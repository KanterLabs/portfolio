terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone_a
}

locals {
  common_tags = ["portfolio", "web"]
}

resource "google_compute_network" "vpc" {
  name                    = "portfolio-vpc"
  auto_create_subnetworks = true
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "portfolio-allow-http-https"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = local.common_tags
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "portfolio-allow-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = var.admin_cidrs
  target_tags   = local.common_tags
}

resource "google_compute_instance" "origin_a" {
  name         = "portfolio-web-a"
  machine_type = var.machine_type
  zone         = var.zone_a
  tags         = local.common_tags

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = google_compute_network.vpc.id
    access_config {}
  }

  metadata_startup_script = file("${path.module}/startup-script.sh")
}

resource "google_compute_instance" "origin_b" {
  name         = "portfolio-web-b"
  machine_type = var.machine_type
  zone         = var.zone_b
  tags         = local.common_tags

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 10
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = google_compute_network.vpc.id
    access_config {}
  }

  metadata_startup_script = file("${path.module}/startup-script.sh")
}
