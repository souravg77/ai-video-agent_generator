import { describe, expect, it } from 'vitest';
import { addCandidates, approveCandidate, createCharacter, lockIdentity, productionReadiness, setCandidateRejected, unlockIdentity } from '../src/core/characters/studio';

const cand = (id: string) => ({ id, imageUri: `data:${id}`, source: 'generated' as const, engineId: 'x', isPlaceholder: false, prompt: '', seed: 1, createdAt: '', rejected: false });

describe('Character Studio identity rules', () => {
  it('requires approval before production', () => {
    const c = createCharacter('char-a', 'A');
    expect(productionReadiness(c)).toMatchObject({ ok: false });
  });

  it('approves, locks and refuses silent replacement', () => {
    let c = addCandidates(createCharacter('char-a', 'A'), [cand('c1'), cand('c2')]);
    c = approveCandidate(c, 'c1');
    expect(c.approved?.version).toBe(1);
    const firstRef = c.approved!.referenceId;
    c = lockIdentity(c);
    expect(() => approveCandidate(c, 'c2')).toThrow(/locked/);
    // regenerating adds candidates but never touches the approved reference
    c = addCandidates(c, [cand('c3')]);
    expect(c.approved!.referenceId).toBe(firstRef);
    expect(c.candidates.map((x) => x.batch)).toEqual([1, 1, 2]);
    c = unlockIdentity(c, 'new wardrobe');
    c = approveCandidate(c, 'c2');
    expect(c.approved!.version).toBe(2);
    expect(c.previousApprovals.map((a) => a.referenceId)).toEqual([firstRef]);
    expect(c.history.map((h) => h.action)).toEqual(['created', 'candidates_generated', 'approved', 'locked', 'candidates_generated', 'unlocked', 'approved']);
  });

  it('cannot reject the approved candidate', () => {
    let c = approveCandidate(addCandidates(createCharacter('char-a', 'A'), [cand('c1')]), 'c1');
    expect(() => setCandidateRejected(c, 'c1', true)).toThrow();
    c = addCandidates(c, [cand('c2')]);
    c = setCandidateRejected(c, 'c2', true);
    expect(() => approveCandidate(c, 'c2')).toThrow(/rejected/);
  });

  it('warns about placeholder and unlocked approvals', () => {
    const c = approveCandidate(addCandidates(createCharacter('char-a', 'A'), [{ ...cand('c1'), isPlaceholder: true }]), 'c1');
    const r = productionReadiness(c);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.join(' ')).toMatch(/placeholder.*|not locked/);
  });
});
