---
name: video-agent-setup
description: Set up the AI video agent (souravg77/ai-video-agent_generator) from scratch or fix its setup, in free local mode or cloud mode with Claude, ElevenLabs, Pexels, YouTube and Meta. Use when asked to install, configure, connect accounts, or get the first video made or posted.
---

# Setting up the AI video agent

The agent (repo `souravg77/ai-video-agent_generator`, TypeScript, Node 20+) plans short videos, writes scripts, records a voice-over, renders with FFmpeg, waits for approval on a review page, and posts to YouTube, Facebook Reels and Instagram Reels.

If the repo isn't in the working directory, clone it first. Read `README.md`, `.env.example` and the doc for the chosen mode before changing anything; they are the source of truth and may be newer than this skill.

## 1. Pick a mode (ask once if the user hasn't said)

| | Local (`AGENT_MODE=local`) | Cloud (`AGENT_MODE=cloud`, default) |
| --- | --- | --- |
| Cost | $0 | tens of cents to about $1 per video |
| Writing | Ollama on their machine | Claude API |
| Voice | Piper | ElevenLabs |
| Footage | generated gradients or `footage/` clips | Pexels |
| Posting | exported to `out/ready/`, uploaded by hand | YouTube and Meta APIs, automatic |
| Guide | `docs/local-mode.md` | `docs/phase0-setup.md` |

The two can be mixed per step with `LLM_PROVIDER`, `TTS_PROVIDER`, `VISUALS_PROVIDER` and `PUBLISH_MODE`. A common mix is everything local except `PUBLISH_MODE=api` once the platform apps are approved.

Never automate posting through a browser or unofficial tools. It breaks the platforms' terms and gets accounts banned. Automatic posting goes through the official APIs only.

## 2. Common steps

```sh
npm install
cp .env.example .env       # only if .env doesn't exist; never overwrite it
```

FFmpeg must be installed (`ffmpeg -version`).

## 3a. Local mode

```sh
npm run local:setup        # pulls the Ollama model, installs Piper, downloads the voice, sets AGENT_MODE=local
npm run check
npm run make -- --topic "why octopuses have three hearts"
```

- Ollama must be running first (`ollama serve`, or the desktop app). The default model `qwen3:14b` needs about 16 GB of RAM. Suggest `qwen3:8b` on smaller machines.
- If pip puts `piper` in `~/.local/bin` and that folder isn't on PATH, set `PIPER_PATH` to the full path.
- To use their own clips, set `VISUALS_PROVIDER=folder` and put files in `footage/` named by content, for example `ocean-waves-sunset.mp4`.

## 3b. Cloud mode

Work through `docs/phase0-setup.md` in order. Start the slow approvals first, because they take days:

1. Google Cloud project with the YouTube Data and Analytics APIs, an OAuth consent screen and a Desktop OAuth client. Then submit the YouTube API audit. Until it passes, uploads are private only. In Testing mode the sign-in also expires every 7 days.
2. Meta Business app, a Facebook Page, and an Instagram professional account linked to that Page. Development mode is enough to post to the user's own accounts. Business Verification and App Review are only needed to post for other people.
3. Cloudflare R2 bucket with a public URL (Instagram fetches the video from there).
4. Postgres (Neon, Supabase, or the Docker one).
5. Keys: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`.

Then:

```sh
npm run auth:youtube       # browser sign-in, saves YOUTUBE_REFRESH_TOKEN
npm run auth:meta          # paste a Graph API Explorer token; saves the Page token and IG user id
npm run db:migrate
npm run check              # every line should be ✓
```

The user does every sign-in and enters every secret themselves. Don't ask them to paste secrets into chat, and never commit `.env` or `brands/*.env`.

## 4. Agent and review page

```sh
npm run db:migrate         # needs DATABASE_URL, in both modes
# set AGENT_NICHE in .env, e.g. "surprising animal facts"
npm run agent              # review page at http://localhost:3000
```

For a server, follow `docs/hosting.md`: `docker compose up -d`, with `DOMAIN` and `REVIEW_PASSWORD` set. For local mode in Docker, add `-f docker-compose.local.yml`.

Optional: approve from a phone with Telegram. Create a bot with @BotFather, set `TELEGRAM_BOT_TOKEN`, message the bot, then run `npm run telegram:setup`.

## Done when

- `npm run check` shows ✓ for everything the chosen mode needs.
- `npm run make -- --topic "…"` produces `out/<run>/video.mp4`. Watch it, or extract a frame with `ffmpeg -ss 1 -i video.mp4 -frames:v 1 frame.png` and look at it.
- Cloud mode: `npm run post -- --privacy private` puts one test video on each platform.
- Local mode: `npm run post` creates `out/ready/<date>-<title>/` with `UPLOAD.md`.

Tell the user plainly which steps they must do themselves: sign-ins, app reviews, payments, and uploading in manual mode.
