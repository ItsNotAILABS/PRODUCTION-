// skills/research.mjs — research aids. Local computation only;
// when keys are present (set via keys_set), upstream research providers
// can be wired in. The shape is stable so the API call can drop in later.

export const RESEARCH_SKILLS = [
  {
    name: 'research.outline',
    description: 'Produce a structured research outline (intro, claims, evidence, counter, conclusion) from a topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topic:    { type: 'string' },
        claims:   { type: 'array', items: { type: 'string' } },
        sources:  { type: 'array', items: { type: 'string' } },
      },
      required: ['topic'],
    },
    run({ topic, claims = [], sources = [] }) {
      const md =
`# Research Outline — ${topic}\n\n` +
`## I. Introduction\nDefine ${topic}; state why it matters; preview the argument.\n\n` +
`## II. Claims\n${claims.length ? claims.map((c, i) => `${i + 1}. ${c}`).join('\n') : '_no claims yet_'}\n\n` +
`## III. Evidence\nMap evidence to each claim; note source quality.\n\n` +
`## IV. Counter-arguments\nWhat would the strongest opponent say? Respond.\n\n` +
`## V. Conclusion\nSynthesize; state implications; note open questions.\n\n` +
`## Sources\n${sources.length ? sources.map((s, i) => `[${i + 1}] ${s}`).join('\n') : '_to be added_'}\n`;
      return { ok: true, kind: 'markdown', markdown: md };
    },
  },

  {
    name: 'research.citation',
    description: 'Format a citation in APA / MLA / Chicago / IEEE.',
    inputSchema: {
      type: 'object',
      properties: {
        style:   { type: 'string', enum: ['APA','MLA','Chicago','IEEE'], default: 'APA' },
        authors: { type: 'array', items: { type: 'string' } },
        year:    { type: 'number' },
        title:   { type: 'string' },
        source:  { type: 'string', description: 'Journal / publisher / site.' },
        url:     { type: 'string' },
      },
      required: ['style', 'authors', 'title'],
    },
    run({ style = 'APA', authors, year = new Date().getFullYear(), title, source = '', url = '' }) {
      // APA joins author entries with ", " and the LAST with ", & " — author
      // entries themselves can contain commas ("Smith, J."), so we have to
      // join the entries as units, not split on commas.
      const joinAuthors = (sep, ampersand) => {
        if (authors.length === 0) return '';
        if (authors.length === 1) return authors[0];
        const init = authors.slice(0, -1).join(sep);
        const last = authors[authors.length - 1];
        return `${init}${ampersand}${last}`;
      };
      const apaAuthors = joinAuthors(', ', ', & ');
      let out;
      switch (style) {
        case 'APA':     out = `${apaAuthors} (${year}). ${title}. ${source}.${url ? ` ${url}` : ''}`; break;
        case 'MLA':     out = `${authors[0]}${authors.length > 1 ? ' et al.' : ''}. "${title}." ${source}, ${year}.${url ? ` ${url}.` : ''}`; break;
        case 'Chicago': out = `${joinAuthors(', ', ', and ')}. ${year}. "${title}." ${source}.${url ? ` ${url}.` : ''}`; break;
        case 'IEEE':    out = `${authors.map(a => initials(a)).join(', ')}, "${title}," ${source}, ${year}.${url ? ` [Online]. Available: ${url}` : ''}`; break;
      }
      return { ok: true, style, citation: out };
    },
  },

  {
    name: 'research.brief',
    description: 'Compose a one-page research brief: question, finding, evidence, confidence, recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        question:   { type: 'string' },
        finding:    { type: 'string' },
        evidence:   { type: 'array', items: { type: 'string' } },
        confidence: { type: 'string', enum: ['LOW','MEDIUM','HIGH','VERY_HIGH'], default: 'MEDIUM' },
        recommend:  { type: 'string' },
      },
      required: ['question', 'finding'],
    },
    run({ question, finding, evidence = [], confidence = 'MEDIUM', recommend = '' }) {
      const md =
`# Research Brief\n\n` +
`**Question:** ${question}\n\n**Finding:** ${finding}\n\n**Confidence:** ${confidence}\n\n` +
`## Evidence\n${evidence.length ? evidence.map((e, i) => `${i + 1}. ${e}`).join('\n') : '_no evidence cited_'}\n\n` +
(recommend ? `## Recommendation\n${recommend}\n` : '');
      return { ok: true, kind: 'markdown', markdown: md, confidence };
    },
  },

  {
    name: 'research.entity_extract',
    description: 'Extract proper nouns (capitalized sequences), dates, dollar amounts, and URLs from text.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run({ text }) {
      const T = String(text);
      const propersRaw = (T.match(/\b(?:[A-Z][a-z'-]+)(?:\s+(?:of|the|de|von|van)?\s*[A-Z][a-z'-]+)*\b/g) || [])
        .filter(s => s.length > 2 && !COMMON_CAPS.has(s.toLowerCase()));
      const propers = [...new Set(propersRaw)];
      const dates = [...new Set(T.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi) || [])];
      const money = [...new Set(T.match(/\$\s?\d[\d,]*(?:\.\d{2})?(?:[KMB])?/g) || [])];
      const urls  = [...new Set(T.match(/https?:\/\/[^\s)]+/g) || [])];
      return { ok: true,
        entities: { proper_nouns: propers, dates, money, urls },
        counts:   { proper_nouns: propers.length, dates: dates.length, money: money.length, urls: urls.length } };
    },
  },

  {
    name: 'research.fact_card',
    description: 'Build a Q&A fact card from a topic + claim + source. For flashcards / spaced repetition.',
    inputSchema: {
      type: 'object',
      properties: {
        topic:  { type: 'string' },
        question:{ type: 'string' },
        answer: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['topic', 'question', 'answer'],
    },
    run({ topic, question, answer, source = '' }) {
      return { ok: true, card: {
        topic, question, answer, source,
        created: new Date().toISOString(),
        id: `fc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      } };
    },
  },
];

const COMMON_CAPS = new Set(['the','a','an','and','or','but','i','we','you','they','it','this','that','these','those','here','there','today','tomorrow','yesterday']);

function initials(name) {
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name;
  const last = parts.pop();
  return parts.map(p => p[0].toUpperCase() + '.').join('') + ' ' + last;
}
