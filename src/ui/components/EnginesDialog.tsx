import type { EngineCapabilities } from '../../core/engines/types';
import type { Project } from '../../core/types';
import { updateProject } from '../../state/actions';
import { registry, useStore } from '../../state/store';

const CAP_LABELS: [keyof EngineCapabilities, string][] = [
  ['imageGeneration', 'images'], ['videoGeneration', 'video'], ['nativeAudio', 'native audio'], ['speechSynthesis', 'speech'], ['lipSync', 'lip-sync'],
  ['emotionControl', 'emotion control'], ['headMotionControl', 'head motion'], ['multiSpeakerInOneShot', 'multi-speaker'], ['startEndFrames', 'start/end frames'],
];

const ROLES: [keyof Project['engineSelection'], string, 'image' | 'video' | 'voice' | 'lipsync'][] = [
  ['image', 'Character design (image)', 'image'], ['video', 'Shot generation (video)', 'video'], ['voice', 'Dialogue voice', 'voice'], ['lipsync', 'Lip-sync / performance', 'lipsync'],
];

export function EnginesDialog() {
  const project = useStore((s) => s.project);
  const close = () => useStore.getState().setDialog('showSettings', false);
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" style={{ width: 'min(720px, calc(100vw - 32px))' }} onClick={(e) => e.stopPropagation()}>
        <h2>Generation engines</h2>
        <p className="hint">
          NOVA plans every shot against what each engine declares it can do, and reports anything it cannot do. No cloud provider is
          connected yet; the offline placeholder engine lets you exercise the workflow, but its output is labelled and can never be approved.
        </p>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {ROLES.map(([key, label, role]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <select value={project.engineSelection[key] ?? ''} onChange={(e) => updateProject({ engineSelection: { ...project.engineSelection, [key]: e.target.value || null } })}>
                <option value="">None</option>
                {registry.forRole(role).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.status().available ? '' : ' (not configured)'}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div>
          {registry.all().map((e) => {
            const st = e.status();
            return (
              <div className="engine-row" key={e.id}>
                <div>
                  <h3>{e.name}</h3>
                  <p className="hint">{e.description}</p>
                </div>
                <span className={`badge ${st.available ? 'approved' : 'needs_repair'}`}>{st.available ? 'Available' : st.reason}</span>
                <div className="caps">
                  {CAP_LABELS.map(([k, l]) => (
                    <span key={k} className={`cap ${e.capabilities[k] ? 'yes' : ''}`}>{e.capabilities[k] ? '✓' : '✕'} {l}</span>
                  ))}
                  <span className="cap">identity: {e.capabilities.identityPreservation.replace('_', ' ')}</span>
                  <span className="cap">max {e.capabilities.maxDurationSec}s</span>
                  {e.capabilities.producesPlaceholders && <span className="cap" style={{ color: 'var(--warn)' }}>placeholder output</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="actions"><button className="btn primary" onClick={close}>Done</button></div>
      </div>
    </div>
  );
}
