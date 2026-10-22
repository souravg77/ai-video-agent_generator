# AI Video Agent

Generates short vertical videos (script → voice → render) and posts them to YouTube, Facebook Page Reels and Instagram Reels, with a human approval step.

Status: **Phase 1** (topic → finished vertical MP4). Phase 0 setup is in [docs/phase0-setup.md](docs/phase0-setup.md). See the [roadmap](https://claude.ai/artifact/PHhmQZ2a6pdjzzVFQNaWyc).

## Setup

```sh
npm install
cp .env.example .env
npm run check          # shows what's configured and tests each credential
```

Follow [docs/phase0-setup.md](docs/phase0-setup.md) to fill in `.env`. Making videos also needs [FFmpeg](https://ffmpeg.org/download.html) installed.

## Make a video

```sh
npm run make -- --topic "why octopuses have three hearts"
npm run make -- --topic "anything" --offline        # no API keys: sample script, silent audio, colour backgrounds
npm run make -- --topic "..." --music track.mp3     # optional background music, mixed quietly under the voice
```

Each run writes a folder under `out/` with `script.json`, the per-scene voice and footage files, `captions.ass` and the final `video.mp4` (1080×1920, 30 fps, H.264/AAC).

How it works:

1. **Script**: Claude returns structured JSON (hook, 4–8 scenes with narration, on-screen text and a stock-footage search, plus title, description and hashtags).
2. **Voice**: ElevenLabs reads each scene's narration; the audio length sets the scene length.
3. **Visuals**: a portrait clip per scene from Pexels, never reusing the same clip in one video.
4. **Render**: FFmpeg crops each clip to 9:16, adds the large title text and word-by-word captions above the Shorts/Reels UI area, and mixes in music.
5. **Save**: uploads to R2 and records the video in Postgres when those are configured.

Needs `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` and `PEXELS_API_KEY`; storage and database are optional.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run make -- --topic "…"` | Generates a video (see above) |
| `npm test` | Unit tests |
| `npm run check` | Lists missing settings and tests DB, YouTube, Facebook and Instagram access |
| `npm run auth:youtube` | One-time Google sign-in; saves `YOUTUBE_REFRESH_TOKEN` |
| `npm run auth:meta` | Exchanges a Graph API Explorer token for a long-lived Page token and finds the Instagram account |
| `npm run db:migrate` | Creates the `videos`, `posts` and `post_stats` tables |

## Layout

```
src/config.ts       env loading and per-integration requirements
src/pipeline/       script, voice, visuals, captions, render, orchestration
src/lib/            helpers (FFmpeg, storage, database, Graph API, .env writer)
scripts/            CLI entry points (make-video, setup and auth)
test/               unit tests
db/schema.sql       Postgres schema
docs/               setup guides
```
