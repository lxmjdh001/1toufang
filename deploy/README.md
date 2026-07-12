# Production Deploy

This deployment runs the app with Docker Compose:

- `postgres`: PostgreSQL data store
- `redis`: Redis service
- `api`: NestJS API on internal port `4000`
- `web`: Next.js app on internal port `3000`
- `nginx`: public HTTP/HTTPS entry on ports `80` and `443`

## First Deploy

```bash
cp deploy/production.env.example deploy/production.env
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:migrate:deploy
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:seed
```

For HTTPS, provision a certificate on the host before enabling the SSL Nginx config:

```bash
certbot certonly --standalone -d wzzads.com --non-interactive --agree-tos -m admin@wzzads.com
```

## Update

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:migrate:deploy
```
