import { useState, type DragEvent } from 'react';
import { findReference, updateProfile } from '../../core/characters/studio';
import { planShot } from '../../core/engines/planner';
import { pinCurrentReferences } from '../../core/storyboard/storyboard';
import type { Character, FrameRef, Framing, PerformanceState, Project, Shot } from '../../core/types';
import { setManualCheck, shotStatus } from '../../core/validation/lipsync';
import { approveShotTake, generateShotTake, updateCharacter, updateLine, updateProject, updateShot } from '../../state/actions';
import { registry, useStore } from '../../state/store';
import { Field, PerformanceEditor, PlanReport, StatusBadge, Text, ValidationPanel, charName } from './common';
import { DND_ASSET, DND_CHARACTER } from './LibrarySidebar';

const FRAMINGS: [Framing, string][] = [
  ['EWS', 'Extreme wide'], ['WS', 'Wide'], ['MWS', 'Medium wide'], ['MS', 'Medium'], ['MCU', 'Medium close-up'], ['CU', 'Close-up'], ['ECU', 'Extreme close-up'], ['OTS', 'Over the shoulder'], ['TWO', 'Two-shot'],
];

function frameInfo(p: Project, f: FrameRef | null): { label: string; uri?: string } {
  if (!f) return { label: 'None — drag a reference or approved character here' };
  if (f.kind === 'asset') {
    const a = p.assets.find((x) => x.id === f.assetId);
    return { label: a?.name ?? 'Missing asset', uri: a?.uri };
  }
  if (f.kind === 'character') {
    const c = p.characters.find((x) => x.id === f.characterId);
    const ref = c ? findReference(c, f.referenceId) : null;
    return { label: `${c?.name ?? '?'} reference v${ref?.version ?? '?'}`, uri: ref?.imageUri };
  }
  return { label: `Last frame of shot ${p.shots.find((s) => s.id === f.shotId)?.order ?? '?'}` };
}

function FrameSlot({ project, shot, which }: { project: Project; shot: Shot; which: 'startFrame' | 'endFrame' }) {
  const [over, setOver] = useState(false);
  const info = frameInfo(project, shot[which]);
  const set = (f: FrameRef | null) => updateShot(shot.id, (s) => ({ ...s, [which]: f }));
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const assetId = e.dataTransfer.getData(DND_ASSET);
    const charId = e.dataTransfer.getData(DND_CHARACTER);
    if (assetId) set({ kind: 'asset', assetId });
    else if (charId) {
      const c = project.characters.find((x) => x.id === charId);
      if (c?.approved) set({ kind: 'character', characterId: c.id, referenceId: c.approved.referenceId });
    }
  };
  const prev = project.shots.find((s) => s.order === shot.order - 1 && s.sceneId === shot.sceneId);
  return (
    <div
      className={`frame-slot ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      {info.uri && <img src={info.uri} alt="" />}
      <span style={{ flex: 1 }}>{info.label}</span>
      {which === 'startFrame' && !shot[which] && prev && prev.takes.length > 0 && (
        <button className="btn small" title="Continue from the previous shot" onClick={() => prev.approvedTakeId && set({ kind: 'take', shotId: prev.id, takeId: prev.approvedTakeId, position: 'last' })} disabled={!prev.approvedTakeId}>
          Continue
        </button>
      )}
      {shot[which] && <button className="icon-btn" onClick={() => set(null)} title="Clear">✕</button>}
    </div>
  );
}

function ShotInspector({ project, shot }: { project: Project; shot: Shot }) {
  const plan = planShot(shot, project, registry);
  const status = shotStatus(shot);
  const outdated = shot.characterRefs.filter((pin) => {
    const c = project.characters.find((x) => x.id === pin.characterId);
    return c?.approved && c.approved.referenceId !== pin.referenceId;
  });
  const set = (patch: Partial<Shot>) => updateShot(shot.id, (s) => ({ ...s, ...patch }));
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ flex: 1 }}>Shot {shot.order}</h2>
        <StatusBadge status={status} />
      </div>
      {shot.orphaned && <div className="limit warning"><b>orphan</b><span>This shot no longer matches the script. It is kept because it has takes.</span></div>}
      <Field label="Title"><Text value={shot.title} onChange={(v) => set({ title: v })} /></Field>
      <Field label="Prompt / action"><Text multiline value={shot.description} onChange={(v) => set({ description: v })} /></Field>

      <div className="section">
        <h4>Camera</h4>
        <div className="field-row">
          <Field label="Framing">
            <select value={shot.camera.framing} onChange={(e) => set({ camera: { ...shot.camera, framing: e.target.value as Framing } })}>
              {FRAMINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Lens (mm)">
            <input type="number" min={8} max={300} value={shot.camera.lensMm} onChange={(e) => set({ camera: { ...shot.camera, lensMm: Number(e.target.value) } })} />
          </Field>
        </div>
        <div className="field-row">
          <Field label="Angle"><Text value={shot.camera.angle} onChange={(v) => set({ camera: { ...shot.camera, angle: v } })} /></Field>
          <Field label="Movement"><Text value={shot.camera.movement} onChange={(v) => set({ camera: { ...shot.camera, movement: v } })} /></Field>
        </div>
        <div className="field-row">
          <Field label="Lighting"><Text value={shot.lighting} onChange={(v) => set({ lighting: v })} /></Field>
          <Field label="Duration (s)">
            <input type="number" min={0.5} step={0.1} value={shot.durationSec} onChange={(e) => set({ durationSec: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Motion"><Text value={shot.motion} onChange={(v) => set({ motion: v })} placeholder="subject and background motion" /></Field>
      </div>

      <div className="section">
        <h4>Characters & references</h4>
        {shot.characterIds.length === 0 && <span className="hint">No characters on camera.</span>}
        {shot.characterIds.map((id) => {
          const pin = shot.characterRefs.find((p) => p.characterId === id);
          return (
            <div key={id} className="hint">
              {charName(project, id)} · {pin ? `pinned to design v${pin.version}` : 'not pinned (needs an approved design)'}
            </div>
          );
        })}
        {outdated.length > 0 && (
          <button className="btn small" onClick={() => updateShot(shot.id, (s) => pinCurrentReferences(project, s))}>
            Re-pin to current approved designs
          </button>
        )}
        <Field label="Start frame"><FrameSlot project={project} shot={shot} which="startFrame" /></Field>
        <Field label="End frame"><FrameSlot project={project} shot={shot} which="endFrame" /></Field>
      </div>

      {shot.dialogueLineIds.length > 0 && (
        <div className="section">
          <h4>Dialogue</h4>
          {shot.dialogueLineIds.map((id) => {
            const l = project.dialogue.find((x) => x.id === id);
            if (!l) return <div key={id} className="hint">Line removed from script</div>;
            return (
              <div key={id} className="el-line" onClick={() => useStore.getState().select({ kind: 'line', id })}>
                <div className="who">{charName(project, l.speakerId)}</div>
                <div>{l.text}</div>
                <div className="chips"><span className="chip emo">{l.performance.emotion}</span><span className="chip">{l.performance.intensity}</span></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section">
        <h4>Generation plan</h4>
        <PlanReport plan={plan} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!plan.canProceed} onClick={() => void generateShotTake(shot.id)}>Generate take</button>
          {!plan.canProceed && plan.placeholderTestAllowed && (
            <button className="btn" onClick={() => void generateShotTake(shot.id, true)} title="Makes a labelled placeholder take to test the workflow. It cannot be approved.">
              Placeholder test take
            </button>
          )}
        </div>
      </div>

      {shot.takes.length > 0 && (
        <div className="section">
          <h4>Takes</h4>
          {[...shot.takes].reverse().map((t) => {
            const n = shot.takes.indexOf(t) + 1;
            return (
              <div key={t.id} className="card" style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <b style={{ flex: 1 }}>Take {n}</b>
                  {t.isPlaceholder && <span className="badge placeholder">placeholder</span>}
                  {shot.approvedTakeId === t.id && <span className="badge approved">approved</span>}
                </div>
                <div className="hint" style={{ marginBottom: 6 }}>{t.route.replace(/_/g, ' ')} · {registry.get(t.engineId)?.name ?? t.engineId}</div>
                {t.validation && (
                  <ValidationPanel
                    report={t.validation}
                    onManual={(id, st) =>
                      updateShot(shot.id, (s) => ({ ...s, takes: s.takes.map((x) => (x.id === t.id && x.validation ? { ...x, validation: setManualCheck(x.validation, id, st, '') } : x)) }))
                    }
                  />
                )}
                <button className="btn small" style={{ marginTop: 6 }} disabled={t.validation?.overall !== 'pass' || shot.approvedTakeId === t.id} onClick={() => approveShotTake(shot.id, t.id)}>
                  Approve take
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const STATES: PerformanceState[] = ['listening', 'reacting', 'silent'];

function LineInspector({ project, lineId }: { project: Project; lineId: string }) {
  const l = project.dialogue.find((x) => x.id === lineId);
  if (!l) return <div className="empty">Line not found</div>;
  const scene = project.scenes.find((s) => s.id === l.sceneId);
  return (
    <>
      <h2>Line {l.order} · {charName(project, l.speakerId)}</h2>
      <div className="hint">{scene?.heading}</div>
      <Field label="Dialogue"><Text multiline value={l.text} onChange={(v) => updateLine(l.id, (x) => ({ ...x, text: v }))} /></Field>
      <Field label="Speaker">
        <select value={l.speakerId} onChange={(e) => updateLine(l.id, (x) => ({ ...x, speakerId: e.target.value }))}>
          {project.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Spoken to">
        <select
          multiple
          value={l.listenerIds}
          size={Math.min(4, Math.max(2, project.characters.length - 1))}
          onChange={(e) => updateLine(l.id, (x) => ({ ...x, listenerIds: Array.from(e.target.selectedOptions).map((o) => o.value) }))}
        >
          {project.characters.filter((c) => c.id !== l.speakerId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="section">
        <h4>Performance direction</h4>
        <PerformanceEditor value={l.performance} onChange={(p) => updateLine(l.id, (x) => ({ ...x, performance: p }))} />
      </div>
      {l.others.length > 0 && (
        <div className="section">
          <h4>Others in the scene</h4>
          {l.others.map((o, i) => (
            <div key={o.characterId} className="grid" style={{ gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <b style={{ flex: 1 }}>{charName(project, o.characterId)}</b>
                <select value={o.state} onChange={(e) => updateLine(l.id, (x) => ({ ...x, others: x.others.map((y, j) => (j === i ? { ...y, state: e.target.value as PerformanceState } : y)) }))}>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <Text value={o.direction} onChange={(v) => updateLine(l.id, (x) => ({ ...x, others: x.others.map((y, j) => (j === i ? { ...y, direction: v } : y)) }))} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CharacterInspector({ project, c }: { project: Project; c: Character }) {
  const edit = (patch: Parameters<typeof updateProfile>[1]) => updateCharacter(c.id, (x) => updateProfile(x, patch));
  const a = c.appearance;
  const v = c.voice;
  return (
    <>
      <h2>{c.name}</h2>
      {!c.inScript && <div className="limit info"><b>note</b><span>No longer appears in the script.</span></div>}
      <div className="section">
        <h4>Appearance</h4>
        <div className="field-row">
          <Field label="Age appearance"><Text value={a.age} onChange={(x) => edit({ appearance: { ...a, age: x } })} /></Field>
          <Field label="Build"><Text value={a.build} onChange={(x) => edit({ appearance: { ...a, build: x } })} /></Field>
        </div>
        <div className="field-row">
          <Field label="Hair"><Text value={a.hair} onChange={(x) => edit({ appearance: { ...a, hair: x } })} /></Field>
          <Field label="Skin"><Text value={a.skin} onChange={(x) => edit({ appearance: { ...a, skin: x } })} /></Field>
        </div>
        <Field label="Face details"><Text value={a.face} onChange={(x) => edit({ appearance: { ...a, face: x } })} /></Field>
        <Field label="Default wardrobe"><Text value={a.wardrobe} onChange={(x) => edit({ appearance: { ...a, wardrobe: x } })} /></Field>
        <Field label="Accessories"><Text value={a.accessories} onChange={(x) => edit({ appearance: { ...a, accessories: x } })} /></Field>
        <Field label="Notes"><Text multiline value={a.notes} onChange={(x) => edit({ appearance: { ...a, notes: x } })} /></Field>
      </div>
      <div className="section">
        <h4>Voice</h4>
        <div className="field-row">
          <Field label="Voice ID"><Text value={v.voiceId} placeholder="from the voice engine" onChange={(x) => edit({ voice: { ...v, voiceId: x } })} /></Field>
          <Field label="Language"><Text value={v.language} onChange={(x) => edit({ voice: { ...v, language: x } })} /></Field>
        </div>
        <div className="field-row">
          <Field label="Accent"><Text value={v.accent} onChange={(x) => edit({ voice: { ...v, accent: x } })} /></Field>
          <Field label="Speaking style"><Text value={v.speakingStyle} onChange={(x) => edit({ voice: { ...v, speakingStyle: x } })} /></Field>
        </div>
        <Field label="Pronunciation notes"><Text value={v.pronunciationNotes} onChange={(x) => edit({ voice: { ...v, pronunciationNotes: x } })} /></Field>
      </div>
      <div className="section">
        <h4>Movement & wardrobe</h4>
        <Field label="Mannerisms"><Text multiline value={c.mannerisms} onChange={(x) => edit({ mannerisms: x })} /></Field>
        {project.scenes.filter((s) => s.characterIds.includes(c.id)).map((s) => (
          <Field key={s.id} label={`Wardrobe · Scene ${s.number}`}>
            <Text value={c.wardrobeByScene[s.id] ?? ''} placeholder="same as default" onChange={(x) => edit({ wardrobeByScene: { ...c.wardrobeByScene, [s.id]: x } })} />
          </Field>
        ))}
      </div>
      <div className="section">
        <h4>Identity</h4>
        <p className="hint">
          Approved reference images guide generation. They are not a trained identity model; training (e.g. a LoRA) is a separate pipeline that needs compatible hardware and permitted training data, and is not part of this build.
        </p>
      </div>
    </>
  );
}

function ProjectInspector({ project }: { project: Project }) {
  const s = project.settings;
  return (
    <>
      <h2>Project</h2>
      <div className="hint">{s.productionType.replace('_', ' ')} · {s.aspectRatio} · {s.resolution} · {s.fps} fps · {s.language}</div>
      <Field label="Target duration (minutes)">
        <input type="number" min={0.1} step={0.5} value={s.targetDurationSec / 60} onChange={(e) => updateProject({ settings: { ...s, targetDurationSec: Math.round(Number(e.target.value) * 60) } })} />
      </Field>
      <Field label="Design candidates per round">
        <select value={s.candidateCount} onChange={(e) => updateProject({ settings: { ...s, candidateCount: Number(e.target.value) as 4 | 6 | 8 } })}>
          <option value={4}>4</option><option value={6}>6</option><option value={8}>8</option>
        </select>
      </Field>
      <p className="empty">Select a shot, line, character or reference to edit it here.</p>
    </>
  );
}

export function Inspector() {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.selection);
  let body;
  if (sel?.kind === 'shot') {
    const shot = project.shots.find((s) => s.id === sel.id);
    body = shot ? <ShotInspector project={project} shot={shot} /> : null;
  } else if (sel?.kind === 'line') body = <LineInspector project={project} lineId={sel.id} />;
  else if (sel?.kind === 'character') {
    const c = project.characters.find((x) => x.id === sel.id);
    body = c ? <CharacterInspector project={project} c={c} /> : null;
  } else if (sel?.kind === 'asset') {
    const a = project.assets.find((x) => x.id === sel.id);
    body = a ? (
      <>
        <h2>{a.name}</h2>
        {a.kind === 'image' && <img src={a.uri} alt="" style={{ width: '100%', borderRadius: 8 }} />}
        <p className="hint">Drag this reference onto a shot’s start or end frame.</p>
        <button className="btn danger" onClick={() => { useStore.getState().update((p) => ({ ...p, assets: p.assets.filter((x) => x.id !== a.id) })); useStore.getState().select(null); }}>
          Remove reference
        </button>
      </>
    ) : null;
  }
  return <aside className="inspector">{body ?? <ProjectInspector project={project} />}</aside>;
}
