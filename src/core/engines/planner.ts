import { productionReadiness } from '../characters/studio';
import type { GenerationRoute, Project, Shot } from '../types';
import type { EngineRegistry } from './registry';
import type { GenerationEngine } from './types';

export type LimitationSeverity = 'blocker' | 'warning' | 'info';
export interface Limitation { severity: LimitationSeverity; code: string; message: string }

export interface PlanStep {
  engineId: string;
  operation: 'synthesize_speech' | 'generate_video' | 'generate_video_with_audio' | 'lip_sync' | 'composite';
  characterId?: string;
  lineId?: string;
  description: string;
}

export interface ShotPlan {
  shotId: string;
  route: GenerationRoute | null;
  steps: PlanStep[];
  limitations: Limitation[];
  canProceed: boolean;
  /** A placeholder engine may still make a labelled test take to exercise the workflow. */
  placeholderTestAllowed: boolean;
}

function supportsLanguage(e: GenerationEngine, lang: string): boolean {
  const l = e.capabilities.languages;
  if (l === 'any') return true;
  const base = lang.split('-')[0];
  return l.some((x) => x === lang || x.split('-')[0] === base);
}

/**
 * Works out how a shot would be generated with the selected engines, and lists every
 * reason it cannot be done (blockers) or may not match the direction (warnings).
 * Nothing here pretends: if the engines cannot perform the dialogue, the plan says so.
 */
export function planShot(shot: Shot, project: Project, registry: EngineRegistry): ShotPlan {
  const limitations: Limitation[] = [];
  const steps: PlanStep[] = [];
  const block = (code: string, message: string) => limitations.push({ severity: 'blocker', code, message });
  const warn = (code: string, message: string) => limitations.push({ severity: 'warning', code, message });
  const info = (code: string, message: string) => limitations.push({ severity: 'info', code, message });

  const sel = project.engineSelection;
  const video = registry.get(sel.video);
  const voice = registry.get(sel.voice);
  const lipsync = registry.get(sel.lipsync);
  const lang = project.settings.language;

  // Characters must be approved; shots stay pinned to the reference they were planned with.
  for (const cid of shot.characterIds) {
    const c = project.characters.find((x) => x.id === cid);
    if (!c) {
      block('missing_character', `Character ${cid} no longer exists in the project.`);
      continue;
    }
    const r = productionReadiness(c);
    if (!r.ok) {
      block('character_not_approved', r.reason);
      continue;
    }
    r.warnings.forEach((w) => warn('character_readiness', w));
    const pin = shot.characterRefs.find((p) => p.characterId === cid);
    if (pin && pin.referenceId !== r.referenceId) {
      warn(
        'reference_changed',
        `${c.name} was re-approved (now v${r.version}); this shot is pinned to v${pin.version}. Re-pin it in the inspector to use the new design. Nothing is replaced automatically.`,
      );
    }
  }

  if (!video) {
    block('no_video_engine', 'No video engine selected.');
    return { shotId: shot.id, route: null, steps, limitations, canProceed: false, placeholderTestAllowed: false };
  }
  const vs = video.status();
  if (!vs.available) block('video_engine_unavailable', `${video.name} is unavailable: ${vs.reason ?? 'unknown reason'}.`);
  const vc = video.capabilities;
  if (!vc.videoGeneration) block('no_video_capability', `${video.name} cannot generate video.`);
  if (vc.producesPlaceholders) warn('placeholder_engine', `${video.name} produces placeholder takes only. They cannot pass validation or be exported.`);
  if (vs.available && vc.videoGeneration) {
    if (shot.durationSec > vc.maxDurationSec) {
      block('duration', `Shot is ${shot.durationSec.toFixed(1)}s but ${video.name} supports at most ${vc.maxDurationSec}s. Split the shot or continue from the last frame.`);
    }
    if (!vc.aspectRatios.includes(project.settings.aspectRatio)) {
      block('aspect_ratio', `${video.name} does not support ${project.settings.aspectRatio}.`);
    }
    if ((shot.startFrame || shot.endFrame) && !vc.startEndFrames) {
      block('start_end_frames', `${video.name} cannot start or end on a chosen frame.`);
    }
    if (shot.characterIds.length > vc.maxReferenceImages) {
      warn('reference_count', `${shot.characterIds.length} characters but ${video.name} accepts ${vc.maxReferenceImages} reference image(s).`);
    }
    if (shot.characterIds.length > 0) {
      if (vc.identityPreservation === 'none' || vc.identityPreservation === 'weak') {
        warn('identity', `${video.name} has ${vc.identityPreservation === 'none' ? 'no' : 'weak'} identity preservation. Characters may not match their approved design; review every take.`);
      } else if (vc.identityPreservation === 'reference_guided') {
        info('identity', 'Identity is guided by approved reference images. This is not a trained identity model.');
      }
    }
  }

  const lines = shot.dialogueLineIds
    .map((id) => project.dialogue.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => !!l);
  const speakers = [...new Set(lines.map((l) => l.speakerId))];

  if (lines.length === 0) {
    steps.push({ engineId: video.id, operation: 'generate_video', description: 'Generate the shot (no dialogue).' });
    return finish('video_only');
  }

  const nativeOk =
    vs.available && vc.nativeAudio && (speakers.length <= 1 || vc.multiSpeakerInOneShot) && supportsLanguage(video, lang);

  if (nativeOk) {
    steps.push({ engineId: video.id, operation: 'generate_video_with_audio', description: `Generate video with ${lines.length} spoken line(s) and synchronised performance.` });
    if (!vc.emotionControl) warn('emotion_control', `${video.name} has no explicit emotion control; emotion direction is passed as prompt text only.`);
    info('validation', 'Native audio-video output still has to pass the lip-sync validation report before the shot can be approved.');
    return finish('native_av');
  }

  if (vc.nativeAudio && speakers.length > 1 && !vc.multiSpeakerInOneShot) {
    info('multi_speaker', `${video.name} cannot reliably perform ${speakers.length} speakers in one generation; using separate performance passes.`);
  } else if (vc.nativeAudio && !supportsLanguage(video, lang)) {
    info('language', `${video.name} does not list ${lang}; using separate voice and lip-sync passes.`);
  }

  // Separate performance route: voice track first, base video, then lip-sync per speaker.
  if (!voice) block('no_voice_engine', 'Dialogue needs a voice engine, and none is selected.');
  else {
    const s = voice.status();
    if (!s.available) block('voice_engine_unavailable', `${voice.name} is unavailable: ${s.reason ?? 'unknown reason'}.`);
    else if (!voice.capabilities.speechSynthesis) block('no_speech', `${voice.name} cannot synthesise speech.`);
    else if (!supportsLanguage(voice, lang)) block('voice_language', `${voice.name} does not support ${lang}.`);
  }
  if (!lipsync) block('no_lipsync_engine', 'Dialogue needs a lip-sync engine so mouth movement matches the audio, and none is selected. NOVA will not fake a spoken performance.');
  else {
    const s = lipsync.status();
    if (!s.available) block('lipsync_engine_unavailable', `${lipsync.name} is unavailable: ${s.reason ?? 'unknown reason'}.`);
    else if (!lipsync.capabilities.lipSync) block('no_lipsync', `${lipsync.name} cannot lip-sync.`);
    else {
      if (!lipsync.capabilities.emotionControl) warn('lipsync_emotion', `${lipsync.name} syncs the mouth only; facial emotion comes from the base video.`);
      if (!lipsync.capabilities.headMotionControl) warn('lipsync_head', `${lipsync.name} has no head-motion control.`);
    }
  }

  for (const l of lines) {
    const c = project.characters.find((x) => x.id === l.speakerId);
    if (c && !c.voice.voiceId) warn('voice_profile', `${c.name} has no voice assigned in their profile yet.`);
    steps.push({ engineId: voice?.id ?? '—', operation: 'synthesize_speech', characterId: l.speakerId, lineId: l.id, description: `Voice line ${l.order} (${c?.name ?? l.speakerId}).` });
  }
  steps.push({ engineId: video.id, operation: 'generate_video', description: 'Generate the base performance video with mouths closed or neutral.' });
  for (const sp of speakers) {
    const c = project.characters.find((x) => x.id === sp);
    steps.push({ engineId: lipsync?.id ?? '—', operation: 'lip_sync', characterId: sp, description: `Lip-sync pass for ${c?.name ?? sp} on their own lines only.` });
  }
  if (speakers.length > 1) {
    steps.push({ engineId: 'nova', operation: 'composite', description: 'Composite the per-speaker passes so each mouth moves only on its own lines.' });
    warn('composite', 'Multi-speaker shots are built from separate passes. Check the edges where passes are combined.');
  }
  return finish('separate_performance');

  function finish(route: GenerationRoute): ShotPlan {
    const characterBlocked = limitations.some((l) => l.severity === 'blocker' && (l.code === 'character_not_approved' || l.code === 'missing_character'));
    return {
      shotId: shot.id,
      route,
      steps,
      limitations,
      canProceed: !limitations.some((l) => l.severity === 'blocker'),
      placeholderTestAllowed: !!video && video.capabilities.producesPlaceholders && video.status().available && !characterBlocked,
    };
  }
}
