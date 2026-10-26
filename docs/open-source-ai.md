# Open-source AI

Every AI step can run on open-source models, on your own machine or on a host that serves open models. Pick them with `npm run setup`, or set them in `.env` as shown below.

| Step | Open-source options | Setting |
| --- | --- | --- |
| Writing (ideas, scripts, translations, comment drafts) | Ollama, LM Studio, vLLM, llama.cpp, LocalAI; or hosted open models on Groq, Together AI, OpenRouter, DeepInfra | `LLM_PROVIDER=ollama` or `openai-compatible` |
| Voice | Piper (offline, light); Kokoro through Kokoro-FastAPI (more natural); any server with an OpenAI-style speech API | `TTS_PROVIDER=piper` or `openai-compatible` |
| Footage | Generated backgrounds, or your own clips | `VISUALS_PROVIDER=generated` or `folder` |

Ollama and Piper are covered in [local-mode.md](local-mode.md). This page covers the rest.

## Writing with any open-source model server

Most model servers speak the same API as OpenAI, so one setting covers them all:

```sh
LLM_PROVIDER=openai-compatible
OPENAI_BASE_URL=http://localhost:1234/v1   # where the server listens; ends in /v1
OPENAI_MODEL=qwen3-14b                     # a model the server has
OPENAI_API_KEY=                            # only for hosted servers
```

| Server | `OPENAI_BASE_URL` | Example `OPENAI_MODEL` | Key |
| --- | --- | --- | --- |
| [LM Studio](https://lmstudio.ai) (desktop app; turn on the server under Developer) | `http://localhost:1234/v1` | `qwen3-14b` | no |
| [vLLM](https://docs.vllm.ai) (fast, needs an NVIDIA GPU): `vllm serve Qwen/Qwen3-14B` | `http://localhost:8000/v1` | `Qwen/Qwen3-14B` | no |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) server: `llama-server -m model.gguf` | `http://localhost:8080/v1` | any name | no |
| [Groq](https://console.groq.com) (hosted open models, very fast) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | yes |
| [Together AI](https://api.together.ai) | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` | yes |
| [OpenRouter](https://openrouter.ai) (many open models behind one key) | `https://openrouter.ai/api/v1` | `qwen/qwen3-235b-a22b` | yes |

Model names change over time. `npm run check` lists the models your server offers when the one in `.env` isn't among them.

The agent asks the server for output that matches an exact JSON schema. If the server rejects schemas, the agent falls back to plain JSON mode, and you can set `OPENAI_JSON_MODE=object` to skip the first try. Every answer is checked against the expected shape. When it doesn't match, the model gets one retry with the problem spelled out.

Hosted servers charge per token. To include that in the agent's cost tracking and the monthly budget, set `OPENAI_USD_PER_1M_INPUT` and `OPENAI_USD_PER_1M_OUTPUT` from the provider's price page.

**Which model?** Open models from 14B parameters up write usable scripts. Qwen3, Llama 3.3, Gemma 3 and Mistral Small are good starting points. Smaller models are faster but break the format more often. For long videos, use 30B or larger.

## Voices with Kokoro

[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) is a small open-source voice model (Apache 2.0) that sounds much more natural than Piper and runs fine on a CPU. [Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) serves it with an OpenAI-style speech API:

```sh
docker run -d --name kokoro -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

```sh
TTS_PROVIDER=openai-compatible
TTS_BASE_URL=http://localhost:8880/v1
TTS_MODEL=kokoro
TTS_VOICE=af_heart     # also af_bella, am_michael, bf_emma, bm_george and more
TTS_SPEED=1
```

The same settings work with any other server that has an OpenAI-style `/audio/speech` endpoint, such as LocalAI or openedai-speech. Use `TTS_API_KEY` if the server needs one.

## In Docker

With `docker-compose.local.yml`, add these lines to `.env` to run Kokoro next to the agent:

```sh
COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml
COMPOSE_PROFILES=kokoro
TTS_PROVIDER=openai-compatible
TTS_BASE_URL=http://kokoro:8880/v1
```

The agent container can't reach the server's `localhost`. For a model server running on the server itself, outside Docker (LM Studio, vLLM), use `http://host.docker.internal:<port>/v1`.

## Check it

```sh
npm run check
npm run make -- --topic "why octopuses have three hearts"
```

`npm run check` confirms that the model server and the voice server answer. Then make one video and watch it before turning on the agent.
