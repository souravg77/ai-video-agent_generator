# The agent, review page and FFmpeg in one image.
#   docker compose up -d            (see docs/hosting.md)
FROM node:22-bookworm-slim

# FFmpeg renders the videos; DejaVu is the default caption font. Add fonts-noto-cjk for Chinese/Japanese/Korean captions.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Local mode (docker-compose.local.yml) adds Piper for offline voice-overs.
ARG LOCAL_MODE=false
RUN if [ "$LOCAL_MODE" = "true" ]; then \
    apt-get update && apt-get install -y --no-install-recommends python3-pip \
    && pip install --no-cache-dir --break-system-packages piper-tts \
    && rm -rf /var/lib/apt/lists/*; \
  fi

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc --noEmit

ENV NODE_ENV=production REVIEW_HOST=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.REVIEW_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npm run db:migrate && npm run agent"]
