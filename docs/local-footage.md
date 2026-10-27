# AI footage (a real photo for every scene)

`VISUALS_PROVIDER=generated-local` makes a **real AI picture for every scene** —
a FLUX image of what the narration is about — and animates it with a slow
zoom/pan. This is the option to use if your videos are "just coloured
backgrounds": those come from `VISUALS_PROVIDER=generated` (procedural gradients,
no AI), whereas this one shows actual imagery.

There are three ways to produce the images; pick one in **Settings → Footage →
“AI images” → AI image source**.

## Easiest: Free online (no setup, no GPU) — default

`IMAGE_API=pollinations` uses **[Pollinations.ai](https://pollinations.ai)**, a
free, keyless service that runs **FLUX** (open source) in the cloud and returns
an image from a URL. **Nothing to install, no GPU, no API key — it just needs an
internet connection.** This is the default.

1. In the app: **Settings → Footage → “AI images — a real photo of each scene”**.
2. **AI image source:** “Free online — no setup”.
3. **Save**, then press **Re-check** (Footage turns green).
4. **Untick “Offline sample”** (the app does this for you), type a topic, pick a
   **Length**, and press **Make video** — each scene gets its own AI photo.

```sh
VISUALS_PROVIDER=generated-local
IMAGE_API=pollinations
IMAGE_MODEL=flux            # or: turbo (faster, lower quality)
```

It depends on a free public service, so it can be slow or busy at times; if an
image fails the run says so and you can try again. For fully offline or
higher-volume use, run a model locally with ComfyUI (below).

## Offline on your own GPU: ComfyUI

[ComfyUI](https://github.com/comfyanonymous/ComfyUI) is the standard way to run
FLUX/SDXL on Windows, and S.Gain Studio talks to it directly.

1. **Install ComfyUI.** Download the **portable Windows build** from the
   [ComfyUI releases](https://github.com/comfyanonymous/ComfyUI/releases) and
   unzip it. (On an NVIDIA GPU, use `run_nvidia_gpu.bat` to start it.)
2. **Download a FLUX model.** Get
   [`flux1-schnell-fp8.safetensors`](https://huggingface.co/Comfy-Org/flux1-schnell/blob/main/flux1-schnell-fp8.safetensors)
   (a single all-in-one file, ~17 GB) and put it in
   `ComfyUI\models\checkpoints\`. FLUX **schnell** is fast (4 steps) and
   Apache-licensed. (Lighter option: any SDXL checkpoint in the same folder.)
3. **Start ComfyUI.** Run `run_nvidia_gpu.bat`. It serves at
   **http://localhost:8188** — leave it running.
4. **Point S.Gain Studio at it.** In the app: **Settings → Footage → “Local AI
   images”**, then:
   - **Local image server:** ComfyUI
   - **Server address:** `http://localhost:8188`
   - **Model / checkpoint:** `flux1-schnell-fp8.safetensors` (the exact file name)
   - **Save**, then press **Re-check** — the Footage pill turns green.
5. **Make a real video.** Untick **Offline sample**, type a topic, pick a
   **Length**, and press **Make video**. Each scene now gets its own AI image.

The first image is slow (ComfyUI loads the model into VRAM); the rest are quick.

## Alternative: an OpenAI-style image server

If you already run a server with an OpenAI `/v1/images/generations` endpoint —
[LocalAI](https://localai.io), [SwarmUI](https://github.com/mcmonkeyprojects/SwarmUI),
or [openedai-images](https://github.com/matatonic/openedai-images) — choose
**“OpenAI-style image server”** instead and set the address (ending in `/v1`)
and the model name that server uses.

## Settings reference (`.env`)

The app writes these for you, but you can also set them directly:

```sh
VISUALS_PROVIDER=generated-local
IMAGE_API=comfyui                        # or: openai
IMAGE_BASE_URL=http://localhost:8188     # ComfyUI address (OpenAI servers end in /v1)
IMAGE_MODEL=flux1-schnell-fp8.safetensors
# IMAGE_SIZE=832x1216                     # optional; blank = a portrait/landscape default
# IMAGE_WORKFLOW=C:\path\to\workflow.json # optional; see "Custom workflow" below
```

Images are generated at a model-friendly size and then upscaled/cropped to the
video frame, so Short (9:16) and Long (16:9) both work from the same setup.

## Hardware and speed

| GPU | What runs | Notes |
| --- | --- | --- |
| NVIDIA 12 GB+ (e.g. RTX 3060 12 GB, 4070) | FLUX.1 schnell comfortably | Best quality; a scene in a few seconds |
| NVIDIA 8 GB (e.g. 3060 Ti, 4060) | FLUX fp8 or SDXL | Use SDXL if FLUX is tight on VRAM |
| No NVIDIA GPU / low VRAM | not practical | Use `generated` backgrounds, Pexels stock, or the Photos & Voice feature instead |

A short video makes one image per scene, so a 1–2 minute video is a handful of
images.

## Custom workflow (advanced)

The built-in ComfyUI workflow targets the FLUX-schnell fp8 checkpoint. To use a
different model or pipeline, build it in ComfyUI, choose **File → Save (API
Format)**, and set `IMAGE_WORKFLOW` to that JSON file. In it, use the literal
placeholders `__PROMPT__`, `__WIDTH__`, `__HEIGHT__`, `__SEED__` and `__MODEL__`
where the per-scene values should go; the app substitutes them each time.

## Troubleshooting

- **Footage pill stays amber / "ComfyUI isn't reachable":** ComfyUI isn't
  running, or the address is wrong. Start `run_nvidia_gpu.bat` and confirm
  http://localhost:8188 opens in a browser.
- **"ComfyUI rejected the request" / model error:** `IMAGE_MODEL` must match a
  file in `ComfyUI\models\checkpoints\` exactly, including `.safetensors`.
- **"didn't finish in time":** the first FLUX run loads a big model; try again
  once it's warm, or use the lighter SDXL checkpoint.
- **Still just colours:** make sure Footage is set to **Local AI images** (not
  Generated) and that **Offline sample** is unticked.
