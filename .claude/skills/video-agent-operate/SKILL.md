---
name: video-agent-operate
description: Run, monitor and troubleshoot the AI video agent (souravg77/ai-video-agent_generator) day to day - make or post a video, add ideas, approve, read stats and the weekly report, run several brands, and fix failed renders or posts. Use for any "make a video", "why did it fail", "what's posted" or "run the agent" request.
---

# Operating the AI video agent

Work in the `souravg77/ai-video-agent_generator` checkout. Check `.env` (or `brands/<name>.env` when `BRAND=<name>` is set) to see the mode: `AGENT_MODE`, plus `LLM_PROVIDER`, `TTS_PROVIDER`, `VISUALS_PROVIDER` and `PUBLISH_MODE`. Never print secret values from those files.

## Commands

| Goal | Command |
| --- | --- |
| One video, now | `npm run make -- --topic "…"` (`--long` for 16:9, `--language Spanish`, `--hook-style story`, `--offline` for no keys at all) |
| Translate a finished video | `npm run make -- --translate out/<run> --language Spanish` |
| Post the newest video | `npm run post` (`--to youtube,facebook`, `--dir out/<run>`, `--privacy private`, `--schedule <ISO>`). In manual mode this exports to `out/ready/` instead |
| Add an idea to the calendar | `npm run agent:add -- --topic "…" --at 2026-11-01T15:00:00Z` |
| Run the agent | `npm run agent` (review page on `REVIEW_PORT`, default 3000), or `--once` from cron |
| Every brand | `npm run agents`. Put `BRAND=<name>` before any command to act on one brand |
| Results | `npm run stats` (snapshot now), `npm run report` (`--days 7`, `--send`) |
| Comment replies | `npm run comments`, then approve the drafts on the review page |
| Health | `npm run check`, `npm run typecheck`, `npm test` |
| Switch a step between local and an API | `npm run setup` (the user runs it in their own terminal) |

## How the agent decides

Every tick (`AGENT_TICK_SECONDS`) it does these steps in order:

1. Releases jobs stuck for over an hour.
2. Plans ideas for empty slots (`AGENT_POST_TIMES_UTC`, `AGENT_PLAN_DAYS`) from `AGENT_NICHE`.
3. Renders one video due within `AGENT_RENDER_LEAD_HOURS`.
4. Waits for approval. `AGENT_AUTO_APPROVE=true` only takes effect after `AGENT_AUTO_APPROVE_AFTER` approved posts.
5. Posts due videos per platform, with `AGENT_PLATFORM_DELAYS`. A failed platform is retried up to 3 times without re-posting the ones that worked.
6. Collects stats every `AGENT_STATS_HOURS` hours and sends the weekly report on `AGENT_REPORT_WEEKDAY`.
7. Deletes old renders after `AGENT_KEEP_RENDERS_DAYS` days.

It also stops making new videos at `AGENT_MONTHLY_BUDGET_USD`.

Video statuses: `idea → rendering → rendered (needs review) → approved → posting → posted`, or `rejected` / `failed`. Post statuses: `uploading`, `scheduled`, `published`, `failed`, or `exported` in manual mode.

To inspect the state, query Postgres with read-only SELECTs:

```sql
SELECT id, topic, status, publish_at, error FROM videos ORDER BY publish_at DESC LIMIT 20;
SELECT p.platform, p.status, p.attempts, p.error, p.url FROM posts p JOIN videos v ON v.id = p.video_id WHERE v.id = '<id>';
```

If `BRAND` or `DB_SCHEMA` is set, set the schema first: `SET search_path TO <schema>`. Leave approving, rejecting and retrying to the review page or Telegram, unless the user asks you to do it.

## Fixing problems

Start by reading the exact error, from the alert, the `videos.error` / `posts.error` columns, or the agent log. Most errors already name the fix.

| Symptom | Fix |
| --- | --- |
| "YouTube sign-in expired or was revoked" | `npm run auth:youtube`. In Testing mode it expires every 7 days, so publish the consent screen to make it permanent |
| YouTube `quotaExceeded` | Wait until midnight Pacific. An upload costs about 1,600 of the 10,000 daily units. Ask Google for more quota (`docs/scaling.md`) |
| YouTube uploads stay private | The API audit hasn't passed yet (`docs/phase0-setup.md` step 2.6) |
| Facebook or Instagram "not connected", or an expired token | `npm run auth:meta` with a fresh Graph API Explorer token |
| Instagram can't fetch the video | `R2_PUBLIC_BASE_URL` is missing or not public. Open the URL in a browser to check |
| "Can't reach Ollama" / "ollama pull" | Start `ollama serve`, or run `ollama pull $OLLAMA_MODEL` |
| The local model's answer didn't match the format | Use a larger `OLLAMA_MODEL`, or raise `OLLAMA_CONTEXT` for long videos |
| Piper not found or voice missing | `npm run local:setup`, or set `PIPER_PATH` / `PIPER_VOICE` |
| "No video clips in footage/" | Add clips, or set `VISUALS_PROVIDER=generated` |
| Missing `PEXELS_API_KEY` / `ELEVENLABS_API_KEY` | Add the key, or switch that step to local with `npm run setup` |
| Nothing gets planned | `AGENT_NICHE` is empty, or the budget cap was reached (check the alerts) |
| Video marked failed after 3 tries | Fix the cause, then press **Retry** on the review page |
| Captions show boxes | Set `CAPTION_FONT` to a font that covers the language, for example `Noto Sans CJK JP` |

After fixing, prove it works before saying it's fixed. Rerun the failing command, or run `npm run check`. For code changes, run `npm run typecheck` and `npm test`. For the agent tests, set `TEST_DATABASE_URL` to an empty, throwaway Postgres; its tables get truncated.

## Rules

- Post only to accounts the user owns, and only videos they've approved, unless they've turned on auto-approve.
- Never post through browser automation or unofficial APIs.
- Before re-posting, deleting videos, or changing the posting schedule, confirm with the user. Those actions are public or hard to undo.
