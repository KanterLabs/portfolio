# Portfolio Architecture Design

## Overview

This repository hosts a personal portfolio site with a deliberately simple application layer and a more interesting delivery model behind it.

The frontend is a static Astro site. It is served from two Google Cloud VM origins running Nginx, with Cloudflare in front for DNS, CDN, TLS, and load balancing. Deployment is handled by GitHub Actions.

The architecture is small on purpose. The goal is not to maximize services, but to show judgment around deployment, redundancy, and operational clarity.

## System Diagram

```text
Internet
   |
Cloudflare DNS + CDN
   |
Cloudflare Load Balancer
   |---------------------------|
   |                           |
GCP VM 1                    GCP VM 2
us-central1-a               us-central1-b
Nginx                       Nginx
   |                           |
Static Astro build         Static Astro build
```

## Main Components

### Edge layer

Cloudflare is the public entry point. It handles:

- DNS
- CDN behavior for static assets
- TLS at the edge
- load balancing across the two origin servers
- origin health checks

### Origin layer

The origin tier consists of two Debian 12 Compute Engine VMs in separate `us-central1` zones.

- VM type: `e2-micro`
- Web server: Nginx
- Content directory: `/var/www/html`
- Health endpoint: `/healthz`

Using two small instances keeps costs low while still making failover and origin management part of the design.

### Application layer

The application itself is a static Astro site. That choice keeps the runtime simple:

- no application server to manage
- no database to operate
- straightforward deployment as static files
- easy replication across multiple nodes

## Provisioning and Delivery

### Infrastructure

Infrastructure is defined under `infrastructure/terraform/`.

That directory includes:

- `main.tf` for the network, firewall rules, and VM resources
- `variables.tf` for project and environment inputs
- `outputs.tf` for origin IP outputs
- `startup-script.sh` for basic origin bootstrapping

### Deployment workflow

Deployment is handled by `.github/workflows/deploy.yml`.

On pushes to `main`, the workflow:

1. checks out the repository
2. sets up Node.js
3. installs site dependencies
4. builds the Astro site from `site/`
5. archives the generated output
6. copies the artifact to both origin VMs
7. reloads Nginx on each host

## Design Goals

The architecture is meant to show a few specific engineering concerns clearly.

| Goal | How the repo addresses it |
|---|---|
| Simplicity | Static Astro output and Nginx serving |
| Redundancy | Two origin VMs in separate zones |
| Delivery | GitHub Actions build and deploy workflow |
| Edge handling | Cloudflare DNS, CDN, TLS, and balancing |
| Cost control | Small VM footprint and a lightweight app layer |

## Cost Profile

Estimated monthly cost stays low because the runtime is static and the compute layer is intentionally small.

| Resource | Estimated Monthly Cost |
|---|---|
| Cloudflare Load Balancer | ~$5 |
| Second `e2-micro` VM | ~$6-8 |
| Persistent disks | ~$1 |
| Network traffic | ~$0-2 |
| **Estimated total** | **~$12-16/month** |

## Why This Matters

The portfolio is useful as a frontend project, but the stronger signal is in how it is delivered.

This repository ties together:

- application work
- infrastructure provisioning
- deployment automation
- documentation that explains the tradeoffs

That combination is the main point of the design.
