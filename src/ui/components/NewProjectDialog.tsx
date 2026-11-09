import { useState } from 'react';
import { createProject, DEFAULT_SETTINGS } from '../../core/project';
import type { AspectRatio, CandidateCount, ProductionType, ProjectSettings, Resolution } from '../../core/types';
import { useStore } from '../../state/store';
import { Field } from './common';

const TYPES: [ProductionType, string][] = [
  ['film', 'Feature film'], ['short_film', 'Short film'], ['advertisement', 'Advertisement'], ['documentary', 'Documentary'], ['music_video', 'Music video'], ['custom', 'Custom'],
];

export function NewProjectDialog() {
  const [name, setName] = useState('Untitled film');
  const [s, setS] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const { newProject, setDialog } = useStore.getState();
  const patch = (p: Partial<ProjectSettings>) => setS({ ...s, ...p });
  return (
    <div className="modal-bg">
      <div className="modal" role="dialog" aria-label="New project">
        <h2>New production</h2>
        <Field label="Project name"><input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <div className="field-row">
          <Field label="Production type">
            <select value={s.productionType} onChange={(e) => patch({ productionType: e.target.value as ProductionType })}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Aspect ratio">
            <select value={s.aspectRatio} onChange={(e) => patch({ aspectRatio: e.target.value as AspectRatio })}>
              {['16:9', '9:16', '1:1', '2.39:1', '4:3'].map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Target resolution">
            <select value={s.resolution} onChange={(e) => patch({ resolution: e.target.value as Resolution })}>
              <option>720p</option><option>1080p</option><option>4k</option>
            </select>
          </Field>
          <Field label="Frame rate">
            <select value={s.fps} onChange={(e) => patch({ fps: Number(e.target.value) as ProjectSettings['fps'] })}>
              <option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option>
            </select>
          </Field>
        </div>
        <div className="field-row">
          <Field label="Language (e.g. en-US)"><input type="text" value={s.language} onChange={(e) => patch({ language: e.target.value })} /></Field>
          <Field label="Final duration (minutes)">
            <input type="number" min={0.1} step={0.5} value={s.targetDurationSec / 60} onChange={(e) => patch({ targetDurationSec: Math.round(Number(e.target.value) * 60) })} />
          </Field>
        </div>
        <Field label="Character design candidates per round">
          <select value={s.candidateCount} onChange={(e) => patch({ candidateCount: Number(e.target.value) as CandidateCount })}>
            <option value={4}>4</option><option value={6}>6</option><option value={8}>8</option>
          </select>
        </Field>
        <div className="actions">
          <button className="btn ghost" onClick={() => setDialog('showNewProject', false)}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => newProject(createProject(name.trim(), s))}>Create project</button>
        </div>
      </div>
    </div>
  );
}
