import React from 'react';
import {Composition} from 'remotion';
import {Explainer} from './Explainer';
import {defaultStyle, type EDL} from './types';

// Studio fallback so `npm run studio` opens without a job. Real renders pass the job's edl.json as props.
const empty: EDL = {
  version: 1, fps: 30, width: 1920, height: 1080, durationInFrames: 90, narration: 'narration.wav',
  style: defaultStyle, music: null, speech: [], overlays: [], sfx: [], captions: [],
  beats: [{id: 'b01', from: 0, to: 90, transitionIn: 'cut', visual: {type: 'title', number: '1', text: 'Pass a job edl.json as props'}}],
};

export const Root: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    defaultProps={{edl: empty}}
    durationInFrames={90}
    fps={30}
    width={1920}
    height={1080}
    calculateMetadata={({props}) => ({
      durationInFrames: props.edl.durationInFrames,
      fps: props.edl.fps,
      width: props.edl.width,
      height: props.edl.height,
    })}
  />
);
