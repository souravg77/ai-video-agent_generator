import { findReference } from '../../core/characters/studio';
import type { Project, Shot } from '../../core/types';
import { shotStatus } from '../../core/validation/lipsync';
import { rebuildStoryboard } from '../../state/actions';
import { useStore } from '../../state/store';
import { StatusBadge } from '../components/common';

export function shotThumb(p: Project, s: Shot): string | undefined {
  const f = s.startFrame;
  if (f?.kind === 'asset') return p.assets.find((a) => a.id === f.assetId)?.uri;
  if (f?.kind === 'character') {
    const c = p.characters.find((x) => x.id === f.characterId);
    return c ? findReference(c, f.referenceId)?.imageUri : undefined;
  }
  const pin = s.characterRefs[0];
  const c = pin && p.characters.find((x) => x.id === pin.characterId);
  return c ? findReference(c, pin.referenceId)?.imageUri : undefined;
}

export function StoryboardWorkspace() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const select = useStore.getState().select;
  return (
    <div>
      <div className="mode-header">
        <h2>Storyboard</h2>
        <span className="hint">{project.shots.length} shots · {project.shots.reduce((t, s) => t + s.durationSec, 0).toFixed(0)}s estimated</span>
        <span className="spacer" />
        <button className="btn primary" disabled={project.scenes.length === 0} onClick={rebuildStoryboard}>
          {project.shots.length ? 'Update from script' : 'Build from script'}
        </button>
      </div>
      {project.scenes.length === 0 && <div className="empty">Parse a script first.</div>}
      {project.scenes.map((sc) => {
        const shots = project.shots.filter((s) => s.sceneId === sc.id);
        if (!shots.length) return null;
        return (
          <div key={sc.id}>
            <div className="scene-label">{sc.number}. {sc.heading}</div>
            <div className="shot-grid">
              {shots.map((s) => {
                const thumb = shotThumb(project, s);
                return (
                  <div key={s.id} className={`shot-card ${selection?.kind === 'shot' && selection.id === s.id ? 'active' : ''}`} onClick={() => select({ kind: 'shot', id: s.id })}>
                    <div className="frame">
                      {thumb && <img src={thumb} alt="" />}
                      <span style={{ position: 'relative' }}>{s.camera.framing} · {s.camera.lensMm}mm</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <b style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.order}. {s.title}</b>
                      <StatusBadge status={shotStatus(s)} />
                    </div>
                    <div className="desc">{s.description}</div>
                    <div className="hint">{s.camera.movement} · {s.durationSec}s{s.orphaned ? ' · orphaned' : ''}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
