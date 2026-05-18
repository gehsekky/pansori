# Deploying Pansori to AWS

## Recommended architecture

For a side project, a single EC2 instance running Docker Compose is the cheapest path that requires zero refactoring — the production environment is identical to development. Add S3 + CloudFront for the frontend later if you want a CDN.

```
Internet → Nginx (EC2) ─┬→ /api/*   → Express backend (Docker)
                         └→ /*       → React frontend (Docker or S3/CloudFront)
                         └→ Postgres (Docker, same host)
```

### Estimated monthly cost (us-east-1)

| Resource | Spec | Cost/mo |
|---|---|---|
| EC2 | t3.micro (2 vCPU, 1 GB RAM) | ~$8.50 |
| Elastic IP | 1 static IP | ~$3.60 |
| EBS storage | 20 GB gp3 | ~$1.60 |
| Data transfer | First 100 GB outbound | ~$0–9 |
| **Total** | | **~$14–22/mo** |

Free tier covers EC2 t2.micro + 30 GB EBS for 12 months if this is a new account.

If you later want managed Postgres, add **RDS db.t3.micro** (~$15/mo) and remove the Postgres container.

---

## Prerequisites

- AWS account with IAM user that has EC2 permissions
- A domain name (optional but recommended for SSL)
- AWS CLI installed locally: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html

---

## Google OAuth setup

Pansori uses Google SSO for authentication. You need a Google Cloud project with an OAuth client.

1. Go to https://console.cloud.google.com/ → create a new project (or select an existing one)
2. APIs & Services → **OAuth consent screen**
   - User type: **External**
   - Fill in app name, support email, developer contact
   - Scopes: add `openid`, `email`, `profile`
   - Save
3. APIs & Services → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://yourdomain.com` (and `http://localhost:3001` for dev)
   - Authorized redirect URIs: `https://yourdomain.com/api/auth/google/callback` (and `http://localhost:3001/api/auth/google/callback` for dev)
   - Click **Create** — copy the **Client ID** and **Client Secret**
4. Add these to your `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
   SESSION_SECRET=<long-random-string>
   FRONTEND_URL=https://yourdomain.com
   ```

> **Local dev**: set `GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback` and `FRONTEND_URL=http://localhost:5173`. Make sure `http://localhost:3001` is in the authorized origins list and the callback URI is in the redirect list.

---

## Step 1 — Launch an EC2 instance

1. Open the EC2 console → **Launch Instance**
2. **Name**: `pansori`
3. **AMI**: Ubuntu Server 24.04 LTS (64-bit x86)
4. **Instance type**: `t3.micro` (or `t3.small` if you expect concurrent players)
5. **Key pair**: Create or select an existing key pair — download the `.pem` file
6. **Security group** — create a new one with these inbound rules:

   | Type | Protocol | Port | Source |
   |------|----------|------|--------|
   | SSH | TCP | 22 | Your IP |
   | HTTP | TCP | 80 | 0.0.0.0/0 |
   | HTTPS | TCP | 443 | 0.0.0.0/0 |

7. **Storage**: 20 GB gp3
8. Launch the instance

### Allocate an Elastic IP

Without an Elastic IP, your instance gets a new public IP on every restart.

1. EC2 console → **Elastic IPs** → **Allocate Elastic IP address**
2. **Associate** it with your new instance

---

## Step 2 — Connect and install Docker

```bash
ssh -i /path/to/your-key.pem ubuntu@<ELASTIC_IP>
```

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

# Install Docker Compose plugin
sudo apt-get install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

## Step 3 — Deploy the application

```bash
# Clone the repo
git clone https://github.com/gehsekky/pansori.git
cd pansori
```

Create a production environment file:

```bash
cat > .env << 'EOF'
POSTGRES_USER=pansori
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=pansori
DATABASE_URL=postgresql://pansori:<strong-random-password>@db:5432/pansori
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback
SESSION_SECRET=<long-random-string-at-least-32-chars>
EOF
```

Build and start:

```bash
docker compose up --build -d
```

Check everything is running:

```bash
docker compose ps
docker compose logs -f
```

The backend will run the DB migrations automatically on first start.

---

## Step 4 — Set up Nginx as a reverse proxy

```bash
sudo apt-get install -y nginx
```

```bash
sudo tee /etc/nginx/sites-available/pansori << 'EOF'
server {
    listen 80;
    server_name <YOUR_DOMAIN_OR_ELASTIC_IP>;

    # Forward /api requests to the Express backend
    location /api/ {
        proxy_pass         http://localhost:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve the React frontend
    location / {
        proxy_pass         http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
```

```bash
sudo ln -s /etc/nginx/sites-available/pansori /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl enable --now nginx
```

---

## Step 5 — SSL with Let's Encrypt (requires a domain)

If you have a domain pointed at your Elastic IP via an A record:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Certbot will automatically rewrite the Nginx config to redirect HTTP → HTTPS and renew certificates via a cron job.

---

## Step 6 — Keep containers running on reboot

```bash
# From the pansori directory
docker compose up -d --restart unless-stopped
```

Or add a systemd service:

```bash
sudo tee /etc/systemd/system/pansori.service << 'EOF'
[Unit]
Description=Pansori game server
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/home/ubuntu/pansori
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
User=ubuntu

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now pansori
```

---

## Deploying updates

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
cd pansori
git pull
docker compose up --build -d
```

Or automate with a GitHub Action (see below).

### Simple GitHub Actions deploy workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd pansori
            git pull
            docker compose up --build -d
```

Add `EC2_HOST` (your Elastic IP) and `EC2_SSH_KEY` (contents of your `.pem` file) as GitHub repository secrets.

---

## Scaling up (when needed)

| Need | Solution |
|------|----------|
| More concurrent players | Upgrade to t3.small or t3.medium |
| Managed database backups | Move Postgres to RDS db.t3.micro (add ~$15/mo) |
| Global CDN for static assets | Build frontend and serve from S3 + CloudFront |
| Zero-downtime deploys | Move to ECS Fargate with rolling deployments |
| Multiple regions | Add CloudFront with origin failover |

For S3/CloudFront (static frontend), build the frontend locally and sync:

```bash
cd src/frontend
npm run build
aws s3 sync dist/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
```

Then update Nginx to proxy only `/api/` and have CloudFront serve everything else.
