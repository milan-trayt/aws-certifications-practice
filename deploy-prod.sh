#!/bin/bash
set -e

# ============================================================
# Production deployment script for a single droplet
# Usage: ./deploy-prod.sh
#
# Prerequisites:
#   - Docker & Docker Compose installed on the droplet
#   - .env file with DOMAIN, POSTGRES_PASSWORD, JWT_SECRET, etc.
#   - DNS A record pointing DOMAIN to the droplet IP
# ============================================================

source .env

if [ -z "$DOMAIN" ]; then
  echo "ERROR: DOMAIN is not set in .env"
  exit 1
fi

echo "=== Deploying to $DOMAIN ==="

# 1. Build the React client locally (or on the server)
echo "--- Building React client ---"
cd client
npm ci
npm run build
cd ..

# 2. Process nginx config — replace ${DOMAIN} placeholder
echo "--- Generating nginx config ---"
mkdir -p nginx/conf.d
envsubst '${DOMAIN}' < nginx/nginx.conf > nginx/conf.d/default.conf

# 3. Get SSL certificate if it doesn't exist
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "--- Obtaining SSL certificate ---"
  # Start a temporary nginx for the ACME challenge
  mkdir -p /var/www/certbot
  docker run --rm -d --name certbot-nginx \
    -p 80:80 \
    -v /var/www/certbot:/var/www/certbot \
    nginx:alpine sh -c "echo 'server { listen 80; location /.well-known/acme-challenge/ { root /var/www/certbot; } }' > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"

  sleep 2

  docker run --rm \
    -v /etc/letsencrypt:/etc/letsencrypt \
    -v /var/www/certbot:/var/www/certbot \
    certbot/certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      --email admin@$DOMAIN \
      --agree-tos \
      --no-eff-email \
      -d $DOMAIN

  docker stop certbot-nginx 2>/dev/null || true
  echo "SSL certificate obtained."
else
  echo "SSL certificate already exists."
fi

# 4. Start backend containers
echo "--- Starting backend services ---"
docker compose -f docker-compose.prod.yml up -d --build

# 5. Run migrations
echo "--- Running database migrations ---"
sleep 10
docker compose -f docker-compose.prod.yml exec server node database/migrationRunner.js

# 6. Start nginx (host-level, not in Docker — serves build files + proxies to containers)
echo "--- Starting nginx ---"
# Copy build files
sudo mkdir -p /usr/share/nginx/html
sudo cp -r client/build/* /usr/share/nginx/html/

# Copy nginx config
sudo cp nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx || sudo systemctl start nginx

echo ""
echo "=== Deployment complete ==="
echo "Site: https://$DOMAIN"
echo ""
echo "To renew SSL: certbot renew --quiet"
echo "Add to crontab: 0 3 * * * certbot renew --quiet && systemctl reload nginx"
