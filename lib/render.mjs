// Bundle the generic composition once per job and render stills or the MP4.
// The job folder is the Remotion public dir, so edl.json paths are job relative.
import {bundle} from '@remotion/bundler';
import {renderMedia, renderStill, selectComposition} from '@remotion/renderer';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const setup = async (jobDir, edl) => {
  const serveUrl = await bundle({
    entryPoint: path.join(root, 'src', 'index.ts'),
    publicDir: jobDir,
    // Must live OUTSIDE the job folder: the job folder is copied into the bundle as public assets.
    outDir: path.join(root, '.cache', 'bundle-' + createHash('sha1').update(jobDir).digest('hex').slice(0, 10)),
  });
  // Set REMOTION_BROWSER_EXECUTABLE to reuse an installed Chrome; otherwise Remotion downloads its headless shell once.
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  const common = {serveUrl, browserExecutable, chromiumOptions: {gl: process.env.REMOTION_GL || 'angle'}, logLevel: 'error', inputProps: {edl}};
  const composition = await selectComposition({...common, id: 'Explainer'});
  return {common, composition};
};

export const renderStills = async (jobDir, edl, frames, outDir) => {
  const {common, composition} = await setup(jobDir, edl);
  await mkdir(outDir, {recursive: true});
  const files = [];
  for (const [i, f] of frames.entries()) {
    const frame = Math.max(0, Math.min(composition.durationInFrames - 1, f));
    const output = path.join(outDir, `frame-${String(i).padStart(3, '0')}-${String(frame).padStart(5, '0')}.png`);
    await renderStill({...common, composition, frame, output, imageFormat: 'png'});
    files.push({frame, seconds: +(frame / composition.fps).toFixed(2), file: path.basename(output)});
  }
  return files;
};

export const renderVideo = async (jobDir, edl, output, {concurrency} = {}) => {
  const {common, composition} = await setup(jobDir, edl);
  await mkdir(path.dirname(output), {recursive: true});
  let last = -1;
  await renderMedia({
    ...common, composition, codec: 'h264', audioCodec: 'aac', pixelFormat: 'yuv420p', crf: 18,
    x264Preset: 'veryfast', concurrency: concurrency ?? null, offthreadVideoCacheSizeInBytes: 256 * 1024 * 1024,
    outputLocation: output,
    onProgress: ({progress}) => {
      const pct = Math.floor(progress * 20) * 5;
      if (pct > last) { last = pct; process.stdout.write(`\rRender ${pct}%`); }
    },
  });
  process.stdout.write('\n');
};
