#!/usr/bin/env bash
set -euxo pipefail

apt-get update
apt-get install -y nginx curl

cat >/var/www/html/index.html <<'EOF'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Portfolio Placeholder</title>
  </head>
  <body>
    <h1>Portfolio origin is online</h1>
    <p>Replace this placeholder with your Astro build output.</p>
  </body>
</html>
EOF

cat >/etc/nginx/sites-available/default <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html;

    location = /healthz {
        add_header Content-Type text/plain;
        return 200 'ok';
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

nginx -t
systemctl enable nginx
systemctl restart nginx
