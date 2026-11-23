// Render props for one segment: the resolved edit decision list (EDL).
// Produced by `explainer build` from plan.json + timing.json + assets.json.
// All times here are frames on the tightened narration timeline.

export type Transition = 'cut' | 'pushLeft' | 'pushRight' | 'pushUp' | 'pushDown';
export type Move = 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'none';

export type Media = {
  /** Path relative to the job folder, e.g. "assets/b03.jpg". Null when the asset is still missing. */
  src: string | null;
  kind: 'image' | 'video';
  /** What this asset should show. Rendered on the placeholder while src is null. */
  request: string;
  /** Short on-screen context label, e.g. "Character footage: Fantastic Four (1994)". */
  credit?: string;
  /** Video only: first source frame to play. */
  startFrom?: number;
  /** Video only: number of usable source frames; the last one is held if the beat runs longer. */
  sourceFrames?: number;
  /** Fitted on-screen size in px, computed by `explainer build` from the real file. */
  w: number;
  h: number;
};

export type Visual =
  | {type: 'source'; media: Media; move: Move}
  | {type: 'compare'; left: Media & {label: string}; right: Media & {label: string}; revealRightAt?: number}
  | {type: 'keyword'; text: string; sub?: string; subAt?: number}
  | {type: 'title'; number?: string; text: string};

export type Beat = {
  id: string;
  from: number;
  to: number;
  transitionIn: Transition;
  visual: Visual;
};

export type Overlay =
  | {type: 'circle'; from: number; to: number; x: number; y: number; d: number}
  | {type: 'arrow'; from: number; to: number; x1: number; y1: number; x2: number; y2: number}
  | {type: 'label'; from: number; to: number; text: string; position?: 'top' | 'bottom'};

export type Caption = {from: number; to: number; words: {text: string; from: number; to: number}[]};

export type Style = {
  background: string;
  text: string;
  accent: string;
  fontFamily: string;
  /** Burned in captions. Off by default: SOP rule 9 (sidecar SRT is always written). */
  captions: 'off' | 'burned';
  pushFrames: number;
};

export type Music = {src: string; volume: number; duckedVolume: number; rampFrames: number};
export type Sfx = {src: string; frame: number; volume: number};

export type EDL = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  narration: string;
  style: Style;
  music: Music | null;
  /** Merged spoken regions, used for music ducking. */
  speech: [number, number][];
  beats: Beat[];
  overlays: Overlay[];
  sfx: Sfx[];
  captions: Caption[];
};

export const defaultStyle: Style = {
  background: '#ffffff',
  text: '#111111',
  accent: '#d81920',
  fontFamily: '"Times New Roman", Georgia, serif',
  captions: 'off',
  pushFrames: 12,
};
