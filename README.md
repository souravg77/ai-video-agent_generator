# AI Video Agent

Generates short vertical videos (script → voice → render) and posts them to YouTube, Facebook Page Reels and Instagram Reels, with a human approval step.

Status: **Phase 2** (make a video, post it to YouTube). Phase 0 setup is in [docs/phase0-setup.md](docs/phase0-setup.md). See the [roadmap](https://claude.ai/artifact/PHhmQZ2a6pdjzzVFQNaWyc).

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

## Post to YouTube

```sh
npm run post:youtube                                     # newest video in out/, uploaded as private
npm run post:youtube -- --privacy public                 # or unlisted
npm run post:youtube -- --publish-at 2026-11-01T15:00:00Z  # scheduled; goes public at that time
npm run post:youtube -- --dir out/<folder> --dry-run     # show the title, description, tags and settings without uploading
```

- Title, description and hashtags come from the video's `script.json`. `#Shorts` is added, and everything is trimmed to YouTube's limits.
- Add `--synthetic` when the video uses realistic AI-generated footage, so YouTube shows its "altered or synthetic content" label. Stock footage with an AI voice-over doesn't need it.
- The result is saved to `youtube.json` in the video's folder and, when a database is set up, as a row in `posts`.
- **Until your Google Cloud project passes YouTube's API audit, every API upload stays private** whatever you ask for. Make it public by hand in YouTube Studio meanwhile.
- An upload uses about 1,600 of the default 10,000 daily quota units, so about 6 uploads a day.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run make -- --topic "…"` | Generates a video (see above) |
| `npm run post:youtube` | Uploads a finished video to YouTube (see above) |
| `npm test` | Unit tests |
| `npm run check` | Lists missing settings and tests DB, YouTube, Facebook and Instagram access |
| `npm run auth:youtube` | One-time Google sign-in; saves `YOUTUBE_REFRESH_TOKEN` |
| `npm run auth:meta` | Exchanges a Graph API Explorer token for a long-lived Page token and finds the Instagram account |
| `npm run db:migrate` | Creates the `videos`, `posts` and `post_stats` tables |

## Layout

```
src/config.ts       env loading and per-integration requirements
src/pipeline/       script, voice, visuals, captions, render, orchestration
src/publish/        posting a finished video (YouTube now; Facebook and Instagram next)
src/lib/            helpers (YouTube API, FFmpeg, storage, database, Graph API, .env writer)
scripts/            CLI entry points (make-video, setup and auth)
test/               unit tests
db/schema.sql       Postgres schema
docs/               setup guides
```
