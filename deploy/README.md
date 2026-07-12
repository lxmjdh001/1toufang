# Production Deploy

This deployment runs the app with Docker Compose:

- `postgres`: PostgreSQL data store
- `redis`: Redis service
- `api`: NestJS API on internal port `4000`
- `web`: Next.js app on internal port `3000`
- `nginx`: public HTTP entry on port `80`

## First Deploy

```bash
cp deploy/production.env.example deploy/production.env
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:migrate:deploy
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:seed
```

## Update

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/production.env run --rm api pnpm --filter @1toufang/database db:migrate:deploy
```
