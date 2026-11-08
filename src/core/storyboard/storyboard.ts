import type { CharacterRefPin, DialogueLine, Project, Shot } from '../types';

const WPS = { slow: 2.0, normal: 2.6, fast: 3.2 } as const;

export function estimateLineDuration(line: DialogueLine): number {
  const words = line.text.split(/\s+/).filter(Boolean).length;
  const pauses = (line.text.match(/\.\.\.|…|—|--/g) ?? []).length;
  const sec = words / WPS[line.performance.speed] + pauses * 0.5 + 0.8;
  return Math.round(Math.max(1.5, sec) * 10) / 10;
}

function actionDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(Math.min(8, Math.max(2, words / 3)) * 10) / 10;
}

function pinsFor(project: Project, ids: string[]): CharacterRefPin[] {
  return ids.flatMap((id) => {
    const c = project.characters.find((x) => x.id === id);
    return c?.approved ? [{ characterId: id, referenceId: c.approved.referenceId, version: c.approved.version }] : [];
  });
}

function blankShot(id: string, sceneId: string): Shot {
  return {
    id,
    sceneId,
    order: 0,
    title: '',
    description: '',
    dialogueLineIds: [],
    characterIds: [],
    camera: { framing: 'MS', angle: 'eye level', movement: 'static', lensMm: 35 },
    lighting: '',
    motion: '',
    durationSec: 3,
    startFrame: null,
    endFrame: null,
    characterRefs: [],
    takes: [],
    approvedTakeId: null,
    orphaned: false,
  };
}

/**
 * Turns the parsed script into a shot list. Shot ids are derived from the script, so
 * rebuilding keeps every existing shot's direction, takes and approvals. Shots whose
 * script content disappeared are kept (flagged orphaned) if they have takes.
 */
export function buildStoryboard(project: Project): { shots: Shot[]; added: number; kept: number; orphaned: number } {
  const generated: Shot[] = [];
  const nameOf = (id: string) => project.characters.find((c) => c.id === id)?.name ?? id;
  const lineById = new Map(project.dialogue.map((l) => [l.id, l]));
  const location = (locId: string | null) => project.locations.find((l) => l.id === locId)?.name ?? 'location';

  for (const scene of project.scenes) {
    const firstAction = scene.elements.find((e) => e.kind === 'action');
    const est = blankShot(`shot-${scene.id}-est`, scene.id);
    est.title = `Establishing: ${location(scene.locationId)}`;
    est.description = firstAction && firstAction.kind === 'action' ? firstAction.text : scene.heading;
    est.camera = { framing: 'WS', angle: 'eye level', movement: 'slow push in', lensMm: 24 };
    est.lighting = scene.timeOfDay ? `${scene.timeOfDay.toLowerCase()} light` : '';
    est.durationSec = 3;
    generated.push(est);

    scene.elements.forEach((el, i) => {
      if (el.kind === 'action') {
        if (el === firstAction) return;
        const s = blankShot(`shot-${scene.id}-a${i}`, scene.id);
        s.title = 'Action';
        s.description = el.text;
        s.camera = { framing: 'MWS', angle: 'eye level', movement: 'handheld follow', lensMm: 35 };
        s.durationSec = actionDuration(el.text);
        s.characterIds = scene.characterIds.filter((id) => new RegExp(`\\b${nameOf(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(el.text));
        generated.push(s);
      } else if (el.kind === 'beat') {
        const s = blankShot(`shot-${scene.id}-b${i}`, scene.id);
        s.title = `Reaction: ${nameOf(el.characterId)}`;
        s.description = `${el.text} (${el.direction})`;
        s.camera = { framing: 'CU', angle: 'eye level', movement: 'static', lensMm: 85 };
        s.durationSec = 2;
        s.characterIds = [el.characterId];
        generated.push(s);
      } else if (el.kind === 'dialogue') {
        const line = lineById.get(el.lineId);
        if (!line || line.isVoiceOver) return; // voice-over lives on the voice track, not on camera
        const s = blankShot(`shot-${line.id}`, scene.id);
        const onCamera = [line.speakerId, ...line.others.filter((o) => o.state !== 'silent').map((o) => o.characterId)];
        s.title = `${nameOf(line.speakerId)}: line ${line.order}`;
        s.description = `${nameOf(line.speakerId)} says “${line.text}” — ${line.performance.emotion}, ${line.performance.intensity}.`;
        s.dialogueLineIds = [line.id];
        s.characterIds = [...new Set(onCamera)];
        s.camera =
          s.characterIds.length > 1
            ? { framing: 'OTS', angle: 'eye level', movement: 'static', lensMm: 50 }
            : { framing: 'MCU', angle: 'eye level', movement: 'static', lensMm: 50 };
        s.durationSec = estimateLineDuration(line);
        generated.push(s);
      }
    });
  }

  const existing = new Map(project.shots.map((s) => [s.id, s]));
  const generatedIds = new Set(generated.map((s) => s.id));
  let kept = 0;
  let added = 0;
  const shots: Shot[] = generated.map((g) => {
    const old = existing.get(g.id);
    if (old) {
      kept++;
      return { ...old, sceneId: g.sceneId, dialogueLineIds: g.dialogueLineIds, orphaned: false };
    }
    added++;
    return { ...g, characterRefs: pinsFor(project, g.characterIds) };
  });
  const orphans = project.shots.filter((s) => !generatedIds.has(s.id) && s.takes.length > 0).map((s) => ({ ...s, orphaned: true }));
  const all = [...shots, ...orphans].map((s, i) => ({ ...s, order: i + 1 }));
  return { shots: all, added, kept, orphaned: orphans.length };
}

export function pinCurrentReferences(project: Project, shot: Shot): Shot {
  return { ...shot, characterRefs: pinsFor(project, shot.characterIds) };
}
