# Portfolio Cloud Architecture Design

## Project Overview

This project hosts a personal portfolio website using a
**high-availability cloud architecture** while keeping operational costs
under **\~\$20/month**.

The design uses:

-   **Cloudflare** for DNS, CDN, TLS, and load balancing
-   **Google Cloud Compute Engine** for origin servers
-   **GitHub Actions** for CI/CD
-   **Astro + Nginx** for a lightweight static web stack

The architecture demonstrates real-world concepts including:

-   edge networking
-   multi-zone compute
-   automated deployment
-   health monitoring
-   cost-controlled infrastructure

------------------------------------------------------------------------

# Architecture Overview

``` text
Internet
   |
Cloudflare DNS
   |
Cloudflare CDN + Load Balancer
   |
Origin Pool
   |                       |
GCP VM 1                   GCP VM 2
us-central1-a              us-central1-b
   |                       |
Nginx                      Nginx
   |                       |
Astro Static Site          Astro Static Site
```

------------------------------------------------------------------------

# Technology Stack

  Category         Technology
  ---------------- -----------------------------
  Frontend         Astro static site generator
  Web server       Nginx
  VM OS            Debian 12
  Edge platform    Cloudflare
  Cloud provider   Google Cloud Platform
  Compute          Compute Engine `e2-micro`
  Deployment       GitHub Actions
  Monitoring       Google Cloud Monitoring

------------------------------------------------------------------------

# Infrastructure Components

## Domain / DNS

  Component   Service          Purpose
  ----------- ---------------- -----------------------
  DNS         Cloudflare DNS   Public domain routing
  Domain      `yourname.dev`   Portfolio domain

Cloudflare acts as the global entry point for all traffic.

------------------------------------------------------------------------

## Edge Layer

  -----------------------------------------------------------------------
  Component               Service                 Purpose
  ----------------------- ----------------------- -----------------------
  CDN                     Cloudflare CDN          Cache static assets
                                                  globally

  TLS                     Cloudflare Universal    HTTPS encryption
                          SSL                     

  DDoS protection         Cloudflare Edge         Basic protection

  Load balancing          Cloudflare Load         Failover between origin
                          Balancer                servers

  Health checks           Cloudflare Health       Detect origin failures
                          Checks                  
  -----------------------------------------------------------------------

Cloudflare reduces latency and offloads requests from the origin
servers.

------------------------------------------------------------------------

## Origin Compute Layer

  Component             Configuration
  --------------------- ----------------------------------
  Cloud provider        Google Cloud Platform
  VM type               `e2-micro`
  Operating system      Debian 12
  Number of instances   2
  Region                `us-central1`
  Zones                 `us-central1-a`, `us-central1-b`

### Purpose

-   provide high availability
-   tolerate zonal outages
-   host the portfolio application

------------------------------------------------------------------------

## Web Server Layer

  Component           Configuration
  ------------------- -----------------
  Server              Nginx
  Content directory   `/var/www/html`
  Site type           Static

### Responsibilities

-   serve the static site
-   expose health endpoint `/healthz`

Example health endpoint response:

``` text
HTTP 200 OK
```

------------------------------------------------------------------------

## Application Layer

  Component        Technology
  ---------------- --------------------
  Site generator   Astro
  Output           Static HTML/CSS/JS
  Backend          None

### Reasons for a static architecture

-   minimal CPU usage
-   easy replication across nodes
-   simple deployment
-   strong performance

------------------------------------------------------------------------

# CI/CD Pipeline

Deployment is automated through **GitHub Actions**.

## Deployment Workflow

1.  Developer pushes code to `main`
2.  GitHub Actions builds the Astro static site
3.  Build artifacts are produced
4.  Pipeline deploys artifacts to both origin servers
5.  Nginx reloads configuration
6.  Cloudflare health checks verify origin availability

------------------------------------------------------------------------

# Instance Configuration

Each VM is configured using a startup script.

## Startup tasks

-   update system packages
-   install nginx
-   create web directory
-   deploy latest site build
-   enable nginx service

Example structure:

``` text
/var/www/html
├── index.html
├── css/
├── js/
└── assets/
```

------------------------------------------------------------------------

# Monitoring and Observability

  Feature         Service
  --------------- --------------------------
  VM metrics      Google Cloud Monitoring
  Uptime checks   Google Cloud Monitoring
  Origin health   Cloudflare Health Checks
  Logs            Nginx access/error logs

Monitoring tracks:

-   CPU utilization
-   uptime status
-   VM health

------------------------------------------------------------------------

# Cost Estimate

  Resource                   Estimated Monthly Cost
  -------------------------- ------------------------
  Cloudflare Load Balancer   \~\$5
  Second `e2-micro` VM       \~\$6--8
  Persistent disks           \~\$1
  Network traffic            \~\$0--2
  **Estimated total**        **\~\$12--16/month**

------------------------------------------------------------------------

# Security

Security features include:

-   Cloudflare TLS termination
-   HTTPS enforcement
-   DDoS protection via Cloudflare
-   optional firewall rules on GCP

------------------------------------------------------------------------

# Key Design Goals

  Goal                     Implementation
  ------------------------ -----------------
  High availability        two origin VMs
  Edge performance         Cloudflare CDN
  Cost control             micro instances
  Automation               GitHub Actions
  Reproducibility          startup scripts
  Operational visibility   monitoring

------------------------------------------------------------------------

# Skills Demonstrated

This project demonstrates:

-   cloud infrastructure design
-   high availability architecture
-   CDN and edge networking
-   DevOps CI/CD pipelines
-   monitoring and observability
-   cost-aware infrastructure planning

------------------------------------------------------------------------

# Future Improvements

Potential upgrades:

-   Infrastructure as Code with Terraform
-   canary deployments
-   Web Application Firewall rules
-   Cloudflare caching rules
-   centralized logging

------------------------------------------------------------------------

# Repository Structure

``` text
portfolio-site/
├── site/
│   ├── src/
│   ├── public/
│   └── astro.config.mjs
│
├── infrastructure/
│   ├── startup-script.sh
│   └── nginx.conf
│
├── .github/
│   └── workflows/
│       └── deploy.yml
│
└── docs/
    └── architecture.md
```

------------------------------------------------------------------------

# Summary

This portfolio platform provides:

-   a real public website
-   multi-zone origin infrastructure
-   global edge routing
-   automated deployment

while maintaining a predictable low monthly cost.

The architecture mirrors real-world SaaS deployment patterns while
remaining simple enough to operate as a personal project.
