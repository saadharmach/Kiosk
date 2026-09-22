
# Kiosk Platform

Multi-restaurant cloud ordering platform integrated with unTill TPAPI-POS.

## Structure
- `apps/api` — NestJS backend (all platforms)
- `apps/web` — Next.js: platform admin, restaurant platform, kiosk
- `packages/tpapi` — TPAPI SOAP client
- `packages/shared` — shared types and validation
- `tools/tpapi-discovery` — WSDL inspection scripts

## Stack
Node 24 · pnpm · TypeScript · Supabase (Postgres + Storage) · Hetzner VPS + Coolify

## Setup
```bash
nvm use
pnpm install
cp .env.example .env   # fill in real values — never commit .env
```