// Draft a word-anchored plan.json and an assets.json request list from
// script timings. The draft is a starting point for a human (or an LLM pass)
// to edit: beats are anchored to WORD INDEXES, not seconds, so re-tightening
// the VO never breaks the plan.

const ABBREVIATIONS = new Set(['dr.', 'mr.', 'mrs.', 'ms.', 'st.', 'vs.', 'no.', 'vol.', 'jr.', 'sr.']);
const SPLIT_WORDS = new Set(['and', 'but', 'while', 'so', 'because', 'when', 'which', 'then', 'after', 'before', 'until']);

// Reference pacing (docs/REFERENCE-BREAKDOWN.md): median shot 2.3 s, middle half 1.6 to 3.9 s.
export const MIN_BEAT = 1.4;   // seconds; shorter pieces merge into a neighbour
export const MAX_BEAT = 4.0;   // seconds; longer sentences split at a clause
const MOVES = ['zoomIn', 'zoomIn', 'zoomOut', 'zoomIn', 'panRight', 'zoomIn', 'zoomOut', 'panLeft'];
const PUSHES = ['pushLeft', 'pushLeft', 'pushUp'];

const endsSentence = (word, next) => {
  if (!/[.!?]["”’)]*$/.test(word)) return false;
  if (ABBREVIATIONS.has(word.toLowerCase())) return false;
  if (!next) return true;
  return /^["“‘(]?[A-Z0-9]/.test(next); // "S.H.I.E.L.D. are" is not a boundary
};

/** Split word list into sentences: [{from, to}] word index ranges, `to` exclusive. */
export const sentences = (words) => {
  const out = [];
  let start = 0;
  words.forEach((w, i) => {
    if (endsSentence(w.word, words[i + 1]?.word)) { out.push({from: start, to: i + 1}); start = i + 1; }
  });
  if (start < words.length) out.push({from: start, to: words.length});
  return out;
};

const span = (words, r) => words[r.to - 1].end - words[r.from].start;

/** Split a long range at the clause boundary closest to its middle; recurse. */
export const splitLong = (words, r) => {
  if (span(words, r) <= MAX_BEAT || r.to - r.from < 5) return [r];
  const mid = words[r.from].start + span(words, r) / 2;
  let best = null;
  for (let i = r.from + 2; i <= r.to - 2; i++) {
    const prev = words[i - 1].word, cur = words[i].word.toLowerCase().replace(/[^a-z]/g, '');
    const strong = /[,;:—–]$/.test(prev) ? 0 : SPLIT_WORDS.has(cur) ? 0.6 : 3; // seconds of penalty
    const score = Math.abs(words[i].start - mid) + strong;
    if (!best || score < best.score) best = {i, score};
  }
  if (!best) return [r];
  return [...splitLong(words, {from: r.from, to: best.i}), ...splitLong(words, {from: best.i, to: r.to})];
};

const mergeShort = (words, ranges) => {
  const out = [];
  for (const r of ranges) {
    const last = out[out.length - 1];
    if (last && (span(words, r) < MIN_BEAT || span(words, last) < MIN_BEAT) && span(words, {from: last.from, to: r.to}) <= MAX_BEAT + 0.8) {
      last.to = r.to;
    } else out.push({...r});
  }
  return out;
};

const text = (words, r) => words.slice(r.from, r.to).map((w) => w.word).join(' ');

/** Capitalised phrases: names, places, devices, issue titles. A capitalised
 * sentence opener only counts when it is part of a longer run ("Doctor Doom"). */
export const searchHints = (words, r) => {
  const hints = [];
  let run = [], runStartsSentence = false;
  const flush = () => {
    if (runStartsSentence && /^(In|The|A|An|On|At|When|Then|But|And|So|After|Before|His|Her|Their|It|This|That)$/.test(run[0])) run.shift();
    else if (runStartsSentence && run.length === 1) run = [];
    if (run.length) hints.push(run.join(' '));
    run = []; runStartsSentence = false;
  };
  for (let i = r.from; i < r.to; i++) {
    const raw = words[i].word;
    const clean = raw.replace(/^["“‘(]+|["”’),.;:!?]+$/g, '').replace(/[’']s$/, '');
    const startsSentence = i === 0 || endsSentence(words[i - 1].word, raw);
    const joiner = run.length && /^(of|the|and|de)$/.test(clean) && /^[A-Z]/.test(words[i + 1]?.word ?? '');
    if (/^[A-Z0-9]/.test(clean) || joiner) {
      if (!run.length) runStartsSentence = startsSentence;
      run.push(clean);
    } else flush();
    if (/[,.;:!?]["”’)]*$/.test(raw) && !/^([A-Z]\.)+$/.test(raw)) flush();
  }
  flush();
  return [...new Set(hints.filter((h) => h.length > 2 && !/^(and|the|of)$/i.test(h)))];
};

const isTitle = (words, r) => {
  const ws = words.slice(r.from, r.to).map((w) => w.word);
  if (ws.length > 12) return false;
  const caps = ws.filter((w) => /^[A-Z0-9“"]/.test(w)).length;
  return caps / ws.length >= 0.6;
};

/** Build the draft plan + asset requests. */
export const draftPlan = ({words, segment, topic}) => {
  let ranges = sentences(words);
  const beats = [];
  const requests = [];
  let startIdx = 0;
  if (ranges.length && isTitle(words, ranges[0])) {
    beats.push({id: 'b00', fromWord: 0, transitionIn: 'cut', visual: {type: 'title', number: String(segment), text: text(words, ranges[0]).replace(/[.!?]$/, '')}});
    startIdx = 1;
  }
  const body = ranges.slice(startIdx);
  const lastSentence = body[body.length - 1];
  const bodyBeats = mergeShort(words, body.slice(0, -1).flatMap((r) => splitLong(words, r)));
  let n = 1, pushes = 0;
  for (const [k, r] of bodyBeats.entries()) {
    const id = `b${String(n++).padStart(2, '0')}`;
    const sentenceStart = k === 0 || endsSentence(words[r.from - 1].word, words[r.from].word);
    const transitionIn = k === 0 && beats.length ? 'pushLeft' : sentenceStart && k % 6 === 0 ? PUSHES[pushes++ % PUSHES.length] : 'cut';
    beats.push({id, fromWord: r.from, transitionIn, visual: {type: 'source', asset: id, move: MOVES[k % MOVES.length]}});
    requests.push({id, need: text(words, r), hints: searchHints(words, r), kind: 'clip preferred', seconds: +span(words, r).toFixed(1), file: null, source_url: null, credit: null, rights: null});
  }
  if (lastSentence) {
    // Closing line becomes the editorial verdict, as in the original edits.
    const line = text(words, lastSentence);
    const parts = line.split(/;\s+|:\s+|—\s*/);
    const id = `b${String(n).padStart(2, '0')}`;
    if (parts.length >= 2 || lastSentence.to - lastSentence.from <= 14) {
      const visual = {type: 'keyword', text: parts.length >= 2 ? parts[0] + (parts[0].endsWith('.') ? '' : '.') : line};
      if (parts.length >= 2) {
        const sub = parts.slice(1).join(' ');
        visual.sub = sub.charAt(0).toUpperCase() + sub.slice(1);
        const firstSubWord = parts[0].split(/\s+/).length;
        visual.subAtWord = lastSentence.from + firstSubWord;
      }
      beats.push({id, fromWord: lastSentence.from, transitionIn: 'pushUp', visual});
    } else {
      beats.push({id, fromWord: lastSentence.from, transitionIn: 'pushUp', visual: {type: 'source', asset: id, move: 'zoomIn'}});
      requests.push({id, need: line, hints: searchHints(words, lastSentence), kind: 'clip preferred', seconds: +span(words, lastSentence).toFixed(1), file: null, source_url: null, credit: null, rights: null});
    }
  }
  return {
    plan: {
      version: 1,
      segment,
      note: 'Draft from explainer plan. Edit freely: beats anchor to word indexes in timing.json. Visual types: source, compare, keyword, title. Overlays: circle, arrow, label.',
      style: {captions: 'off', music: null, sfx: {whoosh: null, pop: null}},
      beats,
      overlays: [],
    },
    assets: {version: 1, topic: topic ?? null, note: 'Put files in assets/ named <id>.<ext> (jpg, png, webp, mp4, mov) or set "file". Record source_url and rights before publishing.', requests},
  };
};
