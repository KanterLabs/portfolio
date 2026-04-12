output "origin_a_ip" {
  value = google_compute_instance.origin_a.network_interface[0].access_config[0].nat_ip
}

output "origin_b_ip" {
  value = google_compute_instance.origin_b.network_interface[0].access_config[0].nat_ip
}
