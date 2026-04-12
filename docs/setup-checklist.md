# GCP + Cloudflare Setup Checklist

## 1. Accounts and prerequisites
- [ ] Buy or choose a domain
- [ ] Create a Google Cloud project
- [ ] Enable billing
- [ ] Create a Cloudflare account
- [ ] Move DNS for the domain to Cloudflare
- [ ] Create a GitHub repository for the site

## 2. Google Cloud
- [ ] Enable Compute Engine API
- [ ] Choose region `us-central1`
- [ ] Create two Debian 12 `e2-micro` VMs in:
  - [ ] `us-central1-a`
  - [ ] `us-central1-b`
- [ ] Open firewall rules for ports 80 and 443
- [ ] Restrict port 22 to your IP if possible
- [ ] Install Nginx
- [ ] Configure `/healthz` to return HTTP 200

## 3. Cloudflare
- [ ] Add your domain to Cloudflare
- [ ] Verify nameservers at registrar
- [ ] Create proxied DNS records for the portfolio hostname
- [ ] Enable Universal SSL
- [ ] Set SSL mode to **Full (strict)**
- [ ] Create a Load Balancer
- [ ] Create one origin pool with both GCP VM public IPs
- [ ] Configure health checks to `http://<origin>/healthz`

## 4. Site and deployment
- [ ] Create Astro site
- [ ] Confirm `npm run build` works locally
- [ ] Serve build output from `/var/www/html`
- [ ] Add GitHub Actions workflow
- [ ] Add repository secrets:
  - [ ] `ORIGIN1_HOST`
  - [ ] `ORIGIN2_HOST`
  - [ ] `ORIGIN_USER`
  - [ ] `ORIGIN_SSH_KEY`
- [ ] Push to `main`
- [ ] Verify deployment completed on both VMs

## 5. Validation
- [ ] Visit the site over HTTPS
- [ ] Confirm Cloudflare proxy is active
- [ ] Confirm `/healthz` is reachable from Cloudflare
- [ ] Stop one origin temporarily
- [ ] Confirm the site still serves traffic
- [ ] Restart the stopped origin
- [ ] Confirm it returns to healthy status

## 6. Portfolio proof points
- [ ] Screenshot Cloudflare load balancer pool
- [ ] Screenshot both VMs in GCP
- [ ] Screenshot GitHub Actions deployment success
- [ ] Screenshot site live on your domain
- [ ] Write a project page describing architecture, cost, and failover test
