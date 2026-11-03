variable "name" { type = string }
variable "secret_names" {
  type    = list(string)
  default = ["JWT_SECRET", "DATA_ENCRYPTION_KEY", "IP_HASH_SALT", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PIX_WEBHOOK_SECRET", "AFFILIATE_WEBHOOK_SECRET", "KLING_ACCESS_KEY", "KLING_SECRET_KEY", "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "TIKTOK_CLIENT_SECRET", "INSTAGRAM_APP_SECRET", "SHOPEE_PARTNER_KEY", "MELI_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET", "METRICS_TOKEN", "SENTRY_DSN", "RESEND_API_KEY", "ANALYTICS_PSEUDO_SALT", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "ML_SERVICE_TOKEN"]
}
variable "generated" {
  type    = list(string)
  default = ["JWT_SECRET", "IP_HASH_SALT", "AFFILIATE_WEBHOOK_SECRET", "PIX_WEBHOOK_SECRET", "METRICS_TOKEN", "ANALYTICS_PSEUDO_SALT", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", "ML_SERVICE_TOKEN"]
}

data "aws_caller_identity" "me" {}
# Política explícita = a padrão da AWS (a conta mantém kms:* e delega ao IAM) + o CloudFront descriptografar os vídeos
# (objetos SSE-KMS servidos pela distribuição com OAC). Sem isso o CDN recebia 403 da origem.
data "aws_iam_policy_document" "kms" {
  statement {
    sid       = "AccountRoot"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.me.account_id}:root"]
    }
  }
  statement {
    sid       = "CloudFrontServeVideos"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:cloudfront::${data.aws_caller_identity.me.account_id}:distribution/*"]
    }
  }
}
resource "aws_kms_key" "this" {
  description             = "${var.name} dados sensíveis (RDS, S3, Redis, Secrets)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.kms.json
}
resource "aws_kms_alias" "this" {
  name          = "alias/${var.name}"
  target_key_id = aws_kms_key.this.key_id
}

resource "random_password" "gen" {
  for_each = toset(var.generated)
  length   = 48
  special  = false
}
# Chave de criptografia de dados (tokens de plataforma): 32 bytes aleatórios em base64. Rotação: ver docs/SECURITY.md (prefixo v1:keyId).
resource "random_id" "dek" { byte_length = 32 }

resource "aws_secretsmanager_secret" "s" {
  for_each   = toset(var.secret_names)
  name       = "${var.name}/${each.key}"
  kms_key_id = aws_kms_key.this.arn
}
# Valores gerados são gravados; os demais (chaves de terceiros) devem ser preenchidos manualmente (console/CLI) — `ignore_changes` evita sobrescrever.
resource "aws_secretsmanager_secret_version" "gen" {
  for_each      = toset(var.generated)
  secret_id     = aws_secretsmanager_secret.s[each.key].id
  secret_string = random_password.gen[each.key].result
  lifecycle { ignore_changes = [secret_string] }
}
resource "aws_secretsmanager_secret_version" "dek" {
  secret_id     = aws_secretsmanager_secret.s["DATA_ENCRYPTION_KEY"].id
  secret_string = random_id.dek.b64_std
  lifecycle { ignore_changes = [secret_string] }
}

output "kms_key_arn" { value = aws_kms_key.this.arn }
output "secret_arns" { value = { for k, s in aws_secretsmanager_secret.s : k => s.arn } }
