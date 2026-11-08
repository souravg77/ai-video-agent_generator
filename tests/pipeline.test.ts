import { describe, expect, it } from 'vitest';
import { approveCandidate, lockIdentity } from '../src/core/characters/studio';
import { planShot } from '../src/core/engines/planner';
import { EngineRegistry, createDefaultRegistry } from '../src/core/engines/registry';
import type { GenerationEngine } from '../src/core/engines/types';
import { generateCharacterCandidates, generateTake, PlanBlockedError } from '../src/core/generation';
import { applyScript, createProject, exportReadiness } from '../src/core/project';
import { buildStoryboard } from '../src/core/storyboard/storyboard';
import type { Project } from '../src/core/types';
import { approveTake, setManualCheck, shotStatus, validateTake } from '../src/core/validation/lipsync';
import { SAMPLE_SCRIPT } from './fixtures/sample';

async function setup(registry = createDefaultRegistry({ placeholderDelayMs: 0 })) {
  let p: Project = applyScript(createProject('Test'), SAMPLE_SCRIPT).project;
  p = { ...p, shots: buildStoryboard(p).shots };
  return { p, registry };
}

async function approveAll(p: Project, registry: EngineRegistry) {
  for (const c of p.characters) {
    let next = await generateCharacterCandidates(p, c.id, registry);
    next = lockIdentity(approveCandidate(next, next.candidates[0].id));
    p = { ...p, characters: p.characters.map((x) => (x.id === c.id ? next : x)) };
  }
  return p;
}

describe('storyboard', () => {
  it('creates establishing, action, reaction and dialogue shots, skipping voice-over', async () => {
    const { p } = await setup();
    const ids = p.shots.map((s) => s.id);
    expect(ids).toContain('shot-scene-1-est');
    expect(ids).toContain('shot-line-1');
    expect(p.shots.some((s) => s.title.startsWith('Reaction: Maya'))).toBe(true);
    const vo = p.dialogue.find((l) => l.isVoiceOver)!;
    expect(ids).not.toContain(`shot-${vo.id}`);
    const line1 = p.shots.find((s) => s.id === 'shot-line-1')!;
    expect(line1.camera.framing).toBe('OTS');
    expect(line1.characterIds).toEqual(['char-maya', 'char-leo']);
  });

  it('keeps edited shots and their takes when rebuilt', async () => {
    const { p } = await setup();
    const edited = { ...p, shots: p.shots.map((s) => (s.id === 'shot-line-1' ? { ...s, lighting: 'neon' } : s)) };
    const rebuilt = buildStoryboard(edited);
    expect(rebuilt.shots.find((s) => s.id === 'shot-line-1')!.lighting).toBe('neon');
    expect(rebuilt.added).toBe(0);
  });
});

describe('planner honesty', () => {
  it('blocks production until characters are approved', async () => {
    const { p, registry } = await setup();
    const plan = planShot(p.shots.find((s) => s.id === 'shot-line-1')!, p, registry);
    expect(plan.canProceed).toBe(false);
    expect(plan.limitations.map((l) => l.code)).toContain('character_not_approved');
    expect(plan.placeholderTestAllowed).toBe(false);
  });

  it('refuses to fake dialogue without voice and lip-sync engines', async () => {
    const { p: p0, registry } = await setup();
    const p = await approveAll(p0, registry);
    const plan = planShot(p.shots.find((s) => s.id === 'shot-line-1')!, p, registry);
    expect(plan.route).toBe('separate_performance');
    expect(plan.canProceed).toBe(false);
    expect(plan.limitations.map((l) => l.code)).toEqual(expect.arrayContaining(['no_voice_engine', 'no_lipsync_engine', 'placeholder_engine']));
    await expect(generateTake(p, 'shot-line-1', registry)).rejects.toBeInstanceOf(PlanBlockedError);
  });

  it('reports unconfigured cloud slots as unavailable', async () => {
    const { p: p0, registry } = await setup();
    const p = { ...(await approveAll(p0, registry)), engineSelection: { video: 'cloud-video', image: 'placeholder', voice: 'cloud-voice', lipsync: 'cloud-lipsync' } };
    const plan = planShot(p.shots.find((s) => s.id === 'shot-line-1')!, p, registry);
    expect(plan.limitations.map((l) => l.code)).toEqual(expect.arrayContaining(['video_engine_unavailable', 'voice_engine_unavailable', 'lipsync_engine_unavailable']));
  });

  it('chooses native audio-video when the engine supports it and splits multi-speaker shots otherwise', async () => {
    const native: GenerationEngine = {
      id: 'native', name: 'Native AV', roles: ['video'], description: '',
      capabilities: { imageGeneration: false, videoGeneration: true, nativeAudio: true, speechSynthesis: false, lipSync: false, emotionControl: true, headMotionControl: false, multiSpeakerInOneShot: false, maxReferenceImages: 3, identityPreservation: 'reference_guided', startEndFrames: true, maxDurationSec: 8, aspectRatios: ['16:9'], languages: ['en'], producesPlaceholders: false },
      status: () => ({ available: true }),
      generateShot: async (req) => ({ videoUri: 'file:///v.mp4', audioUri: 'file:///a.wav', isPlaceholder: false, route: 'native_av', metadata: { videoDurationSec: req.durationSec, audioDurationSec: req.durationSec, fps: 24, speakerTracks: req.dialogue.map((d) => ({ characterId: d.characterId, lineId: d.lineId, startSec: 0, endSec: 1, language: 'en-US' })) } }),
    };
    const registry = createDefaultRegistry({ placeholderDelayMs: 0 });
    registry.register(native);
    const { p: p0 } = await setup(registry);
    const p = { ...(await approveAll(p0, registry)), engineSelection: { video: 'native', image: 'placeholder', voice: null, lipsync: null } };
    const plan = planShot(p.shots.find((s) => s.id === 'shot-line-1')!, p, registry);
    expect(plan.route).toBe('native_av');
    expect(plan.canProceed).toBe(true);

    const two = { ...p.shots.find((s) => s.id === 'shot-line-1')!, dialogueLineIds: ['line-1', 'line-2'] };
    const plan2 = planShot(two, p, registry);
    expect(plan2.route).toBe('separate_performance');
    expect(plan2.limitations.map((l) => l.code)).toContain('multi_speaker');

    const { shot, take } = await generateTake(p, 'shot-line-1', registry);
    expect(take.validation!.checks.find((c) => c.id === 'correct_speaker')!.status).toBe('pass');
    expect(take.validation!.checks.find((c) => c.id === 'av_drift')!.status).toBe('pass');
    expect(take.validation!.overall).toBe('incomplete'); // mouth/face checks still need review
    expect(shotStatus(shot)).toBe('generated_unvalidated');
    expect(() => approveTake(shot, take.id)).toThrow(/validation/);

    let report = take.validation!;
    for (const c of report.checks) if (c.status === 'not_checked') report = setManualCheck(report, c.id, 'pass', 'looked right');
    const reviewed = { ...shot, takes: shot.takes.map((t) => (t.id === take.id ? { ...t, validation: report } : t)) };
    expect(shotStatus(reviewed)).toBe('ready_to_approve');
    expect(shotStatus(approveTake(reviewed, take.id))).toBe('approved');
  });
});

describe('validation', () => {
  it('never lets a placeholder take pass, even in a workflow test', async () => {
    const { p: p0, registry } = await setup();
    const p = await approveAll(p0, registry);
    const { shot, take } = await generateTake(p, 'shot-line-1', registry, { placeholderTest: true });
    expect(take.isPlaceholder).toBe(true);
    expect(take.validation!.overall).toBe('fail');
    expect(shotStatus(shot)).toBe('needs_repair');
    expect(() => setManualCheck(take.validation!, 'real_footage', 'pass', '')).toThrow();
  });

  it('detects wrong speaker, overlapping speakers and drift from metadata', async () => {
    const { p } = await setup();
    const shot = { ...p.shots.find((s) => s.id === 'shot-line-1')!, dialogueLineIds: ['line-1', 'line-2'] };
    const take = {
      id: 't', shotId: shot.id, createdAt: '', engineId: 'x', route: 'native_av' as const, videoUri: 'v', audioUri: 'a', isPlaceholder: false, validation: null, notes: '',
      metadata: { videoDurationSec: 4, audioDurationSec: 4.5, fps: 24, speakerTracks: [
        { characterId: 'char-leo', lineId: 'line-1', startSec: 0, endSec: 2, language: 'en-US' },
        { characterId: 'char-leo', lineId: 'line-2', startSec: 1.5, endSec: 3, language: 'fr-FR' },
      ] },
    };
    const r = validateTake(shot, take, p);
    const s = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(s.correct_speaker).toBe('fail');
    expect(s.av_drift).toBe('fail');
    expect(s.language_pronunciation).toBe('fail');
    expect(r.overall).toBe('fail');
    expect(() => setManualCheck(r, 'av_drift', 'pass', '')).toThrow(/measured/);
  });

  it('blocks export while shots are unapproved and says rendering is not implemented', async () => {
    const { p } = await setup();
    const issues = exportReadiness(p);
    expect(issues.some((i) => /approved, validated take/.test(i.message))).toBe(true);
    expect(issues.some((i) => /not implemented/.test(i.message))).toBe(true);
  });
});

describe('script merge', () => {
  it('keeps approved characters and edited performances when re-parsing', async () => {
    const { p: p0, registry } = await setup();
    let p = await approveAll(p0, registry);
    p = { ...p, dialogue: p.dialogue.map((l) => (l.id === 'line-1' ? { ...l, performance: { ...l.performance, gesture: 'drops the cloth', inferred: false } } : l)) };
    const next = applyScript(p, SAMPLE_SCRIPT.replace('LEO\n(relieved', 'LEO\n(relieved').replace('Maya: Don\'t be. Just stay.', '')).project;
    expect(next.characters.find((c) => c.id === 'char-maya')!.locked).toBe(true);
    expect(next.dialogue.find((l) => l.id === 'line-1')!.performance.gesture).toBe('drops the cloth');
  });
});
