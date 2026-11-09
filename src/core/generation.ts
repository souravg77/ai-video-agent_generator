import { addCandidates, describeAppearance, findReference } from './characters/studio';
import { planShot, type ShotPlan } from './engines/planner';
import type { EngineRegistry } from './engines/registry';
import type { ProgressFn, ShotRequest, TakeResult } from './engines/types';
import { newId, nowIso } from './ids';
import { pinCurrentReferences } from './storyboard/storyboard';
import type { Character, Project, Shot, SpeakerTrack, Take } from './types';
import { validateTake, type PerformanceAnalyzer } from './validation/lipsync';

export class PlanBlockedError extends Error {
  constructor(public plan: ShotPlan) {
    super(plan.limitations.filter((l) => l.severity === 'blocker').map((l) => l.message).join(' '));
  }
}

export async function generateCharacterCandidates(
  project: Project,
  characterId: string,
  registry: EngineRegistry,
  onProgress?: ProgressFn,
): Promise<Character> {
  const c = project.characters.find((x) => x.id === characterId);
  if (!c) throw new Error('Character not found.');
  const engine = registry.get(project.engineSelection.image);
  if (!engine || !engine.generateCandidates) throw new Error('No image engine selected that can generate character designs.');
  const st = engine.status();
  if (!st.available) throw new Error(`${engine.name} is unavailable: ${st.reason ?? 'unknown reason'}.`);
  const results = await engine.generateCandidates(
    { characterId, characterName: c.name, description: describeAppearance(c), count: project.settings.candidateCount },
    onProgress,
  );
  return addCandidates(
    c,
    results.map((r) => ({
      id: newId('cand'),
      imageUri: r.imageUri,
      source: 'generated' as const,
      engineId: engine.id,
      isPlaceholder: r.isPlaceholder,
      prompt: r.prompt,
      seed: r.seed,
      createdAt: nowIso(),
      rejected: false,
    })),
  );
}

export function buildShotPrompt(project: Project, shot: Shot): string {
  const scene = project.scenes.find((s) => s.id === shot.sceneId);
  const loc = project.locations.find((l) => l.id === scene?.locationId);
  const people = shot.characterIds
    .map((id) => project.characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c)
    .map((c) => `${c.name} (${describeAppearance(c) || 'see reference'}${shot.sceneId && c.wardrobeByScene[shot.sceneId] ? `; wardrobe: ${c.wardrobeByScene[shot.sceneId]}` : ''})`);
  const lines = shot.dialogueLineIds.map((id) => project.dialogue.find((l) => l.id === id)).filter(Boolean);
  const perf = lines.map((l) => {
    const p = l!.performance;
    const others = l!.others.filter((o) => o.state !== 'silent').map((o) => `${project.characters.find((c) => c.id === o.characterId)?.name}: ${o.direction}`);
    return `${project.characters.find((c) => c.id === l!.speakerId)?.name} speaks (${p.emotion}, ${p.intensity}): face ${p.expressionDuring}; eyes ${p.eyeDirection}; head ${p.headMovement}; posture ${p.posture}; gesture ${p.gesture}.${others.length ? ` Others: ${others.join('; ')}.` : ''}`;
  });
  return [
    shot.description,
    loc && `Location: ${loc.name}${scene?.timeOfDay ? `, ${scene.timeOfDay.toLowerCase()}` : ''}.`,
    people.length && `Characters: ${people.join('; ')}.`,
    `Camera: ${shot.camera.framing}, ${shot.camera.angle}, ${shot.camera.movement}, ${shot.camera.lensMm}mm.`,
    shot.lighting && `Lighting: ${shot.lighting}.`,
    shot.motion && `Motion: ${shot.motion}.`,
    ...perf,
  ]
    .filter(Boolean)
    .join(' ');
}

function frameUri(project: Project, shot: Shot, which: 'startFrame' | 'endFrame'): string | undefined {
  const f = shot[which];
  if (!f) return undefined;
  if (f.kind === 'asset') return project.assets.find((a) => a.id === f.assetId)?.uri;
  if (f.kind === 'character') {
    const c = project.characters.find((x) => x.id === f.characterId);
    return c ? findReference(c, f.referenceId)?.imageUri : undefined;
  }
  return undefined; // last frame of a take: requires frame extraction from real footage
}

/**
 * Generates one take for a shot following the plan, then validates it.
 * `placeholderTest` lets the offline engine make a clearly labelled test take even when
 * dialogue engines are missing; such takes always fail validation.
 */
export async function generateTake(
  project: Project,
  shotId: string,
  registry: EngineRegistry,
  opts: { placeholderTest?: boolean; onProgress?: ProgressFn; analyzer?: PerformanceAnalyzer } = {},
): Promise<{ shot: Shot; take: Take; plan: ShotPlan }> {
  const original = project.shots.find((s) => s.id === shotId);
  if (!original) throw new Error('Shot not found.');
  // Pin approved references for any character that has none yet; existing pins are kept.
  const pinned = pinCurrentReferences(project, original);
  const shot: Shot = {
    ...original,
    characterRefs: [...original.characterRefs, ...pinned.characterRefs.filter((p) => !original.characterRefs.some((o) => o.characterId === p.characterId))],
  };

  const plan = planShot(shot, project, registry);
  const test = !!opts.placeholderTest && plan.placeholderTestAllowed;
  if (!plan.canProceed && !test) throw new PlanBlockedError(plan);

  const video = registry.get(project.engineSelection.video)!;
  const lines = shot.dialogueLineIds.map((id) => project.dialogue.find((l) => l.id === id)!).filter(Boolean);
  const req: ShotRequest = {
    shotId,
    prompt: buildShotPrompt(project, shot),
    aspectRatio: project.settings.aspectRatio,
    durationSec: shot.durationSec,
    referenceImages: shot.characterRefs.flatMap((p) => {
      const c = project.characters.find((x) => x.id === p.characterId);
      const ref = c ? findReference(c, p.referenceId) : null;
      return ref ? [{ characterId: p.characterId, referenceId: p.referenceId, imageUri: ref.imageUri }] : [];
    }),
    startFrameUri: frameUri(project, shot, 'startFrame'),
    endFrameUri: frameUri(project, shot, 'endFrame'),
    dialogue: lines.map((l) => ({ lineId: l.id, characterId: l.speakerId, text: l.text, language: project.settings.language, performance: l.performance })),
  };

  let result: TakeResult;
  if (test || plan.route === 'video_only' || plan.route === 'native_av') {
    result = await video.generateShot!(req, opts.onProgress);
  } else {
    // Separate performance route: voice tracks, base video, then one lip-sync pass per speaker.
    const voice = registry.get(project.engineSelection.voice)!;
    const lipsync = registry.get(project.engineSelection.lipsync)!;
    const tracks: SpeakerTrack[] = [];
    const audio: Record<string, string> = {};
    let t = 0;
    for (const l of lines) {
      const c = project.characters.find((x) => x.id === l.speakerId)!;
      const s = await voice.synthesizeSpeech!({ lineId: l.id, characterId: c.id, voiceId: c.voice.voiceId, text: l.text, language: project.settings.language, emotion: l.performance.emotion, performance: l.performance });
      audio[l.id] = s.audioUri;
      tracks.push({ characterId: c.id, lineId: l.id, startSec: t, endSec: t + s.durationSec, language: s.language });
      t += s.durationSec;
    }
    let base = await video.generateShot!({ ...req, dialogue: [] }, opts.onProgress);
    for (const sp of [...new Set(lines.map((l) => l.speakerId))]) {
      for (const l of lines.filter((x) => x.speakerId === sp)) {
        base = await lipsync.lipSync!({ shotId, videoUri: base.videoUri!, audioUri: audio[l.id], characterId: sp, lineId: l.id, performance: l.performance }, opts.onProgress);
      }
    }
    result = { ...base, route: 'separate_performance', metadata: { ...base.metadata, speakerTracks: tracks } };
  }

  const take: Take = {
    id: newId('take'),
    shotId,
    createdAt: nowIso(),
    engineId: video.id,
    route: test ? 'video_only' : result.route,
    videoUri: result.videoUri,
    audioUri: result.audioUri,
    isPlaceholder: result.isPlaceholder,
    metadata: result.metadata,
    validation: null,
    notes: test ? 'Placeholder workflow test take.' : '',
  };
  take.validation = validateTake(shot, take, project, { analyzer: opts.analyzer });
  return { shot: { ...shot, takes: [...shot.takes, take] }, take, plan };
}
