import { useRef, useState } from 'react';
import { newId } from '../../core/ids';
import { exportReadiness } from '../../core/project';
import type { TrackKind } from '../../core/types';
import { shotStatus } from '../../core/validation/lipsync';
import { useStore } from '../../state/store';
import { Field, StatusBadge, readFileAsDataUrl } from '../components/common';

export function EditorWorkspace() {
  const project = useStore((s) => s.project);
  const { update, select } = useStore.getState();
  const issues = exportReadiness(project);
  const blockers = issues.filter((i) => i.severity === 'blocker');
  const [track, setTrack] = useState<TrackKind>('music');
  const [start, setStart] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const shots = project.shots.filter((s) => !s.orphaned);

  const addClip = async (f: File | undefined) => {
    if (!f) return;
    const uri = await readFileAsDataUrl(f);
    const duration = await new Promise<number>((resolve) => {
      const a = new Audio();
      a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 10);
      a.onerror = () => resolve(10);
      a.src = uri;
    });
    update((p) => ({ ...p, audioClips: [...p.audioClips, { id: newId('clip'), track, name: f.name, uri, startSec: start, durationSec: Math.round(duration * 10) / 10 }] }));
  };

  return (
    <div className="cols" style={{ alignItems: 'start' }}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="mode-header" style={{ marginBottom: 0 }}><h2>Editor</h2><span className="hint">Assemble approved takes, add music and effects, then export</span></div>
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Sequence</h3>
          {shots.length === 0 && <div className="hint">No shots yet.</div>}
          {shots.map((s) => (
            <div key={s.id} className="el-line" onClick={() => select({ kind: 'shot', id: s.id })}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <b style={{ flex: 1 }}>{s.order}. {s.title}</b>
                <span className="hint">{s.durationSec}s</span>
                <StatusBadge status={shotStatus(s)} />
              </div>
            </div>
          ))}
        </div>
        <div className="card grid" style={{ gap: 8 }}>
          <h3>Add audio</h3>
          <div className="field-row">
            <Field label="Track">
              <select value={track} onChange={(e) => setTrack(e.target.value as TrackKind)}>
                <option value="music">Music</option><option value="sfx">Sound FX</option><option value="voiceover">Voice-over</option>
              </select>
            </Field>
            <Field label="Start (s)"><input type="number" min={0} step={0.5} value={start} onChange={(e) => setStart(Number(e.target.value))} /></Field>
          </div>
          <button className="btn" onClick={() => file.current?.click()}>Choose audio file…</button>
          <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => { void addClip(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </div>
      <div className="card grid" style={{ gap: 8 }}>
        <h3>Export check</h3>
        <p className="hint">Checks approved takes, validation, missing media, frame rate and voice-over audio before export.</p>
        {issues.map((i, n) => (
          <div key={n} className={`limit ${i.severity}`}><b>{i.severity}</b><span>{i.message}</span></div>
        ))}
        <button className="btn primary" disabled={blockers.length > 0} title={blockers.length ? 'Resolve the blockers above first' : undefined}>Export film</button>
      </div>
    </div>
  );
}
