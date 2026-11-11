# TODO (moved)

This file has been split for size and clarity:

- **What's built** → [FEATURES.md](../FEATURES.md)
- **Open work / backlog** → [TODO.md](../TODO.md)

`git log` remains the authoritative record of what landed. See
[CLAUDE.md](../CLAUDE.md) for the strict-SRD contribution rule and
[LEGAL.md](../LEGAL.md) for the SRD attribution + scope.

---

## Deployment reference

Shipped: ECR (immutable repos, full-commit-SHA tags), a single arm64 EC2 host
running Docker Compose (Postgres in a container on the same host — not RDS),
the shared `edge-nginx` reverse proxy from `gehsekky-infra` (Let's Encrypt via
certbot webroot), GitHub Actions → OIDC deploy role → SSM SendCommand deploy
(no stored AWS keys or SSH keys), Google OAuth. See [DEPLOY.md](DEPLOY.md).
Required `/opt/pansori/.env` vars on EC2:

- `POSTGRES_PASSWORD`, `POSTGRES_USER` (`pansori`), `POSTGRES_DB` (`pansori_db`)
- `SESSION_SECRET` (64-char random)
- `ANTHROPIC_API_KEY` (only read when `LLM_PROVIDER=anthropic`; default `none`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`
- `FRONTEND_URL`, `ECR_REGISTRY`, `AWS_REGION`
- `IMAGE_TAG` (written by the deploy job; the commit SHA currently running)
