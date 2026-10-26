// The AI Video Agent Studio page: a single local window to make a video, watch
// progress, and play the result. Self-contained (system fonts, inline CSS/JS) so
// it works offline with no outside requests.

// The S.Gain Studio logo (an "S" with a play triangle). Used in the header and
// served as the window favicon.
export const STUDIO_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<defs>
<linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cff"/><stop offset=".55" stop-color="#5b7cff"/><stop offset="1" stop-color="#17a2ff"/></linearGradient>
<linearGradient id="ls" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect x="16" y="16" width="224" height="224" rx="54" fill="url(#lg)"/>
<rect x="16" y="16" width="224" height="224" rx="54" fill="url(#ls)"/>
<text x="112" y="140" text-anchor="middle" dominant-baseline="central" font-family="Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif" font-size="176" font-weight="800" fill="#fff">S</text>
<circle cx="178" cy="186" r="34" fill="#fff"/>
<path d="M169 169 l26 17 -26 17 z" fill="#5b6cff"/>
</svg>`;

export function renderStudioPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S.Gain Studio</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<style>
  :root {
    --bg:#0c0f15; --panel:#151a22; --panel-2:#1b212b; --line:#273040;
    --fg:#e9edf4; --fg-2:#c3cbd8; --muted:#8b95a7;
    --accent:#6d5cff; --accent-2:#8c7eff; --good:#35c07e; --warn:#e0a53c; --bad:#f06a6f;
    --mono:ui-monospace,"Cascadia Code","SFMono-Regular",Consolas,monospace;
    --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    color-scheme:dark;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--sans); font-size:15px; line-height:1.5; }
  .wrap { max-width:1060px; margin:0 auto; padding:0 20px 60px; }
  header { display:flex; align-items:center; gap:14px; padding:22px 0 16px; }
  .logo { width:44px; height:44px; flex:none; filter:drop-shadow(0 6px 16px rgba(109,92,255,.45)); display:grid; place-items:center; }
  .logo svg { width:44px; height:44px; display:block; }
  header h1 { font-size:19px; margin:0; font-weight:650; letter-spacing:-.02em; }
  header p { margin:0; color:var(--muted); font-size:13px; }
  header .spacer { margin-left:auto; }
  .btn { font-family:inherit; font-size:14px; font-weight:600; border-radius:10px; border:1px solid var(--line); background:var(--panel-2); color:var(--fg); padding:9px 15px; cursor:pointer; display:inline-flex; align-items:center; gap:8px; }
  .btn:hover { background:#222a37; }
  .btn.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .btn.primary:hover { filter:brightness(1.08); }
  .btn:disabled { opacity:.5; cursor:default; }
  .btn svg { width:16px; height:16px; }
  .btn.icon { padding:9px; }

  .status { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
  .pill { display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--fg-2); background:var(--panel); border:1px solid var(--line); border-radius:999px; padding:6px 12px; }
  .pill .dot { width:8px; height:8px; border-radius:50%; }
  .pill b { color:var(--fg); font-weight:600; }
  .pill.btn { cursor:pointer; }
  .pill.btn:hover { background:var(--panel-2); color:var(--fg); }

  .banner { margin:0 0 18px; padding:14px 16px; border-radius:12px; font-size:13.5px;
    background:color-mix(in srgb, var(--warn) 13%, var(--panel)); border:1px solid color-mix(in srgb, var(--warn) 42%, transparent); }
  .banner .bt { font-weight:600; color:var(--fg); display:flex; align-items:center; gap:8px; }
  .banner .bt svg { width:17px; height:17px; color:var(--warn); flex:none; }
  .banner ul { margin:9px 0 9px; padding-left:20px; }
  .banner li { margin:4px 0; color:var(--fg-2); }
  .banner .hint { color:var(--muted); font-size:12.5px; }
  .banner .hint b { color:var(--fg-2); }
  .pbar { height:8px; border-radius:999px; background:var(--panel-2); overflow:hidden; margin:6px 0 4px; }
  .pbar > i { display:block; height:100%; width:0; background:var(--accent); border-radius:999px; transition:width .2s ease; }
  .phint { font-family:var(--mono); font-size:11.5px; color:var(--muted); }

  .card { background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width:820px){ .grid { grid-template-columns:1fr; } }

  label.fld { display:block; font-size:12px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); margin:0 0 7px; }
  input[type=text], input[type=password] { width:100%; background:var(--panel-2); border:1px solid var(--line); border-radius:10px; color:var(--fg); font:inherit; padding:11px 13px; }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:14px; }
  .seg { display:inline-flex; background:var(--panel-2); border:1px solid var(--line); border-radius:10px; padding:3px; gap:2px; }
  .seg button { border:0; background:none; color:var(--muted); font:inherit; font-size:13px; font-weight:600; padding:7px 13px; border-radius:7px; cursor:pointer; }
  .seg button[aria-pressed=true] { background:var(--accent); color:#fff; }
  .check { display:inline-flex; align-items:center; gap:8px; color:var(--fg-2); font-size:13.5px; cursor:pointer; user-select:none; }
  .check input { width:16px; height:16px; accent-color:var(--accent); }

  h2.sec { font-size:13px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); margin:28px 0 14px; }
  .console { background:#080b11; border:1px solid var(--line); border-radius:12px; padding:14px 16px; font-family:var(--mono); font-size:12.5px; line-height:1.7; color:var(--fg-2); max-height:260px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
  .console .l { display:block; }
  .console .l.err { color:var(--bad); }
  .console .l.ok { color:var(--good); }
  .spinner { width:15px; height:15px; border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%; animation:spin .8s linear infinite; display:inline-block; vertical-align:-2px; }
  @keyframes spin { to { transform:rotate(360deg); } }

  video { width:100%; border-radius:12px; background:#000; display:block; }
  .player-meta { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; }
  .player-meta .t { font-weight:600; }
  .player-meta .m { color:var(--muted); font-size:13px; }

  .lib { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:12px; }
  .vid { background:var(--panel); border:1px solid var(--line); border-radius:12px; overflow:hidden; cursor:pointer; text-align:left; padding:0; color:inherit; font:inherit; }
  .vid:hover { border-color:var(--accent); }
  .vid .thumb { aspect-ratio:9/16; background:linear-gradient(150deg,#1f2a44,#3a2a5f 60%,#12161f); display:grid; place-items:center; }
  .vid .thumb svg { width:34px; height:34px; color:rgba(255,255,255,.7); }
  .vid .cap { padding:9px 10px; }
  .vid .cap .vt { font-size:12.5px; font-weight:600; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .vid .cap .vm { font-size:11px; color:var(--muted); margin-top:3px; }
  .empty { color:var(--muted); font-size:13.5px; padding:8px 0; }

  dialog { background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:16px; padding:0; max-width:460px; width:92%; }
  dialog::backdrop { background:rgba(0,0,0,.55); }
  .dlg-head { display:flex; align-items:center; justify-content:space-between; padding:18px 20px 0; }
  .dlg-head h3 { margin:0; font-size:16px; }
  .dlg-body { padding:16px 20px 20px; display:flex; flex-direction:column; gap:14px; }
  .hint { color:var(--muted); font-size:12.5px; }
  .mono { font-family:var(--mono); }

  .drop { border:1.5px dashed var(--line); border-radius:12px; background:var(--panel-2); padding:22px 14px; text-align:center; color:var(--muted); cursor:pointer; font-size:13.5px; }
  .drop:hover, .drop.over { border-color:var(--accent); color:var(--fg-2); }
  .drop svg { width:22px; height:22px; display:block; margin:0 auto 8px; opacity:.8; }
  .thumbs { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .thumb-item { position:relative; width:62px; height:84px; border-radius:8px; overflow:hidden; border:1px solid var(--line); background:#000; }
  .thumb-item img { width:100%; height:100%; object-fit:cover; display:block; }
  .thumb-item button { position:absolute; top:2px; right:2px; width:19px; height:19px; border-radius:50%; border:0; background:rgba(0,0,0,.66); color:#fff; font-size:13px; line-height:1; cursor:pointer; display:grid; place-items:center; padding:0; }
  .rec-dot { width:9px; height:9px; border-radius:50%; background:var(--bad); display:inline-block; animation:pulse 1s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity:.25; } }
  audio { width:100%; margin-top:10px; }
  [hidden]{ display:none !important; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">${STUDIO_LOGO}</div>
    <div>
      <h1>S.Gain Studio</h1>
      <p>Type a topic, make a video — all in this window.</p>
    </div>
    <span class="spacer"></span>
    <a class="pill btn" id="updChip" hidden target="_blank" rel="noopener" style="border-color:var(--accent);color:var(--accent);text-decoration:none;font-weight:600"></a>
    <button class="btn" id="settingsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7"/></svg>Settings</button>
  </header>

  <div class="status" id="statusBar"></div>
  <div class="banner" id="statusBanner" hidden></div>

  <div class="grid">
    <!-- make -->
    <div class="card">
      <label class="fld" for="topic">Video topic</label>
      <input type="text" id="topic" placeholder="why octopuses have three hearts" autocomplete="off">
      <div class="row">
        <div class="seg" id="formatSeg" role="group" aria-label="Format">
          <button data-format="short" aria-pressed="true">Short (9:16)</button>
          <button data-format="long" aria-pressed="false">Long (16:9)</button>
        </div>
        <label class="check"><input type="checkbox" id="offline"> Offline sample (no keys)</label>
      </div>
      <div class="row">
        <button class="btn primary" id="makeBtn" style="flex:1; justify-content:center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 3 14 9-14 9z"/></svg>
          Make video
        </button>
      </div>
      <h2 class="sec" style="margin-bottom:10px">Progress</h2>
      <div class="console" id="console"><span class="empty">Idle. Enter a topic and press Make video.</span></div>
    </div>

    <!-- preview -->
    <div class="card">
      <h2 class="sec" style="margin:0 0 14px">Preview</h2>
      <div id="playerWrap" hidden>
        <video id="player" controls playsinline></video>
        <div class="player-meta">
          <span class="t" id="playerTitle"></span>
          <span class="m" id="playerMeta"></span>
        </div>
      </div>
      <div class="empty" id="noPreview">Your finished video will appear here.</div>
    </div>
  </div>

  <h2 class="sec">Make from your own photos &amp; voice</h2>
  <div class="card">
    <p class="hint" style="margin:0 0 16px; font-size:13px; line-height:1.55">
      Turn 1–4 of your photos into a video narrated by your own voice — record it here or upload an audio file.
      Fully offline: no topic, no AI writing. The photos become a gentle zoom/pan slideshow timed to your voice-over.
      <b>Experimental:</b> set <span class="mono">AVATAR_CMD</span> to a local talking-head tool to animate the first photo to the voice instead.
    </p>
    <div class="grid">
      <div>
        <label class="fld">Your photos (1–4)</label>
        <div class="drop" id="photoDrop" tabindex="0" role="button" aria-label="Add photos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>
          Click to add photos, or drop them here
        </div>
        <input type="file" id="photoInput" accept="image/*" multiple hidden>
        <div class="thumbs" id="thumbs"></div>
      </div>
      <div>
        <label class="fld">Voice-over</label>
        <div class="row" style="margin-top:0">
          <button class="btn" id="recBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg> Record</button>
          <button class="btn" id="audioBtn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Upload audio</button>
          <input type="file" id="audioInput" accept="audio/*" hidden>
        </div>
        <audio id="voicePreview" controls hidden></audio>
        <div class="hint" id="voiceStatus" style="margin-top:10px">No voice-over yet.</div>
      </div>
    </div>
    <div class="row">
      <input type="text" id="photoTitle" placeholder="Title (optional)" autocomplete="off" style="flex:1">
      <button class="btn primary" id="photoMakeBtn" style="justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 3 14 9-14 9z"/></svg> Make photo video
      </button>
    </div>
    <div class="console" id="photoConsole" style="margin-top:14px"><span class="empty">Add photos and a voice-over, then press Make photo video.</span></div>
  </div>

  <h2 class="sec">Your videos</h2>
  <div class="lib" id="library"><span class="empty">No videos yet.</span></div>
</div>

<dialog id="settingsDlg">
  <div class="dlg-head"><h3>Settings</h3><button class="btn icon" id="closeSettings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
  <div class="dlg-body">
    <p class="hint">Paste the keys for the services you use. Leave a field blank to keep what's saved. Local/free mode (Ollama, Piper) is set up from the <b>Local Setup</b> shortcut.</p>
    <div><label class="fld" for="k_anthropic">Claude — ANTHROPIC_API_KEY</label><input type="password" id="k_anthropic" placeholder="sk-ant-..." autocomplete="off"></div>
    <div><label class="fld" for="k_eleven">ElevenLabs — ELEVENLABS_API_KEY</label><input type="password" id="k_eleven" placeholder="..." autocomplete="off"></div>
    <div><label class="fld" for="k_pexels">Pexels — PEXELS_API_KEY</label><input type="password" id="k_pexels" placeholder="..." autocomplete="off"></div>
    <button class="btn primary" id="saveSettings" style="justify-content:center">Save</button>
    <p class="hint" id="settingsNote" hidden></p>
    <div style="border-top:1px solid var(--line);padding-top:14px">
      <label class="fld">App updates</label>
      <div class="hint" style="margin:0 0 8px">Current version: <span class="mono" id="curVer">…</span></div>
      <button class="btn" id="checkUpd" type="button">Check for updates</button>
      <div class="hint" id="updResult" style="margin-top:8px"></div>
    </div>
  </div>
</dialog>

<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var format = "short";
  var busy = false;

  function el(line, cls) { var s = document.createElement("span"); s.className = "l" + (cls ? " " + cls : ""); s.textContent = line; return s; }
  function logTo(consoleId, line, cls) {
    var c = $(consoleId);
    if (c.querySelector(".empty")) c.innerHTML = "";
    c.appendChild(el(line, cls));
    c.scrollTop = c.scrollHeight;
  }
  function clearConsole() { $("console").innerHTML = ""; }
  function log(line, cls) { logTo("console", line, cls); }

  // ---- status ----
  function loadStatus() {
    fetch("/api/status").then(function (r) { return r.json(); }).then(function (s) {
      var bar = $("statusBar"); bar.innerHTML = "";
      function pill(label, ok, text) {
        var p = document.createElement("span"); p.className = "pill";
        p.innerHTML = '<span class="dot" style="background:' + (ok ? "var(--good)" : "var(--warn)") + '"></span>' + label + ' <b></b>';
        p.querySelector("b").textContent = text;
        bar.appendChild(p);
      }
      pill("Mode", true, s.mode);
      pill("Writing", s.ready.writing, s.providers.writing);
      pill("Voice", s.ready.voice, s.providers.voice);
      pill("Footage", s.ready.footage, s.providers.footage);
      var rc = document.createElement("button"); rc.type = "button"; rc.className = "pill btn";
      rc.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v4h4"/></svg> Re-check';
      rc.addEventListener("click", loadStatus);
      bar.appendChild(rc);

      var banner = $("statusBanner");
      var keys = s.reasons ? Object.keys(s.reasons) : [];
      if (keys.length) {
        if (!$("offline").checked) $("offline").checked = true; // don't let a real make fail halfway
        banner.innerHTML = '<div class="bt"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2 18.5A2 2 0 0 0 3.7 21.5h16.6A2 2 0 0 0 22 18.5L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>Not ready for a real video yet — the offline sample is on.</div>';
        var ul = document.createElement("ul");
        keys.forEach(function (k) { var li = document.createElement("li"); li.textContent = s.reasons[k]; ul.appendChild(li); });
        banner.appendChild(ul);
        if (s.pullModel) {
          var pb = document.createElement("div");
          pb.innerHTML =
            '<button class="btn primary" id="pullBtn" style="margin:2px 0 4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg> Download ' + s.model + ' now</button>' +
            '<div id="pullProg" hidden><div class="pbar"><i id="pbarFill"></i></div><div class="phint" id="pstatus"></div></div>';
          banner.appendChild(pb);
          pb.querySelector("#pullBtn").addEventListener("click", function () { startPull(this); });
        }
        var hint = document.createElement("span"); hint.className = "hint";
        hint.innerHTML = s.pullModel
          ? 'The app runs Ollama and Piper for you — this is a one-time model download inside the app. Or open <b>Settings</b> to use cloud APIs instead.'
          : 'The app sets up Ollama and Piper automatically — give it a moment and press <b>Re-check</b>, or open <b>Settings</b> to add API keys.';
        banner.appendChild(hint);
        banner.hidden = false;
      } else {
        banner.hidden = true;
        banner.innerHTML = "";
      }
    }).catch(function () {});
  }

  // ---- library ----
  function fmtDur(s) { if (!s) return ""; var m = Math.floor(s / 60), r = Math.round(s % 60); return (m ? m + "m " : "") + r + "s"; }
  function loadLibrary() {
    fetch("/api/videos").then(function (r) { return r.json(); }).then(function (vids) {
      var lib = $("library"); lib.innerHTML = "";
      if (!vids.length) { lib.innerHTML = '<span class="empty">No videos yet.</span>'; return; }
      vids.forEach(function (v) {
        var b = document.createElement("button"); b.className = "vid";
        b.innerHTML = '<div class="thumb"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 7 8 5-8 5z"/></svg></div><div class="cap"><div class="vt"></div><div class="vm">' + fmtDur(v.durationSec) + '</div></div>';
        b.querySelector(".vt").textContent = v.title;
        b.addEventListener("click", function () { play(v.name, v.title, v.durationSec); });
        lib.appendChild(b);
      });
    }).catch(function () {});
  }

  function play(name, title, dur) {
    $("noPreview").hidden = true;
    $("playerWrap").hidden = false;
    var p = $("player");
    p.src = "/media/" + encodeURIComponent(name) + "/video.mp4";
    p.load();
    $("playerTitle").textContent = title || name;
    $("playerMeta").textContent = fmtDur(dur);
    $("playerWrap").scrollIntoView({ block: "nearest" });
  }

  // ---- make ----
  function make() {
    if (busy) return;
    var topic = $("topic").value.trim();
    if (!topic) { $("topic").focus(); return; }
    busy = true;
    $("makeBtn").disabled = true;
    clearConsole();
    log("Starting — “" + topic + "”");
    $("makeBtn").innerHTML = '<span class="spinner"></span> Working…';
    fetch("/api/make", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: topic, format: format, offline: $("offline").checked })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.error) { throw new Error(res.error); }
      var es = new EventSource("/api/jobs/" + res.id + "/events");
      es.addEventListener("log", function (e) { log(JSON.parse(e.data)); });
      es.addEventListener("done", function (e) {
        var d = JSON.parse(e.data);
        log("Done — " + d.title + "  (" + fmtDur(d.durationSec) + ", $" + (d.costUsd || 0).toFixed(3) + ")", "ok");
        es.close(); finish();
        if (d.name) play(d.name, d.title, d.durationSec);
        loadLibrary();
      });
      es.addEventListener("error", function (e) {
        var msg = "The server closed the connection.";
        try { if (e.data) msg = JSON.parse(e.data).message; } catch (x) {}
        log("Failed: " + msg, "err"); es.close(); finish();
      });
    }).catch(function (err) { log("Failed: " + err.message, "err"); finish(); });
  }
  function finish() {
    busy = false;
    $("makeBtn").disabled = false;
    $("makeBtn").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 3 14 9-14 9z"/></svg> Make video';
  }

  // Download the Ollama writing model inside the app, with a live progress bar.
  function startPull(btn) {
    var finished = false;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Downloading…';
    var prog = $("pullProg"); if (prog) prog.hidden = false;
    var es = new EventSource("/api/pull-model");
    es.addEventListener("progress", function (e) {
      var d = JSON.parse(e.data);
      if ($("pstatus")) $("pstatus").textContent = d.status + (d.percent != null ? " — " + d.percent + "%" : "");
      if (d.percent != null && $("pbarFill")) $("pbarFill").style.width = d.percent + "%";
    });
    es.addEventListener("done", function () {
      finished = true; es.close();
      if ($("pbarFill")) $("pbarFill").style.width = "100%";
      if ($("pstatus")) $("pstatus").textContent = "Downloaded. Checking…";
      loadStatus();
    });
    es.addEventListener("error", function (e) {
      if (finished) return;
      var msg = null; try { if (e.data) msg = JSON.parse(e.data).message; } catch (x) {}
      if (!msg && es.readyState !== 2) return; // transient; EventSource will retry
      finished = true; es.close();
      if ($("pstatus")) $("pstatus").textContent = msg || "Download interrupted.";
      btn.disabled = false;
      btn.innerHTML = "Retry download";
    });
  }

  // ---- settings ----
  function saveSettings() {
    var body = {
      ANTHROPIC_API_KEY: $("k_anthropic").value,
      ELEVENLABS_API_KEY: $("k_eleven").value,
      PEXELS_API_KEY: $("k_pexels").value
    };
    fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).then(function (res) {
        var n = $("settingsNote"); n.hidden = false;
        n.textContent = res.saved && res.saved.length ? "Saved " + res.saved.join(", ") + ". " + res.note : "Nothing to save.";
        $("k_anthropic").value = $("k_eleven").value = $("k_pexels").value = "";
      }).catch(function () {});
  }

  // ---- updates (GitHub Releases) ----
  function renderUpdate(u) {
    if ($("curVer")) $("curVer").textContent = u.current || "—";
    var chip = $("updChip");
    if (u.updateAvailable && u.latest) {
      chip.textContent = "⬆ Update " + u.latest;
      chip.href = u.assetUrl || u.url;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
  }
  function loadUpdate(showResult) {
    fetch("/api/update").then(function (r) { return r.json(); }).then(function (u) {
      renderUpdate(u);
      var box = $("updResult");
      if (!showResult || !box) return;
      box.textContent = "";
      if (u.updateAvailable && u.latest) {
        var span = document.createElement("span"); span.textContent = "Update ";
        var b = document.createElement("b"); b.textContent = u.latest; span.appendChild(b);
        span.appendChild(document.createTextNode(" is available. "));
        var a = document.createElement("a"); a.textContent = "Download"; a.href = u.assetUrl || u.url; a.target = "_blank"; a.rel = "noopener";
        box.appendChild(span); box.appendChild(a);
      } else if (u.note) {
        box.textContent = u.note;
      } else {
        box.textContent = "You're on the latest version (" + u.current + ").";
      }
    }).catch(function () { if (showResult && $("updResult")) $("updResult").textContent = "Couldn't check for updates."; });
  }

  // ---- photos & voice ----
  var REC_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg> Record';
  var photos = [];   // data URLs, up to 4
  var voice = null;  // data URL of the voice-over
  var mediaRec = null, recChunks = [], recStream = null, recTimer = null, recStart = 0;
  var photoBusy = false;

  function readFileData(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Couldn't read that file.")); };
      fr.readAsDataURL(file);
    });
  }
  function renderThumbs() {
    var t = $("thumbs"); t.innerHTML = "";
    photos.forEach(function (p, i) {
      var d = document.createElement("div"); d.className = "thumb-item";
      var img = document.createElement("img"); img.src = p; d.appendChild(img);
      var x = document.createElement("button"); x.type = "button"; x.textContent = "\\u00d7"; x.title = "Remove";
      x.addEventListener("click", function () { photos.splice(i, 1); renderThumbs(); });
      d.appendChild(x); t.appendChild(d);
    });
  }
  function addPhotos(files) {
    var list = Array.prototype.slice.call(files || []).filter(function (f) { return /^image\\//.test(f.type); });
    if (!list.length) return;
    var room = 4 - photos.length;
    if (room <= 0) { logTo("photoConsole", "You already have 4 photos — remove one to add another.", null); return; }
    if (list.length > room) logTo("photoConsole", "Only the first " + room + " photo(s) were added (max 4).", null);
    list.slice(0, room).forEach(function (f) {
      readFileData(f).then(function (d) { if (photos.length < 4) { photos.push(d); renderThumbs(); } });
    });
  }
  function setVoice(dataUrl, label) {
    voice = dataUrl;
    var a = $("voicePreview"); a.src = dataUrl; a.hidden = false;
    $("voiceStatus").textContent = label;
  }
  function resetRecBtn() { var b = $("recBtn"); b.classList.remove("primary"); b.innerHTML = REC_MIC; }
  function toggleRec() {
    if (mediaRec && mediaRec.state === "recording") { mediaRec.stop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      $("voiceStatus").textContent = "Recording isn't available in this window — use Upload audio instead."; return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      recStream = stream; recChunks = [];
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = function (e) { if (e.data && e.data.size) recChunks.push(e.data); };
      mediaRec.onstop = function () {
        if (recTimer) { clearInterval(recTimer); recTimer = null; }
        if (recStream) recStream.getTracks().forEach(function (t) { t.stop(); });
        var secs = (Date.now() - recStart) / 1000;
        var blob = new Blob(recChunks, { type: (mediaRec && mediaRec.mimeType) || "audio/webm" });
        readFileData(blob).then(function (d) { setVoice(d, "Recorded voice-over (" + fmtDur(secs) + ")."); });
        resetRecBtn();
      };
      mediaRec.start();
      recStart = Date.now();
      var b = $("recBtn"); b.classList.add("primary"); b.innerHTML = '<span class="rec-dot"></span> Stop (0s)';
      recTimer = setInterval(function () {
        $("recBtn").innerHTML = '<span class="rec-dot"></span> Stop (' + Math.round((Date.now() - recStart) / 1000) + 's)';
      }, 500);
    }).catch(function () { $("voiceStatus").textContent = "Microphone permission was denied — use Upload audio instead."; });
  }
  function photoFinish(btn, orig) { photoBusy = false; btn.disabled = false; btn.innerHTML = orig; }
  function photoMake() {
    if (photoBusy) return;
    if (!photos.length) { logTo("photoConsole", "Add at least one photo.", "err"); return; }
    if (!voice) { logTo("photoConsole", "Record or upload a voice-over first.", "err"); return; }
    photoBusy = true;
    var btn = $("photoMakeBtn"); var orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Working…';
    $("photoConsole").innerHTML = "";
    logTo("photoConsole", "Building your photo video from " + photos.length + " photo(s)…");
    fetch("/api/photo-video", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ images: photos, audio: voice, title: $("photoTitle").value.trim(), format: format })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res.error) throw new Error(res.error);
      var es = new EventSource("/api/jobs/" + res.id + "/events");
      es.addEventListener("log", function (e) { logTo("photoConsole", JSON.parse(e.data)); });
      es.addEventListener("done", function (e) {
        var d = JSON.parse(e.data);
        logTo("photoConsole", "Done — " + d.title + "  (" + fmtDur(d.durationSec) + ")", "ok");
        es.close(); photoFinish(btn, orig);
        if (d.name) play(d.name, d.title, d.durationSec);
        loadLibrary();
      });
      es.addEventListener("error", function (e) {
        var msg = "The server closed the connection.";
        try { if (e.data) msg = JSON.parse(e.data).message; } catch (x) {}
        logTo("photoConsole", "Failed: " + msg, "err"); es.close(); photoFinish(btn, orig);
      });
    }).catch(function (err) { logTo("photoConsole", "Failed: " + err.message, "err"); photoFinish(btn, orig); });
  }

  // ---- wire up ----
  $("formatSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    format = b.getAttribute("data-format");
    this.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
  });
  $("makeBtn").addEventListener("click", make);
  $("topic").addEventListener("keydown", function (e) { if (e.key === "Enter") make(); });
  $("settingsBtn").addEventListener("click", function () { $("settingsDlg").showModal(); });
  $("closeSettings").addEventListener("click", function () { $("settingsDlg").close(); });
  $("saveSettings").addEventListener("click", saveSettings);
  $("checkUpd").addEventListener("click", function () { loadUpdate(true); });

  $("photoDrop").addEventListener("click", function () { $("photoInput").click(); });
  $("photoDrop").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("photoInput").click(); } });
  $("photoDrop").addEventListener("dragover", function (e) { e.preventDefault(); this.classList.add("over"); });
  $("photoDrop").addEventListener("dragleave", function () { this.classList.remove("over"); });
  $("photoDrop").addEventListener("drop", function (e) { e.preventDefault(); this.classList.remove("over"); if (e.dataTransfer) addPhotos(e.dataTransfer.files); });
  $("photoInput").addEventListener("change", function () { addPhotos(this.files); this.value = ""; });
  $("recBtn").addEventListener("click", toggleRec);
  $("audioBtn").addEventListener("click", function () { $("audioInput").click(); });
  $("audioInput").addEventListener("change", function () {
    var f = this.files && this.files[0]; if (!f) return;
    readFileData(f).then(function (d) { setVoice(d, f.name); });
    this.value = "";
  });
  $("photoMakeBtn").addEventListener("click", photoMake);

  loadStatus(); loadLibrary(); loadUpdate(false);
})();
</script>
</body>
</html>`;
}
