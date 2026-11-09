import type { Emotion, Intensity, PerformanceDirection, SpeakingSpeed } from '../types';

/**
 * Starting-point performance direction for each emotion. The director is expected to
 * review and refine these; inferred directions are flagged with `inferred: true`.
 */
const EMOTION_TEMPLATES: Record<Emotion, Omit<PerformanceDirection, 'emotion' | 'intensity' | 'speed' | 'pauses' | 'emphasis' | 'pronunciation' | 'inferred' | 'customEmotion'>> = {
  neutral: {
    vocalDelivery: 'even, natural conversational tone',
    expressionBefore: 'relaxed, attentive',
    expressionDuring: 'relaxed face, natural mouth shapes',
    expressionAfter: 'relaxed, waits for response',
    eyeDirection: 'toward listener',
    headMovement: 'small natural nods',
    posture: 'relaxed, upright',
    gesture: 'minimal',
  },
  happy: {
    vocalDelivery: 'warm, bright tone with a smile in the voice',
    expressionBefore: 'softening, beginning of a smile',
    expressionDuring: 'warm smile, cheeks raised, eyes crinkle',
    expressionAfter: 'lingering smile',
    eyeDirection: 'gentle eye contact with listener',
    headMovement: 'slight tilt, easy nods',
    posture: 'open, relaxed shoulders',
    gesture: 'open hands',
  },
  sad: {
    vocalDelivery: 'low, soft, slower with breaks',
    expressionBefore: 'brows drawn together, gaze lowering',
    expressionDuring: 'inner brows raised, corners of mouth down, glassy eyes',
    expressionAfter: 'looks away, swallows',
    eyeDirection: 'downcast, occasional glance at listener',
    headMovement: 'head lowered, minimal movement',
    posture: 'shoulders dropped, closed',
    gesture: 'hands still or self-touch',
  },
  angry: {
    vocalDelivery: 'hard, clipped, louder on stressed words',
    expressionBefore: 'jaw set, nostrils flare',
    expressionDuring: 'brows down and together, tight lips between words, hard stare',
    expressionAfter: 'breathing heavy, holds stare',
    eyeDirection: 'locked on listener',
    headMovement: 'sharp forward push on emphasis',
    posture: 'squared, leaning in',
    gesture: 'pointed or chopping hand',
  },
  afraid: {
    vocalDelivery: 'breathy, higher pitch, unsteady',
    expressionBefore: 'freezes, eyes widen',
    expressionDuring: 'brows raised and pulled together, lips stretched, quick breaths',
    expressionAfter: 'scans surroundings',
    eyeDirection: 'darting, toward threat',
    headMovement: 'pulls back',
    posture: 'shrinking, protective',
    gesture: 'hands raised defensively',
  },
  surprised: {
    vocalDelivery: 'excited, rising pitch',
    expressionBefore: 'attention caught, breath in',
    expressionDuring: 'eyes widen, brows raised, mouth opens',
    expressionAfter: 'smile or disbelief settles in',
    eyeDirection: 'locked on the surprise',
    headMovement: 'slight forward movement',
    posture: 'lifts, leans forward',
    gesture: 'hands rise',
  },
  confident: {
    vocalDelivery: 'steady, measured, grounded',
    expressionBefore: 'composed',
    expressionDuring: 'level gaze, controlled small smile',
    expressionAfter: 'holds eye contact',
    eyeDirection: 'direct, steady eye contact',
    headMovement: 'still, deliberate',
    posture: 'upright, chest open',
    gesture: 'deliberate, economical',
  },
  nervous: {
    vocalDelivery: 'hesitant, quick, trailing off',
    expressionBefore: 'swallows, lips pressed',
    expressionDuring: 'forced smile, frequent blinking',
    expressionAfter: 'looks away quickly',
    eyeDirection: 'avoids eye contact',
    headMovement: 'small fidgety movements',
    posture: 'tense, weight shifting',
    gesture: 'fidgeting hands',
  },
  romantic: {
    vocalDelivery: 'soft, intimate, slower',
    expressionBefore: 'softened gaze',
    expressionDuring: 'gentle smile, relaxed eyes',
    expressionAfter: 'holds gaze',
    eyeDirection: 'lingering eye contact',
    headMovement: 'slight tilt toward listener',
    posture: 'leaning in, open',
    gesture: 'gentle touch or reach',
  },
  sarcastic: {
    vocalDelivery: 'dry, flat with exaggerated stress',
    expressionBefore: 'half-smile',
    expressionDuring: 'raised eyebrow, one-sided smirk',
    expressionAfter: 'eye roll or deadpan hold',
    eyeDirection: 'side glance',
    headMovement: 'slight head tilt',
    posture: 'casual, leaning back',
    gesture: 'dismissive hand',
  },
  custom: {
    vocalDelivery: '',
    expressionBefore: '',
    expressionDuring: '',
    expressionAfter: '',
    eyeDirection: '',
    headMovement: '',
    posture: '',
    gesture: '',
  },
};

const PARENTHETICAL_CUES: Array<{ re: RegExp; emotion?: Emotion; intensity?: Intensity; speed?: SpeakingSpeed; delivery?: string }> = [
  { re: /relie/i, emotion: 'happy', intensity: 'subtle', delivery: 'warm, relieved' },
  { re: /whisper/i, intensity: 'subtle', speed: 'slow', delivery: 'whispered' },
  { re: /shout|yell|scream|furious|angr|rage/i, emotion: 'angry', intensity: 'strong' },
  { re: /laugh|grin|smil|cheer|delight|joy/i, emotion: 'happy' },
  { re: /cry|tear|sob|grie|sad|quiet(ly)?$/i, emotion: 'sad' },
  { re: /sarcas|dry|deadpan|mock/i, emotion: 'sarcastic' },
  { re: /nervous|hesit|stammer|stutter|anxious/i, emotion: 'nervous', speed: 'fast' },
  { re: /scared|terrified|afraid|fear|panic/i, emotion: 'afraid', intensity: 'strong' },
  { re: /shock|stunned|surpris|amazed|astonish/i, emotion: 'surprised' },
  { re: /tender|loving|romantic|flirt/i, emotion: 'romantic', intensity: 'subtle' },
  { re: /gentle|warm|kind/i, emotion: 'happy', intensity: 'subtle' },
  { re: /soft/i, intensity: 'subtle' },
  { re: /confident|firm|calm|assured|steady/i, emotion: 'confident' },
];

const TEXT_CUES: Array<{ re: RegExp; emotion: Emotion }> = [
  { re: /\b(came back|you're here|you are here|no way|what\?!|really\?!|oh my)\b/i, emotion: 'surprised' },
  { re: /\b(promise[ds]?|thank|missed you|glad|love you|of course)\b/i, emotion: 'happy' },
  { re: /\b(hate|how dare|get out|shut up)\b/i, emotion: 'angry' },
  { re: /\b(sorry|lost|gone|miss (her|him|them))\b/i, emotion: 'sad' },
  { re: /\b(help|run|don't hurt|please don't)\b/i, emotion: 'afraid' },
];

/** Infers a first-pass performance direction from a line and its parenthetical. */
export function inferPerformance(text: string, parenthetical?: string): PerformanceDirection {
  let emotion: Emotion = 'neutral';
  let intensity: Intensity = 'moderate';
  let speed: SpeakingSpeed = 'normal';
  let delivery: string | undefined;

  if (parenthetical) {
    for (const cue of PARENTHETICAL_CUES) {
      if (cue.re.test(parenthetical)) {
        if (cue.emotion && emotion === 'neutral') emotion = cue.emotion;
        if (cue.intensity) intensity = cue.intensity;
        if (cue.speed) speed = cue.speed;
        if (cue.delivery) delivery = cue.delivery;
      }
    }
  }
  if (emotion === 'neutral') {
    for (const cue of TEXT_CUES) {
      if (cue.re.test(text)) {
        emotion = cue.emotion;
        break;
      }
    }
  }

  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations >= 2) intensity = 'strong';
  if (exclamations >= 1 && emotion === 'neutral') emotion = 'surprised';
  if (exclamations >= 2 && speed === 'normal') speed = 'fast';

  const ellipses = (text.match(/\.\.\.|…|—|--/g) ?? []).length;
  if (ellipses >= 2 && speed === 'normal') speed = 'slow';
  const pauses = ellipses > 0 ? `${ellipses} written pause${ellipses > 1 ? 's' : ''} (at "…" / "—")` : '';

  // Emphasis: ALL-CAPS words (2+ letters) or *starred* / _underscored_ words.
  const emphasis = [
    ...Array.from(text.matchAll(/\b([A-Z]{2,}[A-Z']*)\b/g)).map((m) => m[1]).filter((w) => w !== 'I' && w !== 'OK'),
    ...Array.from(text.matchAll(/[*_]([^*_]+)[*_]/g)).map((m) => m[1]),
  ];

  const template = EMOTION_TEMPLATES[emotion];
  const question = /\?\s*$/.test(text.trim());
  return {
    emotion,
    intensity,
    speed,
    pauses,
    emphasis,
    vocalDelivery: [delivery ?? template.vocalDelivery, question ? 'questioning upward inflection at the end' : '']
      .filter(Boolean)
      .join('; '),
    pronunciation: '',
    expressionBefore: template.expressionBefore,
    expressionDuring: template.expressionDuring,
    expressionAfter: template.expressionAfter,
    eyeDirection: template.eyeDirection,
    headMovement: template.headMovement,
    posture: template.posture,
    gesture: template.gesture,
    inferred: true,
  };
}

/** Re-applies an emotion's template while keeping the line-specific timing fields. */
export function applyEmotionTemplate(p: PerformanceDirection, emotion: Emotion): PerformanceDirection {
  const t = EMOTION_TEMPLATES[emotion];
  return { ...p, ...t, emotion, vocalDelivery: t.vocalDelivery || p.vocalDelivery };
}

export function listenerDirection(speakerEmotion: Emotion, intensity: Intensity): { state: 'listening' | 'reacting'; direction: string } {
  if (intensity === 'strong' || speakerEmotion === 'surprised' || speakerEmotion === 'angry') {
    return { state: 'reacting', direction: 'visible reaction to the line; mouth closed, breathing continues' };
  }
  return { state: 'listening', direction: 'listening, mouth closed, natural blinks and breathing, eyes on speaker' };
}

export const BEAT_DIRECTION = 'mouth closes, breathing and emotional reaction continue';
