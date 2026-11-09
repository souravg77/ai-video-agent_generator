import { useRef, useState } from 'react';
import { addCandidates, setCandidateRejected, setReferenceView } from '../../core/characters/studio';
import { newId, nowIso } from '../../core/ids';
import type { Character, CharacterCandidate, ReferenceViews } from '../../core/types';
import { approve, generateCandidates, toggleLock, updateCharacter } from '../../state/actions';
import { registry, useStore } from '../../state/store';
import { CharacterBadge, avatarOf, readFileAsDataUrl } from '../components/common';

const VIEWS: [keyof ReferenceViews, string][] = [['front', 'Front'], ['threeQuarter', 'Three-quarter'], ['side', 'Side'], ['fullBody', 'Full body']];

function StudioFor({ c }: { c: Character }) {
  const project = useStore((s) => s.project);
  const jobs = useStore((s) => s.jobs);
  const [picked, setPicked] = useState<string[]>([]);
  const [showRejected, setShowRejected] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const viewUpload = useRef<HTMLInputElement>(null);
  const [viewTarget, setViewTarget] = useState<keyof ReferenceViews>('side');
  const busy = jobs.some((j) => j.status === 'running' && j.label === `Designs for ${c.name}`);
  const engine = registry.get(project.engineSelection.image);
  const count = project.settings.candidateCount;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const batches = [...new Set(c.candidates.map((x) => x.batch))].sort((a, b) => b - a);
  const comparing = picked.length === 2 ? picked.map((id) => c.candidates.find((x) => x.id === id)!).filter(Boolean) : [];

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: Omit<CharacterCandidate, 'batch'>[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      list.push({ id: newId('cand'), imageUri: await readFileAsDataUrl(f), source: 'uploaded' as const, engineId: null, isPlaceholder: false, prompt: `Uploaded: ${f.name}`, seed: 0, createdAt: nowIso(), rejected: false });
    }
    if (list.length) updateCharacter(c.id, (x) => addCandidates(x, list));
  };

  const onViewUpload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const uri = await readFileAsDataUrl(f);
    updateCharacter(c.id, (x) => setReferenceView(x, viewTarget, uri));
  };

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="mode-header" style={{ marginBottom: 0 }}>
        <h2>{c.name}</h2>
        <CharacterBadge c={c} />
        <span className="spacer" />
        <button className="btn" onClick={() => upload.current?.click()} disabled={c.locked}>Upload reference</button>
        <input ref={upload} type="file" accept="image/*" multiple hidden onChange={(e) => { void onUpload(e.target.files); e.target.value = ''; }} />
        <button className="btn primary" onClick={() => void generateCandidates(c.id)} disabled={busy || !engine}>
          {busy ? 'Generating…' : c.candidates.length ? `Regenerate ${count} more` : `Generate ${count} designs`}
        </button>
      </div>
      {engine?.capabilities.producesPlaceholders && (
        <div className="limit warning"><b>engine</b><span>{engine.name} draws labelled placeholders, not real character designs. Connect an image provider in Engines for real candidates, or upload your own references.</span></div>
      )}

      {c.approved && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <h3 style={{ flex: 1 }}>Approved design v{c.approved.version}</h3>
            <button className="btn" onClick={() => toggleLock(c.id)}>{c.locked ? 'Unlock identity' : 'Lock identity'}</button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {VIEWS.map(([k, label]) => (
              <div key={k} style={{ width: 110, textAlign: 'center' }}>
                {c.approved!.views[k] ? (
                  <img src={c.approved!.views[k]} alt="" style={{ width: 110, aspectRatio: '4/5', objectFit: 'cover', borderRadius: 6 }} />
                ) : (
                  <button
                    className="btn ghost"
                    style={{ width: 110, aspectRatio: '4/5', borderStyle: 'dashed' }}
                    disabled={c.locked}
                    onClick={() => { setViewTarget(k); viewUpload.current?.click(); }}
                  >
                    + {label}
                  </button>
                )}
                <div className="hint">{label}</div>
              </div>
            ))}
            <input ref={viewUpload} type="file" accept="image/*" hidden onChange={(e) => { void onViewUpload(e.target.files); e.target.value = ''; }} />
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            {c.locked
              ? 'Locked: every shot uses this reference ID. New candidates can be generated for comparison but cannot replace it until you unlock.'
              : 'Lock the identity once you are happy so no later step can change it.'}
          </p>
        </div>
      )}

      {comparing.length === 2 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <h3 style={{ flex: 1 }}>Compare</h3>
            <button className="btn small" onClick={() => setPicked([])}>Close</button>
          </div>
          <div className="compare">
            {comparing.map((x) => (
              <div key={x.id}>
                <img src={x.imageUri} alt="" />
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <span className="hint" style={{ flex: 1 }}>Batch {x.batch} · {x.source}</span>
                  <button className="btn small primary" disabled={c.locked || c.approved?.candidateId === x.id} onClick={() => approve(c.id, x.id)}>Approve</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {c.candidates.length === 0 && <div className="empty">No designs yet. Generate {count} candidates or upload a reference image.</div>}
      {c.candidates.length > 0 && (
        <label className="hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Show rejected · click two candidates to compare
        </label>
      )}
      {batches.map((b) => {
        const list = c.candidates.filter((x) => x.batch === b && (showRejected || !x.rejected));
        if (!list.length) return null;
        return (
          <div key={b}>
            <h4 style={{ marginBottom: 6 }}>Batch {b}</h4>
            <div className="cand-grid">
              {list.map((x) => {
                const isApproved = c.approved?.candidateId === x.id;
                return (
                  <div key={x.id} className={`cand ${picked.includes(x.id) ? 'selected' : ''} ${isApproved ? 'approved' : ''} ${x.rejected ? 'rejected' : ''}`} onClick={() => toggle(x.id)}>
                    <img src={x.imageUri} alt={`${c.name} candidate`} />
                    {isApproved && <span className="badge approved tag">approved</span>}
                    {x.source === 'uploaded' && !isApproved && <span className="badge tag">uploaded</span>}
                    <div className="cand-bar" onClick={(e) => e.stopPropagation()}>
                      <button className="btn small" disabled={c.locked || isApproved || x.rejected} onClick={() => approve(c.id, x.id)}>Approve</button>
                      <button className="btn small ghost" disabled={isApproved} onClick={() => updateCharacter(c.id, (y) => setCandidateRejected(y, x.id, !x.rejected))}>
                        {x.rejected ? 'Restore' : 'Reject'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Version history</h3>
        <ul className="history">
          {[...c.history].reverse().map((h, i) => (
            <li key={i}>
              <span style={{ color: 'var(--dim)' }}>{new Date(h.at).toLocaleString()}</span> · {h.note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CharacterStudio() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const select = useStore.getState().select;
  const selected = project.characters.find((c) => selection?.kind === 'character' && c.id === selection.id) ?? project.characters[0];
  if (!project.characters.length) return <div className="empty">Parse a script to create the cast, then design each character here.</div>;
  return (
    <div className="studio">
      <div className="cast-list">
        <h4 style={{ marginBottom: 6 }}>Cast</h4>
        {project.characters.map((c) => (
          <div key={c.id} className={`cast-item ${selected?.id === c.id ? 'active' : ''}`} onClick={() => select({ kind: 'character', id: c.id })}>
            {avatarOf(c) ? <img src={avatarOf(c)} alt="" /> : <span className="avatar" />}
            <div style={{ minWidth: 0 }}>
              <div>{c.name}</div>
              <div className="hint">{c.locked ? 'Locked' : c.approved ? 'Approved' : c.candidates.length ? 'Choosing' : 'No design'}</div>
            </div>
          </div>
        ))}
      </div>
      {selected && <StudioFor key={selected.id} c={selected} />}
    </div>
  );
}
