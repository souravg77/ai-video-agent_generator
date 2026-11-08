import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/core/script/parser';
import { SAMPLE_SCRIPT } from './fixtures/sample';

describe('parseScript', () => {
  const p = parseScript(SAMPLE_SCRIPT);

  it('reads the title, scenes and locations', () => {
    expect(p.title).toBe('The Return');
    expect(p.scenes.map((s) => s.heading)).toEqual(['INT. HARBOR CAFE - NIGHT', 'EXT. PIER - DAWN']);
    expect(p.scenes[0]).toMatchObject({ setting: 'INT', timeOfDay: 'NIGHT' });
    expect(p.locations.map((l) => l.name)).toEqual(['Harbor Cafe', 'Pier']);
  });

  it('finds characters across Fountain cues and Name: lines', () => {
    expect(p.characters.map((c) => c.name).sort()).toEqual(['Leo', 'Maya', 'Narrator']);
    const maya = p.characters.find((c) => c.name === 'Maya')!;
    expect(maya.lineCount).toBe(4);
  });

  it('splits a speech at a mid-speech parenthetical into separate deliveries', () => {
    const maya = p.dialogue.filter((l) => l.speakerId === 'char-maya');
    expect(maya[1].text).toBe('Where were you... all this time?');
    expect(maya[2]).toMatchObject({ text: 'Three YEARS, Leo!', parenthetical: 'angry' });
    expect(maya[2].performance.emotion).toBe('angry');
    expect(maya[2].performance.emphasis).toContain('YEARS');
  });

  it('infers performance direction and flags it as inferred', () => {
    const first = p.dialogue[0];
    expect(first).toMatchObject({ speakerId: 'char-maya', text: 'You came back!', parenthetical: 'stunned' });
    expect(first.performance.emotion).toBe('surprised');
    expect(first.performance.expressionDuring).toMatch(/eyes widen/);
    expect(first.performance.inferred).toBe(true);
    const leo = p.dialogue[1];
    expect(leo.performance.emotion).toBe('happy');
  });

  it('assigns listeners and reactions for everyone present', () => {
    const first = p.dialogue[0];
    expect(first.listenerIds).toEqual(['char-leo']);
    expect(first.others).toEqual([expect.objectContaining({ characterId: 'char-leo', state: 'reacting' })]);
  });

  it('turns "Maya pauses" into a performance beat', () => {
    const beat = p.scenes[0].elements.find((e) => e.kind === 'beat');
    expect(beat).toMatchObject({ kind: 'beat', characterId: 'char-maya', state: 'reacting' });
  });

  it('marks voice-over lines and keeps them out of on-screen listening', () => {
    const vo = p.dialogue.find((l) => l.speakerId === 'char-narrator')!;
    expect(vo.isVoiceOver).toBe(true);
    expect(vo.listenerIds).toEqual([]);
  });

  it('parses inline parentheticals in Name: lines and transitions', () => {
    const sorry = p.dialogue.find((l) => l.text === "I'm sorry.")!;
    expect(sorry).toMatchObject({ speakerId: 'char-leo', parenthetical: 'quietly', sceneId: 'scene-2' });
    expect(p.scenes[0].elements.some((e) => e.kind === 'transition')).toBe(true);
  });

  it('collects ALL-CAPS props from action', () => {
    expect(p.props.map((x) => x.name)).toContain('Lantern');
  });

  it('handles the chat-style example with no scene heading', () => {
    const q = parseScript('Character A: “You came back!”\nCharacter B: “I promised I would.”\nCharacter A pauses.');
    expect(q.dialogue.map((l) => l.text)).toEqual(['You came back!', 'I promised I would.']);
    expect(q.dialogue[0].performance.emotion).toBe('surprised');
    expect(q.scenes[0].elements[2]).toMatchObject({ kind: 'beat', characterId: 'char-character-a' });
    expect(q.warnings[0]).toMatch(/implicit Scene 1/);
  });

  it('gives stable ids when re-parsed', () => {
    expect(parseScript(SAMPLE_SCRIPT).dialogue.map((l) => l.id)).toEqual(p.dialogue.map((l) => l.id));
  });
});
