variable "name" { type = string }
variable "kms_key_arn" { type = string }
variable "cors_origins" { type = list(string) }
variable "cdn_enabled" {
  type    = bool
  default = true
}
variable "secondary_replication_bucket_arn" {
  type    = string
  default = ""
}

# archive (Módulo 5): Nuvem NexusReel — guarda de longo prazo separada do storage operacional (videos expira cenas em 90 dias)
locals { buckets = toset(["uploads", "videos", "exports", "archive"]) }

resource "aws_s3_bucket" "b" {
  for_each = local.buckets
  bucket   = "${var.name}-${each.key}"
}

resource "aws_s3_bucket_public_access_block" "b" {
  for_each                = aws_s3_bucket.b
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "b" {
  for_each = aws_s3_bucket.b
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
  }
}

resource "aws_s3_bucket_versioning" "videos" {
  bucket = aws_s3_bucket.b["videos"].id
  versioning_configuration { status = "Enabled" }
}

# Retenção (docs/RETENTION.md): exports expiram em 7 dias; vídeos brutos de cena em 90 dias; uploads órfãos limpos pelo app.
resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.b["exports"].id
  rule {
    id     = "expire-exports-7d"
    status = "Enabled"
    filter {}
    expiration { days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

# Nuvem NexusReel: o app apaga no prazo do plano (Free 90 / Pro 365 dias, job diário save-retention).
# Esta regra é só a rede de segurança: nada fica mais de 400 dias, mesmo se o job parar.
resource "aws_s3_bucket_lifecycle_configuration" "archive" {
  bucket = aws_s3_bucket.b["archive"].id
  rule {
    id     = "archive-safety-net-400d"
    status = "Enabled"
    filter {}
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    expiration { days = 400 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

# Antes: filter { prefix = "projects/" } expirava TUDO do projeto em 90 dias (vídeo final, dublagens, áudio), não só as cenas.
# Agora só expira o que o app marca como cena bruta (tag retention=raw-90d, src/providers/storage.ts RAW_SCENE).
resource "aws_s3_bucket_lifecycle_configuration" "videos" {
  bucket = aws_s3_bucket.b["videos"].id
  rule {
    id     = "raw-scenes-90d"
    status = "Enabled"
    filter {
      tag {
        key   = "retention"
        value = "raw-90d"
      }
    }
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    expiration { days = 90 }
  }
  # Bucket versionado: o que foi excluído (projeto excluído, conta excluída) some de vez em 7 dias.
  rule {
    id     = "noncurrent-7d"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.b["uploads"].id
  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = var.cors_origins
    allowed_headers = ["*"]
    max_age_seconds = 600
  }
}

resource "aws_cloudfront_origin_access_control" "videos" {
  count                             = var.cdn_enabled ? 1 : 0
  name                              = "${var.name}-videos"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# URL assinada do CDN: par de chaves gerado aqui; a pública vai para o key group exigido pela distribuição e a privada
# para o Secrets Manager (o app assina com ela). Sem trusted_key_groups a distribuição entregava qualquer vídeo sem assinatura.
resource "tls_private_key" "cdn" {
  count     = var.cdn_enabled ? 1 : 0
  algorithm = "RSA"
  rsa_bits  = 2048
}
resource "aws_cloudfront_public_key" "cdn" {
  count       = var.cdn_enabled ? 1 : 0
  name        = "${var.name}-videos"
  encoded_key = tls_private_key.cdn[0].public_key_pem
}
resource "aws_cloudfront_key_group" "cdn" {
  count = var.cdn_enabled ? 1 : 0
  name  = "${var.name}-videos"
  items = [aws_cloudfront_public_key.cdn[0].id]
}
resource "aws_secretsmanager_secret" "cdn_key" {
  count      = var.cdn_enabled ? 1 : 0
  name       = "${var.name}/CLOUDFRONT_PRIVATE_KEY"
  kms_key_id = var.kms_key_arn
}
resource "aws_secretsmanager_secret_version" "cdn_key" {
  count         = var.cdn_enabled ? 1 : 0
  secret_id     = aws_secretsmanager_secret.cdn_key[0].id
  secret_string = tls_private_key.cdn[0].private_key_pem
}

resource "aws_cloudfront_distribution" "videos" {
  count   = var.cdn_enabled ? 1 : 0
  enabled = true
  comment = "${var.name} vídeos (somente via URL assinada do app)"
  origin {
    domain_name              = aws_s3_bucket.b["videos"].bucket_regional_domain_name
    origin_id                = "videos"
    origin_access_control_id = aws_cloudfront_origin_access_control.videos[0].id
  }
  default_cache_behavior {
    target_origin_id       = "videos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized (a assinatura fica fora da chave de cache)
    compress               = true
    trusted_key_groups     = [aws_cloudfront_key_group.cdn[0].id]
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}

# Só esta distribuição (OAC) lê o bucket de vídeos; o bucket continua sem acesso público.
data "aws_iam_policy_document" "videos_cdn" {
  count = var.cdn_enabled ? 1 : 0
  statement {
    sid       = "CloudFrontOAC"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.b["videos"].arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.videos[0].arn]
    }
  }
}
resource "aws_s3_bucket_policy" "videos_cdn" {
  count  = var.cdn_enabled ? 1 : 0
  bucket = aws_s3_bucket.b["videos"].id
  policy = data.aws_iam_policy_document.videos_cdn[0].json
}

output "bucket_names" { value = { for k, b in aws_s3_bucket.b : k => b.bucket } }
output "bucket_arns" { value = [for b in aws_s3_bucket.b : b.arn] }
output "cdn_domain" { value = var.cdn_enabled ? aws_cloudfront_distribution.videos[0].domain_name : "" }
output "cdn_key_pair_id" { value = var.cdn_enabled ? aws_cloudfront_public_key.cdn[0].id : "" }
output "cdn_private_key_secret_arn" { value = var.cdn_enabled ? aws_secretsmanager_secret.cdn_key[0].arn : "" }
