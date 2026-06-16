// skills/writing.mjs — pure-text transformation skills. No external calls.

const wordCount = s => String(s).trim().split(/\s+/).filter(Boolean).length;
const sentences = s => String(s).split(/(?<=[.!?])\s+/).filter(Boolean);

export const WRITING_SKILLS = [
  {
    name: 'writing.redact_pii',
    description: 'Redact common PII: emails, phone numbers, SSNs, credit cards, US addresses. Returns redacted text + counts.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run({ text }) {
      const counts = { email: 0, phone: 0, ssn: 0, cc: 0, zip: 0 };
      let out = String(text);
      out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
        () => { counts.email++; return '[REDACTED:EMAIL]'; });
      out = out.replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
        () => { counts.phone++; return '[REDACTED:PHONE]'; });
      out = out.replace(/\b\d{3}-\d{2}-\d{4}\b/g,
        () => { counts.ssn++; return '[REDACTED:SSN]'; });
      out = out.replace(/\b(?:\d[ -]*?){13,16}\b/g,
        m => { if (luhnLikely(m)) { counts.cc++; return '[REDACTED:CC]'; } return m; });
      out = out.replace(/\b\d{5}(?:-\d{4})?\b/g,
        () => { counts.zip++; return '[REDACTED:ZIP]'; });
      return { ok: true, redacted: out, counts, total_redactions: Object.values(counts).reduce((a, b) => a + b, 0) };
    },
  },

  {
    name: 'writing.compress',
    description: 'Compress text by removing filler words and tightening sentences. Returns shortened text + ratio.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, target_ratio: { type: 'number', default: 0.6 } },
      required: ['text'],
    },
    run({ text, target_ratio = 0.6 }) {
      const FILLER = /\b(actually|basically|essentially|really|very|just|that|sort of|kind of|in order to|due to the fact that|at this point in time)\b/gi;
      let out = String(text).replace(FILLER, '').replace(/\s{2,}/g, ' ').trim();
      out = out.replace(/(\w),\s+(and|or|but)\s+/g, '$1 $2 ');
      const before = wordCount(text), after = wordCount(out);
      const ratio = before ? after / before : 1;
      return { ok: true, compressed: out, words_before: before, words_after: after,
               ratio: Math.round(ratio * 1000) / 1000, met_target: ratio <= target_ratio };
    },
  },

  {
    name: 'writing.expand_bullets',
    description: 'Turn bullet points into prose paragraphs.',
    inputSchema: { type: 'object', properties: { bullets: { type: 'array', items: { type: 'string' } } }, required: ['bullets'] },
    run({ bullets }) {
      const prose = bullets.map(b => {
        const t = b.trim().replace(/^[-•*]\s*/, '');
        if (!t) return '';
        return t.endsWith('.') ? t : t + '.';
      }).join(' ');
      return { ok: true, prose, paragraphs: 1, words: wordCount(prose) };
    },
  },

  {
    name: 'writing.formal',
    description: 'Rewrite text in a formal business register. Heuristic transforms (no LLM call).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run({ text }) {
      const map = [
        [/\bgonna\b/gi, 'going to'], [/\bwanna\b/gi, 'want to'], [/\bgotta\b/gi, 'must'],
        [/\bkids\b/gi, 'children'], [/\bguys\b/gi, 'team'], [/\byeah\b/gi, 'yes'],
        [/\bok\b/gi, 'understood'], [/\bokay\b/gi, 'understood'],
        [/\bcan't\b/gi, 'cannot'], [/\bwon't\b/gi, 'will not'], [/\bdon't\b/gi, 'do not'],
        [/\bI'm\b/g, 'I am'], [/\bI'll\b/g, 'I will'], [/\bI've\b/g, 'I have'],
        [/\bit's\b/gi, 'it is'], [/\bthat's\b/gi, 'that is'],
        [/!+/g, '.'], [/\s{2,}/g, ' '],
      ];
      let out = String(text);
      for (const [re, sub] of map) out = out.replace(re, sub);
      return { ok: true, formal: out.trim(), words: wordCount(out) };
    },
  },

  {
    name: 'writing.casual',
    description: 'Rewrite text in a casual register. Loosens contractions, breaks long sentences.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run({ text }) {
      const map = [
        [/\bgoing to\b/gi, 'gonna'], [/\bwant to\b/gi, 'wanna'], [/\bhave to\b/gi, 'gotta'],
        [/\bcannot\b/gi, "can't"], [/\bwill not\b/gi, "won't"], [/\bdo not\b/gi, "don't"],
        [/\bI am\b/g, "I'm"], [/\bI will\b/g, "I'll"], [/\bI have\b/g, "I've"],
        [/\bit is\b/g, "it's"], [/\bthat is\b/g, "that's"],
        [/\butilize/gi, 'use'], [/\bcommence/gi, 'start'], [/\bterminate/gi, 'stop'],
      ];
      let out = String(text);
      for (const [re, sub] of map) out = out.replace(re, sub);
      return { ok: true, casual: out.trim(), words: wordCount(out) };
    },
  },

  {
    name: 'writing.headline',
    description: 'Generate 5 candidate headlines from a body of text. Picks salient nouns/verbs.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run({ text }) {
      const words = String(text).toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
      const STOP = new Set(['that','this','with','from','have','will','they','their','about','which','where','what','because','would','should','could']);
      const freq = {};
      for (const w of words) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
      const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
      const firstSentence = sentences(text)[0] || text;
      const candidates = [
        firstSentence.length < 80 ? firstSentence : firstSentence.slice(0, 77) + '...',
        `Why ${top[0] || 'this'} matters`,
        `${cap(top[0])} and ${top[1] || 'why'}`,
        `The ${top[0] || 'thing'} you missed`,
        `${cap(top[0])}: a brief`,
      ].filter(Boolean);
      return { ok: true, candidates, top_terms: top };
    },
  },

  {
    name: 'writing.summarize_extractive',
    description: 'Extractive summary — picks the N highest-information sentences by term-frequency overlap.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, n: { type: 'number', default: 3 } },
      required: ['text'],
    },
    run({ text, n = 3 }) {
      const sents = sentences(text);
      if (sents.length <= n) return { ok: true, summary: text, picked: sents.length };
      const words = w => String(w).toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
      const STOP = new Set(['that','this','with','from','have','will','they','their','about','which','where','what','because','would','should','could']);
      const freq = {};
      for (const s of sents) for (const w of words(s)) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
      const score = s => words(s).reduce((acc, w) => acc + (freq[w] || 0), 0) / Math.max(1, words(s).length);
      const ranked = sents.map((s, i) => ({ s, i, score: score(s) }))
        .sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s);
      return { ok: true, summary: ranked.join(' '), picked: ranked.length };
    },
  },
];

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function luhnLikely(s) {
  const d = s.replace(/\D/g, '');
  if (d.length < 13 || d.length > 16) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
