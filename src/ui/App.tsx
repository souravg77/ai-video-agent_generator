import { useStore, type WorkspaceMode } from '../state/store';
import { EnginesDialog } from './components/EnginesDialog';
import { Inspector } from './components/Inspector';
import { LibrarySidebar } from './components/LibrarySidebar';
import { NewProjectDialog } from './components/NewProjectDialog';
import { ShotTimeline } from './components/ShotTimeline';
import { Toolbar } from './components/Toolbar';
import { CharacterStudio } from './workspaces/CharacterStudio';
import { EditorWorkspace } from './workspaces/EditorWorkspace';
import { GenerationWorkspace } from './workspaces/GenerationWorkspace';
import { SceneBuilder } from './workspaces/SceneBuilder';
import { ScriptWorkspace } from './workspaces/ScriptWorkspace';
import { StoryboardWorkspace } from './workspaces/StoryboardWorkspace';

const MODES: [WorkspaceMode, string][] = [
  ['script', 'Script'],
  ['storyboard', 'Storyboard'],
  ['characters', 'Character Studio'],
  ['scenes', 'Scene Builder'],
  ['generate', 'Video Generation'],
  ['editor', 'Editor'],
];

function Body({ mode }: { mode: WorkspaceMode }) {
  switch (mode) {
    case 'script': return <ScriptWorkspace />;
    case 'storyboard': return <StoryboardWorkspace />;
    case 'characters': return <CharacterStudio />;
    case 'scenes': return <SceneBuilder />;
    case 'generate': return <GenerationWorkspace />;
    case 'editor': return <EditorWorkspace />;
  }
}

export function App() {
  const mode = useStore((s) => s.mode);
  const notices = useStore((s) => s.notices);
  const showNew = useStore((s) => s.showNewProject);
  const showSettings = useStore((s) => s.showSettings);
  const { setMode, dismiss } = useStore.getState();
  return (
    <div className="app">
      <Toolbar />
      <LibrarySidebar />
      <main className="workspace">
        <nav className="mode-tabs">
          {MODES.map(([m, label]) => (
            <button key={m} className={`mode-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>{label}</button>
          ))}
        </nav>
        <div className="mode-body"><Body mode={mode} /></div>
      </main>
      <Inspector />
      <ShotTimeline />
      <div className="toasts">
        {notices.map((n) => <div key={n.id} className={`toast ${n.kind}`} onClick={() => dismiss(n.id)}>{n.text}</div>)}
      </div>
      {showNew && <NewProjectDialog />}
      {showSettings && <EnginesDialog />}
    </div>
  );
}
