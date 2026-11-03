terraform {
  required_version = ">= 1.7"
  backend "s3" {} # preenchido por -backend-config=backend.hcl (bucket, key, region, dynamodb_table)
}

variable "image" { type = string }
variable "certificate_arn" { type = string }
variable "secondary_region" {
  type    = string
  default = "" # ex.: us-east-1 → habilita DR multi-região (ver docs/DEPLOY.md)
}

provider "aws" {
  region = "sa-east-1"
  default_tags {
    tags = { Project = "nexusreel", Environment = "production", ManagedBy = "terraform" }
  }
}

module "stack" {
  source            = "../../stack"
  name              = "nexusreel-production"
  environment_name  = "production"
  region            = "sa-east-1"
  azs               = ["sa-east-1a", "sa-east-1b", "sa-east-1c"]
  image             = var.image
  certificate_arn   = var.certificate_arn
  public_api_url    = "https://api.nexusreel.app"
  public_app_url    = "https://nexusreel.app"
  cors_origins      = ["https://nexusreel.app", "https://www.nexusreel.app"]
  db_instance_class = "db.r6g.large"
  multi_az          = true
  redis_node_type   = "cache.r6g.large"
  platform_mode     = "real"
  payments_mode     = "real"
  ai_video_provider = "kling"
  api_min           = 3
  api_max           = 20
}

output "alb_dns_name" { value = module.stack.alb_dns_name }
