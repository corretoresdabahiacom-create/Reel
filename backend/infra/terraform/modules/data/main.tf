variable "name" { type = string }
variable "vpc_id" { type = string }
variable "data_subnet_ids" { type = list(string) }
variable "app_security_group_id" { type = string }
variable "kms_key_arn" { type = string }
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "db_allocated_storage" {
  type    = number
  default = 50
}
variable "multi_az" {
  type    = bool
  default = true
}
variable "read_replica" {
  type    = bool
  default = true
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "redis_replicas" {
  type    = number
  default = 1
}
variable "backup_retention_days" {
  type    = number
  default = 14
}

resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-db"
  subnet_ids = var.data_subnet_ids
}

resource "aws_security_group" "db" {
  name   = "${var.name}-db"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "aws_security_group" "redis" {
  name   = "${var.name}-redis"
  vpc_id = var.vpc_id
  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }
}

resource "random_password" "db" {
  length  = 32
  special = false
}

# Extensões exigidas pelas migrations: pgcrypto, pg_trgm, uuid-ossp (permitidas no RDS; CREATE EXTENSION roda na migration 0001).
resource "aws_db_parameter_group" "pg16" {
  name   = "${var.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "primary" {
  identifier                      = "${var.name}-pg"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.db_instance_class
  allocated_storage               = var.db_allocated_storage
  max_allocated_storage           = var.db_allocated_storage * 4
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = var.kms_key_arn
  db_name                         = "nexusreel"
  username                        = "nexus"
  password                        = random_password.db.result
  multi_az                        = var.multi_az
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  parameter_group_name            = aws_db_parameter_group.pg16.name
  backup_retention_period         = var.backup_retention_days
  backup_window                   = "05:00-06:00"
  maintenance_window              = "sun:06:30-sun:07:30"
  deletion_protection             = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${var.name}-final"
  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
  copy_tags_to_snapshot           = true
  auto_minor_version_upgrade      = true
}

resource "aws_db_instance" "replica" {
  count                  = var.read_replica ? 1 : 0
  identifier             = "${var.name}-pg-replica"
  replicate_source_db    = aws_db_instance.primary.identifier
  instance_class         = var.db_instance_class
  storage_encrypted      = true
  kms_key_id             = var.kms_key_arn
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = true
  parameter_group_name   = aws_db_parameter_group.pg16.name
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-redis"
  subnet_ids = var.data_subnet_ids
}

# BullMQ exige maxmemory-policy noeviction.
resource "aws_elasticache_parameter_group" "redis" {
  name   = "${var.name}-redis7"
  family = "redis7"
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "${var.name}-redis"
  description                = "NexusReel cache, rate limit, refresh tokens e filas"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1 + var.redis_replicas
  automatic_failover_enabled = var.redis_replicas > 0
  multi_az_enabled           = var.redis_replicas > 0
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  parameter_group_name       = aws_elasticache_parameter_group.redis.name
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  snapshot_retention_limit   = 7
  kms_key_id                 = var.kms_key_arn
}

output "database_url" {
  value     = "postgres://${aws_db_instance.primary.username}:${random_password.db.result}@${aws_db_instance.primary.endpoint}/${aws_db_instance.primary.db_name}?sslmode=require"
  sensitive = true
}
output "database_read_url" {
  value     = var.read_replica ? "postgres://${aws_db_instance.primary.username}:${random_password.db.result}@${aws_db_instance.replica[0].endpoint}/${aws_db_instance.primary.db_name}?sslmode=require" : ""
  sensitive = true
}
output "redis_url" { value = "rediss://${aws_elasticache_replication_group.this.primary_endpoint_address}:6379" }
output "db_identifier" { value = aws_db_instance.primary.identifier }
