
# Kiosk Platform

Multi-restaurant cloud ordering platform integrated with unTill TPAPI-POS.

## Structure
- `apps/api` — NestJS backend (all platforms)
- `apps/kiosk` — Next.js: the customer kiosk (`/r/<slug>`)
- `apps/backoffice` — Next.js: a restaurant's own back office
- `apps/admin` — Next.js: platform admin for the platform team (restaurants, till connection, users, activity)
- `tools/print-helper` — the small program that prints tickets on a restaurant's network printer
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