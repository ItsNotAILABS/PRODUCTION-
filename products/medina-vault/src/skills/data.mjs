// skills/data.mjs — data shaping skills. Pure transforms.

export const DATA_SKILLS = [
  {
    name: 'data.csv_to_json',
    description: 'Parse CSV (RFC 4180-ish: quoted fields, escaped quotes) into an array of objects keyed by header row.',
    inputSchema: {
      type: 'object',
      properties: { csv: { type: 'string' }, delimiter: { type: 'string', default: ',' } },
      required: ['csv'],
    },
    run({ csv, delimiter = ',' }) {
      const rows = parseCSV(csv, delimiter);
      if (!rows.length) return { ok: true, headers: [], rows: [], count: 0 };
      const [headers, ...data] = rows;
      const out = data.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
      return { ok: true, headers, rows: out, count: out.length };
    },
  },

  {
    name: 'data.json_to_csv',
    description: 'Serialize an array of objects into a CSV string. Headers inferred from union of keys.',
    inputSchema: {
      type: 'object',
      properties: {
        rows:      { type: 'array', items: { type: 'object' } },
        delimiter: { type: 'string', default: ',' },
      },
      required: ['rows'],
    },
    run({ rows, delimiter = ',' }) {
      if (!Array.isArray(rows) || rows.length === 0) return { ok: true, csv: '', headers: [] };
      const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
      const esc = (v) => {
        const s = String(v ?? '');
        return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(delimiter), ...rows.map(r => headers.map(h => esc(r[h])).join(delimiter))];
      return { ok: true, csv: lines.join('\n'), headers, row_count: rows.length };
    },
  },

  {
    name: 'data.aggregate',
    description: 'Group + aggregate. Specify group_by field(s) and metrics (sum/avg/count/min/max).',
    inputSchema: {
      type: 'object',
      properties: {
        rows:     { type: 'array', items: { type: 'object' } },
        group_by: { type: 'array', items: { type: 'string' } },
        metrics:  { type: 'array', items: { type: 'object',
          properties: { field: {type:'string'}, op: {type:'string', enum:['sum','avg','count','min','max']} },
          required: ['field', 'op'] } },
      },
      required: ['rows', 'group_by', 'metrics'],
    },
    run({ rows, group_by, metrics }) {
      const groups = new Map();
      for (const r of rows) {
        const key = group_by.map(g => r[g]).join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      const result = [];
      for (const [key, items] of groups) {
        const out = {};
        group_by.forEach((g, i) => out[g] = key.split('|')[i]);
        for (const m of metrics) {
          const vals = items.map(r => Number(r[m.field])).filter(v => !Number.isNaN(v));
          const col = `${m.op}_${m.field}`;
          switch (m.op) {
            case 'sum':   out[col] = vals.reduce((a,b)=>a+b, 0); break;
            case 'avg':   out[col] = vals.length ? vals.reduce((a,b)=>a+b, 0) / vals.length : 0; break;
            case 'count': out[col] = items.length; break;
            case 'min':   out[col] = vals.length ? Math.min(...vals) : null; break;
            case 'max':   out[col] = vals.length ? Math.max(...vals) : null; break;
          }
        }
        result.push(out);
      }
      return { ok: true, groups: result, group_count: result.length };
    },
  },

  {
    name: 'data.diff',
    description: 'Diff two arrays of objects by a key field. Returns added/removed/changed sets.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'array', items: { type: 'object' } },
        after:  { type: 'array', items: { type: 'object' } },
        key:    { type: 'string' },
      },
      required: ['before', 'after', 'key'],
    },
    run({ before, after, key }) {
      const a = new Map(before.map(r => [r[key], r]));
      const b = new Map(after.map(r => [r[key], r]));
      const added = [], removed = [], changed = [];
      for (const [k, v] of b) if (!a.has(k)) added.push(v);
      for (const [k, v] of a) if (!b.has(k)) removed.push(v);
      for (const [k, vAft] of b) {
        const vBef = a.get(k);
        if (vBef && JSON.stringify(vBef) !== JSON.stringify(vAft))
          changed.push({ key: k, before: vBef, after: vAft });
      }
      return { ok: true, added, removed, changed,
               counts: { added: added.length, removed: removed.length, changed: changed.length } };
    },
  },

  {
    name: 'data.describe',
    description: 'Numeric column summary (count, min, max, mean, median, stddev) for an array of objects.',
    inputSchema: {
      type: 'object',
      properties: { rows: { type: 'array', items: { type: 'object' } } },
      required: ['rows'],
    },
    run({ rows }) {
      if (!rows.length) return { ok: true, columns: {} };
      const cols = {};
      for (const r of rows) for (const [k, v] of Object.entries(r)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        (cols[k] ||= []).push(n);
      }
      const out = {};
      for (const [k, vals] of Object.entries(cols)) {
        const sorted = [...vals].sort((a,b)=>a-b);
        const mean = vals.reduce((a,b)=>a+b, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
        out[k] = {
          count: vals.length, min: sorted[0], max: sorted[sorted.length-1],
          mean: round(mean), median: sorted[Math.floor(sorted.length / 2)],
          stddev: round(Math.sqrt(variance)),
        };
      }
      return { ok: true, columns: out };
    },
  },

  {
    name: 'data.tabulate',
    description: 'Render an array of objects as a Markdown table.',
    inputSchema: {
      type: 'object',
      properties: {
        rows:    { type: 'array', items: { type: 'object' } },
        columns: { type: 'array', items: { type: 'string' } },
      },
      required: ['rows'],
    },
    run({ rows, columns }) {
      if (!rows.length) return { ok: true, kind: 'markdown', markdown: '_(empty)_' };
      const cols = columns ?? [...new Set(rows.flatMap(r => Object.keys(r)))];
      const md =
        `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n` +
        rows.map(r => `| ${cols.map(c => String(r[c] ?? '')).join(' | ')} |`).join('\n');
      return { ok: true, kind: 'markdown', markdown: md, rows: rows.length, columns: cols.length };
    },
  },
];

// ── helpers ──────────────────────────────────────────────────────────────

function parseCSV(text, delim = ',') {
  const out = [];
  let row = [], cell = '', inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inQuote) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cell += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && n === '\n') i++;
        row.push(cell); out.push(row); row = []; cell = '';
      } else cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter(r => r.length && !(r.length === 1 && r[0] === ''));
}

function round(n) { return Math.round(n * 1000) / 1000; }
