terraform {
  required_version = ">= 1.7"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.60" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" } # par de chaves da URL assinada do CDN
  }
}

variable "name" { type = string }
variable "region" { type = string }
variable "azs" { type = list(string) }
variable "image" { type = string }
variable "certificate_arn" { type = string }
variable "public_app_url" { type = string }
variable "public_api_url" { type = string }
variable "cors_origins" { type = list(string) }
variable "environment_name" { type = string }
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "multi_az" {
  type    = bool
  default = true
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "platform_mode" {
  type    = string
  default = "mock"
}
variable "payments_mode" {
  type    = string
  default = "mock"
}
variable "allow_stubs_in_production" {
  type        = string
  default     = "false"
  description = "Auditoria pós-Fase 8: produção só sobe com stubs (IA/plataformas/KYC/sanções) se isto for \"true\" — reconhecimento explícito, ex.: soft launch fechado."
}
variable "kyc_provider" {
  type    = string
  default = "stub"
}
variable "sanctions_provider" {
  type    = string
  default = "stub"
}
variable "ai_video_provider" {
  type    = string
  default = "mock"
}
variable "api_min" {
  type    = number
  default = 2
}
variable "api_max" {
  type    = number
  default = 10
}

module "network" {
  source = "../modules/network"
  name   = var.name
  azs    = var.azs
}

module "secrets" {
  source = "../modules/secrets"
  name   = var.name
}

resource "aws_security_group" "app" {
  name   = "${var.name}-app"
  vpc_id = module.network.vpc_id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

module "data" {
  source                = "../modules/data"
  name                  = var.name
  vpc_id                = module.network.vpc_id
  data_subnet_ids       = module.network.data_subnet_ids
  app_security_group_id = aws_security_group.app.id
  kms_key_arn           = module.secrets.kms_key_arn
  db_instance_class     = var.db_instance_class
  multi_az              = var.multi_az
  redis_node_type       = var.redis_node_type
}

module "storage" {
  source       = "../modules/storage"
  name         = var.name
  kms_key_arn  = module.secrets.kms_key_arn
  cors_origins = var.cors_origins
}

# URLs de conexão contêm credenciais → vão para o Secrets Manager (nunca em texto no task definition).
resource "aws_secretsmanager_secret" "conn" {
  for_each   = toset(["DATABASE_URL", "DATABASE_READ_URL", "REDIS_URL"])
  name       = "${var.name}/${each.key}"
  kms_key_id = module.secrets.kms_key_arn
}
resource "aws_secretsmanager_secret_version" "conn" {
  for_each = {
    DATABASE_URL      = module.data.database_url
    DATABASE_READ_URL = module.data.database_read_url
    REDIS_URL         = module.data.redis_url
  }
  secret_id     = aws_secretsmanager_secret.conn[each.key].id
  secret_string = each.value
}

module "app" {
  source                = "../modules/app"
  name                  = var.name
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  app_security_group_id = aws_security_group.app.id
  image                 = var.image
  certificate_arn       = var.certificate_arn
  region                = var.region
  kms_key_arn           = module.secrets.kms_key_arn
  secret_arns           = merge(module.secrets.secret_arns, { for k, s in aws_secretsmanager_secret.conn : k => s.arn }, { for k, v in { CLOUDFRONT_PRIVATE_KEY = module.storage.cdn_private_key_secret_arn } : k => v if v != "" })
  bucket_arns           = module.storage.bucket_arns
  api_min               = var.api_min
  api_max               = var.api_max
  environment = {
    NODE_ENV                  = var.environment_name == "production" ? "production" : "staging"
    REGION                    = var.region
    PUBLIC_API_URL            = var.public_api_url
    PUBLIC_APP_URL            = var.public_app_url
    CORS_ORIGINS              = join(",", var.cors_origins)
    STORAGE_DRIVER            = "s3"
    S3_REGION                 = var.region
    S3_BUCKET_UPLOADS         = module.storage.bucket_names["uploads"]
    S3_BUCKET_VIDEOS          = module.storage.bucket_names["videos"]
    S3_BUCKET_EXPORTS         = module.storage.bucket_names["exports"]
    S3_BUCKET_ARCHIVE         = module.storage.bucket_names["archive"]
    KMS_DRIVER                = "aws"
    KMS_KEY_ID                = module.secrets.kms_key_arn # tokens de nuvem (Módulo 5): envelope com chave de dados do KMS
    CLOUD_MODE                = var.platform_mode == "mock" ? "mock" : "real"
    CDN_BASE_URL              = module.storage.cdn_domain == "" ? "" : "https://${module.storage.cdn_domain}"
    CLOUDFRONT_KEY_PAIR_ID    = module.storage.cdn_key_pair_id
    PLATFORM_MODE             = var.platform_mode
    PAYMENTS_MODE             = var.payments_mode
    AI_VIDEO_PROVIDER         = var.ai_video_provider
    AI_TTS_PROVIDER           = var.ai_video_provider == "mock" ? "mock" : "elevenlabs"
    AI_MODERATION_PROVIDER    = var.ai_video_provider == "mock" ? "mock" : "openai"
    ADMIN_REQUIRE_TOTP        = "true"
    BULL_BOARD_ENABLED        = "false" # auditoria: UI opcional; ligar só sob VPN/allowlist e com dependências sem CVE
    KYC_PROVIDER              = var.kyc_provider
    SANCTIONS_PROVIDER        = var.sanctions_provider
    ALLOW_STUBS_IN_PRODUCTION = var.allow_stubs_in_production
    METRICS_ALLOW_CIDRS       = module.network.vpc_cidr
  }
}

output "alb_dns_name" { value = module.app.alb_dns_name }
output "cluster_name" { value = module.app.cluster_name }
output "cdn_domain" { value = module.storage.cdn_domain }
output "target_group_arns" { value = module.app.target_group_arns }
output "listener_arn" { value = module.app.listener_arn }
