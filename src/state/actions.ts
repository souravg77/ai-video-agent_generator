import { approveCandidate, lockIdentity, unlockIdentity } from '../core/characters/studio';
import { generateCharacterCandidates, generateTake, PlanBlockedError } from '../core/generation';
import { buildStoryboard } from '../core/storyboard/storyboard';
import type { Character, DialogueLine, Project, Shot } from '../core/types';
import { approveTake } from '../core/validation/lipsync';
import { registry, useStore } from './store';

const st = () => useStore.getState();

export function updateCharacter(id: string, fn: (c: Character) => Character) {
  st().update((p) => ({ ...p, characters: p.characters.map((c) => (c.id === id ? fn(c) : c)) }));
}
export function updateShot(id: string, fn: (s: Shot) => Shot) {
  st().update((p) => ({ ...p, shots: p.shots.map((s) => (s.id === id ? fn(s) : s)) }));
}
export function updateLine(id: string, fn: (l: DialogueLine) => DialogueLine) {
  st().update((p) => ({ ...p, dialogue: p.dialogue.map((l) => (l.id === id ? fn(l) : l)) }));
}
export function updateProject(patch: Partial<Project>) {
  st().update((p) => ({ ...p, ...patch }));
}

export async function generateCandidates(characterId: string) {
  const p = st().project;
  const name = p.characters.find((c) => c.id === characterId)?.name ?? '';
  const next = await st().run(`Designs for ${name}`, (progress) => generateCharacterCandidates(p, characterId, registry, progress));
  // Merge only the new candidates, in case the director edited the character meanwhile.
  if (next) updateCharacter(characterId, (c) => ({ ...c, candidates: [...c.candidates, ...next.candidates.filter((n) => !c.candidates.some((o) => o.id === n.id))], history: next.history.length > c.history.length ? [...c.history, next.history[next.history.length - 1]] : c.history }));
}

export function approve(characterId: string, candidateId: string) {
  updateCharacter(characterId, (c) => approveCandidate(c, candidateId));
}
export function toggleLock(characterId: string) {
  updateCharacter(characterId, (c) => (c.locked ? unlockIdentity(c, 'unlocked from Character Studio') : lockIdentity(c)));
}

export function rebuildStoryboard() {
  const r = buildStoryboard(st().project);
  st().update((p) => ({ ...p, shots: r.shots }));
  st().notify('info', `Storyboard: ${r.added} new shot(s), ${r.kept} kept${r.orphaned ? `, ${r.orphaned} orphaned shot(s) with takes preserved` : ''}.`);
}

export async function generateShotTake(shotId: string, placeholderTest = false) {
  const p = st().project;
  const shot = p.shots.find((s) => s.id === shotId);
  try {
    const res = await st().run(`Shot ${shot?.order}: ${placeholderTest ? 'placeholder test take' : 'generate take'}`, (progress) =>
      generateTake(p, shotId, registry, { placeholderTest, onProgress: progress }),
    );
    if (res) updateShot(shotId, (s) => ({ ...s, characterRefs: res.shot.characterRefs, takes: [...s.takes, res.take] }));
  } catch (e) {
    if (e instanceof PlanBlockedError) st().notify('error', e.message);
    else throw e;
  }
}

export function approveShotTake(shotId: string, takeId: string) {
  updateShot(shotId, (s) => approveTake(s, takeId));
}
