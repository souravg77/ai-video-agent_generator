import { newId, nowIso } from '../ids';
import type { ApprovedReference, Character, CharacterCandidate, CharacterVersionEntry, ReferenceViews } from '../types';

/**
 * Character Studio rules:
 *  - Candidates are only ever appended; regenerating never touches the approved reference.
 *  - Production may only use a character once the director has approved a reference.
 *  - A locked character cannot be re-approved until the director explicitly unlocks it.
 *  - Every change is recorded in the character's version history.
 */

export class IdentityError extends Error {}

export function createCharacter(id: string, name: string, language = 'en-US'): Character {
  return {
    id,
    name,
    appearance: { age: '', hair: '', skin: '', face: '', build: '', wardrobe: '', accessories: '', notes: '' },
    voice: { voiceId: '', engineId: null, language, accent: '', speakingStyle: '', pronunciationNotes: '', emotionalRange: [] },
    mannerisms: '',
    wardrobeByScene: {},
    expressionRefs: {},
    candidates: [],
    approved: null,
    previousApprovals: [],
    locked: false,
    history: [{ version: 0, at: nowIso(), action: 'created', note: `Created ${name}` }],
    inScript: true,
    identityTraining: { status: 'none' },
  };
}

function currentVersion(c: Character): number {
  return c.approved?.version ?? c.previousApprovals.reduce((m, a) => Math.max(m, a.version), 0);
}

function log(c: Character, entry: Omit<CharacterVersionEntry, 'at' | 'version'>): CharacterVersionEntry[] {
  return [...c.history, { ...entry, at: nowIso(), version: currentVersion(c) }];
}

export function addCandidates(c: Character, candidates: Omit<CharacterCandidate, 'batch'>[]): Character {
  const batch = c.candidates.reduce((m, x) => Math.max(m, x.batch), 0) + 1;
  const added = candidates.map((x) => ({ ...x, batch }));
  return {
    ...c,
    candidates: [...c.candidates, ...added],
    history: log(c, {
      action: added.some((a) => a.source === 'uploaded') ? 'reference_uploaded' : 'candidates_generated',
      note: `${added.length} candidate${added.length === 1 ? '' : 's'} added (batch ${batch})`,
    }),
  };
}

export function setCandidateRejected(c: Character, candidateId: string, rejected: boolean): Character {
  if (c.approved?.candidateId === candidateId && rejected) {
    throw new IdentityError('The approved design cannot be rejected. Approve a different candidate first.');
  }
  return { ...c, candidates: c.candidates.map((x) => (x.id === candidateId ? { ...x, rejected } : x)) };
}

export function approveCandidate(c: Character, candidateId: string, views: ReferenceViews = {}): Character {
  if (c.locked) throw new IdentityError(`${c.name} is locked. Unlock the identity before approving a different design.`);
  const cand = c.candidates.find((x) => x.id === candidateId);
  if (!cand) throw new IdentityError('Candidate not found.');
  if (cand.rejected) throw new IdentityError('This candidate was rejected. Restore it before approving.');
  const version = currentVersion(c) + 1;
  const approved: ApprovedReference = {
    referenceId: newId('ref'),
    candidateId,
    imageUri: cand.imageUri,
    isPlaceholder: cand.isPlaceholder,
    views: { front: cand.imageUri, ...views },
    version,
    approvedAt: nowIso(),
  };
  const next: Character = {
    ...c,
    approved,
    previousApprovals: c.approved ? [...c.previousApprovals, c.approved] : c.previousApprovals,
  };
  next.history = [...c.history, { version, at: nowIso(), action: 'approved', note: `Approved design v${version}`, referenceId: approved.referenceId }];
  return next;
}

export function setReferenceView(c: Character, view: keyof ReferenceViews, imageUri: string): Character {
  if (!c.approved) throw new IdentityError('Approve a design before adding reference views.');
  if (c.locked) throw new IdentityError(`${c.name} is locked. Unlock to change reference views.`);
  return {
    ...c,
    approved: { ...c.approved, views: { ...c.approved.views, [view]: imageUri } },
    history: log(c, { action: 'profile_edited', note: `Set ${view} reference view` }),
  };
}

export function lockIdentity(c: Character): Character {
  if (!c.approved) throw new IdentityError('Approve a design before locking the identity.');
  if (c.locked) return c;
  return { ...c, locked: true, history: log(c, { action: 'locked', note: `Locked identity at v${c.approved.version}`, referenceId: c.approved.referenceId }) };
}

export function unlockIdentity(c: Character, reason: string): Character {
  if (!c.locked) return c;
  return { ...c, locked: false, history: log(c, { action: 'unlocked', note: `Unlocked: ${reason || 'no reason given'}` }) };
}

export function updateProfile(c: Character, patch: Partial<Pick<Character, 'appearance' | 'voice' | 'mannerisms' | 'wardrobeByScene' | 'name'>>): Character {
  return { ...c, ...patch, history: log(c, { action: 'profile_edited', note: `Edited ${Object.keys(patch).join(', ')}` }) };
}

export type ProductionReadiness =
  | { ok: true; referenceId: string; version: number; warnings: string[] }
  | { ok: false; reason: string };

/** Whether a character may be used to generate production shots. */
export function productionReadiness(c: Character): ProductionReadiness {
  if (!c.approved) return { ok: false, reason: `${c.name} has no approved design. Approve one in Character Studio first.` };
  const warnings: string[] = [];
  if (!c.locked) warnings.push(`${c.name} is approved but not locked; the approved design could still be changed.`);
  if (c.approved.isPlaceholder) warnings.push(`${c.name}'s approved design is an offline placeholder, not a real generated or uploaded image.`);
  return { ok: true, referenceId: c.approved.referenceId, version: c.approved.version, warnings };
}

/** Finds the reference a shot was pinned to, even if the character has since been re-approved. */
export function findReference(c: Character, referenceId: string): ApprovedReference | null {
  if (c.approved?.referenceId === referenceId) return c.approved;
  return c.previousApprovals.find((a) => a.referenceId === referenceId) ?? null;
}

export function describeAppearance(c: Character): string {
  const a = c.appearance;
  return [a.age && `${a.age}`, a.build, a.skin && `${a.skin} skin`, a.hair && `${a.hair} hair`, a.face, a.wardrobe && `wearing ${a.wardrobe}`, a.accessories, a.notes]
    .filter(Boolean)
    .join(', ');
}
