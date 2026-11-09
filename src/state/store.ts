import { create } from 'zustand';
import { createDefaultRegistry } from '../core/engines/registry';
import { newId } from '../core/ids';
import { createProject, loadProject, serializeProject } from '../core/project';
import type { Project } from '../core/types';

export const registry = createDefaultRegistry();

export type WorkspaceMode = 'script' | 'storyboard' | 'characters' | 'scenes' | 'generate' | 'editor';
export type Selection =
  | { kind: 'shot'; id: string }
  | { kind: 'line'; id: string }
  | { kind: 'character'; id: string }
  | { kind: 'scene'; id: string }
  | { kind: 'asset'; id: string }
  | null;

export interface Job {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  progress: number;
  message: string;
}

export interface Notice { id: string; kind: 'info' | 'error' | 'warning'; text: string }

interface DesktopBridge {
  saveProject(json: string, filePath?: string): Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>;
  openProject(): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; json?: string }>;
}
export const desktop: DesktopBridge | undefined = (window as unknown as { novaDesktop?: DesktopBridge }).novaDesktop;

const AUTOSAVE_KEY = 'nova-flow:autosave';
const HISTORY_LIMIT = 100;

function loadAutosave(): Project | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? loadProject(raw) : null;
  } catch {
    return null;
  }
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  saveState: 'saved' | 'unsaved' | 'saving' | 'error';
  filePath?: string;
  mode: WorkspaceMode;
  selection: Selection;
  jobs: Job[];
  notices: Notice[];
  showNewProject: boolean;
  showSettings: boolean;

  update(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  setMode(m: WorkspaceMode): void;
  select(s: Selection): void;
  notify(kind: Notice['kind'], text: string): void;
  dismiss(id: string): void;
  run<T>(label: string, fn: (progress: (f: number, msg: string) => void) => Promise<T>): Promise<T | undefined>;
  newProject(p: Project): void;
  save(saveAs?: boolean): Promise<void>;
  open(): Promise<void>;
  setDialog(which: 'showNewProject' | 'showSettings', open: boolean): void;
}

const initial = loadAutosave();

export const useStore = create<State>((set, get) => ({
  project: initial ?? createProject('Untitled film'),
  past: [],
  future: [],
  saveState: initial ? 'saved' : 'unsaved',
  mode: 'script',
  selection: null,
  jobs: [],
  notices: [],
  showNewProject: !initial,
  showSettings: false,

  update(fn) {
    const prev = get().project;
    let next: Project;
    try {
      next = fn(prev);
    } catch (e) {
      get().notify('error', (e as Error).message);
      return;
    }
    if (next === prev) return;
    set({ project: next, past: [...get().past, prev].slice(-HISTORY_LIMIT), future: [], saveState: 'unsaved' });
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], saveState: 'unsaved' });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), saveState: 'unsaved' });
  },
  setMode: (mode) => set({ mode }),
  select: (selection) => set({ selection }),
  notify(kind, text) {
    const id = newId('n');
    set({ notices: [...get().notices, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'error' ? 9000 : 5000);
  },
  dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
  async run(label, fn) {
    const id = newId('job');
    const patch = (p: Partial<Job>) => set({ jobs: get().jobs.map((j) => (j.id === id ? { ...j, ...p } : j)) });
    set({ jobs: [...get().jobs, { id, label, status: 'running', progress: 0, message: 'Starting' }] });
    try {
      const out = await fn((progress, message) => patch({ progress, message }));
      patch({ status: 'done', progress: 1, message: 'Done' });
      return out;
    } catch (e) {
      patch({ status: 'failed', message: (e as Error).message });
      get().notify('error', `${label}: ${(e as Error).message}`);
      return undefined;
    }
  },
  newProject(p) {
    set({ project: p, past: [], future: [], filePath: undefined, saveState: 'unsaved', selection: null, mode: 'script', showNewProject: false });
  },
  async save(saveAs = false) {
    const json = serializeProject(get().project);
    set({ saveState: 'saving' });
    try {
      localStorage.setItem(AUTOSAVE_KEY, json);
    } catch {
      /* storage may be unavailable; file save below still works on desktop */
    }
    if (desktop) {
      try {
        const r = await desktop.saveProject(json, saveAs ? undefined : get().filePath);
        if (!r.ok) {
          set({ saveState: 'unsaved' });
          return;
        }
        set({ filePath: r.filePath, saveState: 'saved' });
      } catch (e) {
        set({ saveState: 'error' });
        get().notify('error', `Save failed: ${(e as Error).message}`);
      }
    } else {
      set({ saveState: 'saved' });
    }
  },
  async open() {
    if (!desktop) {
      get().notify('info', 'Opening project files is available in the desktop app. The browser preview keeps one autosaved project.');
      return;
    }
    const r = await desktop.openProject();
    if (!r.ok || !r.json) return;
    try {
      const p = loadProject(r.json);
      set({ project: p, past: [], future: [], filePath: r.filePath, saveState: 'saved', selection: null });
    } catch (e) {
      get().notify('error', (e as Error).message);
    }
  },
  setDialog: (which, open) => set({ [which]: open } as Partial<State>),
}));

// Debounced autosave of the working copy.
let timer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, serializeProject(useStore.getState().project));
    } catch {
      /* ignore quota or privacy-mode errors */
    }
  }, 800);
});

export function useProject() {
  return useStore((s) => s.project);
}
