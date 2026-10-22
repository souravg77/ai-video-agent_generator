// Turns a short-lived user token (from Graph API Explorer) into a long-lived Page token,
// finds the Instagram professional account linked to the Page, and saves both to .env.
import { config } from "../src/config.js";
import { writeEnv } from "../src/lib/env-file.js";
import { graphGet } from "../src/lib/graph.js";

const { META_APP_ID, META_APP_SECRET, META_SHORT_LIVED_USER_TOKEN } = config;
if (!META_APP_ID || !META_APP_SECRET || !META_SHORT_LIVED_USER_TOKEN) {
  console.error("Set META_APP_ID, META_APP_SECRET and META_SHORT_LIVED_USER_TOKEN in .env first.");
  process.exit(1);
}

const { access_token: longUserToken } = await graphGet<{ access_token: string }>("oauth/access_token", {
  grant_type: "fb_exchange_token",
  client_id: META_APP_ID,
  client_secret: META_APP_SECRET,
  fb_exchange_token: META_SHORT_LIVED_USER_TOKEN,
});

type Page = { id: string; name: string; access_token: string };
const { data: pages } = await graphGet<{ data: Page[] }>("me/accounts", {
  access_token: longUserToken,
  fields: "id,name,access_token",
});
if (pages.length === 0) throw new Error("No Facebook Pages found. Is the token granted pages_show_list for your Page?");

const wanted = config.META_PAGE_ID;
const page = wanted ? pages.find((p) => p.id === wanted) : pages[0];
if (!page) throw new Error(`Page ${wanted} not in: ${pages.map((p) => `${p.name} (${p.id})`).join(", ")}`);
if (!wanted && pages.length > 1) {
  console.warn(`Several Pages found; using "${page.name}". Set META_PAGE_ID to pick another:`);
  for (const p of pages) console.warn(`  ${p.name}: ${p.id}`);
}

const { instagram_business_account: ig } = await graphGet<{ instagram_business_account?: { id: string } }>(page.id, {
  access_token: page.access_token,
  fields: "instagram_business_account",
});

writeEnv({
  META_PAGE_ID: page.id,
  META_PAGE_ACCESS_TOKEN: page.access_token,
  ...(ig ? { META_IG_USER_ID: ig.id } : {}),
});

console.log(`Saved long-lived Page token for "${page.name}" (${page.id}).`);
console.log(ig ? `Linked Instagram account: ${ig.id}` : "No Instagram professional account is linked to this Page yet.");
