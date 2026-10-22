import type { PostRow, VideoRow } from "../agent/store.js";
import { hours, type Report } from "../analytics/report.js";
import type { CommentRow } from "../comments/index.js";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// <input type="datetime-local"> value, in UTC.
export const toInputUtc = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");
const fmt = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "unscheduled");

const STYLES = `
:root { --bg:#f5f6f8; --card:#fff; --fg:#17202a; --muted:#5d6b7a; --line:#dde2e8; --accent:#1f6feb; --ok:#1a7f37; --bad:#c62828; --warn:#9a5b00; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f141a; --card:#161d25; --fg:#e5eaf0; --muted:#98a5b3; --line:#29333e; --accent:#6ea8ff; --ok:#56d364; --bad:#ff7b72; --warn:#f0b45a; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 980px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 32px 0 12px; }
.lede { color: var(--muted); margin: 0; }
.flash { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; margin-top: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; margin-bottom: 16px; }
.card video { width: 100%; aspect-ratio: 9/16; background: #000; border-radius: 8px; grid-row: span 2; }
.fields { display: grid; gap: 6px; min-width: 0; }
label { font-size: 13px; font-weight: 600; margin-top: 6px; } .hint { font-weight: 400; color: var(--muted); }
input, textarea { width: 100%; min-width: 0; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px; }
button { font: inherit; border: 1px solid var(--line); background: var(--card); color: var(--fg); border-radius: 6px; padding: 8px 16px; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.actions { margin-top: 8px; } .reject { display: flex; gap: 8px; align-self: end; min-width: 0; } .reject input { flex: 1; }
.meta { margin: 0; color: var(--muted); font-size: 13px; }
.status { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
.status.needs, .s-rendered { color: var(--accent); border-color: var(--accent); } .status.bad, .s-failed { color: var(--bad); border-color: var(--bad); }
.s-posted, .s-approved { color: var(--ok); border-color: var(--ok); }
ul { list-style: none; padding: 0; margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.row { padding: 12px 16px; border-bottom: 1px solid var(--line); display: grid; gap: 4px; } .row:last-child { border-bottom: 0; }
.row-main { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; } .row-main strong { min-width: 0; overflow-wrap: anywhere; }
.when { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; margin-left: auto; }
.sub { margin: 0; color: var(--muted); font-size: 13px; } .err { color: var(--bad); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; } .chip { font-size: 12px; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--line); color: var(--muted); text-decoration: none; }
.chip.ok { color: var(--ok); border-color: var(--ok); } .chip.bad { color: var(--bad); border-color: var(--bad); }
.row form button { padding: 4px 12px; font-size: 13px; justify-self: start; }
.empty { color: var(--muted); padding: 16px; margin: 0; }
@media (max-width: 640px) { .card { grid-template-columns: minmax(0, 1fr); } .card video { max-width: 280px; justify-self: center; grid-row: auto; } .when { margin-left: 0; } }
nav { display: flex; gap: 16px; margin-bottom: 16px; font-size: 14px; } nav a { color: var(--accent); }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.stat { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px; }
.stat b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; } .stat span { color: var(--muted); font-size: 13px; }
.table-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
th:first-child, td:first-child { text-align: left; white-space: normal; min-width: 180px; } tr:last-child td { border-bottom: 0; } th { color: var(--muted); font-weight: 600; font-size: 13px; }
td a { color: var(--accent); }
.thumb { width: 100%; max-width: 320px; aspect-ratio: 16/9; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); }
.card.long video { aspect-ratio: 16/9; }
.reply { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; display: grid; gap: 8px; min-width: 0; }
.reply blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--line); background: var(--bg); border-radius: 0 6px 6px 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.reply .actions { display: flex; gap: 8px; margin: 0; } .reply a { color: var(--accent); }
`;

const STATUS_LABEL: Record<string, string> = {
  idea: "Planned",
  rendering: "Making",
  rendered: "Needs review",
  approved: "Approved",
  posting: "Posting",
  posted: "Posted",
  rejected: "Rejected",
  failed: "Failed",
};

function postChips(posts: PostRow[] = []): string {
  return posts
    .map((p) => {
      const ok = p.status === "published" || p.status === "scheduled";
      const label = `${p.platform}: ${p.status}${p.status === "failed" ? ` (${p.attempts}/3)` : ""}`;
      return p.url && ok
        ? `<a class="chip ok" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(label)}</a>`
        : `<span class="chip ${p.status === "failed" ? "bad" : ""}" title="${esc(p.error)}">${esc(label)}</span>`;
    })
    .join("");
}

function reviewCard(v: VideoRow, now: Date): string {
  const overdue = v.publish_at && v.publish_at < now;
  const tags = (v.hashtags.length ? v.hashtags : (v.script?.hashtags ?? [])).join(" ");
  return `<article class="card review${v.format === "long" ? " long" : ""}" id="v-${esc(v.id)}">
  <video src="/videos/${esc(v.id)}/file" controls preload="metadata" playsinline></video>
  <form method="post" action="/videos/${esc(v.id)}/approve" class="fields">
    <p class="meta"><span class="status needs">Needs review</span> ${overdue ? `<span class="status bad">Slot passed; posts as soon as approved</span>` : `Posts ${esc(fmt(v.publish_at))}`}</p>
    <label for="t-${esc(v.id)}">Title</label>
    <input id="t-${esc(v.id)}" name="title" maxlength="100" value="${esc(v.title ?? v.script?.title)}" required>
    <label for="d-${esc(v.id)}">Description</label>
    <textarea id="d-${esc(v.id)}" name="description" rows="4">${esc(v.description ?? v.script?.description)}</textarea>
    <label for="h-${esc(v.id)}">Hashtags <span class="hint">space separated, no #</span></label>
    <input id="h-${esc(v.id)}" name="hashtags" value="${esc(tags)}">
    <label for="p-${esc(v.id)}">Post at <span class="hint">UTC</span></label>
    <input id="p-${esc(v.id)}" name="publish_at" type="datetime-local" value="${esc(toInputUtc(v.publish_at))}">
    ${v.format === "long" ? `<label>Thumbnail</label><img class="thumb" src="/videos/${esc(v.id)}/thumbnail" alt="Thumbnail for ${esc(v.title ?? v.topic)}">` : ""}
    <p class="meta">Platforms: ${esc(v.platforms.join(", "))}${v.hook_style ? ` · hook test: ${esc(v.hook_style)}` : ""}</p>
    <div class="actions">
      <button type="submit" class="primary">Approve</button>
    </div>
  </form>
  <form method="post" action="/videos/${esc(v.id)}/reject" class="reject">
    <input id="r-${esc(v.id)}" name="note" placeholder="Why reject? (optional)" aria-label="Reason for rejecting">
    <button type="submit">Reject</button>
  </form>
</article>`;
}

function replyCard(c: CommentRow): string {
  return `<article class="reply">
  <p class="meta"><strong>${esc(c.author ?? "Someone")}</strong> on ${esc(c.platform)} · ${c.post_url ? `<a href="${esc(c.post_url)}" target="_blank" rel="noopener">${esc(c.video_title)}</a>` : esc(c.video_title)}${c.status === "failed" ? ` · <span class="err">last try failed: ${esc(c.error)}</span>` : ""}</p>
  <blockquote>${esc(c.text)}</blockquote>
  <form method="post" action="/comments/${esc(c.id)}/send" class="fields">
    <label for="c-${esc(c.id)}">Reply <span class="hint">edit before sending; posts publicly as your account</span></label>
    <textarea id="c-${esc(c.id)}" name="reply" rows="3" maxlength="1000">${esc(c.draft)}</textarea>
    <div class="actions">
      <button type="submit" class="primary">Send reply</button>
      <button type="submit" formaction="/comments/${esc(c.id)}/ignore">Ignore</button>
    </div>
  </form>
</article>`;
}

function row(v: VideoRow, posts?: PostRow[]): string {
  const action =
    v.status === "failed"
      ? `<form method="post" action="/videos/${esc(v.id)}/retry"><button type="submit">Retry</button></form>`
      : v.status === "idea"
        ? `<form method="post" action="/videos/${esc(v.id)}/reject"><button type="submit">Skip</button></form>`
        : "";
  return `<li class="row">
  <div class="row-main">
    <span class="status s-${esc(v.status)}">${esc(STATUS_LABEL[v.status] ?? v.status)}</span>
    <strong>${esc(v.title ?? v.topic)}</strong>
    <span class="when">${esc(fmt(v.publish_at))}</span>
  </div>
  ${v.angle && !v.title ? `<p class="sub">${esc(v.angle)}</p>` : ""}
  ${v.error ? `<p class="sub err">${esc(v.error)}</p>` : ""}
  ${posts?.length ? `<div class="chips">${postChips(posts)}</div>` : ""}
  ${action}
</li>`;
}

export function renderPage(data: {
  review: VideoRow[];
  upcoming: VideoRow[];
  recent: VideoRow[];
  posts: Map<string, PostRow[]>;
  replies?: CommentRow[];
  now: Date;
  flash?: string;
}): string {
  const { review, upcoming, recent, posts, now } = data;
  const replies = data.replies ?? [];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video Review Queue</title>
<style>${STYLES}</style></head>
<body><main>
<nav><a href="/">Review queue</a><a href="/report">Weekly report</a></nav>
<h1>Video review queue</h1>
<p class="lede">${review.length} waiting for review${replies.length ? ` · ${replies.length} comment repl${replies.length === 1 ? "y" : "ies"} to approve` : ""} · ${upcoming.length} coming up · times in UTC</p>
${data.flash ? `<p class="flash" role="status">${esc(data.flash)}</p>` : ""}
<h2>Needs review</h2>
${review.length ? review.map((v) => reviewCard(v, now)).join("\n") : `<ul><li><p class="empty">Nothing to review. New videos appear here once the agent makes them.</p></li></ul>`}
${replies.length ? `<h2>Comment replies</h2>\n${replies.map(replyCard).join("\n")}` : ""}
<h2>Coming up</h2>
<ul>${upcoming.length ? upcoming.map((v) => row(v, posts.get(v.id))).join("") : `<li><p class="empty">No planned videos. Set AGENT_NICHE so the agent plans ideas, or add one with npm run agent:add.</p></li>`}</ul>
<h2>Recent</h2>
<ul>${recent.length ? recent.map((v) => row(v, posts.get(v.id))).join("") : `<li><p class="empty">Nothing posted yet.</p></li>`}</ul>
</main></body></html>`;
}

export function renderReportPage(r: Report): string {
  const t = r.totals;
  const usd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;
  const int = (x: number) => Math.round(x).toLocaleString("en-US");
  const platforms = ["youtube", "facebook", "instagram"] as const;
  const shown = platforms.filter((p) => r.byPlatform[p]);
  const stat = (value: string, label: string) => `<div class="stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
  const cell = (v: Report["videos"][number], p: (typeof platforms)[number]) => {
    const x = v.platforms[p];
    if (!x) return "<td>–</td>";
    return `<td>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${int(x.views)}</a>` : int(x.views)}</td>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Video Report</title>
<style>${STYLES}</style></head>
<body><main>
<nav><a href="/">Review queue</a><a href="/report">Weekly report</a></nav>
<h1>Last 7 days</h1>
<p class="lede">${esc(r.from.toISOString().slice(0, 10))} to ${esc(r.to.toISOString().slice(0, 10))} · latest numbers from each platform</p>
<h2>Totals</h2>
<div class="stats">
${stat(int(t.videos), "videos posted")}
${stat(int(t.views), "views")}
${stat(int(t.likes), "likes")}
${stat(int(t.comments), "comments")}
${stat(t.watchTimeSec ? hours(t.watchTimeSec) : "–", "watch time")}
${stat(usd(t.costUsd), "spent making them")}
${stat(t.costPer1kViews == null ? "–" : usd(t.costPer1kViews), "per 1,000 views")}
${r.rejected.count ? stat(`${r.rejected.count} (${usd(r.rejected.costUsd)})`, "rejected") : ""}
</div>
<h2>Videos</h2>
${
  r.videos.length
    ? `<div class="table-wrap"><table>
<thead><tr><th scope="col">Video</th>${shown.map((p) => `<th scope="col">${esc(p)}</th>`).join("")}<th scope="col">Total views</th><th scope="col">Cost</th></tr></thead>
<tbody>${r.videos.map((v) => `<tr><td>${esc(v.title)}</td>${shown.map((p) => cell(v, p)).join("")}<td>${int(v.views)}</td><td>${usd(v.costUsd)}</td></tr>`).join("")}</tbody>
</table></div>`
    : `<ul><li><p class="empty">Nothing posted in the last 7 days.</p></li></ul>`
}
${
  r.hookStyles.length
    ? `<h2>Hook styles</h2>
<p class="lede">Last 90 days. The agent keeps testing every style and mostly uses the one with the most views.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Hook style</th><th scope="col">Videos</th><th scope="col">Avg views</th></tr></thead>
<tbody>${r.hookStyles.map((h) => `<tr><td>${esc(h.style)}</td><td>${int(h.videos)}</td><td>${int(h.avgViews)}</td></tr>`).join("")}</tbody>
</table></div>`
    : ""
}
<h2>Coming up</h2>
<ul>${r.upcoming.length ? r.upcoming.map((u) => `<li class="row"><div class="row-main"><span class="status s-${esc(u.status)}">${esc(STATUS_LABEL[u.status] ?? u.status)}</span><strong>${esc(u.title)}</strong><span class="when">${esc(fmt(u.publishAt))}</span></div></li>`).join("") : `<li><p class="empty">Nothing planned.</p></li>`}</ul>
</main></body></html>`;
}
