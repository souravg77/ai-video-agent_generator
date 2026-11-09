import { useEffect, useState } from 'react';
import { applyScript } from '../../core/project';
import { useStore } from '../../state/store';
import { charName } from '../components/common';
import { SAMPLE_SCRIPT } from '../sampleScript';

export function ScriptWorkspace() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const { update, select, notify } = useStore.getState();
  const [draft, setDraft] = useState(project.script.source);
  useEffect(() => setDraft(project.script.source), [project.script.source]);
  const dirty = draft !== project.script.source;

  const parse = () => {
    let summary = '';
    update((p) => {
      const r = applyScript(p, draft);
      summary = `${r.parsed.scenes.length} scene(s), ${r.parsed.characters.length} character(s), ${r.parsed.dialogue.length} line(s).`;
      return r.project;
    });
    if (summary) notify('info', `Script parsed: ${summary}`);
  };

  return (
    <div className="cols" style={{ alignItems: 'start' }}>
      <div>
        <div className="mode-header">
          <h2>Script</h2>
          {dirty && <span className="hint" style={{ color: 'var(--warn)' }}>Unparsed changes</span>}
          <span className="spacer" />
          <button className="btn" onClick={() => setDraft(SAMPLE_SCRIPT)}>Load sample</button>
          <button className="btn primary" onClick={parse} disabled={!draft.trim()}>Parse script</button>
        </div>
        <textarea
          className="script-editor"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={'Write or paste a screenplay.\n\nINT. KITCHEN - NIGHT\n\nMAYA\n(stunned)\nYou came back!\n\nOr simple lines:\nMaya: You came back!\nLeo: I promised I would.'}
        />
        <p className="hint" style={{ marginTop: 6 }}>
          Supports screenplay format (scene headings, CHARACTER cues, (parentheticals), transitions) and “Name: line” dialogue. Re-parsing keeps approved characters and any performance direction you edited.
        </p>
      </div>
      <div>
        <div className="mode-header">
          <h2>Breakdown</h2>
          <span className="hint">{project.scenes.length} scenes · {project.characters.length} characters · {project.dialogue.length} lines</span>
        </div>
        {project.script.warnings.length > 0 && <div className="warnings">{project.script.warnings.map((w, i) => <div key={i}>{w}</div>)}</div>}
        {project.scenes.length === 0 && <div className="empty">Parse a script to see scenes, characters and dialogue with performance direction.</div>}
        {project.scenes.map((s) => (
          <div key={s.id} className="card breakdown-scene">
            <h3>{s.number}. {s.heading}</h3>
            <div className="chips" style={{ marginBottom: 6 }}>
              {s.characterIds.map((id) => <span key={id} className="chip">{charName(project, id)}</span>)}
              {s.propIds.map((id) => <span key={id} className="chip">◆ {project.props.find((p) => p.id === id)?.name}</span>)}
            </div>
            {s.elements.map((el, i) => {
              if (el.kind === 'action') return <p key={i} className="el-action">{el.text}</p>;
              if (el.kind === 'transition') return <p key={i} className="el-transition">{el.text}</p>;
              if (el.kind === 'beat') return <div key={i} className="el-beat"><b>{charName(project, el.characterId)}</b> — {el.text} <span className="hint">({el.direction})</span></div>;
              const l = project.dialogue.find((d) => d.id === el.lineId);
              if (!l) return null;
              return (
                <div key={i} className={`el-line ${selection?.kind === 'line' && selection.id === l.id ? 'active' : ''}`} onClick={() => select({ kind: 'line', id: l.id })}>
                  <div className="who">
                    {charName(project, l.speakerId)}{l.extension ? ` (${l.extension})` : ''}
                    {l.listenerIds.length > 0 && <span className="paren"> → {l.listenerIds.map((id) => charName(project, id)).join(', ')}</span>}
                  </div>
                  {l.parenthetical && <div className="paren">({l.parenthetical})</div>}
                  <div>{l.text}</div>
                  <div className="chips">
                    <span className="chip emo">{l.performance.emotion}</span>
                    <span className="chip">{l.performance.intensity}</span>
                    <span className="chip">{l.performance.expressionDuring}</span>
                    {l.isVoiceOver && <span className="chip">voice-over</span>}
                    {l.performance.inferred && <span className="chip inferred">inferred · review</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
