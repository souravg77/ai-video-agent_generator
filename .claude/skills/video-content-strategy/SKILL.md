---
name: video-content-strategy
description: Plan and improve what the AI video agent publishes - choose a niche, write AGENT_NICHE, judge scripts and hooks, read the weekly report and hook-test results, and decide what to change next. Use when asked what videos to make, why views are low, or how to grow the channel.
---

# Content strategy for the AI video agent

The agent makes faceless videos: a voice-over over stock, generated or the user's own footage, with big captions. Short videos are 30–60 seconds, vertical, 4–8 scenes. Long videos are 4–8 minutes, 16:9, YouTube only. Strategy works through a few settings and through the user's approvals. Ground every recommendation in the user's own numbers when they exist.

## Choosing a niche (`AGENT_NICHE`)

Recommend one niche per channel. A good niche:

- is visual and easy to show with footage (animals, space, history, food science, geography, money basics);
- is evergreen and fact-based, because the script prompt forbids invented statistics and the format can't keep up with news;
- is narrow enough to own but has hundreds of topics, for example "surprising animal facts" rather than "facts";
- avoids medical, legal and financial advice, and real people's private lives.

Write `AGENT_NICHE` as one line that names both the audience and the angle, for example `AGENT_NICHE=surprising animal facts for curious adults, one fact per video`. The planner reads it every time it plans ideas.

For a second niche, add a brand (`brands/<name>.env`, see `docs/scaling.md`) instead of mixing topics on one channel.

## Cadence

- Start with one Short a day: `AGENT_POST_TIMES_UTC` set to one time when the audience is awake, for example `15:00` for the US.
- Review the first 30 videos yourself. That's what `AGENT_AUTO_APPROVE_AFTER=30` enforces.
- Add a second daily slot or long videos only after 2–4 weeks of steady numbers.
- YouTube quota allows about 6 uploads a day per Google project.

## Reviewing a video before approval

Check these in order, and reject or edit on the review page when they fail:

1. **Hook:** does the first line make you want the second line within 3 seconds? Rewrite weak titles and descriptions, and reject videos with weak hooks.
2. **Truth:** does any claim sound invented or overstated? Reject it. A correction comment costs more than one missing video.
3. **Visuals:** does the footage match what's being said? Generic gradients are fine; wrong footage is not.
4. **Title:** under 70 characters, specific, and no clickbait the video doesn't pay off.
5. **Hashtags:** 3–8 relevant ones. `#Shorts` is added automatically for Shorts on YouTube.

Rejecting a video frees its slot, and the planner fills it with a new idea.

## Reading results

Use `npm run report`, or `/report` on the review page:

- **Views per video by platform:** a platform far behind the others usually means a format or caption problem there, not a topic problem.
- **Best and weakest videos:** look for patterns in topic, hook and title, and name them concretely. The planner already sees view counts and leans toward winners, so the user's job is to sharpen `AGENT_NICHE` when a pattern is clear.
- **Hook styles** (`AGENT_HOOK_TESTS=true`): styles are question, surprising-fact, bold-claim, story and challenge. Each is tried 3 times, then the best is used 80% of the time. Don't judge a style on fewer than 3 videos.
- **Cost per 1,000 views** (cloud mode): only add costly extras such as `GENERATED_CLIPS=hook` or long videos when this number can absorb them.

Give a verdict only after at least 2 weeks or 10 videos. Short-video numbers are noisy, and newer videos have had less time to gather views.

## What to change, in order of leverage

1. Narrow or reword `AGENT_NICHE` toward the patterns in the best videos.
2. Reject more of the weak ideas and videos, because review quality compounds.
3. Move the posting time.
4. Try another language (`VIDEO_LANGUAGE`) on a separate brand if the niche travels well.
5. Add long videos (`VIDEO_FORMAT=long` on a YouTube-focused brand) once Shorts get steady views.
6. Turn on comment replies (`AGENT_COMMENT_REPLIES=true`) to build engagement. Every reply is still approved by the user.

## Guardrails

- Faceless and AI-voiced is allowed, but mass-produced, repetitive content can be demonetised. Keep each video useful, varied and fact-checked.
- Mark realistic synthetic footage where the platform asks (`npm run post -- --synthetic` for YouTube).
- Use only footage the user has the rights to, especially in `footage/`.
- Never suggest fake engagement, buying views, reposting other creators' videos, or misleading titles.
