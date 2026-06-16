// skills/finance.mjs — real financial calculations + artifact generators.

const fmt = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n);

export const FINANCE_SKILLS = [
  {
    name: 'finance.runway',
    description: 'Compute runway in months from cash balance and burn rate, with breakeven shaving.',
    inputSchema: {
      type: 'object',
      properties: {
        cash_balance: { type: 'number' },
        monthly_burn: { type: 'number', description: 'Net monthly burn (USD); positive number.' },
        monthly_revenue: { type: 'number', default: 0 },
        growth_rate:  { type: 'number', default: 0, description: 'Monthly revenue growth as decimal (e.g. 0.1 = 10%).' },
        horizon_months:{ type: 'number', default: 24 },
      },
      required: ['cash_balance', 'monthly_burn'],
    },
    run({ cash_balance, monthly_burn, monthly_revenue = 0, growth_rate = 0, horizon_months = 24 }) {
      let cash = cash_balance, rev = monthly_revenue, months = 0;
      const series = [];
      while (cash > 0 && months < horizon_months) {
        const net = monthly_burn - rev;
        series.push({ month: months + 1, cash: Math.round(cash * 100) / 100,
                      revenue: Math.round(rev * 100) / 100, net_burn: Math.round(net * 100) / 100 });
        cash -= net;
        rev *= (1 + growth_rate);
        months++;
        if (net <= 0) { series[series.length - 1].breakeven = true; break; }
      }
      return {
        ok: true,
        runway_months: cash <= 0 ? months : `> ${horizon_months}`,
        breakeven_month: series.find(x => x.breakeven)?.month ?? null,
        ending_cash: Math.round(cash * 100) / 100,
        series,
        summary: cash <= 0
          ? `Runway: ${months} months at current trajectory.`
          : `Breakeven before horizon (${horizon_months} months).`,
      };
    },
  },

  {
    name: 'finance.roi',
    description: 'Return on investment + payback period + annualized ROI.',
    inputSchema: {
      type: 'object',
      properties: {
        initial_cost: { type: 'number' },
        cash_flows:   { type: 'array', items: { type: 'number' }, description: 'Monthly cash inflows.' },
      },
      required: ['initial_cost', 'cash_flows'],
    },
    run({ initial_cost, cash_flows }) {
      const total = cash_flows.reduce((s, v) => s + v, 0);
      const profit = total - initial_cost;
      let cum = -initial_cost, payback = null;
      for (let i = 0; i < cash_flows.length; i++) {
        cum += cash_flows[i];
        if (cum >= 0 && payback === null) { payback = i + 1; break; }
      }
      const months = cash_flows.length;
      const roi = initial_cost > 0 ? profit / initial_cost : 0;
      const annualized = months > 0 ? Math.pow(1 + roi, 12 / months) - 1 : 0;
      return {
        ok: true,
        initial_cost, total_returns: total, profit,
        roi: Math.round(roi * 10000) / 10000,
        roi_percent: `${(roi * 100).toFixed(2)}%`,
        annualized_roi: Math.round(annualized * 10000) / 10000,
        annualized_percent: `${(annualized * 100).toFixed(2)}%`,
        payback_months: payback,
      };
    },
  },

  {
    name: 'finance.npv',
    description: 'Net present value of a stream of cash flows at a given monthly discount rate.',
    inputSchema: {
      type: 'object',
      properties: {
        cash_flows:    { type: 'array', items: { type: 'number' }, description: 'Period 0 first, then forward.' },
        discount_rate: { type: 'number', description: 'Per-period rate as decimal (monthly).' },
      },
      required: ['cash_flows', 'discount_rate'],
    },
    run({ cash_flows, discount_rate }) {
      let npv = 0;
      for (let t = 0; t < cash_flows.length; t++) npv += cash_flows[t] / Math.pow(1 + discount_rate, t);
      return { ok: true, npv: Math.round(npv * 100) / 100, periods: cash_flows.length, rate: discount_rate };
    },
  },

  {
    name: 'finance.expense_report',
    description: 'Build an expense report (markdown). Totals + per-category breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        author:   { type: 'string' },
        period:   { type: 'string' },
        currency: { type: 'string', default: 'USD' },
        line_items: { type: 'array', items: { type: 'object',
          properties: { date: {type:'string'}, category: {type:'string'},
                        description: {type:'string'}, amount: {type:'number'} },
          required: ['date', 'category', 'amount'] } },
      },
      required: ['author', 'line_items'],
    },
    run({ author, period = new Date().toISOString().slice(0, 7),
          currency = 'USD', line_items }) {
      const byCat = {};
      let total = 0;
      for (const li of line_items) {
        byCat[li.category] = (byCat[li.category] || 0) + li.amount;
        total += li.amount;
      }
      const md =
`# Expense Report — ${author}\n_${period}_\n\n` +
`**Total: ${fmt(total, currency)}**\n\n` +
`## By Category\n` +
Object.entries(byCat).sort((a, b) => b[1] - a[1])
  .map(([c, v]) => `- ${c} — **${fmt(v, currency)}**`).join('\n') + '\n\n' +
`## Line Items\n` +
'| Date | Category | Description | Amount |\n|---|---|---|---:|\n' +
line_items.map(li => `| ${li.date} | ${li.category} | ${li.description ?? ''} | ${fmt(li.amount, currency)} |`).join('\n');
      return { ok: true, kind: 'markdown', markdown: md, total, by_category: byCat };
    },
  },

  {
    name: 'finance.tip_split',
    description: 'Split a bill with tax + tip across N people.',
    inputSchema: {
      type: 'object',
      properties: {
        subtotal:    { type: 'number' },
        tax_rate:    { type: 'number', default: 0.0825 },
        tip_percent: { type: 'number', default: 0.20 },
        people:      { type: 'number', default: 1 },
      },
      required: ['subtotal'],
    },
    run({ subtotal, tax_rate = 0.0825, tip_percent = 0.20, people = 1 }) {
      const tax = subtotal * tax_rate;
      const tip = subtotal * tip_percent;
      const total = subtotal + tax + tip;
      const each = total / Math.max(1, people);
      return { ok: true, subtotal, tax: round(tax), tip: round(tip), total: round(total),
               per_person: round(each), people };
    },
  },

  {
    name: 'finance.loan_payment',
    description: 'Standard amortizing loan: monthly payment, total interest, payoff schedule (first 12 + last).',
    inputSchema: {
      type: 'object',
      properties: {
        principal:     { type: 'number' },
        annual_rate:   { type: 'number', description: 'APR as decimal (e.g. 0.065).' },
        term_months:   { type: 'number' },
      },
      required: ['principal', 'annual_rate', 'term_months'],
    },
    run({ principal, annual_rate, term_months }) {
      const r = annual_rate / 12;
      const pmt = r === 0
        ? principal / term_months
        : (principal * r) / (1 - Math.pow(1 + r, -term_months));
      let balance = principal, totalInterest = 0;
      const schedule = [];
      for (let i = 1; i <= term_months; i++) {
        const interest = balance * r;
        const principalPart = pmt - interest;
        balance -= principalPart;
        totalInterest += interest;
        if (i <= 12 || i === term_months) schedule.push({
          month: i, payment: round(pmt), interest: round(interest),
          principal: round(principalPart), balance: round(Math.max(0, balance)),
        });
      }
      return { ok: true, monthly_payment: round(pmt), total_paid: round(pmt * term_months),
               total_interest: round(totalInterest), schedule_preview: schedule };
    },
  },
];

function round(n) { return Math.round(n * 100) / 100; }
