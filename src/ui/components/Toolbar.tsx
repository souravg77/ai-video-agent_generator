import { useEffect } from 'react';
import type { HardwareProfile } from '../../core/types';
import { updateProject } from '../../state/actions';
import { desktop, registry, useStore } from '../../state/store';

const SAVE_LABEL = { saved: desktop ? 'All changes saved' : 'Saved in browser', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' };

export function Toolbar() {
  const project = useStore((s) => s.project);
  const saveState = useStore((s) => s.saveState);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { undo, redo, save, open, setDialog, setMode } = useStore.getState();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (e.target as HTMLElement).tagName;
      const editing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (e.key.toLowerCase() === 'z' && !editing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y' && !editing) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, undo, redo]);

  const videoEngines = registry.forRole('video');
  return (
    <header className="toolbar">
      <div className="brand"><span className="brand-mark" />NOVA FLOW</div>
      <input className="project-name" value={project.name} aria-label="Project name" onChange={(e) => updateProject({ name: e.target.value })} />
      <div className="group">
        <button className="icon-btn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>↶</button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>↷</button>
      </div>
      <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
      <div className="spacer" />
      <label>
        Hardware
        <select value={project.settings.hardwareProfile} onChange={(e) => updateProject({ settings: { ...project.settings, hardwareProfile: e.target.value as HardwareProfile } })}>
          <option value="cloud">Cloud</option>
          <option value="local_gpu">Local GPU</option>
          <option value="local_cpu">Local CPU</option>
        </select>
      </label>
      <label>
        Video engine
        <select value={project.engineSelection.video ?? ''} onChange={(e) => updateProject({ engineSelection: { ...project.engineSelection, video: e.target.value || null } })}>
          {videoEngines.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.status().available ? '' : ' (not configured)'}</option>
          ))}
        </select>
      </label>
      <button className="btn ghost" onClick={() => setDialog('showNewProject', true)}>New</button>
      <button className="btn ghost" onClick={() => void open()}>Open</button>
      <button className="btn ghost" onClick={() => void save()}>Save</button>
      <button className="btn ghost" onClick={() => setDialog('showSettings', true)}>Engines</button>
      <button className="btn primary" onClick={() => setMode('editor')}>Export</button>
    </header>
  );
}
