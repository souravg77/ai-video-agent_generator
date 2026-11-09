import { nowIso } from '../ids';
import type { CheckStatus, DialogueLine, LipSyncCheckId, Project, Shot, ShotStatus, Take, ValidationCheck, ValidationReport } from '../types';

/**
 * Every take gets a validation report. A shot is never "done" because a file exists:
 * dialogue shots need every lip-sync check to pass, and placeholder takes always fail.
 *
 * Checks come from three sources, in order of authority:
 *  1. metadata the engine returned (durations, speaker tracks): objective, wins over manual
 *  2. a performance analyzer (face/mouth analysis), when one is configured
 *  3. the director's manual review, recorded as such
 * Anything nobody has checked stays "not_checked", which keeps the shot out of "approved".
 */

export const CHECK_LABELS: Record<LipSyncCheckId, string> = {
  real_footage: 'Real footage (not a placeholder)',
  correct_speaker: 'Correct character speaking',
  mouth_audio_alignment: 'Mouth movement aligned with the audio',
  no_off_turn_mouth_movement: "No mouth movement during another character's line",
  emotion_consistency: 'Facial emotion matches the dialogue',
  blink_breathing: 'Natural blinking and breathing',
  no_frozen_face: 'No frozen face or unnatural jaw',
  av_drift: 'No audio/video drift',
  language_pronunciation: 'Correct language and pronunciation',
};

const DIALOGUE_CHECKS: LipSyncCheckId[] = [
  'correct_speaker',
  'mouth_audio_alignment',
  'no_off_turn_mouth_movement',
  'emotion_consistency',
  'blink_breathing',
  'no_frozen_face',
  'av_drift',
  'language_pronunciation',
];

export interface AnalyzerFinding { status: CheckStatus; detail: string }
export interface PerformanceAnalyzer {
  id: string;
  analyze(take: Take, shot: Shot, lines: DialogueLine[]): Partial<Record<LipSyncCheckId, AnalyzerFinding>>;
}

function check(id: LipSyncCheckId, status: CheckStatus, detail: string, source: ValidationCheck['source']): ValidationCheck {
  return { id, label: CHECK_LABELS[id], status, detail, source };
}

function overallOf(checks: ValidationCheck[]): ValidationReport['overall'] {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'not_checked')) return 'incomplete';
  return 'pass';
}

function metadataChecks(take: Take, lines: DialogueLine[], project: Project): Partial<Record<LipSyncCheckId, ValidationCheck>> {
  const out: Partial<Record<LipSyncCheckId, ValidationCheck>> = {};
  const m = take.metadata;
  const tracks = m.speakerTracks;

  if (tracks && tracks.length) {
    const wrong = lines.filter((l) => {
      const t = tracks.find((x) => x.lineId === l.id);
      return !t || t.characterId !== l.speakerId;
    });
    out.correct_speaker = wrong.length
      ? check('correct_speaker', 'fail', `Line(s) ${wrong.map((l) => l.order).join(', ')} were not performed by the scripted speaker.`, 'metadata')
      : check('correct_speaker', 'pass', 'Engine speaker tracks match the script for every line.', 'metadata');

    const overlaps: string[] = [];
    for (let i = 0; i < tracks.length; i++)
      for (let j = i + 1; j < tracks.length; j++) {
        const a = tracks[i];
        const b = tracks[j];
        if (a.characterId !== b.characterId && a.startSec < b.endSec && b.startSec < a.endSec) overlaps.push(`${a.lineId}/${b.lineId}`);
      }
    if (overlaps.length) out.no_off_turn_mouth_movement = check('no_off_turn_mouth_movement', 'fail', `Speaker tracks overlap: ${overlaps.join(', ')}.`, 'metadata');

    const langMismatch = tracks.filter((t) => t.language && t.language.split('-')[0] !== project.settings.language.split('-')[0]);
    if (langMismatch.length) {
      out.language_pronunciation = check('language_pronunciation', 'fail', `Audio language ${langMismatch[0].language} does not match project language ${project.settings.language}.`, 'metadata');
    }
  }

  if (m.videoDurationSec != null && m.audioDurationSec != null) {
    const fps = m.fps ?? project.settings.fps;
    const drift = Math.abs(m.videoDurationSec - m.audioDurationSec);
    out.av_drift =
      drift <= 1 / fps
        ? check('av_drift', 'pass', `Audio and video lengths match within one frame (${(drift * 1000).toFixed(0)} ms).`, 'metadata')
        : check('av_drift', 'fail', `Audio and video lengths differ by ${(drift * 1000).toFixed(0)} ms (more than one frame at ${fps} fps).`, 'metadata');
  }
  return out;
}

export function validateTake(
  shot: Shot,
  take: Take,
  project: Project,
  opts: { analyzer?: PerformanceAnalyzer; previous?: ValidationReport | null } = {},
): ValidationReport {
  const lines = shot.dialogueLineIds.map((id) => project.dialogue.find((l) => l.id === id)).filter((l): l is DialogueLine => !!l);
  const checks: ValidationCheck[] = [];

  checks.push(
    take.isPlaceholder
      ? check('real_footage', 'fail', 'Placeholder take from the offline engine. Generate with a real engine before approval.', 'metadata')
      : !take.videoUri
        ? check('real_footage', 'fail', 'The take has no video file.', 'metadata')
        : check('real_footage', 'pass', 'Video file present.', 'metadata'),
  );

  if (lines.length > 0) {
    const meta = metadataChecks(take, lines, project);
    const found = opts.analyzer?.analyze(take, shot, lines) ?? {};
    const prev = new Map((opts.previous?.checks ?? []).map((c) => [c.id, c]));
    for (const id of DIALOGUE_CHECKS) {
      const mc = meta[id];
      if (mc && mc.status === 'fail') {
        checks.push(mc);
        continue;
      }
      const a = found[id];
      if (a && a.status !== 'not_checked') {
        checks.push(check(id, a.status, a.detail, 'analyzer'));
        continue;
      }
      const p = prev.get(id);
      if (p && p.source === 'manual') {
        checks.push(p);
        continue;
      }
      if (mc) {
        checks.push(mc);
        continue;
      }
      checks.push(
        check(
          id,
          'not_checked',
          opts.analyzer ? 'The analyzer could not assess this.' : 'No performance analyzer is configured. Review the take and record the result manually.',
          'none',
        ),
      );
    }
  }
  return { takeId: take.id, createdAt: nowIso(), checks, overall: overallOf(checks) };
}

/** Records the director's own review of one check. Placeholder and metadata failures cannot be overridden. */
export function setManualCheck(report: ValidationReport, id: LipSyncCheckId, status: CheckStatus, note: string): ValidationReport {
  const checks = report.checks.map((c) => {
    if (c.id !== id) return c;
    if (c.source === 'metadata' && c.status === 'fail') {
      throw new Error(`"${c.label}" failed on measured data and cannot be overridden manually. Repair or regenerate the take.`);
    }
    if (c.id === 'real_footage') throw new Error('Real-footage status comes from the take itself and cannot be set manually.');
    return { ...c, status, detail: note || (status === 'pass' ? 'Reviewed by the director.' : status === 'fail' ? 'Rejected by the director.' : 'Not reviewed.'), source: status === 'not_checked' ? ('none' as const) : ('manual' as const) };
  });
  return { ...report, checks, overall: overallOf(checks) };
}

export function shotStatus(shot: Shot): ShotStatus {
  if (shot.takes.length === 0) return 'not_started';
  const approved = shot.takes.find((t) => t.id === shot.approvedTakeId);
  if (approved && approved.validation?.overall === 'pass') return 'approved';
  const latest = shot.takes[shot.takes.length - 1];
  const v = latest.validation;
  if (!v || v.overall === 'incomplete') return 'generated_unvalidated';
  if (v.overall === 'fail') return 'needs_repair';
  return 'ready_to_approve';
}

export const STATUS_LABEL: Record<ShotStatus, string> = {
  not_started: 'Not started',
  generated_unvalidated: 'Needs review',
  needs_repair: 'Needs repair',
  ready_to_approve: 'Ready to approve',
  approved: 'Approved',
};

export function approveTake(shot: Shot, takeId: string): Shot {
  const take = shot.takes.find((t) => t.id === takeId);
  if (!take) throw new Error('Take not found.');
  if (!take.validation || take.validation.overall !== 'pass') {
    const failing = (take.validation?.checks ?? []).filter((c) => c.status !== 'pass').map((c) => c.label);
    throw new Error(`This take cannot be approved until validation passes.${failing.length ? ` Outstanding: ${failing.join('; ')}.` : ''}`);
  }
  return { ...shot, approvedTakeId: takeId };
}
