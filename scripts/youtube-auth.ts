// One-time OAuth for the YouTube channel. Opens a consent URL, catches the redirect on localhost,
// and saves the refresh token to .env (or brands/<BRAND>.env) as YOUTUBE_REFRESH_TOKEN.
import { createServer } from "node:http";
import { google } from "googleapis";
import { config, envFile } from "../src/config.js";
import { writeEnv } from "../src/lib/env-file.js";

const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  // Watch time and average view duration for the weekly report
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  // Replying to comments (phase 6); YouTube has no narrower scope for this
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
  console.error(`Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in ${envFile} first (OAuth client type: Desktop app).`);
  process.exit(1);
}

const oauth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, REDIRECT);
const authUrl = oauth.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  if (url.pathname !== "/oauth2callback") return void res.writeHead(404).end();
  const code = url.searchParams.get("code");
  if (!code) return void res.writeHead(400).end("Missing code");

  try {
    const { tokens } = await oauth.getToken(code);
    if (!tokens.refresh_token) throw new Error("No refresh token returned. Remove the app's access at myaccount.google.com/permissions and retry.");
    oauth.setCredentials(tokens);

    const yt = google.youtube({ version: "v3", auth: oauth });
    const me = await yt.channels.list({ part: ["snippet"], mine: true });
    const channel = me.data.items?.[0]?.snippet?.title ?? "(no channel found)";

    writeEnv({ YOUTUBE_REFRESH_TOKEN: tokens.refresh_token });
    res.end(`Authorized for channel: ${channel}. You can close this tab.`);
    console.log(`Saved YOUTUBE_REFRESH_TOKEN for channel "${channel}" to ${envFile}.`);
    console.log("Note: while the OAuth consent screen is in Testing mode, this token expires after 7 days.");
  } catch (err) {
    res.writeHead(500).end(String(err));
    console.error(err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("Open this URL and sign in with the Google account that owns the channel:\n");
  console.log(authUrl);
});
