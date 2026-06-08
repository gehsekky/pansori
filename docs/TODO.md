# TODO (moved)

This file has been split for size and clarity:

- **What's built** → [FEATURES.md](../FEATURES.md)
- **Open work / backlog** → [TODO.md](../TODO.md)

`git log` remains the authoritative record of what landed. See
[CLAUDE.md](../CLAUDE.md) for the strict-SRD contribution rule and
[LEGAL.md](../LEGAL.md) for the SRD attribution + scope.

---

## Deployment reference

Shipped: ECR, EC2, RDS, direct EC2 + nginx, Let's Encrypt (certbot webroot
auto-renew), GitHub Actions → SSM SendCommand deploy, Google OAuth, Docker
Compose prod. Required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
