# Running it for real

How to run the agent around the clock on a small server, approve videos from your phone, and keep costs and risk in check.

## 1. Server with Docker (recommended)

Any small Linux VPS works: 2 vCPU and 2–4 GB RAM is plenty for Shorts (Hetzner, DigitalOcean, Lightsail, Railway, Fly.io…). You don't need a GPU.

```sh
git clone <this repo> && cd ai-video-agent_generator
cp .env.example .env            # fill in keys, or copy your working .env from your computer
# in .env: DOMAIN=review.example.com and REVIEW_PASSWORD=<long random password>
docker compose up -d --build
docker compose logs -f agent
```

That starts three containers:

- **agent**: runs the database migration, then `npm run agent`, which includes the review page.
- **db**: Postgres 16. Its data lives in the `pgdata` volume.
- **caddy**: gets an HTTPS certificate for `DOMAIN` and forwards to the review page.

Point an A record for `DOMAIN` at the server before starting, so Caddy can get the certificate.

- **Neon or Supabase instead of the bundled Postgres:** set `DATABASE_URL` in `.env` and delete the `db` service.
- **Several brands:** set `command: npm run agents` on the agent service. Each brand needs its own `DOMAIN` entry in `Caddyfile`, pointing to its port (3001, 3002…).
- **Without Docker:** install Node 22 and FFmpeg, run `npm ci`, then keep `npm run agent` alive with systemd or pm2. Put Caddy or a Cloudflare Tunnel in front of the review page.

The review page refuses to listen beyond the local machine unless `REVIEW_PASSWORD` is set. `/privacy`, `/data-deletion` and `/health` are public on purpose. Everything else needs the password.

**Backups:** Neon and Supabase back up for you. With the bundled database, run `docker compose exec db pg_dump -U agent agent > backup.sql` daily (for example from cron) and copy the file off the server. Also keep a copy of `.env` and `brands/*.env` somewhere safe and private.

## 2. Approve from your phone (Telegram)

1. In Telegram, message **@BotFather**, send `/newbot`, and copy the token into `.env` as `TELEGRAM_BOT_TOKEN`.
2. Send your new bot any message.
3. Run `npm run telegram:setup`. It saves `TELEGRAM_CHAT_ID`.
4. Restart the agent.

Each video that needs review then arrives as a playable video with **Approve** and **Reject** buttons. Approve keeps the title, description and time Claude wrote. To edit them, use the review page. Button presses only count from your chat. Alerts and the weekly report also arrive in that chat.

## 3. Privacy policy for Google and Meta

Both reviews ask for a privacy policy URL and data deletion instructions. The review page serves them:

- `https://<DOMAIN>/privacy`
- `https://<DOMAIN>/data-deletion`

Set `PRIVACY_OWNER_NAME` and `PRIVACY_CONTACT_EMAIL` first. Read the pages and adjust `src/review/privacy.ts` if anything doesn't match how you use the tool. This is a starting point, not legal advice.

## 4. Spending and safety switches

| Setting | Default | What it does |
| --- | --- | --- |
| `AGENT_MONTHLY_BUDGET_USD` | off | Stops making new videos once this month's tracked spend reaches it, and alerts you once. Also set limits in each provider's dashboard: this only counts what the agent tracks. |
| `AGENT_AUTO_APPROVE_AFTER` | 30 | `AGENT_AUTO_APPROVE=true` only takes effect after this many videos have been posted with your approval. |
| `AGENT_KEEP_RENDERS_DAYS` | 14 | Deletes the local folders of posted and rejected videos after this many days. It only ever deletes inside `OUT_DIR`. Failed videos are kept so Retry works. |
| `AGENT_PLATFORM_DELAYS` | none | For example `facebook=60,instagram=120` posts Facebook an hour and Instagram two hours after the slot. YouTube posts at the slot. |

## 5. Growth experiments

- **Hook tests** (`AGENT_HOOK_TESTS=true` by default): each video opens with one of five hook styles (question, surprising fact, bold claim, story, challenge). The agent tries each style 3 times, then uses the one with the most average views 80% of the time and keeps testing the others 20% of the time. The weekly report and `/report` show the results. Force a style with `npm run make -- --hook-style story`.
- **Thumbnails:** long videos get a 1280×720 thumbnail made from the opening shot plus the first scene's on-screen text. It is uploaded after the video and shown on the review page. YouTube only accepts custom thumbnails from verified channels (youtube.com/verify). Without that, the upload still works and the thumbnail is skipped.
- **Generated opening clip** (`GENERATED_CLIPS=hook`): the first scene uses a clip generated through fal.ai instead of stock footage. Set:
  - `FAL_KEY`
  - `FAL_VIDEO_MODEL` (any fal.ai text-to-video model id)
  - `GENERATED_CLIP_USD_PER_SECOND`, from that model's pricing page, so costs are tracked

  If generation fails, the video falls back to stock footage. Only turn it on once the report shows your cost per 1,000 views can absorb roughly $0.50 to $5 more per video.
