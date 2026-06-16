// skills/workflows_library.mjs — prebuilt workflow templates that compose
// skills into real production sequences. Each is a definition you pass to
// workflows_run; the operator can also clone and tweak via vault.

export const WORKFLOW_LIBRARY = {
  onboard_engagement: {
    id: 'onboard_engagement',
    description: 'Generate an engagement letter + first invoice for a new client matter.',
    nodes: [
      { id: 'eng', skill: 'legal.engagement_letter',
        input: { firm_name: '${firm_name}', attorney: '${attorney}',
                 client_name: '${client_name}', matter: '${matter}',
                 fee_basis: '${fee_basis}', retainer: '${retainer}' } },
      { id: 'inv', skill: 'legal.invoice',
        input: { from_name: '${firm_name}', bill_to_name: '${client_name}',
                 invoice_number: 'INV-${eng.filename|hash}',
                 line_items: '${line_items}' } },
    ],
  },

  contract_to_invoice: {
    id: 'contract_to_invoice',
    description: 'NDA + Contractor agreement + first invoice for a new vendor.',
    nodes: [
      { id: 'nda', skill: 'legal.nda_mutual',
        input: { party_a_name: '${client_name}', party_b_name: '${vendor_name}',
                 purpose: '${purpose}', term_years: 3 } },
      { id: 'agreement', skill: 'legal.contractor_agreement',
        input: { client_name: '${client_name}', contractor_name: '${vendor_name}',
                 scope: '${scope}', rate: '${rate}', term_months: 12 } },
      { id: 'invoice', skill: 'legal.invoice',
        input: { from_name: '${vendor_name}', bill_to_name: '${client_name}',
                 invoice_number: 'INV-${agreement.filename|hash}',
                 line_items: '${initial_line_items}' } },
    ],
  },

  weekly_status_with_followups: {
    id: 'weekly_status_with_followups',
    description: 'Compose a status update + draft follow-up emails to each blocker.',
    nodes: [
      { id: 'status', skill: 'comms.status_update',
        input: { author: '${author}', did: '${did}', doing: '${doing}', blocked: '${blocked}' } },
    ],
  },

  finance_close_month: {
    id: 'finance_close_month',
    description: 'Compute runway + ROI + build an expense report for the period.',
    nodes: [
      { id: 'runway',  skill: 'finance.runway',
        input: { cash_balance: '${cash_balance}', monthly_burn: '${monthly_burn}',
                 monthly_revenue: '${monthly_revenue}', growth_rate: 0.05 } },
      { id: 'roi',     skill: 'finance.roi',
        input: { initial_cost: '${initial_cost}', cash_flows: '${cash_flows}' } },
      { id: 'expense', skill: 'finance.expense_report',
        input: { author: '${author}', line_items: '${expense_items}' } },
    ],
  },

  research_to_brief: {
    id: 'research_to_brief',
    description: 'Outline a topic + draft a one-page brief from claims + sources.',
    nodes: [
      { id: 'outline', skill: 'research.outline',
        input: { topic: '${topic}', claims: '${claims}', sources: '${sources}' } },
      { id: 'brief',   skill: 'research.brief',
        input: { question: '${question}', finding: '${finding}',
                 evidence: '${evidence}', confidence: '${confidence}' } },
    ],
  },

  code_release_notes: {
    id: 'code_release_notes',
    description: 'Build a changelog + a README outline ready for a release.',
    nodes: [
      { id: 'log',    skill: 'code.changelog',
        input: { commits: '${commits}', version: '${version}' } },
      { id: 'readme', skill: 'code.readme_outline',
        input: { name: '${name}', description: '${description}', languages: '${languages}' } },
    ],
  },

  data_cleanup_report: {
    id: 'data_cleanup_report',
    description: 'Describe a dataset + tabulate the summary + flag PII.',
    nodes: [
      { id: 'desc',   skill: 'data.describe',  input: { rows: '${rows}' } },
      { id: 'csv',    skill: 'data.json_to_csv', input: { rows: '${rows}' } },
      { id: 'redact', skill: 'writing.redact_pii', input: { text: '${csv.csv}' } },
    ],
  },

  cease_and_demand: {
    id: 'cease_and_demand',
    description: 'Cease-and-desist letter + parallel demand letter against the same target.',
    nodes: [
      { id: 'cease',  skill: 'legal.cease_and_desist',
        input: { sender_name: '${sender_name}', recipient_name: '${recipient_name}',
                 conduct: '${conduct}', basis: '${basis}', deadline_days: 10 } },
      { id: 'demand', skill: 'legal.demand_letter',
        input: { sender_name: '${sender_name}', recipient_name: '${recipient_name}',
                 claim_summary: '${claim_summary}', demand: '${demand}',
                 amount_usd: '${amount_usd}', deadline_days: 14 } },
    ],
  },
};

export function listWorkflows() {
  return Object.values(WORKFLOW_LIBRARY).map(w => ({
    id: w.id,
    description: w.description,
    nodes: w.nodes.map(n => ({ id: n.id, skill: n.skill })),
    required_vars: extractVars(w),
  }));
}

function extractVars(wf) {
  const found = new Set();
  const walk = (v) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(/\$\{([^}|]+)(?:\|[^}]*)?\}/g)) {
        const v = m[1];
        if (!v.includes('.')) found.add(v); // node-output refs (a.b) excluded
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const n of wf.nodes) walk(n.input);
  return [...found].sort();
}
