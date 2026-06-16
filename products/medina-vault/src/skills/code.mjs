// skills/code.mjs — programmer-tooling skills. Operates on text, not git.

export const CODE_SKILLS = [
  {
    name: 'code.commit_message',
    description: 'Generate a conventional-commits message from a unified diff. Heuristic — picks type from changed paths.',
    inputSchema: { type: 'object', properties: { diff: { type: 'string' } }, required: ['diff'] },
    run({ diff }) {
      const paths = [...String(diff).matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(m => m[1]);
      const adds = (String(diff).match(/^\+(?!\+\+)/gm) || []).length;
      const dels = (String(diff).match(/^-(?!--)/gm) || []).length;
      let type = 'chore';
      const allTest = paths.length > 0 && paths.every(p => /(^|\/)(test|tests|__tests__|_smoke|spec)/.test(p));
      const allDocs = paths.length > 0 && paths.every(p => /\.(md|rst|txt)$/i.test(p));
      const hasFix = /\b(fix|bug|broken|issue|error)\b/i.test(diff);
      const hasFeat = /\b(add|new|introduce|create|ship)\b/i.test(diff);
      if (allTest)      type = 'test';
      else if (allDocs) type = 'docs';
      else if (hasFix)  type = 'fix';
      else if (hasFeat) type = 'feat';
      const scope = paths[0]?.split('/').slice(0, 2).join('/') ?? null;
      const subject = `update ${paths.length} file${paths.length === 1 ? '' : 's'} (+${adds}/-${dels})`;
      const msg = `${type}${scope ? '(' + scope + ')' : ''}: ${subject}`;
      return { ok: true, message: msg, type, scope, paths, additions: adds, deletions: dels };
    },
  },

  {
    name: 'code.changelog',
    description: 'Build a CHANGELOG section from an array of commit messages.',
    inputSchema: {
      type: 'object',
      properties: {
        commits: { type: 'array', items: { type: 'string' } },
        version: { type: 'string' },
        date:    { type: 'string' },
      },
      required: ['commits'],
    },
    run({ commits, version = 'Unreleased', date = new Date().toISOString().slice(0, 10) }) {
      const groups = { feat: [], fix: [], docs: [], test: [], chore: [], other: [] };
      for (const c of commits) {
        const m = c.match(/^(feat|fix|docs|test|chore)(?:\([^)]+\))?:\s*(.+)/);
        if (m) groups[m[1]].push(m[2]);
        else groups.other.push(c);
      }
      const SECTIONS = [['feat','Added'],['fix','Fixed'],['docs','Documentation'],['test','Tests'],['chore','Maintenance'],['other','Other']];
      let md = `## [${version}] — ${date}\n\n`;
      for (const [k, label] of SECTIONS) {
        if (!groups[k].length) continue;
        md += `### ${label}\n`;
        for (const item of groups[k]) md += `- ${item}\n`;
        md += '\n';
      }
      return { ok: true, kind: 'markdown', markdown: md, groups };
    },
  },

  {
    name: 'code.readme_outline',
    description: 'Produce a structured README outline from a package description.',
    inputSchema: {
      type: 'object',
      properties: {
        name:        { type: 'string' },
        description: { type: 'string' },
        languages:   { type: 'array', items: { type: 'string' } },
      },
      required: ['name', 'description'],
    },
    run({ name, description, languages = ['JavaScript'] }) {
      const md =
`# ${name}

${description}

## Install

\`\`\`bash
# ${languages[0] === 'JavaScript' ? 'npm install ' + name : 'pip install ' + name}
\`\`\`

## Quick start

\`\`\`${languages[0]?.toLowerCase() || 'text'}
// example here
\`\`\`

## API

_to be documented_

## License

MIT
`;
      return { ok: true, kind: 'markdown', markdown: md, sections: ['Install','Quick start','API','License'] };
    },
  },

  {
    name: 'code.lint_summary',
    description: 'Summarize a flat list of lint messages by severity and file.',
    inputSchema: {
      type: 'object',
      properties: {
        issues: { type: 'array', items: { type: 'object',
          properties: { file: {type:'string'}, line: {type:'number'}, severity: {type:'string'}, rule: {type:'string'}, message: {type:'string'} } } },
      },
      required: ['issues'],
    },
    run({ issues }) {
      const bySeverity = {}, byFile = {}, byRule = {};
      for (const i of issues) {
        bySeverity[i.severity] = (bySeverity[i.severity] || 0) + 1;
        byFile[i.file]         = (byFile[i.file]         || 0) + 1;
        byRule[i.rule]         = (byRule[i.rule]         || 0) + 1;
      }
      const top = (obj, n=5) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
      return { ok: true, total: issues.length, by_severity: bySeverity,
               top_files: top(byFile), top_rules: top(byRule) };
    },
  },

  {
    name: 'code.json_schema_from_sample',
    description: 'Infer a JSON Schema (draft-07) from a sample object.',
    inputSchema: { type: 'object', properties: { sample: {} }, required: ['sample'] },
    run({ sample }) {
      const infer = (v) => {
        if (v === null) return { type: 'null' };
        if (Array.isArray(v)) return { type: 'array', items: v[0] === undefined ? {} : infer(v[0]) };
        if (typeof v === 'object') {
          const props = {};
          for (const [k, val] of Object.entries(v)) props[k] = infer(val);
          return { type: 'object', properties: props, required: Object.keys(props) };
        }
        return { type: typeof v };
      };
      return { ok: true, schema: { $schema: 'http://json-schema.org/draft-07/schema#', ...infer(sample) } };
    },
  },

  {
    name: 'code.diff_stats',
    description: 'Lines added/removed/files-changed from a unified diff.',
    inputSchema: { type: 'object', properties: { diff: { type: 'string' } }, required: ['diff'] },
    run({ diff }) {
      const files = (String(diff).match(/^diff --git /gm) || []).length;
      const adds  = (String(diff).match(/^\+(?!\+\+)/gm) || []).length;
      const dels  = (String(diff).match(/^-(?!--)/gm)    || []).length;
      return { ok: true, files_changed: files, additions: adds, deletions: dels, net: adds - dels };
    },
  },
];
