variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Primary region"
  type        = string
  default     = "us-central1"
}

variable "zone_a" {
  description = "Primary zone A"
  type        = string
  default     = "us-central1-a"
}

variable "zone_b" {
  description = "Primary zone B"
  type        = string
  default     = "us-central1-b"
}

variable "machine_type" {
  description = "Compute Engine machine type"
  type        = string
  default     = "e2-micro"
}

variable "admin_cidrs" {
  description = "CIDRs allowed to SSH to the instances"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
