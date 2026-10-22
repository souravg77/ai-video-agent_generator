# AI Video Agent

Generates short vertical videos (script → voice → render) and posts them to YouTube, Facebook Page Reels and Instagram Reels, with a human approval step.

Status: **Phase 6**. The agent plans ideas, makes videos, waits for your approval on a review page, posts them on schedule to YouTube, Facebook and Instagram, tracks how each one does, and sends a weekly report. It can run several channels side by side, make long 16:9 YouTube videos, work in other languages and draft replies to comments for you to approve: see [docs/scaling.md](docs/scaling.md). Phase 0 setup is in [docs/phase0-setup.md](docs/phase0-setup.md). See the [roadmap](https://claude.ai/artifact/PHhmQZ2a6pdjzzVFQNaWyc).

## Free, offline mode

No API keys at all: `npm run local:setup`, then `npm run make -- --topic "…"`. Ollama writes, Piper speaks, backgrounds are generated, and finished videos are exported for you to upload by hand. See [docs/local-mode.md](docs/local-mode.md).

## Claude skills

`.claude/skills/` teaches Claude Code to work with this agent: `video-agent-setup` (install and connect accounts, cloud or local), `video-agent-operate` (make, post, monitor, fix failures) and `video-content-strategy` (niche, hooks, reading the report). Open the repo in Claude Code and ask, for example, "set up local mode" or "why did yesterday's post fail?".

## Setup

```sh
npm install
cp .env.example .env
npm run check          # shows what's configured and tests each credential
```

Follow [docs/phase0-setup.md](docs/phase0-setup.md) to fill in `.env`. Making videos also needs [FFmpeg](https://ffmpeg.org/download.html) installed.

## Run the agent

```sh
npm run db:migrate          # once, and again after updates
npm run agent               # keeps running; review page at http://localhost:3000
```

Every minute the agent:

1. **Plans**: keeps the next `AGENT_PLAN_DAYS` days of posting slots (`AGENT_POST_TIMES_UTC`) filled with ideas Claude proposes for your `AGENT_NICHE`, avoiding repeats and leaning toward topics that got views.
2. **Makes**: turns the next idea due within `AGENT_RENDER_LEAD_HOURS` into a video (one per minute).
3. **Waits for you**: the video shows up on the review page. Watch it, edit the title, description, hashtags or time, then **Approve** or **Reject**. Rejected slots are refilled with a new idea. Set `AGENT_AUTO_APPROVE=true` to skip review.
4. **Posts**: at the slot time, posts approved videos to `AGENT_PLATFORMS`. A platform that fails is retried on the next minutes, up to 3 tries, without re-posting to the platforms that worked. Then the video is marked failed and a **Retry** button appears.
5. **Alerts**: failures are logged and sent to `ALERT_WEBHOOK_URL` if set (a Slack or Discord incoming webhook).
6. **Tracks results**: every `AGENT_STATS_HOURS` hours it saves views, likes, comments, shares and watch time for each post from the last 30 days. The planner sees each video's total views, so new ideas lean toward what worked.
7. **Reports**: on `AGENT_REPORT_WEEKDAY` (Monday by default) after 09:00 UTC it sends the weekly report to the webhook: videos posted, views per platform, best and weakest videos, spend and cost per 1,000 views.

Other ways to run it:

```sh
npm run agent -- --once                                   # one pass, e.g. from cron every few minutes
npm run agent -- --offline                                # sample ideas and offline renders, to try the review page without API keys
npm run agent:add -- --topic "why cats purr" --at 2026-11-01T15:00:00Z   # add your own idea to the calendar
```

The review page only listens on this computer unless `REVIEW_PASSWORD` is set; with a password it's open to your network (sign in with any username). Use a tunnel or a server with HTTPS before exposing it to the internet.

The agent needs `DATABASE_URL`. A crash mid-render or mid-post is recovered automatically after an hour.

## Running it for real

[docs/hosting.md](docs/hosting.md) covers:

- `docker compose up -d` (agent, Postgres, and Caddy for HTTPS)
- approving videos from your phone with Telegram buttons
- the public `/privacy` and `/data-deletion` pages that Google and Meta ask for
- spend and safety switches: monthly budget, auto-approve only after 30 approved posts, old file cleanup, per-platform delays
- hook-style tests, long-video thumbnails, and an optional generated opening clip

## Scaling up

| | How |
| --- | --- |
| Several channels | One file per brand in `brands/`, then `npm run agents` |
| Long YouTube videos | `VIDEO_FORMAT=long` or `npm run make -- --topic … --long` |
| Another language | `VIDEO_LANGUAGE=Spanish`, or `npm run make -- --translate out/<run> --language Spanish` |
| Comment replies | `AGENT_COMMENT_REPLIES=true`: Claude drafts, you approve on the review page |
| Quota and app reviews | YouTube verification and audit, Meta App Review |

Details for each are in [docs/scaling.md](docs/scaling.md).

## Results and costs

```sh
npm run report                 # last 7 days in the terminal
npm run report -- --days 30 --send   # a month, also posted to ALERT_WEBHOOK_URL
npm run stats                  # take a stats snapshot now (the agent does this on its own)
```

The review page has the same report at `/report`, with links to each post.

Each video's cost is Claude's tokens plus ElevenLabs characters, saved in `videos.cost_usd` and printed by `npm run make`. Set `ELEVENLABS_USD_PER_1K_CHARS` to your plan's rate (0.30 by default). Pexels is free; hosting and storage aren't counted.

Permissions the stats need, on top of the posting ones:

- **YouTube watch time**: run `npm run auth:youtube` again so the sign-in includes YouTube Analytics (read only). Without it you still get views, likes and comments.
- **Instagram**: `instagram_manage_insights`. **Facebook**: `read_insights`. Add both in Graph API Explorer and run `npm run auth:meta` again. Facebook Reels view counts aren't available for every Page yet; likes and comments always are.

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

## Post to all platforms

```sh
npm run post                                             # newest video in out/ to YouTube, Facebook and Instagram
npm run post -- --to youtube,facebook                    # pick platforms
npm run post -- --to youtube,facebook --schedule 2026-11-01T15:00:00Z
```

- **Facebook**: uploaded straight from your computer as a Page Reel. Can be scheduled 10 minutes to 29 days ahead.
- **Instagram**: Instagram downloads the video from a public link, so R2 storage with a public URL is required (the video is uploaded there automatically). Instagram's API can't schedule; `--schedule` with Instagram is refused, and the phase 4 agent posts Instagram at the right time instead.
- Captions are the script's description plus hashtags (Instagram: up to 2,200 characters and 30 hashtags).
- If one platform fails, the others still post. Each result is saved next to the video (`youtube.json`, `facebook.json`, `instagram.json`) and in the `posts` table.

## Post to YouTube only

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
| `npm run agent` | Runs the agent and the review page |
| `npm run agent:add -- --topic "…" --at …` | Adds an idea to the calendar |
| `npm run agents` | Runs one agent per brand in `brands/` |
| `npm run comments` | Fetches new comments and drafts replies for the review page |
| `npm run telegram:setup` | Finds your Telegram chat id after you message your bot |
| `npm run report` | Weekly report: views, best and weakest videos, spend (`--days`, `--send`) |
| `npm run stats` | Saves a views/likes/watch-time snapshot for recent posts |
| `npm run post` | Posts a finished video to YouTube, Facebook and Instagram |
| `npm run post:youtube` | Uploads a finished video to YouTube (see above) |
| `npm test` | Tests (set `TEST_DATABASE_URL` to an empty Postgres database to include the agent tests; its tables get emptied) |
| `npm run check` | Lists missing settings and tests DB, YouTube, Facebook and Instagram access (or Ollama, Piper and footage in local mode) |
| `npm run local:setup` | Gets local mode ready: Ollama model, Piper and its voice, footage folder |
| `npm run auth:youtube` | One-time Google sign-in; saves `YOUTUBE_REFRESH_TOKEN` |
| `npm run auth:meta` | Exchanges a Graph API Explorer token for a long-lived Page token and finds the Instagram account |
| `npm run db:migrate` | Creates or updates the `videos`, `posts`, `post_stats` and `agent_state` tables |

## Layout

```
src/config.ts       env loading and per-integration requirements
src/pipeline/       script, voice, visuals, captions, render, orchestration
src/publish/        posting a finished video to YouTube, Facebook and Instagram
src/agent/          planner, posting slots, job queue in Postgres, worker loop, alerts, Telegram approval
src/analytics/      stats from each platform, weekly report
src/comments/      fetching comments, Claude's reply drafts, sending approved replies
src/review/         review page (watch, edit, approve, reject, retry), report page, privacy pages
src/lib/            helpers (Claude/Ollama, YouTube and Meta APIs, FFmpeg, storage, database, Graph API, .env writer)
scripts/            CLI entry points (make-video, setup and auth)
test/               unit tests
db/schema.sql       Postgres schema
docs/               setup guides
```
