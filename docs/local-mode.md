# Local mode: no paid APIs

Set `AGENT_MODE=local` and the agent runs on your own computer with free tools. No Claude, ElevenLabs, Pexels, YouTube or Meta keys are needed.

| Step | Cloud mode (default) | Local mode |
| --- | --- | --- |
| Ideas, scripts, translations, comment drafts | Claude API | [Ollama](https://ollama.com) running a model on your machine |
| Voice-over | ElevenLabs | [Piper](https://github.com/OHF-Voice/piper1-gpl), offline |
| Background footage | Pexels | Generated moving gradients, or your own clips folder |
| Posting | YouTube and Meta APIs | Exported to `out/ready/` for you to upload by hand |
| Cost per video | tens of cents to about $1 | $0 (your electricity) |

## Set it up

1. Install [FFmpeg](https://ffmpeg.org/download.html), [Ollama](https://ollama.com/download) and Python 3.
2. Start Ollama (`ollama serve`, or open the app).
3. Run:

   ```sh
   npm install
   npm run local:setup      # downloads the writing model and the voice, installs Piper, sets AGENT_MODE=local in .env
   npm run check            # confirms each piece is ready
   npm run make -- --topic "why octopuses have three hearts"
   ```

The finished video is in `out/<date>-<topic>/video.mp4`.

To run the agent on a schedule you still need Postgres (free: a local install, Docker, or a free Neon or Supabase database) and `AGENT_NICHE`; see the README's "Run the agent". The review page works the same.

## Posting by hand

With `PUBLISH_MODE=manual` (the local default), when an approved video's slot comes the agent doesn't upload it. It puts everything in one folder and alerts you:

```
out/ready/2026-11-01-why-octopuses-have-three-hearts/
  video.mp4        upload this
  thumbnail.jpg    long videos only
  youtube.txt      title and description (with #Shorts and hashtags)
  facebook.txt     caption
  instagram.txt    caption
  UPLOAD.md        the steps
```

The review page shows these posts as "upload by hand", with a download button and the text to copy. `npm run post` does the same for a single video.

Stats, the weekly report's view counts, and comment replies need the platform APIs, so they don't work for hand-uploaded posts. Everything else does.

## Choosing pieces separately

The easiest way is `npm run setup`, which asks for each step. By hand:

Each step has its own setting, which overrides `AGENT_MODE`. For example, to keep Claude for writing but go free everywhere else:

```sh
AGENT_MODE=local
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=...
```

| Setting | Values |
| --- | --- |
| `LLM_PROVIDER` | `claude`, `ollama`, `openai-compatible` ([open-source-ai.md](open-source-ai.md)) |
| `TTS_PROVIDER` | `elevenlabs`, `piper`, `openai-compatible` (Kokoro) |
| `VISUALS_PROVIDER` | `pexels`, `folder`, `generated` |
| `PUBLISH_MODE` | `api`, `manual` |

## The writing model

`OLLAMA_MODEL` defaults to `qwen3:14b` (about 9 GB; needs roughly 16 GB of RAM, faster with a GPU). Smaller and faster: `qwen3:8b` or `llama3.1:8b`. Better writing if you have the memory: `qwen3:32b`. After changing it, run `npm run local:setup` again to download it.

Local models are less reliable than Claude at following the script format. The agent checks every answer against the expected shape and asks again once if it's wrong; if a model keeps failing, try a larger one. Approve the first videos yourself before turning on auto-approve.

For long videos (`VIDEO_FORMAT=long`), raise `OLLAMA_CONTEXT` to 32768 if the model supports it.

## The voice

`PIPER_VOICE` defaults to `models/en_US-lessac-medium.onnx`. Hear the others at [rhasspy.github.io/piper-samples](https://rhasspy.github.io/piper-samples), set `PIPER_VOICE=models/<name>.onnx` (for example `models/es_ES-davefx-medium.onnx` for Spanish), and run `npm run local:setup` to download it. Pick a voice in the language set in `VIDEO_LANGUAGE`.

## Footage

- `VISUALS_PROVIDER=generated` (the local default) makes slowly moving colour gradients behind the captions. Nothing to download.
- `VISUALS_PROVIDER=folder` uses your own clips from `FOOTAGE_DIR` (default `footage/`, subfolders are fine). Name files by what they show, like `ocean-waves-sunset.mp4`: each scene picks the clip whose name shares the most words with its search, and a video avoids repeating clips while others are left. Use footage you have the rights to.

## Docker

```sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
docker compose exec ollama ollama pull qwen3:14b
docker compose exec agent npm run local:setup -- --no-env
```

This adds an Ollama container and builds the agent with Piper. Voices go in `models/`, your clips in `footage/`, exports in `out/ready/`. Uncomment the GPU block in `docker-compose.local.yml` if the server has an NVIDIA GPU.

## Why posting isn't automatic in local mode

YouTube, Facebook and Instagram only allow automated posting through their official APIs. Those are free; they just need the one-time app setup in [phase0-setup.md](phase0-setup.md). Posting by driving a browser instead breaks their terms and gets accounts banned, so the agent doesn't do it. When you're ready, set `PUBLISH_MODE=api` and keep everything else local.
