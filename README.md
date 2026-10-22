# AI Video Agent

Generates short vertical videos (script → voice → render) and posts them to YouTube, Facebook Page Reels and Instagram Reels, with a human approval step.

Status: **Phase 0** (accounts, credentials, database schema). See the [roadmap](https://claude.ai/artifact/PHhmQZ2a6pdjzzVFQNaWyc).

## Setup

```sh
npm install
cp .env.example .env
npm run check          # shows what's configured and tests each credential
```

Follow [docs/phase0-setup.md](docs/phase0-setup.md) to fill in `.env`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run check` | Lists missing settings and tests DB, YouTube, Facebook and Instagram access |
| `npm run auth:youtube` | One-time Google sign-in; saves `YOUTUBE_REFRESH_TOKEN` |
| `npm run auth:meta` | Exchanges a Graph API Explorer token for a long-lived Page token and finds the Instagram account |
| `npm run db:migrate` | Creates the `videos`, `posts` and `post_stats` tables |

## Layout

```
src/config.ts       env loading and per-integration requirements
src/lib/            small helpers (Graph API, .env writer)
scripts/            setup and auth scripts
db/schema.sql       Postgres schema
docs/               setup guides
```
