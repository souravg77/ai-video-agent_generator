# Windows 11: one-click install

A single `.exe` installs the complete AI Video Agent on Windows 11. It bundles
everything the core app needs — a private copy of Node.js and FFmpeg plus the
app and its dependencies — so you don't install anything else first.

## Install

1. Download `ai-video-agent-setup-<version>.exe` from the project's
   [Releases](https://github.com/souravg77/ai-video-agent_generator/releases)
   page.
2. Double-click it. It installs per-user (no administrator prompt) to
   `%LOCALAPPDATA%\Programs\AI Video Agent`.
3. Leave **Run first-time setup now** ticked and finish. Setup asks, for each
   step, whether to connect a paid API or use a free local tool, saves your
   choices to `.env`, and tests every credential.

Windows SmartScreen may warn about an unrecognised app because the installer
isn't code-signed. Choose **More info → Run anyway**, or sign the build with
your own certificate (see [the build notes](../installer/windows/README.md)).

## Start menu shortcuts

| Shortcut | What it does |
| --- | --- |
| **AI Video Agent - Setup** | Re-run setup to connect services or switch a step to a free local tool |
| **AI Video Agent - Make a Video** | Type a topic and get a finished video in the `out\` folder |
| **AI Video Agent - Start Agent** | Run the agent and open the review page at http://localhost:3000 |
| **Open Review Page** | Open http://localhost:3000 in your browser |

Finished videos are saved under `%LOCALAPPDATA%\Programs\AI Video Agent\app\out`.

## What the installer does and doesn't include

- **Included:** Node.js, FFmpeg, the app and all its Node dependencies. Making a
  video works as soon as setup has your API keys (Claude, ElevenLabs, Pexels).
- **Not included (optional):**
  - **Full agent on a schedule** needs a Postgres database. Use a free local or
    hosted one and set `DATABASE_URL`; see [hosting.md](hosting.md).
  - **Free local mode** (no paid APIs) needs Ollama and Piper. Install
    [Ollama](https://ollama.com/download) and Python 3, then run
    `local:setup` from the app folder; see [local-mode.md](local-mode.md).

## Uninstall

Use **Settings → Apps → Installed apps → AI Video Agent → Uninstall**, or the
**Uninstall** shortcut. This also removes the `.env`, `out\` and `node_modules`
the app created.

## Running the agent in the background

The Start Agent shortcut runs in a console window that must stay open. To keep
the agent running after you close it or sign out, run it under a process manager
or the Docker setup instead; see [hosting.md](hosting.md).
