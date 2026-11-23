import React from 'react';
import {AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Arrow, Circle, Compare, ease, Keyword, progress, pushOffset, SourceShot, TitleCard} from './components';
import type {Beat, Caption, EDL, Music, Transition} from './types';

const outgoingOffset = (t: Transition, p: number, width: number, height: number) => {
  switch (t) {
    case 'pushLeft': return {x: -width * p, y: 0};
    case 'pushRight': return {x: width * p, y: 0};
    case 'pushUp': return {x: 0, y: -height * p};
    case 'pushDown': return {x: 0, y: height * p};
    default: return {x: 0, y: 0};
  }
};

const BeatView: React.FC<{beat: Beat; next?: Beat; edl: EDL}> = ({beat, next, edl}) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const duration = beat.to - beat.from;
  const push = edl.style.pushFrames;
  const incoming = pushOffset(beat.transitionIn, frame, push, width, height);
  const outgoing = next && next.transitionIn !== 'cut' && frame >= duration
    ? outgoingOffset(next.transitionIn, ease((frame - duration) / push), width, height) : {x: 0, y: 0};
  const v = beat.visual;
  return <AbsoluteFill style={{transform: `translate(${incoming.x + outgoing.x}px, ${incoming.y + outgoing.y}px)`}}>
    {v.type === 'source' && <SourceShot media={v.media} move={v.move} style={edl.style} duration={duration}/>}
    {v.type === 'compare' && <Compare left={v.left} right={v.right} revealRightAt={v.revealRightAt} style={edl.style} duration={duration}/>}
    {v.type === 'keyword' && <Keyword text={v.text} sub={v.sub} subAt={v.subAt} style={edl.style}/>}
    {v.type === 'title' && <TitleCard number={v.number} text={v.text} style={edl.style}/>}
  </AbsoluteFill>;
};

/** Music sits under the voice: full level in gaps, ducked while anyone is speaking. */
export const musicVolume = (frame: number, music: Music, speech: [number, number][], total: number) => {
  let nearest = Infinity;
  for (const [a, b] of speech) {
    if (frame >= a && frame <= b) { nearest = 0; break; }
    nearest = Math.min(nearest, frame < a ? a - frame : frame - b);
  }
  const duck = interpolate(nearest, [0, music.rampFrames], [music.duckedVolume, music.volume], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fade = Math.min(progress(frame, 0, 15), progress(total - frame, 0, 30));
  return duck * fade;
};

const Captions: React.FC<{caption: Caption; edl: EDL}> = ({caption, edl}) => {
  const frame = useCurrentFrame() + caption.from;
  return <div style={{position: 'absolute', bottom: 54, width: '100%', display: 'flex', justifyContent: 'center'}}>
    <div style={{background: 'rgba(255,255,255,0.92)', padding: '10px 26px', borderRadius: 8, fontSize: 46, lineHeight: 1.2, maxWidth: 1500, textAlign: 'center'}}>
      {caption.words.map((w, i) => <span key={i} style={{color: frame >= w.from && frame < w.to ? edl.style.accent : edl.style.text}}>{w.text}{i < caption.words.length - 1 ? ' ' : ''}</span>)}
    </div>
  </div>;
};

export const Explainer: React.FC<{edl: EDL}> = ({edl}) => {
  const {style} = edl;
  return <AbsoluteFill style={{background: style.background, color: style.text, fontFamily: style.fontFamily, overflow: 'hidden'}}>
    <Audio src={staticFile(edl.narration)}/>
    {edl.music && <Audio src={staticFile(edl.music.src)} loop volume={(f) => musicVolume(f, edl.music!, edl.speech, edl.durationInFrames)}/>}
    {edl.sfx.map((s, i) => <Sequence key={`sfx-${i}`} from={s.frame} layout="none"><Audio src={staticFile(s.src)} volume={s.volume}/></Sequence>)}
    {edl.beats.map((b, i) => {
      const next = edl.beats[i + 1];
      const tail = next && next.transitionIn !== 'cut' ? style.pushFrames : 0;
      return <Sequence key={b.id} from={b.from} durationInFrames={b.to - b.from + tail}><BeatView beat={b} next={next} edl={edl}/></Sequence>;
    })}
    {edl.overlays.map((o, i) => <Sequence key={`ov-${i}`} from={o.from} durationInFrames={Math.max(1, o.to - o.from)}>
      {o.type === 'circle' && <Circle x={o.x} y={o.y} d={o.d} color={style.accent}/>}
      {o.type === 'arrow' && <ArrowOverlay {...o} color={style.accent}/>}
      {o.type === 'label' && <div style={{position: 'absolute', [o.position === 'top' ? 'top' : 'bottom']: 70, width: '100%', textAlign: 'center', fontSize: 34}}>{o.text}</div>}
    </Sequence>)}
    {style.captions === 'burned' && edl.captions.map((c, i) => <Sequence key={`cap-${i}`} from={c.from} durationInFrames={Math.max(1, c.to - c.from)}><Captions caption={c} edl={edl}/></Sequence>)}
  </AbsoluteFill>;
};

const ArrowOverlay: React.FC<{x1: number; y1: number; x2: number; y2: number; color: string}> = (a) => {
  const frame = useCurrentFrame();
  return <Arrow {...a} p={progress(frame, 0, 14)}/>;
};
