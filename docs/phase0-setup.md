# Phase 0: accounts and approvals

These steps need your own logins, so they can't be done for you. Work top to bottom; each one ends with values to put in `.env`. Run `npm run check` at any point to see what's still missing.

Start steps 2 and 3 first. Their reviews take days to weeks and run while the rest gets built.

## 1. Local setup (5 min)

1. Clone this repo, then run `npm install` and `cp .env.example .env`.

## 2. YouTube: Google Cloud project (30 min, then the audit wait)

1. Go to https://console.cloud.google.com, create a project named `ai-video-agent`.
2. **APIs & Services → Library**: enable **YouTube Data API v3** and **YouTube Analytics API**.
3. **OAuth consent screen** (Google Auth Platform): user type **External**, app name, your email. Add scopes `youtube.upload` and `youtube.readonly`. Add your Google account under **Test users**.
4. **Credentials → Create credentials → OAuth client ID**, type **Desktop app**. Copy the ID and secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
5. Run `npm run auth:youtube`, open the printed URL, sign in with the account that owns the channel. This writes `YOUTUBE_REFRESH_TOKEN`.
6. Submit the **YouTube API Services audit** form (search "YouTube API Services Audit and Quota Extension Form"). Until it passes, API uploads are private-only. Describe the use as "uploading original short videos to my own channel".
7. Later, to stop the 7-day token expiry, publish the consent screen to **In production** (Google may ask for verification of the sensitive upload scope).

## 3. Meta: Facebook Page + Instagram (45 min, then verification wait)

1. Make sure you have a **Facebook Page** for the brand.
2. In the Instagram app: **Settings → Account type → Switch to professional** (Creator or Business). Then link it to the Page (Page settings → Linked accounts → Instagram, or Meta Business Suite).
3. Go to https://developers.facebook.com → **My Apps → Create app**, type **Business**. Add the **Facebook Login for Business** and **Instagram** products.
4. Copy **App ID** and **App secret** (App settings → Basic) to `.env` as `META_APP_ID` / `META_APP_SECRET`.
5. Open **Graph API Explorer**, choose your app, and request: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`. Generate a **User token**, paste it into `.env` as `META_SHORT_LIVED_USER_TOKEN`.
6. Run `npm run auth:meta`. This writes `META_PAGE_ID`, a long-lived `META_PAGE_ACCESS_TOKEN`, and `META_IG_USER_ID`.
7. Because you're an admin of the app, development mode is enough to post to **your own** Page and Instagram. Only if you'll post for other people: start **Business Verification** (Business settings → Security centre) and later submit **App Review** for Advanced Access.

## 4. Cloudflare R2 storage (15 min)

1. Create a Cloudflare account → **R2** → create bucket `video-agent`.
2. Bucket settings → enable **Public access** via the r2.dev subdomain (or a custom domain). Put that URL in `R2_PUBLIC_BASE_URL`. Instagram downloads videos from it.
3. **R2 → Manage API tokens** → create a token with Object Read & Write on that bucket. Fill `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

## 5. Postgres (10 min)

1. Create a free project on Supabase or Neon.
2. Copy the connection string into `DATABASE_URL`.
3. Run `npm run db:migrate`.

## 6. Claude API (5 min)

1. https://console.anthropic.com → API keys → create key → `ANTHROPIC_API_KEY`.
2. Set a monthly spend limit under Billing.

## Done when

`npm run check` shows a ✓ on every line, and the YouTube audit form is submitted.
