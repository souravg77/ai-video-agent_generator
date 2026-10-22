# Scaling up (phase 6)

Everything here is optional. Do it once the single channel runs well.

## 1. More channels (brands)

Each brand is a file in `brands/` with its own niche, accounts, language and format. Anything a brand file leaves out comes from the shared `.env`, so API keys, `DATABASE_URL` and R2 are set once.

```sh
cp brands/example.env brands/cooking.env      # fill in AGENT_NICHE etc.
BRAND=cooking npm run db:migrate              # creates the "cooking" schema in the same database
BRAND=cooking npm run auth:youtube            # sign in with the cooking channel; the token goes into brands/cooking.env
BRAND=cooking npm run auth:meta               # same for its Facebook Page and Instagram
npm run agents                                # runs every brand; review pages on 3001, 3002…
```

Every command takes `BRAND=…`: `BRAND=cooking npm run make -- --topic …`, `BRAND=cooking npm run report`, and so on.

- Videos go to `out/<brand>/` and `<brand>/videos/` in R2. Alerts and reports are labelled with the brand.
- Each brand's tables live in their own Postgres schema (`DB_SCHEMA`, which defaults to the brand name).
- Brand files hold tokens. Git ignores them, except `example.env`.
- One Google Cloud project and one Meta app can serve every brand. Each brand only needs its own sign-in. Remember they share the YouTube quota (section 4).

## 2. Long videos for YouTube

Set `VIDEO_FORMAT=long` for a brand, or use `npm run make -- --topic … --long`, or `npm run agent:add -- … --long`. Long videos are:

- 4–8 minutes long, 1920×1080, with landscape stock footage
- captioned like normal YouTube videos, without `#Shorts`

They're posted to YouTube only, because Facebook and Instagram Reels must be vertical. Expect 25–50 Pexels searches and about 10× the ElevenLabs characters per video.

## 3. Other languages

Two options:

- **A channel in another language**: set `VIDEO_LANGUAGE=Spanish` (any language name) in a brand file. Claude plans and writes everything in that language, and ElevenLabs' multilingual model voices it. Pick an `ELEVENLABS_VOICE_ID` that sounds native.
- **Translate one video**: `npm run make -- --translate out/<run> --language Spanish` reuses the footage and creates a new script, voice and captions. Post it with that language's brand, e.g. `BRAND=spanish npm run post -- --dir out/<new run>`.

Languages written without spaces (Japanese, Chinese, Thai) are captioned by characters. They need a font that covers them: install e.g. Noto Sans CJK and set `CAPTION_FONT="Noto Sans CJK JP"`.

## 4. Replying to comments

With `AGENT_COMMENT_REPLIES=true`, every `AGENT_STATS_HOURS` the agent:

1. fetches new comments on posts from the last 14 days
2. has Claude draft a short reply to each one, skipping spam and abuse
3. alerts you

The drafts appear under **Comment replies** on the review page. Edit a draft and press **Send reply**, or press **Ignore**. Nothing is posted without your click. `npm run comments` runs the check by hand.

It needs new permissions:

- **YouTube**: run `npm run auth:youtube` again, which now asks for "manage your YouTube account" (`youtube.force-ssl`). That's the only scope that allows replying. Each reply uses 50 quota units.
- **Instagram**: `instagram_manage_comments`.
- **Facebook**: `pages_read_user_content` and `pages_manage_engagement`.

Add the Meta permissions in Graph API Explorer and run `npm run auth:meta` again.

## 5. YouTube: verification, audit and more quota

- **App verification.** Until Google verifies your OAuth app, uploads from it stay private and sign-ins in Testing mode expire after 7 days. In Google Cloud Console, open **APIs & Services → OAuth consent screen** and publish the app. Then submit it for verification with:
  - a privacy policy URL
  - a homepage
  - a short screen recording of the sign-in and upload flow
  - an explanation of each scope (upload, readonly, analytics, and force-ssl if you use comment replies)
- **API audit.** Projects that haven't passed the YouTube API Services audit can have uploads locked to private. Use the **YouTube API Services Audit and Quota Extension form** to request the audit. Describe the tool truthfully: an internal tool that posts AI-assisted videos to channels you own, with a human approving each one.
- **Quota.** The default is 10,000 units a day per Google Cloud project, shared by every brand. Uploads are by far the most expensive call (see Google's quota calculator for current costs). Stats calls cost 1 unit and replies 50. When several brands post daily, request more on the same audit form, with your expected uploads per day.

## 6. Meta App Review

In Development mode the app only works for people with a role on it (admin, developer, tester). Posting to your own Page and Instagram is fine like that. To use Advanced Access, or to let anyone without an app role connect, submit App Review:

1. **Business verification** (Meta Business Settings → Security Center). Usually a few days.
2. In the app dashboard, open **App Review → Permissions and Features** and request each permission you use:
   - Posting: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
   - Stats: `read_insights`, `instagram_manage_insights`
   - Comment replies: `pages_read_user_content`, `pages_manage_engagement`, `instagram_manage_comments`
3. For each permission, say how the app uses it and attach a screen recording of that flow. For example: the review page approving a video, then the Reel appearing on the Page.
4. Add a privacy policy URL and a data deletion instructions URL in **App settings → Basic**, then switch the app to **Live**.

Reviews usually take a few days to a couple of weeks. Rejections normally say which recording or explanation is missing.
