import { config } from "../config.js";
import { esc } from "./page.js";

// Google's OAuth verification and Meta's App Review both ask for a privacy policy URL and data deletion
// instructions. These pages are public (no password) so the reviewers can open them.
export function renderPrivacyPage(kind: "privacy" | "data-deletion"): string {
  const owner = esc(config.PRIVACY_OWNER_NAME ?? "the operator of this tool");
  const contact = config.PRIVACY_CONTACT_EMAIL
    ? `<a href="mailto:${esc(config.PRIVACY_CONTACT_EMAIL)}">${esc(config.PRIVACY_CONTACT_EMAIL)}</a>`
    : "the email address listed on the app's store or consent screen";
  const body =
    kind === "privacy"
      ? `<h1>Privacy policy</h1>
<p>This tool is operated by ${owner} to create short videos and publish them to YouTube, Facebook and Instagram accounts that ${owner} owns or manages. It is not offered to the public.</p>
<h2>What it accesses</h2>
<ul>
<li>YouTube (Google API Services): uploading videos, reading those videos' statistics and analytics, and, if enabled, reading comments on them and posting replies that a person has approved.</li>
<li>Facebook Pages and Instagram professional accounts (Meta Graph API): publishing Reels, reading their insights, and, if enabled, reading comments on them and posting approved replies.</li>
</ul>
<h2>What it stores</h2>
<p>Access tokens for the connected accounts, the videos it made, their titles and descriptions, post links, view and engagement counts, and, if comment replies are enabled, the text and display name of comments on those videos. Data is kept in a private database and storage bucket controlled by ${owner}. It is not sold or shared with anyone, and it is used only to run and improve the operator's own channels.</p>
<p>Scripts and comment reply drafts are generated with Anthropic's Claude API, and voice-overs with ElevenLabs; the text sent to them is the video topic, the script, and, for reply drafts, the comments being answered.</p>
<p>Use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. YouTube use is also subject to the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and the <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>
<h2>Revoking access</h2>
<p>Access can be revoked at any time from <a href="https://myaccount.google.com/permissions">Google account permissions</a> or Facebook's Settings → Business integrations. See <a href="/data-deletion">data deletion</a> to have stored data removed.</p>
<h2>Contact</h2>
<p>Questions: ${contact}.</p>`
      : `<h1>Data deletion</h1>
<p>To delete the data this tool stores about you or a comment you wrote, email ${contact} with the link to the video or comment. It is removed within 30 days and you will get a confirmation.</p>
<p>To stop the tool from accessing an account, revoke it in <a href="https://myaccount.google.com/permissions">Google account permissions</a> or in Facebook's Settings → Business integrations. Stored tokens stop working immediately.</p>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${kind === "privacy" ? "Privacy Policy" : "Data Deletion"}</title>
<style>
:root { --bg:#fff; --fg:#17202a; --muted:#5d6b7a; --accent:#1f6feb; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --fg:#e5eaf0; --muted:#98a5b3; --accent:#6ea8ff; color-scheme: dark; } }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; } a { color: var(--accent); } h2 { font-size: 18px; margin-top: 28px; }
</style></head><body><main>${body}
<p style="color:var(--muted);font-size:14px">Last updated ${new Date().toISOString().slice(0, 10)}</p></main></body></html>`;
}
