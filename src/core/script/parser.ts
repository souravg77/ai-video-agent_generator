import { slugify } from '../ids';
import type { DialogueLine, Location, Prop, Scene, ScriptElement } from '../types';
import { BEAT_DIRECTION, inferPerformance, listenerDirection } from './performance';

/**
 * Screenplay parser. Accepts Fountain-style screenplays (scene headings, CHARACTER cues,
 * parentheticals, transitions) and the simpler "Name: line" chat format, mixed freely.
 * Ids are deterministic so re-parsing an edited script keeps links to existing records.
 */

export interface ParsedCharacter { id: string; name: string; lineCount: number; firstSceneId: string }

export interface ParsedScript {
  title: string;
  scenes: Scene[];
  dialogue: DialogueLine[];
  characters: ParsedCharacter[];
  locations: Location[];
  props: Prop[];
  warnings: string[];
}

const HEADING_RE = /^(INT\.?\/EXT|INT\/EXT|I\/E|INT|EXT|EST)[.\s]/i;
const TRANSITION_RE = /^([A-Z][A-Z\s]*TO:|FADE (IN|OUT)[.:]?|FADE TO BLACK[.:]?|CUT TO BLACK[.:]?)$/;
const EXTENSION_RE = /\s*\(([^)]*)\)\s*$/;
const COLON_RE = /^([A-Za-zÀ-ɏ][A-Za-z0-9À-ɏ .'\-]{0,30}?)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/;
const METADATA_KEYS = new Set(['title', 'credit', 'author', 'authors', 'source', 'draft date', 'contact', 'notes', 'note', 'scene', 'int', 'ext', 'fade in', 'cut to', 'dissolve to']);

function isCue(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('@')) return t.length > 1;
  const name = t.replace(/\^$/, '').replace(EXTENSION_RE, '').trim();
  if (!/[A-Z]/.test(name)) return false;
  if (/[a-z]/.test(name)) return false;
  if (HEADING_RE.test(t) || TRANSITION_RE.test(t)) return false;
  return /^[A-ZÀ-Þ][A-Z0-9À-Þ .'\-]*$/.test(name) && name.length <= 40;
}

function cleanCue(line: string): { name: string; extension?: string } {
  let t = line.trim().replace(/^@/, '').replace(/\^$/, '').trim();
  let extension: string | undefined;
  const m = t.match(EXTENSION_RE);
  if (m) {
    extension = m[1].trim().toUpperCase();
    t = t.replace(EXTENSION_RE, '').trim();
  }
  return { name: t, extension };
}

function displayName(raw: string): string {
  if (raw === raw.toUpperCase()) {
    return raw.toLowerCase().replace(/(^|[\s\-'.])([a-zà-þ])/g, (_m, p, c) => p + c.toUpperCase());
  }
  return raw;
}

function parseHeading(text: string): { setting: Scene['setting']; location: string; timeOfDay: string } {
  const t = text.replace(/^\./, '').trim();
  const m = t.match(/^(INT\.?\/EXT\.?|INT\/EXT|I\/E|INT\.?|EXT\.?|EST\.?)\s*(.*)$/i);
  let setting: Scene['setting'] = null;
  let rest = t;
  if (m) {
    const s = m[1].toUpperCase().replace(/\./g, '');
    setting = s === 'INT' ? 'INT' : s === 'EXT' || s === 'EST' ? 'EXT' : 'INT/EXT';
    rest = m[2];
  }
  rest = rest.replace(/#[^#]*#\s*$/, '').trim(); // scene numbers
  const parts = rest.split(/\s+[-–—]\s+/);
  const timeOfDay = parts.length > 1 ? parts.pop()!.trim() : '';
  return { setting, location: displayName(parts.join(' - ').trim() || 'Unspecified location'), timeOfDay };
}

interface PendingLine {
  speakerKey: string;
  text: string;
  parenthetical?: string;
  extension?: string;
}

export function parseScript(source: string): ParsedScript {
  const warnings: string[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  // Title page: leading "Key: value" lines until the first blank line, only if it starts with Title:.
  let title = '';
  let start = 0;
  if (/^title\s*:/i.test(lines[0]?.trim() ?? '')) {
    while (start < lines.length && lines[start].trim() !== '') {
      const m = lines[start].match(/^title\s*:\s*(.*)$/i);
      if (m) title = m[1].trim();
      start++;
    }
  }

  // Split into blocks separated by blank lines.
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else if (!/^\s*(\[\[.*\]\]|\/\*.*\*\/|=+\s*$|#)/.test(l)) {
      cur.push(l);
    }
  }
  if (cur.length) blocks.push(cur);

  // Pass 1: discover character names so action lines can be recognised as beats.
  const names = new Map<string, string>(); // KEY -> display name
  for (const b of blocks) {
    if (b.length >= 2 && isCue(b[0])) {
      const { name } = cleanCue(b[0]);
      const key = name.toUpperCase();
      if (!names.has(key)) names.set(key, displayName(name));
    }
    for (const l of b) {
      const t = l.trim();
      if (HEADING_RE.test(t)) continue;
      const m = t.match(COLON_RE);
      if (m && !METADATA_KEYS.has(m[1].trim().toLowerCase()) && m[1].trim().split(/\s+/).length <= 4) {
        const key = m[1].trim().toUpperCase();
        if (!names.has(key)) names.set(key, displayName(m[1].trim()));
      }
    }
  }
  const charId = (key: string) => `char-${slugify(key)}`;

  const scenes: Scene[] = [];
  const dialogue: DialogueLine[] = [];
  const locations = new Map<string, Location>();
  const props = new Map<string, Prop>();
  const lineCounts = new Map<string, { count: number; firstSceneId: string }>();

  let scene: Scene | null = null;
  const sceneLines: DialogueLine[] = [];

  const ensureScene = (): Scene => {
    if (!scene) {
      warnings.push('Script content appears before any scene heading; it was placed in an implicit Scene 1.');
      openScene('Scene 1', null, 'Unspecified location', '');
    }
    return scene!;
  };

  const openScene = (heading: string, setting: Scene['setting'], location: string, timeOfDay: string) => {
    closeScene();
    const number = scenes.length + 1;
    const locId = `loc-${slugify(location)}`;
    if (!locations.has(locId)) locations.set(locId, { id: locId, name: location, description: '' });
    scene = { id: `scene-${number}`, number, heading, setting, locationId: locId, timeOfDay, elements: [], characterIds: [], propIds: [] };
    scenes.push(scene);
  };

  const presentIn = (s: Scene, key: string) => {
    const id = charId(key);
    if (!s.characterIds.includes(id)) s.characterIds.push(id);
    return id;
  };

  const closeScene = () => {
    if (!scene) return;
    const s: Scene = scene;
    // Listeners and reactions are resolved once everyone present in the scene is known.
    for (const line of sceneLines) {
      if (line.isVoiceOver) {
        line.listenerIds = [];
      } else {
        const vocative = s.characterIds.find(
          (id) => id !== line.speakerId && new RegExp(`\\b${escapeRe(nameOf(id))}\\b`, 'i').test(line.text),
        );
        line.listenerIds = vocative ? [vocative] : s.characterIds.filter((id) => id !== line.speakerId);
      }
      line.others = s.characterIds
        .filter((id) => id !== line.speakerId)
        .map((id) => {
          if (!line.listenerIds.includes(id)) return { characterId: id, state: 'silent' as const, direction: 'silent, mouth closed, natural idle motion' };
          const d = listenerDirection(line.performance.emotion, line.performance.intensity);
          return { characterId: id, state: d.state, direction: d.direction };
        });
    }
    sceneLines.length = 0;
    scene = null;
  };

  const nameOf = (id: string) => {
    for (const [key, display] of names) if (charId(key) === id) return display;
    return id;
  };

  const pushLine = (p: PendingLine) => {
    const s = ensureScene();
    const speakerId = presentIn(s, p.speakerKey);
    const order = dialogue.length + 1;
    const ext = p.extension;
    const isVoiceOver = !!ext && /V\.?O|NARRAT/.test(ext) || /^NARRATOR$/.test(p.speakerKey);
    const line: DialogueLine = {
      id: `line-${order}`,
      sceneId: s.id,
      order,
      speakerId,
      listenerIds: [],
      text: p.text.trim(),
      parenthetical: p.parenthetical,
      extension: ext,
      isVoiceOver,
      performance: inferPerformance(p.text, p.parenthetical),
      others: [],
    };
    dialogue.push(line);
    sceneLines.push(line);
    s.elements.push({ kind: 'dialogue', lineId: line.id });
    const lc = lineCounts.get(speakerId);
    if (lc) lc.count++;
    else lineCounts.set(speakerId, { count: 1, firstSceneId: s.id });
  };

  const pushAction = (text: string) => {
    const s = ensureScene();
    const t = text.trim();
    // A short action that starts with a character's name is a performance beat (pause, reaction).
    const starter = [...names.keys()]
      .sort((a, b) => b.length - a.length)
      .find((key) => new RegExp(`^${escapeRe(key)}\\b`, 'i').test(t));
    if (starter && t.length <= 160) {
      const id = presentIn(s, starter);
      const el: ScriptElement = { kind: 'beat', characterId: id, text: t, state: 'reacting', direction: BEAT_DIRECTION };
      s.elements.push(el);
    } else {
      s.elements.push({ kind: 'action', text: t });
    }
    // Characters mentioned in action are present in the scene.
    for (const key of names.keys()) {
      if (new RegExp(`\\b${escapeRe(key)}\\b`, 'i').test(t)) presentIn(s, key);
    }
    // ALL-CAPS phrases in action that are not character names are prop / sound candidates.
    for (const m of t.matchAll(/\b([A-Z][A-Z'\-]{2,}(?:\s+[A-Z][A-Z'\-]{2,})*)\b/g)) {
      const phrase = m[1];
      if (names.has(phrase)) continue;
      if (/^(INT|EXT|CONT'D|V\.O|O\.S)$/.test(phrase)) continue;
      const id = `prop-${slugify(phrase)}`;
      if (!props.has(id)) props.set(id, { id, name: displayName(phrase), description: '' });
      if (!s.propIds.includes(id)) s.propIds.push(id);
    }
  };

  for (const block of blocks) {
    const first = block[0].trim();

    if (HEADING_RE.test(first) || (/^\.[A-Za-z]/.test(first) && !first.startsWith('..'))) {
      const h = parseHeading(first);
      openScene(first.replace(/^\./, ''), h.setting, h.location, h.timeOfDay);
      if (block.length > 1) pushAction(block.slice(1).join(' '));
      continue;
    }
    if (TRANSITION_RE.test(first) || (first.startsWith('>') && !first.endsWith('<'))) {
      ensureScene().elements.push({ kind: 'transition', text: first.replace(/^>\s*/, '') });
      continue;
    }

    if (block.length >= 2 && isCue(first)) {
      const { name, extension } = cleanCue(first);
      const key = name.toUpperCase();
      let pending: PendingLine | null = null;
      let paren: string | undefined;
      for (const raw of block.slice(1)) {
        const t = raw.trim();
        const pm = t.match(/^\((.*)\)$/);
        if (pm) {
          // A parenthetical mid-speech starts a new delivery with its own direction.
          if (pending && pending.text) {
            pushLine(pending);
            pending = null;
          }
          paren = pm[1].trim();
          continue;
        }
        if (!pending) pending = { speakerKey: key, text: '', parenthetical: paren, extension };
        pending.text = pending.text ? `${pending.text} ${t}` : t;
        paren = undefined;
      }
      if (pending && pending.text) pushLine(pending);
      continue;
    }

    // Line-by-line: "Name: dialogue" lines, otherwise action.
    let actionBuf: string[] = [];
    const flushAction = () => {
      if (actionBuf.length) pushAction(actionBuf.join(' '));
      actionBuf = [];
    };
    for (const raw of block) {
      const t = raw.trim();
      const m = t.match(COLON_RE);
      if (m && !METADATA_KEYS.has(m[1].trim().toLowerCase()) && names.has(m[1].trim().toUpperCase())) {
        flushAction();
        let text = m[3].trim();
        let parenthetical = m[2]?.trim();
        const lead = text.match(/^\(([^)]*)\)\s*(.*)$/);
        if (lead) {
          parenthetical = parenthetical ?? lead[1].trim();
          text = lead[2];
        }
        text = text.replace(/^["“”']|["“”']$/g, '').trim();
        pushLine({ speakerKey: m[1].trim().toUpperCase(), text, parenthetical });
      } else {
        actionBuf.push(t);
      }
    }
    flushAction();
  }
  closeScene();

  if (scenes.length === 0) warnings.push('No scenes were found. Add a scene heading such as "INT. KITCHEN - NIGHT".');
  if (dialogue.length === 0) warnings.push('No dialogue was found. Use a CHARACTER cue line, or "Name: line".');

  const characters: ParsedCharacter[] = [...names.entries()].map(([key, name]) => {
    const id = charId(key);
    const lc = lineCounts.get(id);
    return { id, name, lineCount: lc?.count ?? 0, firstSceneId: lc?.firstSceneId ?? scenes.find((s) => s.characterIds.includes(id))?.id ?? '' };
  });

  return { title, scenes, dialogue, characters, locations: [...locations.values()], props: [...props.values()], warnings };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
