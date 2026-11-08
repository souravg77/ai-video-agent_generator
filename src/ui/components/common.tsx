import type { ReactNode } from 'react';
import type { ShotPlan } from '../../core/engines/planner';
import { applyEmotionTemplate } from '../../core/script/performance';
import { EMOTIONS, type Character, type PerformanceDirection, type Project, type ShotStatus, type ValidationReport, type LipSyncCheckId, type CheckStatus } from '../../core/types';
import { STATUS_LABEL } from '../../core/validation/lipsync';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Text({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return multiline ? (
    <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  );
}

export function StatusBadge({ status }: { status: ShotStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function CharacterBadge({ c }: { c: Character }) {
  if (c.locked) return <span className="badge locked">Locked v{c.approved?.version}</span>;
  if (c.approved) return <span className="badge ready_to_approve">Approved v{c.approved.version}</span>;
  if (c.candidates.length) return <span className="badge generated_unvalidated">Choosing design</span>;
  return <span className="badge draft">No design</span>;
}

export function charName(p: Project, id: string): string {
  return p.characters.find((c) => c.id === id)?.name ?? id;
}

export function avatarOf(c: Character | undefined): string | undefined {
  return c?.approved?.imageUri ?? c?.candidates.find((x) => !x.rejected)?.imageUri;
}

export function PlanReport({ plan }: { plan: ShotPlan }) {
  return (
    <div className="grid" style={{ gap: 6 }}>
      <div className="hint">
        Route: <b style={{ color: 'var(--text)' }}>{plan.route ? plan.route.replace(/_/g, ' ') : 'none'}</b>
        {' · '}
        {plan.canProceed ? <span style={{ color: 'var(--ok)' }}>ready to generate</span> : <span style={{ color: 'var(--bad)' }}>blocked</span>}
      </div>
      {plan.limitations.map((l, i) => (
        <div key={i} className={`limit ${l.severity}`}>
          <b>{l.severity}</b>
          <span>{l.message}</span>
        </div>
      ))}
      {plan.steps.length > 0 && (
        <ol className="steps">
          {plan.steps.map((s, i) => (
            <li key={i}>{s.description}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

const MARK: Record<CheckStatus, string> = { pass: '✓', fail: '✕', not_checked: '·' };

export function ValidationPanel({ report, onManual }: { report: ValidationReport; onManual?: (id: LipSyncCheckId, s: CheckStatus) => void }) {
  return (
    <div>
      <div className="hint" style={{ marginBottom: 4 }}>
        Validation: <b className={`st ${report.overall === 'pass' ? 'pass' : report.overall === 'fail' ? 'fail' : 'not_checked'}`}>{report.overall}</b>
      </div>
      {report.checks.map((c) => {
        const locked = c.id === 'real_footage' || (c.source === 'metadata' && c.status === 'fail');
        return (
          <div className="check" key={c.id}>
            <span className={`st ${c.status}`}>{MARK[c.status]}</span>
            <div>
              <div>{c.label}</div>
              <div className="detail">{c.detail}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span className="src">{c.source}</span>
              {onManual && !locked && (
                <select value={c.status} onChange={(e) => onManual(c.id, e.target.value as CheckStatus)} title="Record your own review">
                  <option value="not_checked">not checked</option>
                  <option value="pass">pass</option>
                  <option value="fail">fail</option>
                </select>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PerformanceEditor({ value, onChange }: { value: PerformanceDirection; onChange: (p: PerformanceDirection) => void }) {
  const set = (patch: Partial<PerformanceDirection>) => onChange({ ...value, ...patch, inferred: false });
  return (
    <div className="grid" style={{ gap: 8 }}>
      {value.inferred && <div className="limit warning"><b>review</b><span>Auto-inferred from the script. Edit any field to confirm it.</span></div>}
      <div className="field-row">
        <Field label="Emotion">
          <select value={value.emotion} onChange={(e) => onChange({ ...applyEmotionTemplate(value, e.target.value as PerformanceDirection['emotion']), inferred: false })}>
            {EMOTIONS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
        <Field label="Intensity">
          <select value={value.intensity} onChange={(e) => set({ intensity: e.target.value as PerformanceDirection['intensity'] })}>
            <option>subtle</option>
            <option>moderate</option>
            <option>strong</option>
          </select>
        </Field>
      </div>
      {value.emotion === 'custom' && (
        <Field label="Custom emotion">
          <Text value={value.customEmotion ?? ''} onChange={(v) => set({ customEmotion: v })} />
        </Field>
      )}
      <div className="field-row">
        <Field label="Speed">
          <select value={value.speed} onChange={(e) => set({ speed: e.target.value as PerformanceDirection['speed'] })}>
            <option>slow</option>
            <option>normal</option>
            <option>fast</option>
          </select>
        </Field>
        <Field label="Emphasis (comma separated)">
          <Text value={value.emphasis.join(', ')} onChange={(v) => set({ emphasis: v.split(',').map((x) => x.trim()).filter(Boolean) })} />
        </Field>
      </div>
      <Field label="Pauses"><Text value={value.pauses} onChange={(v) => set({ pauses: v })} /></Field>
      <Field label="Vocal delivery"><Text value={value.vocalDelivery} onChange={(v) => set({ vocalDelivery: v })} /></Field>
      <Field label="Pronunciation notes"><Text value={value.pronunciation} onChange={(v) => set({ pronunciation: v })} placeholder="e.g. Leo = LAY-oh" /></Field>
      <Field label="Expression before the line"><Text value={value.expressionBefore} onChange={(v) => set({ expressionBefore: v })} /></Field>
      <Field label="Expression during"><Text value={value.expressionDuring} onChange={(v) => set({ expressionDuring: v })} /></Field>
      <Field label="Expression after"><Text value={value.expressionAfter} onChange={(v) => set({ expressionAfter: v })} /></Field>
      <div className="field-row">
        <Field label="Eyes"><Text value={value.eyeDirection} onChange={(v) => set({ eyeDirection: v })} /></Field>
        <Field label="Head"><Text value={value.headMovement} onChange={(v) => set({ headMovement: v })} /></Field>
      </div>
      <div className="field-row">
        <Field label="Posture"><Text value={value.posture} onChange={(v) => set({ posture: v })} /></Field>
        <Field label="Gesture"><Text value={value.gesture} onChange={(v) => set({ gesture: v })} /></Field>
      </div>
    </div>
  );
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
