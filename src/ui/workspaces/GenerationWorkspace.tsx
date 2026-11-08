import { useState } from 'react';
import { planShot } from '../../core/engines/planner';
import { buildShotPrompt } from '../../core/generation';
import { shotStatus } from '../../core/validation/lipsync';
import { generateShotTake, updateProject } from '../../state/actions';
import { registry, useStore } from '../../state/store';
import { Field, PlanReport, StatusBadge } from '../components/common';
import { shotThumb } from './StoryboardWorkspace';

export function GenerationWorkspace() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const jobs = useStore((s) => s.jobs);
  const select = useStore.getState().select;
  const [variations, setVariations] = useState(1);
  const shot = project.shots.find((s) => selection?.kind === 'shot' && s.id === selection.id) ?? project.shots[0];
  const sel = project.engineSelection;

  if (!project.shots.length) return <div className="empty">Build the storyboard first, then generate shots here.</div>;
  const plan = shot ? planShot(shot, project, registry) : null;
  const plans = project.shots.map((s) => ({ s, p: planShot(s, project, registry) }));
  const ready = plans.filter((x) => x.p.canProceed).length;

  const run = async (test: boolean) => {
    if (!shot) return;
    for (let i = 0; i < variations; i++) await generateShotTake(shot.id, test);
  };

  return (
    <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="mode-header" style={{ marginBottom: 0 }}><h2>Video generation</h2></div>
        <div className="card grid" style={{ gap: 10 }}>
          <Field label="Shot">
            <select value={shot?.id} onChange={(e) => select({ kind: 'shot', id: e.target.value })}>
              {project.shots.map((s) => <option key={s.id} value={s.id}>{s.order}. {s.title}</option>)}
            </select>
          </Field>
          {shot && (
            <>
              <Field label="Prompt sent to the engine (edit the shot, line and character fields to change it)">
                <textarea readOnly rows={6} value={buildShotPrompt(project, shot)} />
              </Field>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {shotThumb(project, shot) && <img src={shotThumb(project, shot)} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 4 }} />}
                <span className="hint">
                  {shot.characterRefs.length} character reference(s) · start frame: {shot.startFrame ? shot.startFrame.kind : 'none'} · end frame: {shot.endFrame ? shot.endFrame.kind : 'none'}
                </span>
              </div>
              <div className="field-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
                <Field label="Video engine">
                  <select value={sel.video ?? ''} onChange={(e) => updateProject({ engineSelection: { ...sel, video: e.target.value || null } })}>
                    {registry.forRole('video').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </Field>
                <Field label="Aspect ratio"><input type="text" readOnly value={project.settings.aspectRatio} /></Field>
                <Field label="Duration"><input type="text" readOnly value={`${shot.durationSec}s`} /></Field>
                <Field label="Variations">
                  <select value={variations} onChange={(e) => setVariations(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
              </div>
              {plan && <PlanReport plan={plan} />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" disabled={!plan?.canProceed} onClick={() => void run(false)}>Generate {variations > 1 ? `${variations} takes` : 'take'}</button>
                {plan && !plan.canProceed && plan.placeholderTestAllowed && (
                  <button className="btn" onClick={() => void run(true)}>Placeholder test take{variations > 1 ? 's' : ''}</button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Queue</h3>
          {jobs.length === 0 && <div className="hint">Nothing queued.</div>}
          {[...jobs].reverse().slice(0, 12).map((j) => (
            <div key={j.id} className={`job ${j.status}`}>
              <span>{j.label}</span>
              <span className="hint">{j.status}</span>
              <div className="bar"><div style={{ width: `${Math.round(j.progress * 100)}%` }} /></div>
              <span className="msg">{j.message}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="mode-header" style={{ marginBottom: 8 }}>
          <h3>All shots</h3>
          <span className="spacer" />
          <span className="hint">{ready}/{plans.length} ready to generate</span>
        </div>
        {plans.map(({ s, p }) => {
          const blockers = p.limitations.filter((l) => l.severity === 'blocker');
          return (
            <div key={s.id} className="el-line" onClick={() => select({ kind: 'shot', id: s.id })} style={shot?.id === s.id ? { borderColor: 'var(--accent-2)' } : undefined}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <b style={{ flex: 1 }}>{s.order}. {s.title}</b>
                <StatusBadge status={shotStatus(s)} />
              </div>
              <div className="hint">
                {p.route ? p.route.replace(/_/g, ' ') : 'no route'} · {blockers.length ? <span style={{ color: 'var(--bad)' }}>{blockers.length} blocker(s): {blockers[0].message}</span> : <span style={{ color: 'var(--ok)' }}>ready</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
