# Windows 11: one-click install

A single `.exe` installs the AI Video Agent on Windows 11. It bundles Node.js,
FFmpeg, **Piper** and the app, and **downloads Ollama during installation** (a
tickbox you can skip) so the installer stays small. On first launch S.Gain
Studio downloads the writing model (a one-time download, inside the app).

## Install

1. Download `ai-video-agent-setup-<version>.exe` from the project's
   [Releases](https://github.com/souravg77/ai-video-agent_generator/releases)
   page.
2. Double-click it. It installs per-user (no administrator prompt) to
   `%LOCALAPPDATA%\Programs\AI Video Agent`.
3. Finish. **S.Gain Studio** opens in its own window (no console), set to free
   local mode. The first time, a banner offers to **Download the writing model**
   (one-time, with a progress bar, inside the app). When it's done, type a topic
   and press **Make video**. You can also tick **Offline sample** to make one
   instantly, open **Settings** to paste API keys for cloud quality, or run
   **Setup** for the full guided setup.

Windows SmartScreen may warn about an unrecognised app because the installer
isn't code-signed. Choose **More info → Run anyway**, or sign the build with
your own certificate (see [the build notes](../installer/windows/README.md)).

## Start menu shortcuts

| Shortcut | What it does |
| --- | --- |
| **S.Gain Studio** | The main app window — type a topic, make a video, watch it, all in one window with no console |
| **AI Video Agent - Setup** | Re-run setup to connect services or switch a step to a free local tool |
| **AI Video Agent - Local Setup (free mode)** | Install Ollama and Piper (offering winget) and download the free model and voice |
| **AI Video Agent - Make a Video** | Type a topic and get a finished video in the `out\` folder |
| **AI Video Agent - Start Agent** | Run the agent and open the review page at http://localhost:3000 |
| **Open Review Page** | Open http://localhost:3000 in your browser |

Finished videos are saved under `%LOCALAPPDATA%\Programs\AI Video Agent\app\out`.

## The app window

**S.Gain Studio** is the main way to use the app on Windows. It starts the
agent's local server with no console window and opens it as an app window (using
Microsoft Edge's app mode, which is built into Windows 11; it falls back to your
default browser). You type a topic, press **Make video**, watch the progress, and
play the result — no command prompt at any point. You can also make a video from
**your own photos and voice** (record or upload a voice-over) in the same
window — see [avatar-voice.md](avatar-voice.md), which also covers the
experimental talking-avatar and voice-cloning hooks. **Piper** (voice) is bundled and
**Ollama** (writing) is downloaded during installation; both run inside the app,
and the writing model is downloaded on first launch from the banner, with a
progress bar. The **Setup**, **Start Agent** and other shortcuts are still there
for the full agent and posting.

## What the installer does and doesn't include

- **Included (bundled):** Node.js, FFmpeg, **Piper** (with a voice), and the app
  and all its dependencies.
- **Downloaded during installation:** **Ollama** (about 1 GB) — a tickbox on the
  install screen, so the `.exe` itself stays small. Untick it if you'll use cloud
  APIs or want to install Ollama later (the **Local Setup** shortcut can fetch it).
- **Downloaded on first launch:** the **writing model** (about 9 GB for
  `qwen3:14b`), from the Studio window with a progress bar. An **Offline sample**
  needs nothing.
- **Not included:**
  - **Cloud quality** (Claude, ElevenLabs, Pexels) needs API keys — paste them in
    **Settings**, or run **Setup**.
  - **The agent on a schedule** needs a Postgres database (`DATABASE_URL`); see
    [hosting.md](hosting.md).

## Uninstall

Use **Settings → Apps → Installed apps → AI Video Agent → Uninstall**, or the
**Uninstall** shortcut. This also removes the `.env`, `out\`, `node_modules`
and any downloaded models the app created.

## Running the agent in the background

The Start Agent shortcut runs in a console window that must stay open. To keep
the agent running after you close it or sign out, run it under a process manager
or the Docker setup instead; see [hosting.md](hosting.md).
