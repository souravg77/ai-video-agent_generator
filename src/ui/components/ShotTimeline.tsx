import { useState } from 'react';
import { estimateLineDuration } from '../../core/storyboard/storyboard';
import { shotStatus } from '../../core/validation/lipsync';
import { useStore } from '../../state/store';
import { charName } from './common';

const TRACKS = ['Shots', 'Dialogue', 'Voice', 'Music', 'Sound FX', 'Subtitles', 'Footage'] as const;

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ShotTimeline() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const select = useStore.getState().select;
  const [pps, setPps] = useState(22); // pixels per second

  const shots = project.shots.filter((s) => !s.orphaned).sort((a, b) => a.order - b.order);
  let t = 0;
  const placed = shots.map((s) => {
    const start = t;
    t += s.durationSec;
    return { shot: s, start };
  });
  const total = t;
  const sceneStart = new Map<string, number>();
  for (const p of placed) if (!sceneStart.has(p.shot.sceneId)) sceneStart.set(p.shot.sceneId, p.start);
  const width = Math.max(600, (total + 5) * pps);
  const x = (sec: number) => sec * pps;
  const approved = shots.filter((s) => shotStatus(s) === 'approved').length;

  const voOffsets = new Map<string, number>();
  const voClips = project.dialogue
    .filter((l) => l.isVoiceOver)
    .map((l) => {
      const base = sceneStart.get(l.sceneId) ?? total;
      const off = voOffsets.get(l.sceneId) ?? 0;
      const d = estimateLineDuration(l);
      voOffsets.set(l.sceneId, off + d);
      return { line: l, start: base + off, dur: d };
    });

  return (
    <section className="timeline">
      <div className="tl-head">
        <b style={{ color: 'var(--text)' }}>Timeline</b>
        <span>{shots.length} shots · {fmt(total)} of {fmt(project.settings.targetDurationSec)} target</span>
        <span>{approved}/{shots.length} approved</span>
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Zoom
          <input type="range" min={6} max={80} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div className="tl-ruler" />
          {TRACKS.map((tr) => <div key={tr} className="tl-label">{tr}</div>)}
        </div>
        <div style={{ width, position: 'relative' }}>
          <div className="tl-ruler">
            {Array.from({ length: Math.ceil(total / 5) + 2 }, (_, i) => (
              <span key={i} style={{ left: x(i * 5) }}>{fmt(i * 5)}</span>
            ))}
          </div>
          <div className="tl-track">
            {placed.map(({ shot, start }) => (
              <div
                key={shot.id}
                className={`tl-clip shot ${selection?.kind === 'shot' && selection.id === shot.id ? 'active' : ''}`}
                style={{ left: x(start), width: Math.max(4, x(shot.durationSec) - 2) }}
                title={shot.title}
                onClick={() => select({ kind: 'shot', id: shot.id })}
              >
                {shot.order}. {shot.title}
              </div>
            ))}
          </div>
          <div className="tl-track">
            {placed.flatMap(({ shot, start }) =>
              shot.dialogueLineIds.map((id) => {
                const l = project.dialogue.find((d) => d.id === id);
                return l ? (
                  <div key={id} className="tl-clip dialogue" style={{ left: x(start), width: Math.max(4, x(shot.durationSec) - 2) }} onClick={() => select({ kind: 'line', id })} title={l.text}>
                    {charName(project, l.speakerId)} · {l.performance.emotion}
                  </div>
                ) : null;
              }),
            )}
          </div>
          <div className="tl-track">
            {placed.flatMap(({ shot, start }) => {
              if (!shot.dialogueLineIds.length) return [];
              const take = shot.takes.find((tk) => tk.id === shot.approvedTakeId) ?? shot.takes[shot.takes.length - 1];
              const has = !!take?.audioUri;
              return [
                <div key={shot.id} className={`tl-clip voice ${has ? '' : 'missing'}`} style={{ left: x(start), width: Math.max(4, x(shot.durationSec) - 2) }}>
                  {has ? 'voice track' : 'no voice yet'}
                </div>,
              ];
            })}
            {voClips.map(({ line, start, dur }) => (
              <div key={line.id} className="tl-clip voice missing" style={{ left: x(start), width: Math.max(4, x(dur) - 2) }} title={line.text} onClick={() => select({ kind: 'line', id: line.id })}>
                V.O. {charName(project, line.speakerId)} (no audio)
              </div>
            ))}
          </div>
          <div className="tl-track">
            {project.audioClips.filter((c) => c.track === 'music').map((c) => (
              <div key={c.id} className="tl-clip music" style={{ left: x(c.startSec), width: x(c.durationSec) }}>{c.name}</div>
            ))}
          </div>
          <div className="tl-track">
            {project.audioClips.filter((c) => c.track === 'sfx').map((c) => (
              <div key={c.id} className="tl-clip sfx" style={{ left: x(c.startSec), width: x(c.durationSec) }}>{c.name}</div>
            ))}
          </div>
          <div className="tl-track">
            {placed.flatMap(({ shot, start }) =>
              shot.dialogueLineIds.map((id) => {
                const l = project.dialogue.find((d) => d.id === id);
                return l ? <div key={id} className="tl-clip sub" style={{ left: x(start), width: Math.max(4, x(shot.durationSec) - 2) }}>{l.text}</div> : null;
              }),
            )}
          </div>
          <div className="tl-track">
            {placed.map(({ shot, start }) => {
              if (!shot.takes.length) return null;
              const st = shotStatus(shot);
              const take = shot.takes.find((tk) => tk.id === shot.approvedTakeId) ?? shot.takes[shot.takes.length - 1];
              return (
                <div
                  key={shot.id}
                  className={`tl-clip footage ${take.isPlaceholder ? 'placeholder' : ''} ${st === 'needs_repair' ? 'needs_repair' : ''}`}
                  style={{ left: x(start), width: Math.max(4, x(shot.durationSec) - 2) }}
                  onClick={() => select({ kind: 'shot', id: shot.id })}
                >
                  {take.isPlaceholder ? 'placeholder' : st.replace(/_/g, ' ')}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
