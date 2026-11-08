import { productionReadiness } from '../../core/characters/studio';
import { shotStatus } from '../../core/validation/lipsync';
import { useStore } from '../../state/store';
import { Field, Text, charName } from '../components/common';

export function SceneBuilder() {
  const project = useStore((s) => s.project);
  const { update, select, setMode } = useStore.getState();
  if (!project.scenes.length) return <div className="empty">Parse a script to build scenes.</div>;
  return (
    <div>
      <div className="mode-header"><h2>Scene Builder</h2><span className="hint">Locations, cast readiness and shot progress per scene</span></div>
      {project.scenes.map((sc) => {
        const loc = project.locations.find((l) => l.id === sc.locationId);
        const shots = project.shots.filter((s) => s.sceneId === sc.id && !s.orphaned);
        const approved = shots.filter((s) => shotStatus(s) === 'approved').length;
        return (
          <div key={sc.id} className="card">
            <div className="mode-header" style={{ marginBottom: 8 }}>
              <h3 style={{ color: 'var(--accent)' }}>{sc.number}. {sc.heading}</h3>
              <span className="spacer" />
              <span className="hint">{approved}/{shots.length} shots approved</span>
              <button className="btn small" onClick={() => setMode('storyboard')}>Open shots</button>
            </div>
            <div className="cols">
              <div className="grid" style={{ gap: 8 }}>
                {loc && (
                  <Field label={`Location: ${loc.name}`}>
                    <Text
                      multiline
                      value={loc.description}
                      placeholder="Describe the set: architecture, materials, colour, era, atmosphere"
                      onChange={(v) => update((p) => ({ ...p, locations: p.locations.map((l) => (l.id === loc.id ? { ...l, description: v } : l)) }))}
                    />
                  </Field>
                )}
                <div className="hint">Time of day: {sc.timeOfDay || 'unspecified'} · {sc.setting ?? 'setting unspecified'}</div>
                <div className="chips">{sc.propIds.map((id) => <span key={id} className="chip">◆ {project.props.find((p) => p.id === id)?.name}</span>)}</div>
              </div>
              <div className="grid" style={{ gap: 4 }}>
                <h4>Cast in scene</h4>
                {sc.characterIds.map((id) => {
                  const c = project.characters.find((x) => x.id === id);
                  const r = c ? productionReadiness(c) : null;
                  return (
                    <div key={id} className="el-line" onClick={() => { select({ kind: 'character', id }); setMode('characters'); }}>
                      <b>{charName(project, id)}</b>{' '}
                      {r?.ok ? <span style={{ color: 'var(--ok)' }}>ready (design v{r.version}{c?.locked ? ', locked' : ''})</span> : <span style={{ color: 'var(--bad)' }}>needs an approved design</span>}
                      {c?.wardrobeByScene[sc.id] && <div className="hint">Wardrobe: {c.wardrobeByScene[sc.id]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
