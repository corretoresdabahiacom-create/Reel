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
    tags = { Project = "nexusreel", Environment = "staging", ManagedBy = "terraform" }
  }
}

module "stack" {
  source            = "../../stack"
  name              = "nexusreel-staging"
  environment_name  = "staging"
  region            = "sa-east-1"
  azs               = ["sa-east-1a", "sa-east-1b", "sa-east-1c"]
  image             = var.image
  certificate_arn   = var.certificate_arn
  public_api_url    = "https://api.staging.nexusreel.app"
  public_app_url    = "https://staging.nexusreel.app"
  cors_origins      = ["https://staging.nexusreel.app"]
  db_instance_class = "db.t4g.small"
  multi_az          = false
  redis_node_type   = "cache.t4g.micro"
  api_min           = 1
  api_max           = 3
}

output "alb_dns_name" { value = module.stack.alb_dns_name }
