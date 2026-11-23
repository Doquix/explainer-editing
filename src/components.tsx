// Visual building blocks in the channel's ORIGINAL look (17-remotion-v2):
// white canvas, serif type, one red accent, soft shadow on sources,
// gentle 3-7% zoom, push transitions. Do not restyle here without a
// CREATIVE-DECISIONS entry: Luke rejected the Swiss redesign (C20).
import React from 'react';
import {AbsoluteFill, Easing, Freeze, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Media, Move, Style, Transition} from './types';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const ease = (n: number) => Easing.inOut(Easing.cubic)(Math.max(0, Math.min(1, n)));
export const progress = (frame: number, start: number, duration: number) =>
  Math.max(0, Math.min(1, (frame - start) / Math.max(1, duration)));
export const SHADOW = '0 12px 32px rgba(0,0,0,0.16)';

/** Offset for a push transition: incoming slides in during the first `push` frames. */
export const pushOffset = (t: Transition, frame: number, push: number, width: number, height: number) => {
  if (t === 'cut') return {x: 0, y: 0};
  const left = 1 - ease(frame / push);
  switch (t) {
    case 'pushLeft': return {x: width * left, y: 0};
    case 'pushRight': return {x: -width * left, y: 0};
    case 'pushUp': return {x: 0, y: height * left};
    case 'pushDown': return {x: 0, y: -height * left};
  }
};

/** Slow move over the whole beat. Short beats move less, like the original edit. */
export const moveTransform = (move: Move, frame: number, duration: number, fps: number) => {
  const seconds = duration / fps;
  const amount = seconds < 2.5 ? 0.03 : seconds < 4.5 ? 0.05 : 0.07;
  const p = progress(frame, 0, duration);
  switch (move) {
    case 'zoomIn': return `scale(${1 + amount * p})`;
    case 'zoomOut': return `scale(${1 + amount * (1 - p)})`;
    case 'panLeft': return `scale(${1 + amount}) translateX(${interpolate(p, [0, 1], [30, -30])}px)`;
    case 'panRight': return `scale(${1 + amount}) translateX(${interpolate(p, [0, 1], [-30, 30])}px)`;
    default: return 'none';
  }
};

/** A missing asset. Deliberately loud so a draft can never pass as final. */
const Placeholder: React.FC<{media: Media; style: Style}> = ({media, style}) => (
  <div style={{width: '100%', height: '100%', boxSizing: 'border-box', border: `6px dashed ${style.accent}`, background: '#f4f4f4',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center'}}>
    <div style={{fontFamily: 'monospace', fontSize: 30, color: style.accent, letterSpacing: 2}}>MISSING {media.kind.toUpperCase()}</div>
    <div style={{fontSize: 34, marginTop: 18, lineHeight: 1.25, color: '#333', maxWidth: '92%'}}>{media.request}</div>
  </div>
);

export const MediaBox: React.FC<{media: Media; style: Style; frame: number}> = ({media, style, frame}) => {
  if (!media.src) return <Placeholder media={media} style={style}/>;
  if (media.kind === 'video') {
    const last = Math.max(0, (media.sourceFrames ?? Number.MAX_SAFE_INTEGER) - 1);
    return <Freeze frame={Math.min(frame, last)}>
      <OffthreadVideo src={staticFile(media.src)} startFrom={media.startFrom ?? 0} muted style={{width: '100%', height: '100%', objectFit: 'contain'}}/>
    </Freeze>;
  }
  return <Img src={staticFile(media.src)} style={{width: '100%', height: '100%', objectFit: 'contain'}}/>;
};

export const SourceShot: React.FC<{media: Media; move: Move; style: Style; duration: number}> = ({media, move, style, duration}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const isVideo = media.kind === 'video' && media.src;
  return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
    <div style={{width: media.w, height: media.h, position: 'relative', overflow: 'hidden',
      transform: isVideo ? 'none' : moveTransform(move, frame, duration, fps), boxShadow: isVideo ? undefined : SHADOW}}>
      <MediaBox media={media} style={style} frame={frame}/>
    </div>
    {media.credit && <div style={{position: 'absolute', top: 960, width: '100%', textAlign: 'center', fontSize: 30, color: style.text}}>{media.credit}</div>}
  </AbsoluteFill>;
};

export const Arrow: React.FC<{x1: number; y1: number; x2: number; y2: number; p: number; color: string; stroke?: number}> = ({x1, y1, x2, y2, p, color, stroke = 6}) => {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 26;
  const a1 = angle + Math.PI * 0.82, a2 = angle - Math.PI * 0.82;
  const d = `M${x1} ${y1} L${x2} ${y2} M${x2 + head * Math.cos(a1)} ${y2 + head * Math.sin(a1)} L${x2} ${y2} L${x2 + head * Math.cos(a2)} ${y2 + head * Math.sin(a2)}`;
  return <svg style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}} width={1} height={1}>
    <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p}/>
  </svg>;
};

/** Two sources side by side, arrow drawn between them, labels under each (the "needs powers / won't share control" graphic). */
export const Compare: React.FC<{left: Media & {label: string}; right: Media & {label: string}; revealRightAt?: number; style: Style; duration: number}> =
({left, right, revealRightAt, style, duration}) => {
  const frame = useCurrentFrame();
  const p = ease(frame / 15);
  const slow = 1 + 0.05 * progress(frame, 0, duration);
  const reveal = revealRightAt ?? 10;
  const rightP = ease(progress(frame, reveal, 12));
  const box = (m: Media, side: 'left' | 'right', o: number) => {
    const w = Math.min(m.w, 600), h = Math.min(m.h, 560);
    return <div style={{position: 'absolute', [side]: 250, top: 190, width: 620, height: 580, display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `translateX(${(side === 'left' ? -35 : 35) * (1 - o)}px) scale(${slow})`, opacity: o}}>
      <div style={{width: w, height: h, boxShadow: m.src ? SHADOW : undefined}}><MediaBox media={{...m, w, h}} style={style} frame={frame}/></div>
    </div>;
  };
  return <AbsoluteFill>
    {box(left, 'left', p)}
    {box(right, 'right', rightP)}
    <Arrow x1={890} y1={480} x2={1030} y2={480} p={progress(frame, 8, 22)} color={style.accent}/>
    <div style={{position: 'absolute', left: 250, top: 800, width: 620, textAlign: 'center', fontSize: 51, opacity: p}}>{left.label}</div>
    <div style={{position: 'absolute', right: 250, top: 800, width: 620, textAlign: 'center', fontSize: 51, opacity: rightP}}>{right.label}</div>
  </AbsoluteFill>;
};

/** Short editorial punch on the white page: big line, red rule, optional second line. */
export const Keyword: React.FC<{text: string; sub?: string; subAt?: number; style: Style}> = ({text, sub, subAt, style}) => {
  const frame = useCurrentFrame();
  const at = subAt ?? 22;
  return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
    <div style={{width: 1300, textAlign: 'center'}}>
      <div style={{fontSize: text.length > 40 ? 64 : 84, lineHeight: 1.1, transform: `translateY(${22 * (1 - ease(frame / 10))}px)`, opacity: progress(frame, 0, 8)}}>{text}</div>
      <div style={{height: 5, background: style.accent, width: interpolate(frame, [5, 23], [0, 440], clamp), margin: '30px auto 0'}}/>
      {sub && <div style={{fontSize: 46, marginTop: 30, lineHeight: 1.2, opacity: progress(frame, at, 10), transform: `translateY(${14 * (1 - ease((frame - at) / 10))}px)`}}>{sub}</div>}
    </div>
  </AbsoluteFill>;
};

/** Entry heading, e.g. "#2  Doom Weaponized A Wedding Guest List". Plain white spoken heading, as in the original opening. */
export const TitleCard: React.FC<{number?: string; text: string; style: Style}> = ({number, text, style}) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
    <div style={{width: 1400, textAlign: 'center'}}>
      {number && <div style={{fontSize: 150, color: style.accent, opacity: progress(frame, 0, 8), transform: `scale(${0.94 + 0.06 * ease(frame / 10)})`}}>{number}</div>}
      <div style={{fontSize: 78, lineHeight: 1.12, marginTop: 12, opacity: progress(frame, 4, 10), transform: `translateY(${20 * (1 - ease((frame - 4) / 12))}px)`}}>{text}</div>
    </div>
  </AbsoluteFill>;
};

export const Circle: React.FC<{x: number; y: number; d: number; color: string}> = ({x, y, d, color}) => {
  const p = ease(useCurrentFrame() / 7);
  return <svg style={{position: 'absolute', left: x - d / 2, top: y - d / 2, overflow: 'visible'}} width={d} height={d}>
    <circle cx={d / 2} cy={d / 2} r={d / 2 - 5} stroke={color} strokeWidth={6} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p}/>
  </svg>;
};
