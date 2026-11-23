#!/usr/bin/env node
// explainer: render stage for the topic → script → VO pipeline.
//
//   explainer prepare --input <editing-inputs/JOB> --segment N --out <jobDir>
//   explainer plan    <jobDir> [--force]      draft plan.json + assets.json (never overwrites edits without --force)
//   explainer assets  <jobDir>                which asset requests are still missing
//   explainer build   <jobDir>                plan → edl.json (+ out/segment.srt)
//   explainer review  <jobDir>                still per beat + contact sheet in out/review
//   explainer render  <jobDir> [--draft]      MP4, mastered to −14 LUFS; refuses placeholders unless --draft
//   explainer verify  <jobDir>                technical checks → out/verification.json
//   explainer run     --input … --segment N --out <jobDir> [--draft]   all of the above in order
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {draftPlan} from '../lib/plan.mjs';
import {buildEdl, toSrt} from '../lib/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const write = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2) + '\n');

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const VALUE_FLAGS = new Set(['--input', '--segment', '--out', '--align']);
const positional = () => args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]));

const stage = (jobDir, name, info) => {
  const f = path.join(jobDir, 'job.json');
  const job = existsSync(f) ? read(f) : {stages: {}};
  job.stages = {...job.stages, [name]: {...info, at: new Date().toISOString()}};
  write(f, job);
};

const segName = (jobDir) => {
  const job = existsSync(path.join(jobDir, 'job.json')) ? read(path.join(jobDir, 'job.json')) : {};
  return `segment-${String(job.segment ?? 1).padStart(2, '0')}`;
};

const prepare = (input, segment, out) => {
  const r = spawnSync(PY, [path.join(root, 'pipeline', 'prepare.py'), '--input', input, '--segment', String(segment), '--out', out, ...(opt('align') ? ['--align', opt('align')] : [])], {stdio: 'inherit'});
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const plan = (jobDir) => {
  const planFile = path.join(jobDir, 'plan.json');
  if (existsSync(planFile) && !flag('force')) { console.log('plan.json exists; keeping your edits (use --force to redraft).'); return; }
  const job = read(path.join(jobDir, 'job.json'));
  const timing = read(path.join(jobDir, 'timing.json'));
  const {plan: p, assets} = draftPlan({words: timing.words, segment: job.segment, topic: job.topic});
  write(planFile, p);
  const assetFile = path.join(jobDir, 'assets.json');
  if (existsSync(assetFile)) {
    // Keep sourcing work already recorded for requests that still exist.
    const old = Object.fromEntries(read(assetFile).requests.map((r) => [r.id, r]));
    assets.requests = assets.requests.map((r) => old[r.id] ? {...r, file: old[r.id].file, source_url: old[r.id].source_url, credit: old[r.id].credit, rights: old[r.id].rights} : r);
  }
  write(assetFile, assets);
  stage(jobDir, 'plan', {beats: p.beats.length, requests: assets.requests.length});
  console.log(`Drafted ${p.beats.length} beats and ${assets.requests.length} asset requests.`);
};

const build = (jobDir) => {
  const edits = read(path.join(jobDir, 'audio-edits.json'));
  const timing = read(path.join(jobDir, 'timing.json'));
  const {edl, warnings, placeholders} = buildEdl({jobDir, plan: read(path.join(jobDir, 'plan.json')), timing,
    assets: existsSync(path.join(jobDir, 'assets.json')) ? read(path.join(jobDir, 'assets.json')) : {requests: []}, durationSeconds: edits.edited_duration});
  write(path.join(jobDir, 'edl.json'), edl);
  mkdirSync(path.join(jobDir, 'out'), {recursive: true});
  writeFileSync(path.join(jobDir, 'out', `${segName(jobDir)}.srt`), toSrt(timing.words));
  warnings.forEach((w) => console.warn(`warning: ${w}`));
  stage(jobDir, 'build', {beats: edl.beats.length, frames: edl.durationInFrames, placeholders, warnings});
  console.log(`edl.json: ${edl.beats.length} beats, ${(edl.durationInFrames / edl.fps).toFixed(2)} s, ${placeholders} missing asset(s).`);
  return {edl, placeholders};
};

const assetsStatus = (jobDir) => {
  const {requests} = read(path.join(jobDir, 'assets.json'));
  const files = existsSync(path.join(jobDir, 'assets')) ? readdirSync(path.join(jobDir, 'assets')) : [];
  let missing = 0;
  for (const r of requests) {
    const file = r.file ?? files.find((f) => path.parse(f).name === r.id);
    if (!file) missing++;
    console.log(`${file ? 'ok     ' : 'MISSING'} ${r.id} ${String(r.seconds).padStart(4)}s  ${file ?? r.need.slice(0, 70)}${file && !r.source_url ? '  (no source_url recorded)' : ''}`);
    if (!file && r.hints.length) console.log(`        search: ${r.hints.join(' | ')}`);
  }
  console.log(`${requests.length - missing}/${requests.length} assets present.`);
  return missing;
};

const review = async (jobDir) => {
  const {renderStills} = await import('../lib/render.mjs');
  const edl = read(path.join(jobDir, 'edl.json'));
  const frames = edl.beats.map((b) => Math.round((b.from + b.to) / 2));
  const outDir = path.join(jobDir, 'out', 'review');
  const files = await renderStills(jobDir, edl, frames, outDir);
  write(path.join(outDir, 'manifest.json'), files);
  const cols = 5, rows = Math.ceil(files.length / cols);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(outDir, 'frame-*.png'), '-vf', `scale=480:-1,tile=${cols}x${rows}:padding=6:color=gray`, '-frames:v', '1', path.join(jobDir, 'out', 'review-sheet.jpg')], {stdio: 'inherit'});
  console.log(`Review stills: ${files.length} → out/review-sheet.jpg`);
};

const render = async (jobDir) => {
  const {edl, placeholders} = build(jobDir);
  const draft = flag('draft');
  if (placeholders && !draft) {
    console.error(`${placeholders} asset(s) missing. Supply them (explainer assets ${jobDir}) or render a draft with --draft.`);
    process.exit(2);
  }
  const {renderVideo} = await import('../lib/render.mjs');
  const name = segName(jobDir) + (draft ? '-draft' : '');
  const raw = path.join(jobDir, 'out', `${name}-raw.mp4`);
  await renderVideo(jobDir, edl, raw);
  // Master to −14 LUFS, video copied untouched; the raw render is kept.
  const final = path.join(jobDir, 'out', `${name}.mp4`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', final], {stdio: 'inherit'});
  if (r.status !== 0) process.exit(1);
  stage(jobDir, 'render', {output: path.basename(final), draft, placeholders});
  console.log(`Rendered ${path.relative(process.cwd(), final)}`);
  return final;
};

const verify = (jobDir, video) => {
  const file = video ?? path.join(jobDir, 'out', read(path.join(jobDir, 'job.json')).stages.render.output);
  const r = spawnSync(PY, [path.join(root, 'pipeline', 'verify.py'), jobDir, file], {stdio: 'inherit'});
  stage(jobDir, 'verify', {pass: r.status === 0});
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const need = (v, m) => { if (!v) { console.error(m); process.exit(1); } return v; };
const job = () => path.resolve(need(positional(), 'job folder required'));

switch (cmd) {
  case 'prepare': prepare(need(opt('input'), '--input required'), need(opt('segment'), '--segment required'), need(opt('out'), '--out required')); break;
  case 'plan': plan(job()); break;
  case 'assets': process.exit(assetsStatus(job()) ? 2 : 0);
  case 'build': build(job()); break;
  case 'review': await review(job()); break;
  case 'render': await render(job()); break;
  case 'verify': verify(job()); break;
  case 'run': {
    const out = path.resolve(need(opt('out'), '--out required'));
    prepare(need(opt('input'), '--input required'), need(opt('segment'), '--segment required'), out);
    plan(out);
    const missing = assetsStatus(out);
    if (missing && !flag('draft')) { console.error(`\nStopped: ${missing} asset(s) to supply. Add files to ${path.join(out, 'assets')} and run "explainer render ${out}", or use --draft.`); process.exit(2); }
    await review(out);
    await render(out);
    verify(out);
    break;
  }
  default:
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 12).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}
