variable "name" { type = string }
variable "vpc_id" { type = string }
variable "public_subnet_ids" { type = list(string) }
variable "private_subnet_ids" { type = list(string) }
variable "image" { type = string }
variable "app_security_group_id" { type = string }
variable "certificate_arn" { type = string }
variable "region" { type = string }
variable "kms_key_arn" { type = string }
variable "secret_arns" { type = map(string) }
variable "bucket_arns" { type = list(string) }
variable "environment" { type = map(string) }
variable "api_cpu" {
  type    = number
  default = 512
}
variable "api_memory" {
  type    = number
  default = 1024
}
variable "worker_cpu" {
  type    = number
  default = 1024
}
variable "worker_memory" {
  type    = number
  default = 2048
}
variable "api_min" {
  type    = number
  default = 2
}
variable "api_max" {
  type    = number
  default = 10
}
variable "worker_min" {
  type    = number
  default = 2
}
variable "worker_max" {
  type    = number
  default = 12
}
variable "assemble_worker_min" {
  type    = number
  default = 1
}
variable "assemble_worker_max" {
  type    = number
  default = 8
}

locals {
  secret_env = [for k, arn in var.secret_arns : { name = k, valueFrom = arn }]
  env        = [for k, v in var.environment : { name = k, value = v }]
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.name}/api"
  retention_in_days = 30 # logs: 30 dias (docs/RETENTION.md)
}
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.name}/worker"
  retention_in_days = 30
}

resource "aws_ecs_cluster" "this" {
  name = var.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_security_group" "alb" {
  name   = "${var.name}-alb"
  vpc_id = var.vpc_id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# O SG da aplicação é criado fora (stack) para evitar dependência circular com o módulo de dados.
resource "aws_security_group_rule" "app_from_alb" {
  type                     = "ingress"
  from_port                = 8787
  to_port                  = 8787
  protocol                 = "tcp"
  security_group_id        = var.app_security_group_id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_lb" "this" {
  name                       = var.name
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  idle_timeout               = 60
}

# Canary / blue-green: dois target groups; o `cd.yml` desloca o peso do listener 10% → 50% → 100% e reverte se 5xx > 2% (docs/DEPLOY.md).
resource "aws_lb_target_group" "blue" {
  name        = "${var.name}-blue"
  port        = 8787
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path                = "/readyz"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = 30
}
resource "aws_lb_target_group" "green" {
  name        = "${var.name}-green"
  port        = 8787
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  health_check {
    path                = "/readyz"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = 30
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 100
      }
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 0
      }
    }
  }
  lifecycle { ignore_changes = [default_action] } # pesos são geridos pelo pipeline de canary
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-exec"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
data "aws_iam_policy_document" "exec_secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(var.secret_arns)
  }
  statement {
    actions   = ["kms:Decrypt"]
    resources = [var.kms_key_arn]
  }
}
resource "aws_iam_role_policy" "exec_secrets" {
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.exec_secrets.json
}

resource "aws_iam_role" "task" {
  name               = "${var.name}-task"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}
data "aws_iam_policy_document" "task" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:AbortMultipartUpload"]
    resources = concat(var.bucket_arns, [for a in var.bucket_arns : "${a}/*"])
  }
  statement {
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [var.kms_key_arn]
  }
}
resource "aws_iam_role_policy" "task" {
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "api"
    image            = var.image
    essential        = true
    portMappings     = [{ containerPort = 8787 }]
    environment      = concat(local.env, [{ name = "TRUSTED_PROXY", value = "true" }])
    secrets          = local.secret_env
    stopTimeout      = 30
    healthCheck      = { command = ["CMD-SHELL", "curl -fsS http://127.0.0.1:8787/healthz || exit 1"], interval = 15, timeout = 3, retries = 3, startPeriod = 20 }
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "api" } }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "worker"
    image            = var.image
    essential        = true
    command          = ["node", "--import", "./dist/instrumentation.js", "dist/worker.js"]
    environment      = local.env
    secrets          = local.secret_env
    stopTimeout      = 120 # graceful shutdown: aguarda jobs em andamento
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "worker" } }
  }])
}

# Pool dedicado para a fila de montagem (FFmpeg é CPU-bound): escala separado dos demais workers.
resource "aws_ecs_task_definition" "assemble" {
  family                   = "${var.name}-worker-assemble"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 2048
  memory                   = 4096
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name             = "worker"
    image            = var.image
    essential        = true
    command          = ["node", "--import", "./dist/instrumentation.js", "dist/worker.js"]
    environment      = concat(local.env, [{ name = "WORKER_QUEUES", value = "generation-assemble,dubbing-video" }])
    secrets          = local.secret_env
    stopTimeout      = 120
    logConfiguration = { logDriver = "awslogs", options = { "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.region, "awslogs-stream-prefix" = "assemble" } }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_min
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.app_security_group_id]
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.blue.arn
    container_name   = "api"
    container_port   = 8787
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count, task_definition, load_balancer] }
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_min
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.app_security_group_id]
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count, task_definition] }
}

resource "aws_ecs_service" "assemble" {
  name            = "worker-assemble"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.assemble.arn
  desired_count   = var.assemble_worker_min
  launch_type     = "FARGATE"
  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [var.app_security_group_id]
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  lifecycle { ignore_changes = [desired_count, task_definition] }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_max
  min_capacity       = var.api_min
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}
resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${var.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 55
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
  }
}
resource "aws_appautoscaling_policy" "api_requests" {
  name               = "${var.name}-api-req"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 800
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.blue.arn_suffix}"
    }
  }
}
resource "aws_appautoscaling_target" "worker" {
  max_capacity       = var.worker_max
  min_capacity       = var.worker_min
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}
resource "aws_appautoscaling_policy" "worker_cpu" {
  name               = "${var.name}-worker-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
  }
}
resource "aws_appautoscaling_target" "assemble" {
  max_capacity       = var.assemble_worker_max
  min_capacity       = var.assemble_worker_min
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.assemble.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}
resource "aws_appautoscaling_policy" "assemble_cpu" {
  name               = "${var.name}-assemble-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.assemble.resource_id
  scalable_dimension = aws_appautoscaling_target.assemble.scalable_dimension
  service_namespace  = aws_appautoscaling_target.assemble.service_namespace
  target_tracking_scaling_policy_configuration {
    target_value = 65
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
  }
}

# Alarmes de infraestrutura que complementam as regras Prometheus (infra/observability/alerts.yml).
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.name}-alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = aws_lb.this.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 50
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
}

output "alb_dns_name" { value = aws_lb.this.dns_name }
output "alb_zone_id" { value = aws_lb.this.zone_id }
output "listener_arn" { value = aws_lb_listener.https.arn }
output "target_group_arns" { value = { blue = aws_lb_target_group.blue.arn, green = aws_lb_target_group.green.arn } }
output "cluster_name" { value = aws_ecs_cluster.this.name }
