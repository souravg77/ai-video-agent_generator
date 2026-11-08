import { createCharacter } from './characters/studio';
import { newId, nowIso } from './ids';
import { parseScript, type ParsedScript } from './script/parser';
import type { Project, ProjectSettings } from './types';
import { shotStatus } from './validation/lipsync';

export const DEFAULT_SETTINGS: ProjectSettings = {
  productionType: 'short_film',
  aspectRatio: '16:9',
  resolution: '1080p',
  fps: 24,
  language: 'en-US',
  targetDurationSec: 180,
  candidateCount: 4,
  hardwareProfile: 'cloud',
};

export function createProject(name: string, settings: Partial<ProjectSettings> = {}): Project {
  const at = nowIso();
  return {
    schema: 1,
    id: newId('proj'),
    name,
    createdAt: at,
    updatedAt: at,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    script: { id: 'script-main', title: name, source: '', warnings: [] },
    scenes: [],
    dialogue: [],
    characters: [],
    locations: [],
    props: [],
    assets: [],
    shots: [],
    audioClips: [],
    engineSelection: { video: 'placeholder', image: 'placeholder', voice: null, lipsync: null },
    versions: [],
  };
}

/**
 * Parses the script and merges it into the project. Existing characters (with their
 * approvals and locks) are never replaced; performance directions the director already
 * edited are kept when the line text is unchanged.
 */
export function applyScript(project: Project, source: string): { project: Project; parsed: ParsedScript } {
  const parsed = parseScript(source);
  const byId = new Map(project.characters.map((c) => [c.id, c]));
  const parsedIds = new Set(parsed.characters.map((c) => c.id));
  const characters = [
    ...project.characters.map((c) => ({ ...c, inScript: parsedIds.has(c.id) })),
    ...parsed.characters.filter((pc) => !byId.has(pc.id)).map((pc) => createCharacter(pc.id, pc.name, project.settings.language)),
  ];

  const oldLines = new Map(project.dialogue.map((l) => [l.id, l]));
  const dialogue = parsed.dialogue.map((l) => {
    const old = oldLines.get(l.id);
    if (old && old.text === l.text && old.speakerId === l.speakerId && !old.performance.inferred) {
      return { ...l, performance: old.performance, listenerIds: old.listenerIds, others: old.others };
    }
    return l;
  });

  const keepDesc = <T extends { id: string; description: string }>(oldList: T[], newList: T[]) =>
    newList.map((n) => ({ ...n, description: oldList.find((o) => o.id === n.id)?.description ?? n.description }));

  return {
    parsed,
    project: {
      ...project,
      script: { ...project.script, source, title: parsed.title || project.script.title, parsedAt: nowIso(), warnings: parsed.warnings },
      scenes: parsed.scenes,
      dialogue,
      characters,
      locations: keepDesc(project.locations, parsed.locations),
      props: keepDesc(project.props, parsed.props),
    },
  };
}

export function serializeProject(p: Project): string {
  return JSON.stringify({ ...p, updatedAt: nowIso() }, null, 2);
}

export function loadProject(json: string): Project {
  const data = JSON.parse(json);
  if (!data || data.schema !== 1 || !Array.isArray(data.shots) || !Array.isArray(data.characters)) {
    throw new Error('This file is not a NOVA FLOW project (or was made by an unsupported version).');
  }
  return data as Project;
}

export function saveVersion(p: Project, label: string): Project {
  const snapshot = JSON.stringify({ ...p, versions: [] });
  return { ...p, versions: [...p.versions, { id: newId('ver'), label: label || `Version ${p.versions.length + 1}`, at: nowIso(), snapshot }] };
}

export function restoreVersion(p: Project, versionId: string): Project {
  const v = p.versions.find((x) => x.id === versionId);
  if (!v) throw new Error('Version not found.');
  const restored = JSON.parse(v.snapshot) as Project;
  return { ...restored, versions: p.versions };
}

export interface ExportIssue { severity: 'blocker' | 'warning'; message: string }

/** Pre-export integrity check. Reports problems; it never claims a render it cannot do. */
export function exportReadiness(p: Project): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const active = p.shots.filter((s) => !s.orphaned);
  if (active.length === 0) issues.push({ severity: 'blocker', message: 'There are no shots to export.' });
  const unapproved = active.filter((s) => shotStatus(s) !== 'approved');
  if (unapproved.length) {
    issues.push({ severity: 'blocker', message: `${unapproved.length} of ${active.length} shot(s) have no approved, validated take.` });
  }
  for (const s of active) {
    const t = s.takes.find((x) => x.id === s.approvedTakeId);
    if (!t) continue;
    if (!t.videoUri) issues.push({ severity: 'blocker', message: `Shot ${s.order}: approved take has no video file.` });
    if (t.metadata.fps && t.metadata.fps !== p.settings.fps) issues.push({ severity: 'warning', message: `Shot ${s.order}: ${t.metadata.fps} fps differs from project ${p.settings.fps} fps.` });
  }
  const vo = p.dialogue.filter((l) => l.isVoiceOver);
  if (vo.length && !p.audioClips.some((c) => c.track === 'voiceover' && c.uri)) {
    issues.push({ severity: 'blocker', message: `${vo.length} voice-over line(s) have no recorded or generated audio.` });
  }
  if (p.shots.some((s) => s.orphaned)) issues.push({ severity: 'warning', message: 'Some shots no longer match the script (orphaned). They are excluded from export.' });
  issues.push({ severity: 'blocker', message: 'Final render and encoding are not implemented in this build yet.' });
  return issues;
}
