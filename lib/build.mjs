// Resolve plan.json (word anchored) + timing.json + assets.json into edl.json
// (frame accurate render props). Pure except for probing asset files.
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync} from 'node:fs';
import path from 'node:path';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
const LEAD = 0.08;                 // cut slightly before the anchor word starts
const MAX_W = 1440, MAX_H = 800;   // ~75% frame width, like the references
const PLACEHOLDER = {w: 1200, h: 675};
const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO = new Set(['.mp4', '.mov', '.webm', '.m4v']);

export const defaultStyle = {
  background: '#ffffff', text: '#111111', accent: '#d81920',
  fontFamily: '"Times New Roman", Georgia, serif', captions: 'off', pushFrames: 12,
};

export const probe = (file) => {
  const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {encoding: 'utf8'}));
  const v = out.streams.find((s) => s.codec_type === 'video');
  return {width: v?.width, height: v?.height, duration: Number(out.format?.duration ?? v?.duration ?? 0)};
};

export const fit = (w, h, maxW = MAX_W, maxH = MAX_H) => {
  const s = Math.min(maxW / w, maxH / h);
  return {w: Math.round(w * s), h: Math.round(h * s)};
};

const findAssetFile = (jobDir, request) => {
  if (request?.file) return existsSync(path.join(jobDir, request.file)) ? request.file : null;
  const dir = path.join(jobDir, 'assets');
  if (!existsSync(dir)) return null;
  const hit = readdirSync(dir).find((f) => path.parse(f).name === request.id && (IMAGE.has(path.extname(f).toLowerCase()) || VIDEO.has(path.extname(f).toLowerCase())));
  return hit ? `assets/${hit}` : null;
};

export const resolveMedia = (jobDir, requests, ref, extra = {}, probeFn = probe) => {
  const request = requests.find((r) => r.id === ref) ?? {id: ref, need: `asset "${ref}" (not in assets.json)`};
  const file = findAssetFile(jobDir, request);
  if (!file) return {src: null, kind: 'image', request: request.need, ...PLACEHOLDER, ...extra};
  const ext = path.extname(file).toLowerCase();
  const kind = VIDEO.has(ext) ? 'video' : 'image';
  const info = probeFn(path.join(jobDir, file));
  const size = info.width ? fit(info.width, info.height) : PLACEHOLDER;
  const media = {src: file.split(path.sep).join('/'), kind, request: request.need, ...size, ...extra};
  if (request.credit) media.credit = request.credit;
  if (kind === 'video') media.sourceFrames = Math.max(1, Math.floor(info.duration * FPS) - (extra.startFrom ?? 0));
  return media;
};

const wordFrame = (words, i, lead = LEAD) => {
  if (i <= 0) return 0;
  if (i >= words.length) throw new Error(`Word index ${i} is past the end of the script (${words.length} words).`);
  return Math.max(0, Math.round((words[i].start - lead) * FPS));
};

/** Chunk words into caption lines: break on punctuation, at most 6 words / 2.8 s. */
export const captionChunks = (words) => {
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) chunks.push(cur); cur = []; };
  words.forEach((w) => {
    cur.push(w);
    const long = cur.length >= 6 || w.end - cur[0].start > 2.8;
    if (/[.,;:!?—]["”’)]?$/.test(w.word) || long) flush();
  });
  flush();
  return chunks;
};

export const toSrt = (words) => {
  const t = (s) => {
    const ms = Math.round(s * 1000);
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return captionChunks(words).map((c, i) => `${i + 1}\n${t(c[0].start)} --> ${t(c[c.length - 1].end)}\n${c.map((w) => w.word).join(' ')}\n`).join('\n');
};

/** Merge spoken words into regions (frames) for music ducking. */
export const speechRegions = (words, gap = 0.35) => {
  const out = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && w.start - last[1] <= gap) last[1] = w.end;
    else out.push([w.start, w.end]);
  }
  return out.map(([a, b]) => [Math.round(a * FPS), Math.round(b * FPS)]);
};

const at = (words, o, key) => {
  if (o[`${key}Word`] !== undefined) return wordFrame(words, o[`${key}Word`], 0);
  if (o[`${key}Seconds`] !== undefined) return Math.round(o[`${key}Seconds`] * FPS);
  throw new Error(`Overlay needs ${key}Word or ${key}Seconds: ${JSON.stringify(o)}`);
};

export const buildEdl = ({jobDir, plan, timing, assets, durationSeconds, probeFn = probe}) => {
  const words = timing.words;
  const requests = assets?.requests ?? [];
  const warnings = [];
  const durationInFrames = Math.ceil(durationSeconds * FPS);
  const style = {...defaultStyle, ...(plan.style?.captions ? {captions: plan.style.captions} : {})};
  const sorted = [...plan.beats].sort((a, b) => a.fromWord - b.fromWord);
  if (sorted[0]?.fromWord !== 0) warnings.push('First beat does not start at word 0; it was moved to frame 0.');

  const beats = sorted.map((b, i) => {
    const from = i === 0 ? 0 : wordFrame(words, b.fromWord);
    const to = i + 1 < sorted.length ? wordFrame(words, sorted[i + 1].fromWord) : durationInFrames;
    const v = b.visual;
    let visual;
    if (v.type === 'source') visual = {type: 'source', move: v.move ?? 'zoomIn', media: resolveMedia(jobDir, requests, v.asset, v.startFrom ? {startFrom: v.startFrom} : {}, probeFn)};
    else if (v.type === 'compare') {
      visual = {type: 'compare', left: resolveMedia(jobDir, requests, v.left.asset, {label: v.left.label}, probeFn), right: resolveMedia(jobDir, requests, v.right.asset, {label: v.right.label}, probeFn)};
      if (v.revealRightAtWord !== undefined) visual.revealRightAt = Math.max(0, wordFrame(words, v.revealRightAtWord, 0) - from);
    } else if (v.type === 'keyword') {
      visual = {type: 'keyword', text: v.text};
      if (v.sub) visual.sub = v.sub;
      if (v.subAtWord !== undefined) visual.subAt = Math.max(0, wordFrame(words, v.subAtWord, 0) - from);
    } else if (v.type === 'title') visual = {type: 'title', text: v.text, ...(v.number ? {number: v.number} : {})};
    else throw new Error(`Unknown visual type "${v.type}" in beat ${b.id}`);
    if (to - from < 1) throw new Error(`Beat ${b.id} has no duration; two beats share an anchor word.`);
    const secs = (to - from) / FPS;
    if (secs > 7.5) warnings.push(`Beat ${b.id} runs ${secs.toFixed(1)} s; consider splitting it.`);
    if (secs < 1) warnings.push(`Beat ${b.id} is only ${secs.toFixed(2)} s.`);
    return {id: b.id, from, to, transitionIn: i === 0 ? 'cut' : (b.transitionIn ?? 'cut'), visual};
  });

  const overlays = (plan.overlays ?? []).map((o) => ({...o, from: at(words, o, 'from'), to: at(words, o, 'to')}))
    .map(({fromWord, toWord, fromSeconds, toSeconds, ...o}) => o);

  const sfx = [];
  const s = plan.style?.sfx ?? {};
  const has = (f) => f && existsSync(path.join(jobDir, f));
  for (const [k, f] of Object.entries(s)) if (f && !has(f)) warnings.push(`SFX ${k} file not found: ${f}`);
  if (has(s.whoosh)) beats.filter((b) => b.transitionIn !== 'cut').forEach((b) => sfx.push({src: s.whoosh, frame: Math.max(0, b.from - 3), volume: s.whooshVolume ?? 0.35}));
  if (has(s.pop)) {
    beats.filter((b) => b.visual.type === 'keyword' || b.visual.type === 'title').forEach((b) => sfx.push({src: s.pop, frame: b.from + 2, volume: s.popVolume ?? 0.4}));
    overlays.filter((o) => o.type === 'circle').forEach((o) => sfx.push({src: s.pop, frame: o.from, volume: s.popVolume ?? 0.4}));
  }

  let music = null;
  const m = plan.style?.music;
  if (m?.file) {
    if (has(m.file)) music = {src: m.file, volume: m.volume ?? 0.12, duckedVolume: m.duckedVolume ?? 0.035, rampFrames: m.rampFrames ?? 9};
    else warnings.push(`Music file not found: ${m.file} (rendering without music).`);
  }

  if (style.captions === 'burned' && timing.method === 'estimate') warnings.push('Captions are burned in but word timings are ESTIMATED; install faster-whisper and re-run prepare before publishing.');

  const captions = captionChunks(words).map((c) => ({
    from: Math.round(c[0].start * FPS), to: Math.round(c[c.length - 1].end * FPS),
    words: c.map((w) => ({text: w.word, from: Math.round(w.start * FPS), to: Math.round(w.end * FPS)})),
  }));

  const placeholders = beats.flatMap((b) => b.visual.type === 'source' ? [b.visual.media] : b.visual.type === 'compare' ? [b.visual.left, b.visual.right] : [])
    .filter((m) => !m.src).length;

  const edl = {version: 1, fps: FPS, width: WIDTH, height: HEIGHT, durationInFrames, narration: 'narration.wav', style, music,
    speech: speechRegions(words), beats, overlays, sfx: sfx.sort((a, b) => a.frame - b.frame), captions};
  return {edl, warnings, placeholders};
};
