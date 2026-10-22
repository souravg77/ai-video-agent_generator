import type { PostRow, VideoRow } from "../agent/store.js";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// <input type="datetime-local"> value, in UTC.
export const toInputUtc = (d: Date | null) => (d ? d.toISOString().slice(0, 16) : "");
const fmt = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "unscheduled");

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
  return `<article class="card review" id="v-${esc(v.id)}">
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
    <p class="meta">Platforms: ${esc(v.platforms.join(", "))}</p>
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
  now: Date;
  flash?: string;
}): string {
  const { review, upcoming, recent, posts, now } = data;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video Review Queue</title>
<style>
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
</style></head>
<body><main>
<h1>Video review queue</h1>
<p class="lede">${review.length} waiting for review · ${upcoming.length} coming up · times in UTC</p>
${data.flash ? `<p class="flash" role="status">${esc(data.flash)}</p>` : ""}
<h2>Needs review</h2>
${review.length ? review.map((v) => reviewCard(v, now)).join("\n") : `<ul><li><p class="empty">Nothing to review. New videos appear here once the agent makes them.</p></li></ul>`}
<h2>Coming up</h2>
<ul>${upcoming.length ? upcoming.map((v) => row(v, posts.get(v.id))).join("") : `<li><p class="empty">No planned videos. Set AGENT_NICHE so the agent plans ideas, or add one with npm run agent:add.</p></li>`}</ul>
<h2>Recent</h2>
<ul>${recent.length ? recent.map((v) => row(v, posts.get(v.id))).join("") : `<li><p class="empty">Nothing posted yet.</p></li>`}</ul>
</main></body></html>`;
}
