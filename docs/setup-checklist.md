# GCP + Cloudflare Setup Checklist

Reference checklist for reproducing the portfolio deployment.

## 1. Accounts and prerequisites

- [ ] Buy or choose a domain
- [ ] Create a Google Cloud project
- [ ] Enable billing
- [ ] Create a Cloudflare account
- [ ] Move DNS for the domain to Cloudflare
- [ ] Create the GitHub repository

## 2. Prepare Google Cloud

- [ ] Enable the Compute Engine API
- [ ] Choose region `us-central1`
- [ ] Decide which admin IP ranges should be allowed to SSH to the origin VMs
- [ ] Set Terraform variables for project ID, region, zones, machine type, and admin CIDRs
- [ ] Run Terraform from `infrastructure/terraform/`
- [ ] Record the output IP addresses for both origin servers

## 3. Verify origin bootstrap

- [ ] Confirm both Debian 12 VMs are running
- [ ] Confirm Nginx is installed and active on each VM
- [ ] Confirm `/var/www/html` exists on each VM
- [ ] Confirm `/healthz` returns HTTP 200 on each origin

## 4. Configure Cloudflare

- [ ] Add the domain to Cloudflare
- [ ] Verify nameservers at the registrar
- [ ] Create proxied DNS records for the site hostname
- [ ] Configure SSL/TLS mode to match the actual origin setup
- [ ] Create a load balancer
- [ ] Create an origin pool containing both VM public IPs
- [ ] Configure health checks against `http://<origin>/healthz` unless origin HTTPS is explicitly configured

## 5. Configure deployment

- [ ] Add repository secrets:
- [ ] `ORIGIN1_HOST`
- [ ] `ORIGIN2_HOST`
- [ ] `ORIGIN_USER`
- [ ] `ORIGIN_SSH_KEY`
- [ ] Confirm `npm run build` succeeds in `site/`
- [ ] Push to `main` or trigger the workflow manually
- [ ] Verify the workflow deploys to both origins successfully

## 6. Validate the public site

- [ ] Visit the site over HTTPS
- [ ] Confirm Cloudflare proxying is active
- [ ] Confirm both origins report healthy in Cloudflare
- [ ] Temporarily remove or stop one origin
- [ ] Confirm traffic continues to serve from the remaining origin
- [ ] Restore the stopped origin and confirm it returns to healthy status

## 7. Capture proof for the case study

- [ ] Screenshot the Cloudflare load balancer pool
- [ ] Screenshot both VMs in GCP
- [ ] Screenshot a successful GitHub Actions deployment
- [ ] Screenshot the live site on the production domain
- [ ] Update the project writeup with any deployment changes worth documenting
