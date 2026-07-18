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
    listen 80;
    listen [::]:80;
    server_name www.shanekanterman.dev;

    return 301 https://shanekanterman.dev$request_uri;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name shanekanterman.dev;

    root /var/www/html;
    index index.html;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

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
