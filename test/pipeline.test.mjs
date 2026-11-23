import test from 'node:test';
import assert from 'node:assert/strict';
import {draftPlan, searchHints, sentences, MAX_BEAT} from '../lib/plan.mjs';
import {buildEdl, captionChunks, fit, speechRegions, toSrt} from '../lib/build.mjs';

// Fake timings: each word 0.3 s, a 0.5 s gap after sentence ends.
const timed = (text) => {
  let t = 0;
  return text.split(/\s+/).map((word) => {
    const w = {word, start: +t.toFixed(3), end: +(t + 0.28).toFixed(3)};
    t += /[.!?]$/.test(word) ? 0.8 : 0.3;
    return w;
  });
};

const SCRIPT = 'Doom Weaponized A Wedding Guest List. Reed Richards and Sue Storm’s wedding already has enough security to look like a summit meeting. Avengers, X-Men, and agents of S.H.I.E.L.D. are there. Doctor Doom still decides the ceremony needs more guests: virtually every villain he can stir into a fight, because a wedding gives him a public moment when they are surrounded by friends, family, and cameras. He could not stop the vows; he could only make the guests forget.';

test('sentence split ignores acronym periods followed by lowercase', () => {
  const words = timed('Agents of S.H.I.E.L.D. are there. Dr. Doom waits.');
  const s = sentences(words).map((r) => words.slice(r.from, r.to).map((w) => w.word).join(' '));
  assert.deepEqual(s, ['Agents of S.H.I.E.L.D. are there.', 'Dr. Doom waits.']);
});

test('search hints keep multi word names and drop lone sentence openers', () => {
  const words = timed('Reed Richards and Sue Storm’s wedding. In Fantastic Four Annual issue three, Doom acts.');
  const hints = searchHints(words, {from: 0, to: words.length});
  assert.ok(hints.includes('Reed Richards and Sue Storm'));
  assert.ok(hints.includes('Fantastic Four Annual'));
  assert.ok(!hints.includes('In Fantastic Four Annual'));
});

test('draft plan: title first, beats within pacing, verdict keyword last', () => {
  const words = timed(SCRIPT);
  const {plan, assets} = draftPlan({words, segment: 2, topic: 'Doom'});
  assert.equal(plan.beats[0].visual.type, 'title');
  assert.equal(plan.beats[0].visual.number, '2');
  const last = plan.beats.at(-1);
  assert.equal(last.visual.type, 'keyword');
  assert.equal(last.visual.sub, 'He could only make the guests forget.');
  const anchors = plan.beats.map((b) => b.fromWord);
  assert.deepEqual(anchors, [...anchors].sort((a, b) => a - b), 'beats are in word order');
  assert.equal(new Set(anchors).size, anchors.length, 'no two beats share an anchor word');
  for (const r of assets.requests) assert.ok(r.seconds <= MAX_BEAT + 0.8, `${r.id} is ${r.seconds}s`);
  assert.equal(assets.requests.length, plan.beats.filter((b) => b.visual.type === 'source').length);
});

test('build: frames follow word anchors, missing assets become placeholders', () => {
  const words = timed(SCRIPT);
  const {plan, assets} = draftPlan({words, segment: 2});
  const duration = words.at(-1).end + 0.5;
  const {edl, placeholders} = buildEdl({jobDir: '/nonexistent', plan, timing: {method: 'test', words}, assets, durationSeconds: duration, probeFn: () => ({width: 100, height: 100, duration: 1})});
  assert.equal(edl.beats[0].from, 0);
  assert.equal(edl.beats.at(-1).to, Math.ceil(duration * 30));
  edl.beats.slice(1).forEach((b, i) => assert.equal(b.from, edl.beats[i].to, 'beats are contiguous'));
  assert.equal(placeholders, assets.requests.length);
  assert.equal(edl.music, null);
  assert.equal(edl.style.captions, 'off');
});

test('build rejects two beats on the same word', () => {
  const words = timed(SCRIPT);
  const plan = {beats: [{id: 'a', fromWord: 0, visual: {type: 'title', text: 'x'}}, {id: 'b', fromWord: 5, visual: {type: 'keyword', text: 'y'}}, {id: 'c', fromWord: 5, visual: {type: 'keyword', text: 'z'}}]};
  assert.throws(() => buildEdl({jobDir: '/x', plan, timing: {words}, assets: {requests: []}, durationSeconds: 30}), /no duration/);
});

test('fit keeps aspect inside the 75% box', () => {
  assert.deepEqual(fit(1920, 1080), {w: 1422, h: 800});
  assert.deepEqual(fit(3000, 1000), {w: 1440, h: 480});
});

test('captions chunk at punctuation and SRT is well formed', () => {
  const words = timed('One two three, four five six seven eight nine ten. Eleven.');
  const chunks = captionChunks(words).map((c) => c.map((w) => w.word).join(' '));
  assert.equal(chunks[0], 'One two three,');
  assert.ok(chunks.every((c) => c.split(' ').length <= 6));
  assert.match(toSrt(words), /^1\n00:00:00,000 --> 00:00:00,\d{3}\nOne two three,\n/);
});

test('speech regions merge short gaps only', () => {
  const words = [{start: 0, end: 1}, {start: 1.2, end: 2}, {start: 3, end: 4}];
  assert.deepEqual(speechRegions(words), [[0, 60], [90, 120]]);
});
