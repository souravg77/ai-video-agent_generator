# Your own photos and voice (and experimental avatar / voice cloning)

S.Gain Studio can build a video from **your own photos** narrated by **your own
voice** — no LLM, no text-to-speech, nothing sent anywhere. This page covers
that built-in feature, plus two **experimental** add-ons for people with a GPU:
a local **talking-head avatar** and local **voice cloning**.

## Photos + voice (built in, works offline)

In the Studio window, the **Make from your own photos & voice** section:

1. **Add 1–4 photos** — click the drop zone or drag images in. Remove one with
   the **×** on its thumbnail.
2. **Add a voice-over** — press **Record** to capture it with your microphone
   (press **Stop** when done), or **Upload audio** to use an existing file
   (`.mp3`, `.m4a`, `.wav`, `.webm`, …).
3. Give it an optional **title** and press **Make photo video**.

The photos become a gentle zoom/pan (Ken Burns) slideshow, split evenly across
the length of your voice-over, muxed together into `video.mp4`. It plays in the
preview and is saved under `out\` like any other video. The format (9:16 short
or 16:9 long) follows the toggle at the top of the window.

This path needs only FFmpeg — it's part of the install, so it works in free
local mode with no API keys and no model download.

## Experimental: a talking-head avatar (`AVATAR_CMD`)

Instead of a slideshow, you can have the **first photo animated to speak** your
voice-over, using a local open-source tool such as
[SadTalker](https://github.com/OpenTalker/SadTalker) or
[Wav2Lip](https://github.com/Rudrabha/Wav2Lip). These need an NVIDIA GPU and a
working Python environment, so they are **not bundled** — you set them up
yourself and point the app at a small wrapper.

Set one environment variable (in `.env`, or **Settings** once exposed):

```
AVATAR_CMD=C:\tools\avatar\run.cmd
```

When `AVATAR_CMD` is set, the photo feature calls it as:

```
AVATAR_CMD <first-photo> <voice-over-audio> <output.mp4>
```

Your wrapper must read the photo and audio, produce a lip-synced `.mp4` at the
output path, and exit `0`. A minimal SadTalker wrapper looks like:

```bat
@echo off
rem run.cmd  %1=photo  %2=audio  %3=output.mp4
call C:\tools\sadtalker\venv\Scripts\activate.bat
python C:\tools\sadtalker\inference.py ^
  --source_image %1 --driven_audio %2 --result_dir "%TEMP%\sadtalker" --still --preprocess full
rem SadTalker writes a timestamped file; copy the newest one to %3
for /f "delims=" %%F in ('dir /b /o-d "%TEMP%\sadtalker\*.mp4"') do (copy /y "%TEMP%\sadtalker\%%F" %3 & goto :done)
:done
```

If `AVATAR_CMD` is unset or the command fails, you simply get (or fall back to)
the slideshow. This hook is deliberately generic: any program that turns a photo
+ audio into a video works, including a script that calls a cloud avatar service
(HeyGen, D-ID) if you prefer quality over local/offline.

## Experimental: clone your own voice tone

The built-in feature uses the **exact audio you record or upload** — it is your
real voice, so there is nothing to clone. Cloning only matters if you want the
**agent's AI-written scripts** read back in *your* voice tone.

For that, run a local voice-cloning TTS server that speaks OpenAI's
`/audio/speech` API — for example
[Coqui XTTS](https://github.com/coqui-ai/TTS) behind an OpenAI-style shim, or
[openedai-speech](https://github.com/matatonic/openedai-speech) with an XTTS
voice. Record a short clean sample of your voice, register it as a named voice
in that server, then point the app at it:

```
TTS_PROVIDER=openai-compatible
TTS_BASE_URL=http://localhost:8000/v1
TTS_MODEL=xtts
TTS_VOICE=my-voice        # the voice name/sample you registered on the server
TTS_SPEED=1
```

Now `npm run make` and the agent narrate with your cloned tone, while everything
else (writing, footage) stays as configured. Quality and licensing depend on the
model you run — clone only your own voice, or one you have permission to use.

## Which should I use?

| You want… | Use |
| --- | --- |
| A quick video from your photos, narrated by you | **Photos + voice** (built in) |
| Your photo's face animated to speak | **`AVATAR_CMD`** (needs a GPU + setup) |
| AI-written scripts read in your voice tone | **Voice cloning** via `openai-compatible` TTS |

The first works for everyone out of the box. The other two are for people
comfortable setting up local ML tools, and are unsupported beyond the hooks
described here.
