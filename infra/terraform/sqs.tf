# ============================================================
# SQS Queues
# ============================================================

resource "aws_sqs_queue" "notifications_dlq" {
  name                      = "${var.project_name}-notifications-dlq"
  message_retention_seconds = 1209600  # 14 days

  tags = { Name = "${var.project_name}-notifications-dlq", Project = var.project_name }
}

resource "aws_sqs_queue" "notifications" {
  name                      = "${var.project_name}-notifications"
  visibility_timeout_seconds = 30
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.notifications_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${var.project_name}-notifications", Project = var.project_name }
}

# ============================================================
# S3 Buckets
# ============================================================

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${var.environment}"
  tags   = { Name = "${var.project_name}-frontend", Project = var.project_name }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document { suffix = "index.html" }
  error_document { key    = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_cloudwatch_log_group" "services" {
  for_each          = toset(["api-gateway", "auth-service", "job-service", "payment-service", "notification-service", "analytics-service", "ai-agent-service"])
  name              = "/ecs/${var.project_name}/${each.key}"
  retention_in_days = 30

  tags = { Project = var.project_name }
}
