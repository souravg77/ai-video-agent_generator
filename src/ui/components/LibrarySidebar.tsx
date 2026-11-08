import { useState, type DragEvent, type ReactNode } from 'react';
import { newId, nowIso } from '../../core/ids';
import { restoreVersion, saveVersion } from '../../core/project';
import { shotStatus } from '../../core/validation/lipsync';
import { useStore } from '../../state/store';
import type { ReferenceAsset } from '../../core/types';
import { avatarOf, readFileAsDataUrl } from './common';

export const DND_ASSET = 'application/x-nova-asset';
export const DND_CHARACTER = 'application/x-nova-character';

function Section({ title, count, children, action }: { title: string; count: number; children: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="lib-section">
      <div className="lib-head" onClick={() => setOpen(!open)}>
        <span>{open ? '▾' : '▸'}</span>
        {title}
        {action}
        <span className="count">{count}</span>
      </div>
      {open && (count === 0 ? <div className="lib-empty">Nothing yet</div> : children)}
    </div>
  );
}

export function LibrarySidebar() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const { select, setMode, update, notify } = useStore.getState();
  const [over, setOver] = useState(false);

  const isActive = (kind: string, id: string) => selection?.kind === kind && selection.id === id;
  const takes = project.shots.flatMap((s) => s.takes.map((t) => ({ shot: s, take: t })));

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const added: ReferenceAsset[] = [];
    for (const f of files) {
      const kind = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : null;
      if (!kind) {
        notify('warning', `${f.name}: only image, video and audio files can be added as references.`);
        continue;
      }
      added.push({ id: newId('asset'), name: f.name, kind, uri: await readFileAsDataUrl(f), tags: [], addedAt: nowIso() });
    }
    if (added.length) update((p) => ({ ...p, assets: [...p.assets, ...added] }));
  };

  return (
    <aside
      className={`library ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <Section title="Script" count={project.script.source ? 1 : 0}>
        <div className="lib-item" onClick={() => setMode('script')}>
          📜 {project.script.title || 'Main script'}
          <span className="meta">{project.scenes.length} sc</span>
        </div>
      </Section>

      <Section title="Characters" count={project.characters.length}>
        {project.characters.map((c) => (
          <div
            key={c.id}
            className={`lib-item ${isActive('character', c.id) ? 'active' : ''}`}
            draggable={!!c.approved}
            onDragStart={(e) => e.dataTransfer.setData(DND_CHARACTER, c.id)}
            onClick={() => {
              select({ kind: 'character', id: c.id });
              setMode('characters');
            }}
            title={c.approved ? 'Drag onto a shot’s start or end frame' : undefined}
          >
            {avatarOf(c) ? <img className="thumb" src={avatarOf(c)} alt="" /> : <span className="thumb" />}
            {c.name}
            <span className="meta">{c.locked ? '🔒' : c.approved ? '✓' : ''}</span>
          </div>
        ))}
      </Section>

      <Section title="Locations" count={project.locations.length}>
        {project.locations.map((l) => (
          <div key={l.id} className="lib-item" onClick={() => setMode('scenes')}>📍 {l.name}</div>
        ))}
      </Section>

      <Section title="Props" count={project.props.length}>
        {project.props.map((p) => (
          <div key={p.id} className="lib-item">◆ {p.name}</div>
        ))}
      </Section>

      <Section title="References" count={project.assets.length}>
        {project.assets.map((a) => (
          <div
            key={a.id}
            className={`lib-item ${isActive('asset', a.id) ? 'active' : ''}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(DND_ASSET, a.id)}
            onClick={() => select({ kind: 'asset', id: a.id })}
          >
            {a.kind === 'image' ? <img className="thumb" src={a.uri} alt="" /> : <span className="thumb" />}
            {a.name}
          </div>
        ))}
      </Section>
      <div className="drop-hint">Drop images, video or audio here to add references</div>

      <Section title="Generated clips" count={takes.length}>
        {takes.map(({ shot, take }) => (
          <div key={take.id} className="lib-item" onClick={() => select({ kind: 'shot', id: shot.id })}>
            🎞 Shot {shot.order} · take {shot.takes.indexOf(take) + 1}
            <span className="meta">{take.isPlaceholder ? 'placeholder' : shotStatus(shot) === 'approved' && shot.approvedTakeId === take.id ? 'approved' : ''}</span>
          </div>
        ))}
      </Section>

      <Section title="Audio" count={project.audioClips.length}>
        {project.audioClips.map((a) => (
          <div key={a.id} className="lib-item">♪ {a.name}</div>
        ))}
      </Section>

      <Section
        title="Saved versions"
        count={project.versions.length}
        action={
          <button
            className="btn small"
            style={{ marginLeft: 6 }}
            onClick={(e) => {
              e.stopPropagation();
              update((p) => saveVersion(p, `Version ${p.versions.length + 1}`));
              notify('info', 'Version saved.');
            }}
          >
            + Save
          </button>
        }
      >
        {[...project.versions].reverse().map((v) => (
          <div key={v.id} className="lib-item" title="Restore this version (undo is available)">
            ⟲ {v.label}
            <span className="meta">
              <button className="btn small" onClick={() => update((p) => restoreVersion(p, v.id))}>Restore</button>
            </span>
          </div>
        ))}
      </Section>
    </aside>
  );
}
