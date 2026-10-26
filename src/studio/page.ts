// The AI Video Agent Studio page: a single local window to make a video, watch
// progress, and play the result. Self-contained (system fonts, inline CSS/JS) so
// it works offline with no outside requests.

export function renderStudioPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Video Agent Studio</title>
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
  .logo { width:40px; height:40px; border-radius:11px; background:linear-gradient(140deg,var(--accent),#17a2ff); display:grid; place-items:center; flex:none; box-shadow:0 6px 20px -6px rgba(109,92,255,.5); }
  .logo svg { width:22px; height:22px; color:#fff; }
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
  [hidden]{ display:none !important; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2l4-2v10l-4-2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg></div>
    <div>
      <h1>AI Video Agent Studio</h1>
      <p>Type a topic, make a video — all in this window.</p>
    </div>
    <span class="spacer"></span>
    <button class="btn" id="settingsBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 9 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7"/></svg>Settings</button>
  </header>

  <div class="status" id="statusBar"></div>

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
  </div>
</dialog>

<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var format = "short";
  var busy = false;

  function el(line, cls) { var s = document.createElement("span"); s.className = "l" + (cls ? " " + cls : ""); s.textContent = line; return s; }
  function clearConsole() { $("console").innerHTML = ""; }
  function log(line, cls) {
    var c = $("console");
    if (c.querySelector(".empty")) c.innerHTML = "";
    c.appendChild(el(line, cls));
    c.scrollTop = c.scrollHeight;
  }

  // ---- status ----
  function loadStatus() {
    fetch("/api/status").then(function (r) { return r.json(); }).then(function (s) {
      var bar = $("statusBar"); bar.innerHTML = "";
      function pill(label, ok, text) {
        var p = document.createElement("span"); p.className = "pill";
        p.innerHTML = '<span class="dot" style="background:' + (ok ? "var(--good)" : "var(--warn)") + '"></span>' + label + ' <b>' + text + '</b>';
        bar.appendChild(p);
      }
      pill("Mode", true, s.mode);
      pill("Writing", s.ready.writing, s.providers.writing);
      pill("Voice", s.ready.voice, s.providers.voice);
      pill("Footage", s.ready.footage, s.providers.footage);
      if (!s.canMakeReal) {
        $("offline").checked = true;
        var p = document.createElement("span"); p.className = "pill";
        p.style.borderColor = "var(--warn)";
        p.innerHTML = '<span class="dot" style="background:var(--warn)"></span>Some keys missing — using <b>offline sample</b>. Open Settings to add them.';
        bar.appendChild(p);
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

  loadStatus(); loadLibrary();
})();
</script>
</body>
</html>`;
}
