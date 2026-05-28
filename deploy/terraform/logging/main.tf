// SOC2 CC7.1 / CC7.4 — log retention with immutability for the audit stream.
//
// Two buckets:
//   1. eliza-logs-general          — general app logs, 365d retention.
//   2. eliza-logs-security-audit   — security/audit events, 7y retention,
//                                    BUCKET object-lock retention policy.
//
// Operator must supply var.project_id and var.region.

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP project ID hosting the GKE cluster."
  type        = string
}

variable "region" {
  description = "GCS bucket region."
  type        = string
  default     = "us-central1"
}

# General log sink — 365d retention, no object lock.
resource "google_storage_bucket" "logs_general" {
  name                        = "eliza-logs-general-${var.project_id}"
  location                    = var.region
  project                     = var.project_id
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false
  public_access_prevention    = "enforced"

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}

# Security audit log sink — 7-year retention, locked bucket policy.
# Once retention_policy.is_locked = true, neither retention period nor
# deletion can be reversed (SOC2 CC7.4 evidence preservation requirement).
resource "google_storage_bucket" "logs_security_audit" {
  name                        = "eliza-logs-security-audit-${var.project_id}"
  location                    = var.region
  project                     = var.project_id
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  force_destroy               = false
  public_access_prevention    = "enforced"

  retention_policy {
    retention_period = 7 * 365 * 24 * 60 * 60  # 7 years in seconds
    # TODO(soc2): set is_locked = true via separate apply after verifying
    # the bucket name + region. THIS IS IRREVERSIBLE.
    is_locked = false
  }

  versioning {
    enabled = true
  }
}

resource "google_logging_project_sink" "general" {
  name        = "eliza-logs-general"
  project     = var.project_id
  destination = "storage.googleapis.com/${google_storage_bucket.logs_general.name}"
  filter      = "resource.type=\"k8s_container\" AND severity>=DEFAULT"

  unique_writer_identity = true
}

resource "google_logging_project_sink" "security_audit" {
  name        = "eliza-logs-security-audit"
  project     = var.project_id
  destination = "storage.googleapis.com/${google_storage_bucket.logs_security_audit.name}"
  filter      = <<-EOT
    logName:"cloudaudit.googleapis.com"
    OR protoPayload.serviceName="k8s.io"
    OR resource.type="gke_cluster"
  EOT

  unique_writer_identity = true
}

# Grant sink writer roles on each bucket.
resource "google_storage_bucket_iam_member" "general_writer" {
  bucket = google_storage_bucket.logs_general.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.general.writer_identity
}

resource "google_storage_bucket_iam_member" "security_audit_writer" {
  bucket = google_storage_bucket.logs_security_audit.name
  role   = "roles/storage.objectCreator"
  member = google_logging_project_sink.security_audit.writer_identity
}

output "general_bucket" {
  value = google_storage_bucket.logs_general.name
}

output "security_audit_bucket" {
  value = google_storage_bucket.logs_security_audit.name
}
