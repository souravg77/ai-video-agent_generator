import type { CandidateRequest, CandidateResult, GenerationEngine, ShotRequest, TakeResult } from './types';

/**
 * Offline engine for exercising the workflow without API keys. It draws labelled
 * placeholder portraits and returns placeholder takes. Everything it makes is flagged
 * `isPlaceholder`, so nothing it produces can pass validation or be exported as final.
 */

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function placeholderPortrait(name: string, seed: number, label = 'PLACEHOLDER'): string {
  const r = rng(seed);
  const hue = Math.floor(r() * 360);
  const skin = ['#f1c7a5', '#d9a07a', '#b97a56', '#8d5a3b', '#5e3b26', '#e8b896'][Math.floor(r() * 6)];
  const hair = ['#1d1a18', '#3b2416', '#6b4423', '#a8783f', '#d6c08a', '#8a8a8a', '#7a1f1f'][Math.floor(r() * 7)];
  const hairStyle = Math.floor(r() * 3);
  const faceW = 54 + r() * 14;
  const faceH = 70 + r() * 12;
  const shoulder = 70 + r() * 30;
  const outfit = `hsl(${(hue + 180) % 360} 35% ${30 + r() * 25}%)`;
  const hairPath =
    hairStyle === 0
      ? `<ellipse cx="128" cy="${112 - faceH / 2 + 10}" rx="${faceW + 6}" ry="${faceH / 2}" fill="${hair}"/>`
      : hairStyle === 1
        ? `<path d="M${128 - faceW - 6} 120 Q128 ${20 + r() * 20} ${128 + faceW + 6} 120 L${128 + faceW + 10} 190 L${128 - faceW - 10} 190 Z" fill="${hair}"/>`
        : `<rect x="${128 - faceW}" y="${118 - faceH}" width="${faceW * 2}" height="${faceH * 0.7}" rx="30" fill="${hair}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320" viewBox="0 0 256 320">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 30% 22%)"/><stop offset="1" stop-color="hsl(${hue} 35% 10%)"/></linearGradient></defs>
<rect width="256" height="320" fill="url(#g)"/>
${hairPath}
<path d="M${128 - shoulder - 40} 320 Q128 ${200 + r() * 20} ${128 + shoulder + 40} 320 Z" fill="${outfit}"/>
<rect x="114" y="170" width="28" height="40" fill="${skin}"/>
<ellipse cx="128" cy="130" rx="${faceW}" ry="${faceH}" fill="${skin}"/>
<ellipse cx="${128 - faceW * 0.38}" cy="125" rx="6" ry="4" fill="#1b1b1b"/>
<ellipse cx="${128 + faceW * 0.38}" cy="125" rx="6" ry="4" fill="#1b1b1b"/>
<path d="M${118} ${165 + r() * 6} Q128 ${170 + r() * 8} 138 ${165 + r() * 6}" stroke="#6b2b2b" stroke-width="3" fill="none"/>
<rect x="0" y="0" width="256" height="26" fill="rgba(0,0,0,.55)"/>
<text x="10" y="18" font-family="sans-serif" font-size="12" fill="#ffd166" font-weight="700">${esc(label)}</text>
<text x="246" y="18" font-family="sans-serif" font-size="11" fill="#ddd" text-anchor="end">seed ${seed}</text>
<rect x="0" y="292" width="256" height="28" fill="rgba(0,0,0,.55)"/>
<text x="128" y="311" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">${esc(name)}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createPlaceholderEngine(opts: { delayMs?: number } = {}): GenerationEngine {
  const delay = opts.delayMs ?? 350;
  return {
    id: 'placeholder',
    name: 'Offline placeholder',
    roles: ['image', 'video'],
    description:
      'Built-in offline engine for testing the workflow. Draws labelled placeholder portraits and creates placeholder takes with no real footage. Placeholder output never passes validation or export.',
    capabilities: {
      imageGeneration: true,
      videoGeneration: true,
      nativeAudio: false,
      speechSynthesis: false,
      lipSync: false,
      emotionControl: false,
      headMotionControl: false,
      multiSpeakerInOneShot: false,
      maxReferenceImages: 4,
      identityPreservation: 'none',
      startEndFrames: true,
      maxDurationSec: 20,
      aspectRatios: ['16:9', '9:16', '1:1', '2.39:1', '4:3'],
      languages: 'any',
      producesPlaceholders: true,
    },
    status: () => ({ available: true }),
    async generateCandidates(req: CandidateRequest, onProgress): Promise<CandidateResult[]> {
      const base = req.seed ?? Math.floor(Math.random() * 1e6);
      const out: CandidateResult[] = [];
      for (let i = 0; i < req.count; i++) {
        await wait(delay / req.count);
        onProgress?.((i + 1) / req.count, `Drawing placeholder ${i + 1}/${req.count}`);
        const seed = base + i * 7919;
        out.push({
          imageUri: placeholderPortrait(req.characterName, seed),
          seed,
          prompt: `${req.characterName}: ${req.description || 'no description yet'}`,
          isPlaceholder: true,
        });
      }
      return out;
    },
    async generateShot(req: ShotRequest, onProgress): Promise<TakeResult> {
      for (let i = 1; i <= 4; i++) {
        await wait(delay / 4);
        onProgress?.(i / 4, `Building placeholder take ${i}/4`);
      }
      return {
        videoUri: null,
        audioUri: null,
        isPlaceholder: true,
        route: 'video_only',
        metadata: { videoDurationSec: req.durationSec, referenceIdsUsed: req.referenceImages.map((r) => r.referenceId) },
      };
    },
  };
}
