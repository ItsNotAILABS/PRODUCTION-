// skills/comms.mjs — communication artifact generators.

export const COMMS_SKILLS = [
  {
    name: 'comms.email_draft',
    description: 'Draft an email. Returns subject + body + a mailto: URL ready to open in any client.',
    inputSchema: {
      type: 'object',
      properties: {
        to:       { type: 'string' },
        cc:       { type: 'string' },
        subject:  { type: 'string' },
        intent:   { type: 'string', description: 'What the email is for.' },
        bullets:  { type: 'array', items: { type: 'string' } },
        sign_off: { type: 'string', default: 'Best' },
        signature:{ type: 'string' },
      },
      required: ['to', 'subject', 'intent'],
    },
    run({ to, cc, subject, intent, bullets = [], sign_off = 'Best', signature = '' }) {
      const body = [
        `Hi,`,
        ``,
        intent,
        ``,
        ...(bullets.length ? bullets.map(b => `• ${b}`) : []),
        bullets.length ? '' : null,
        sign_off + ',',
        signature || '',
      ].filter(x => x !== null).join('\n');
      const params = new URLSearchParams({ subject, body });
      if (cc) params.set('cc', cc);
      const url = `mailto:${encodeURIComponent(to)}?${params.toString()}`;
      return { ok: true, subject, body, mailto: url, kind: 'email' };
    },
  },

  {
    name: 'comms.meeting_notes',
    description: 'Format meeting notes (markdown). Sections: attendees, decisions, action items, next steps.',
    inputSchema: {
      type: 'object',
      properties: {
        title:        { type: 'string' },
        date:         { type: 'string' },
        attendees:    { type: 'array', items: { type: 'string' } },
        decisions:    { type: 'array', items: { type: 'string' } },
        action_items: { type: 'array', items: { type: 'object',
          properties: { owner: {type:'string'}, item: {type:'string'}, due: {type:'string'} },
          required: ['owner', 'item'] } },
        notes:        { type: 'string' },
      },
      required: ['title'],
    },
    run({ title, date = new Date().toISOString().slice(0, 10),
          attendees = [], decisions = [], action_items = [], notes = '' }) {
      const md =
`# ${title}\n_${date}_\n\n` +
`## Attendees\n${attendees.length ? attendees.map(a => `- ${a}`).join('\n') : '_none recorded_'}\n\n` +
`## Decisions\n${decisions.length ? decisions.map(d => `- ${d}`).join('\n') : '_none_'}\n\n` +
`## Action Items\n${action_items.length ? action_items.map(a => `- [ ] **${a.owner}** — ${a.item}${a.due ? ` _(due ${a.due})_` : ''}`).join('\n') : '_none_'}\n\n` +
(notes ? `## Notes\n${notes}\n` : '');
      return { ok: true, kind: 'markdown', markdown: md,
               attendee_count: attendees.length, action_count: action_items.length };
    },
  },

  {
    name: 'comms.status_update',
    description: 'Compose a weekly status update (Did / Doing / Blocked).',
    inputSchema: {
      type: 'object',
      properties: {
        author:  { type: 'string' },
        week_of: { type: 'string' },
        did:     { type: 'array', items: { type: 'string' } },
        doing:   { type: 'array', items: { type: 'string' } },
        blocked: { type: 'array', items: { type: 'string' } },
      },
      required: ['author'],
    },
    run({ author, week_of = new Date().toISOString().slice(0, 10),
          did = [], doing = [], blocked = [] }) {
      const md =
`# Status — ${author}\n_Week of ${week_of}_\n\n` +
`**Did**\n${did.length ? did.map(x => `- ${x}`).join('\n') : '_nothing recorded_'}\n\n` +
`**Doing**\n${doing.length ? doing.map(x => `- ${x}`).join('\n') : '_nothing recorded_'}\n\n` +
`**Blocked**\n${blocked.length ? blocked.map(x => `- ${x}`).join('\n') : '_nothing blocking_'}\n`;
      return { ok: true, kind: 'markdown', markdown: md };
    },
  },

  {
    name: 'comms.formal_letter',
    description: 'Plain-text formal letter with sender/recipient blocks and date.',
    inputSchema: {
      type: 'object',
      properties: {
        sender_name:    { type: 'string' },
        sender_address: { type: 'string' },
        recipient_name: { type: 'string' },
        recipient_address: { type: 'string' },
        date:           { type: 'string' },
        body:           { type: 'string' },
        sign_off:       { type: 'string', default: 'Sincerely' },
      },
      required: ['sender_name', 'recipient_name', 'body'],
    },
    run(input) {
      const { sender_name, sender_address = '', recipient_name, recipient_address = '',
              date = new Date().toISOString().slice(0, 10), body, sign_off = 'Sincerely' } = input;
      const text =
`${sender_name}\n${sender_address}\n\n${date}\n\n${recipient_name}\n${recipient_address}\n\n` +
`Dear ${recipient_name.split(' ')[0]},\n\n${body}\n\n${sign_off},\n\n\n${sender_name}\n`;
      return { ok: true, kind: 'text', text };
    },
  },

  {
    name: 'comms.slack_message',
    description: 'Format a Slack-style message with thread title + body + reactions block.',
    inputSchema: {
      type: 'object',
      properties: {
        channel:   { type: 'string' },
        author:    { type: 'string' },
        title:     { type: 'string' },
        body:      { type: 'string' },
        reactions: { type: 'array', items: { type: 'string' } },
      },
      required: ['author', 'body'],
    },
    run({ channel = '#general', author, title = '', body, reactions = [] }) {
      const text =
`${channel} · ${author}\n` +
(title ? `*${title}*\n` : '') +
`${body}\n` +
(reactions.length ? '\n' + reactions.map(r => `:${r}:`).join(' ') : '');
      return { ok: true, kind: 'text', text };
    },
  },
];
