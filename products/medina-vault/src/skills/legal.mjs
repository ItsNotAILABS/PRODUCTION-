// skills/legal.mjs — real legal artifact generators.
//
// Each skill takes structured input, fills a template based on common
// standard forms (NDAs, demand letters, etc. — the structure of these
// forms is industry-standard and not copyrighted), validates fields,
// returns artifact text + a PDF buffer.
//
// IMPORTANT: every artifact carries a disclaimer that it is a template,
// not legal advice, and should be reviewed by counsel before execution.
// We are providing leverage, not malpractice insurance.

import { buildPDF } from '../pdf.mjs';

function need(input, fields) {
  for (const f of fields) {
    if (input[f] == null || input[f] === '') return { ok: false, reason: `MISSING_FIELD:${f}` };
  }
  return null;
}

const FOOTER_NOTE =
  'This document was generated from a standard-form template by Medina Vault. ' +
  'It is not legal advice. Review by qualified counsel licensed in the relevant ' +
  'jurisdiction is required before execution.';

const today = () => new Date().toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────────────────
// NDA · Mutual
// ─────────────────────────────────────────────────────────────────────────

export const NDA_MUTUAL = {
  name: 'legal.nda_mutual',
  description: 'Mutual non-disclosure agreement. Two parties exchange confidential information; both bound to protect.',
  inputSchema: {
    type: 'object',
    properties: {
      party_a_name:     { type: 'string', description: 'Disclosing party A legal name.' },
      party_a_address:  { type: 'string' },
      party_b_name:     { type: 'string', description: 'Disclosing party B legal name.' },
      party_b_address:  { type: 'string' },
      purpose:          { type: 'string', description: 'Why the parties are exchanging confidential information.' },
      term_years:       { type: 'number', default: 3 },
      jurisdiction:     { type: 'string', default: 'State of Texas', description: 'Governing law jurisdiction.' },
      effective_date:   { type: 'string', description: 'YYYY-MM-DD; defaults to today.' },
    },
    required: ['party_a_name', 'party_b_name', 'purpose'],
  },
  run({ party_a_name, party_a_address = '[address on file]',
        party_b_name, party_b_address = '[address on file]',
        purpose, term_years = 3,
        jurisdiction = 'State of Texas',
        effective_date = today() }) {
    const err = need(arguments[0] || {}, ['party_a_name', 'party_b_name', 'purpose']);
    if (err) return err;

    const blocks = [
      { type: 'paragraph', text:
        `This Mutual Non-Disclosure Agreement (this "Agreement") is entered into as of ${effective_date} ` +
        `(the "Effective Date") by and between ${party_a_name}, with an address at ${party_a_address} ("Party A"), ` +
        `and ${party_b_name}, with an address at ${party_b_address} ("Party B"). Party A and Party B are each ` +
        `referred to herein as a "Party" and collectively as the "Parties".` },

      { type: 'heading', text: '1. Purpose' },
      { type: 'paragraph', text:
        `The Parties wish to explore a potential business relationship in connection with ${purpose} ` +
        `(the "Purpose"). In connection therewith, each Party may disclose to the other certain confidential and ` +
        `proprietary information that it desires to protect against unrestricted disclosure or competitive use.` },

      { type: 'heading', text: '2. Confidential Information' },
      { type: 'paragraph', text:
        `"Confidential Information" means any non-public information of a Party, whether disclosed orally, ` +
        `in writing, electronically, or by inspection, that is identified as confidential or that a reasonable ` +
        `person would understand to be confidential given the nature of the information and the circumstances ` +
        `of disclosure. Confidential Information includes, without limitation, technical data, trade secrets, ` +
        `know-how, research, product plans, software, source code, customer lists, financial information, ` +
        `pricing, marketing plans, business strategies, and personnel information.` },

      { type: 'heading', text: '3. Obligations' },
      { type: 'bullets', items: [
        'Each Party shall hold all Confidential Information of the other Party in strict confidence and not disclose it to any third party without the prior written consent of the disclosing Party.',
        'Each Party shall use the Confidential Information solely for the Purpose and shall not use it for its own benefit or for the benefit of any third party.',
        'Each Party shall protect the Confidential Information using at least the same degree of care it uses to protect its own confidential information, and in no event less than a reasonable degree of care.',
        'Each Party may disclose Confidential Information only to those of its employees, contractors, and advisors who have a need to know for the Purpose and who are bound by written obligations of confidentiality no less protective than those in this Agreement.',
      ]},

      { type: 'heading', text: '4. Exclusions' },
      { type: 'paragraph', text:
        `The obligations in Section 3 shall not apply to information that the receiving Party can demonstrate ` +
        `(a) was rightfully in its possession without obligation of confidentiality prior to receipt; ` +
        `(b) is or becomes publicly known through no breach of this Agreement; (c) is independently developed ` +
        `without use of or reference to the Confidential Information; or (d) is rightfully obtained from a ` +
        `third party not under any confidentiality obligation.` },

      { type: 'heading', text: '5. Compelled Disclosure' },
      { type: 'paragraph', text:
        `If the receiving Party is required by law, regulation, or court order to disclose Confidential ` +
        `Information, it shall, to the extent legally permitted, give prompt written notice to the disclosing ` +
        `Party and cooperate, at the disclosing Party's expense, in any reasonable effort to obtain a ` +
        `protective order or similar relief.` },

      { type: 'heading', text: '6. Term' },
      { type: 'paragraph', text:
        `This Agreement shall remain in effect for a period of ${term_years} years from the Effective Date, ` +
        `provided that the obligations of confidentiality with respect to any Confidential Information ` +
        `disclosed during the term shall survive for the longer of (i) ${term_years} years from the date of ` +
        `disclosure or (ii) such period as the information remains a trade secret under applicable law.` },

      { type: 'heading', text: '7. No License; No Warranty' },
      { type: 'paragraph', text:
        `Nothing in this Agreement grants either Party any license or right, by implication, estoppel, or ` +
        `otherwise, to any Confidential Information of the other Party. All Confidential Information is ` +
        `provided "AS IS" without warranty of any kind.` },

      { type: 'heading', text: '8. Return or Destruction' },
      { type: 'paragraph', text:
        `Upon written request of the disclosing Party, the receiving Party shall promptly return or destroy ` +
        `all tangible materials containing Confidential Information and certify such destruction in writing.` },

      { type: 'heading', text: '9. Governing Law' },
      { type: 'paragraph', text:
        `This Agreement shall be governed by and construed in accordance with the laws of the ${jurisdiction}, ` +
        `without regard to its conflict-of-laws principles. The Parties consent to the exclusive jurisdiction ` +
        `and venue of the state and federal courts located in that jurisdiction for any dispute arising under ` +
        `or in connection with this Agreement.` },

      { type: 'heading', text: '10. Miscellaneous' },
      { type: 'paragraph', text:
        `This Agreement constitutes the entire agreement of the Parties with respect to its subject matter and ` +
        `supersedes all prior or contemporaneous agreements or understandings, written or oral. It may be ` +
        `amended only by a writing signed by both Parties. If any provision is held invalid, the remaining ` +
        `provisions shall continue in full force. The Parties may execute this Agreement in counterparts, ` +
        `each of which shall be deemed an original.` },

      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: 'IN WITNESS WHEREOF, the Parties have executed this Agreement as of the Effective Date.' },
      { type: 'spacer', height: 18 },
      { type: 'paragraph', text: `${party_a_name}\n\nBy: ______________________________\nName:\nTitle:\nDate:` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `${party_b_name}\n\nBy: ______________________________\nName:\nTitle:\nDate:` },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];

    const pdf = buildPDF({
      title: 'MUTUAL NON-DISCLOSURE AGREEMENT',
      subtitle: `Effective ${effective_date} · ${party_a_name} ↔ ${party_b_name}`,
      blocks,
    });
    return { ok: true, kind: 'pdf', filename: `NDA_Mutual_${effective_date}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Mutual NDA between ${party_a_name} and ${party_b_name}, ${term_years}-year term, governed by ${jurisdiction}.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Demand Letter
// ─────────────────────────────────────────────────────────────────────────

export const DEMAND_LETTER = {
  name: 'legal.demand_letter',
  description: 'Pre-litigation demand letter. Notice of claim, statement of facts, demand for cure, deadline.',
  inputSchema: {
    type: 'object',
    properties: {
      sender_name:     { type: 'string' },
      sender_address:  { type: 'string' },
      recipient_name:  { type: 'string' },
      recipient_address: { type: 'string' },
      claim_summary:   { type: 'string', description: 'One sentence describing the breach or harm.' },
      facts:           { type: 'array', items: { type: 'string' }, description: 'Bulleted statement of facts.' },
      demand:          { type: 'string', description: 'What is being demanded (payment, performance, etc).' },
      amount_usd:      { type: 'number' },
      deadline_days:   { type: 'number', default: 14 },
      jurisdiction:    { type: 'string', default: 'State of Texas' },
    },
    required: ['sender_name', 'recipient_name', 'claim_summary', 'demand'],
  },
  run(input) {
    const err = need(input, ['sender_name', 'recipient_name', 'claim_summary', 'demand']);
    if (err) return err;
    const {
      sender_name, sender_address = '[address on file]',
      recipient_name, recipient_address = '[address on file]',
      claim_summary, facts = [], demand, amount_usd,
      deadline_days = 14, jurisdiction = 'State of Texas',
    } = input;
    const deadline = new Date(Date.now() + deadline_days * 86400000).toISOString().slice(0, 10);

    const blocks = [
      { type: 'paragraph', text: `${sender_name}\n${sender_address}\n\n${today()}` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `${recipient_name}\n${recipient_address}` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `Re: Notice of Claim and Demand for ${demand}` },
      { type: 'spacer', height: 8 },
      { type: 'paragraph', text: `Dear ${recipient_name}:` },

      { type: 'paragraph', text:
        `This letter constitutes formal notice of a claim arising from ${claim_summary} ` +
        `Please give this matter your immediate attention.` },

      { type: 'heading', text: 'Statement of Facts' },
      facts.length
        ? { type: 'bullets', items: facts }
        : { type: 'paragraph', text: '[Facts on file with sender.]' },

      { type: 'heading', text: 'Demand' },
      { type: 'paragraph', text:
        `Demand is hereby made that you ${demand}` +
        (amount_usd ? `, including payment in the amount of $${Number(amount_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}.` : '.') },

      { type: 'heading', text: 'Deadline' },
      { type: 'paragraph', text:
        `You have ${deadline_days} days from the date of this letter, until ${deadline}, to comply with this demand. ` +
        `If you fail to do so, the undersigned will pursue all available legal remedies, including but not limited ` +
        `to filing a civil action in the appropriate court in the ${jurisdiction}, and will seek recovery of all ` +
        `damages, costs, and attorneys' fees permitted by law.` },

      { type: 'paragraph', text:
        `This letter is sent without prejudice to any rights, remedies, or defenses, all of which are expressly ` +
        `reserved. Nothing herein constitutes a waiver of any claim. If you have retained counsel, please direct ` +
        `your attorney to contact the undersigned at once.` },

      { type: 'spacer', height: 18 },
      { type: 'paragraph', text: 'Sincerely,\n\n\n______________________________\n' + sender_name },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];

    const pdf = buildPDF({
      title: 'DEMAND LETTER',
      subtitle: `${sender_name} → ${recipient_name} · ${today()}`,
      blocks,
    });
    return { ok: true, kind: 'pdf', filename: `Demand_${today()}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Demand letter from ${sender_name} to ${recipient_name}; deadline ${deadline}.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Independent Contractor Agreement
// ─────────────────────────────────────────────────────────────────────────

export const CONTRACTOR_AGREEMENT = {
  name: 'legal.contractor_agreement',
  description: '1099 independent contractor agreement. Scope, deliverables, payment, IP, term, termination.',
  inputSchema: {
    type: 'object',
    properties: {
      client_name:     { type: 'string' },
      contractor_name: { type: 'string' },
      scope:           { type: 'string', description: 'Description of services / deliverables.' },
      rate:            { type: 'string', description: 'e.g. "$150/hour" or "$10,000 fixed".' },
      term_months:     { type: 'number', default: 6 },
      jurisdiction:    { type: 'string', default: 'State of Texas' },
      effective_date:  { type: 'string' },
    },
    required: ['client_name', 'contractor_name', 'scope', 'rate'],
  },
  run(input) {
    const err = need(input, ['client_name', 'contractor_name', 'scope', 'rate']);
    if (err) return err;
    const { client_name, contractor_name, scope, rate,
            term_months = 6, jurisdiction = 'State of Texas',
            effective_date = today() } = input;

    const blocks = [
      { type: 'paragraph', text:
        `This Independent Contractor Agreement (this "Agreement") is made as of ${effective_date} between ` +
        `${client_name} ("Client") and ${contractor_name} ("Contractor"). The parties agree as follows:` },

      { type: 'heading', text: '1. Services' },
      { type: 'paragraph', text: `Contractor shall perform the following services for Client (the "Services"): ${scope}` },

      { type: 'heading', text: '2. Compensation' },
      { type: 'paragraph', text:
        `Client shall pay Contractor at the rate of ${rate}. Invoices shall be issued monthly and paid within ` +
        `thirty (30) days of receipt. Contractor is responsible for all taxes on amounts received under this ` +
        `Agreement; no taxes will be withheld by Client.` },

      { type: 'heading', text: '3. Independent Contractor Status' },
      { type: 'paragraph', text:
        `Contractor is an independent contractor and not an employee, agent, partner, or joint venturer of ` +
        `Client. Contractor has sole discretion over the manner and means of performing the Services and shall ` +
        `not be entitled to any employee benefits.` },

      { type: 'heading', text: '4. Intellectual Property' },
      { type: 'paragraph', text:
        `All work product, deliverables, inventions, and materials created by Contractor in the course of ` +
        `performing the Services (collectively, the "Work Product") shall be the sole and exclusive property of ` +
        `Client. Contractor hereby irrevocably assigns to Client all right, title, and interest in and to the ` +
        `Work Product, including all intellectual property rights. Contractor agrees to execute any further ` +
        `documents reasonably required to perfect Client's ownership.` },

      { type: 'heading', text: '5. Confidentiality' },
      { type: 'paragraph', text:
        `Contractor shall hold in strict confidence all non-public information of Client received in connection ` +
        `with the Services and shall not use such information for any purpose other than performing the Services. ` +
        `This obligation survives termination of this Agreement.` },

      { type: 'heading', text: '6. Term and Termination' },
      { type: 'paragraph', text:
        `This Agreement shall remain in effect for ${term_months} months from the Effective Date unless ` +
        `terminated earlier. Either party may terminate this Agreement at any time on fourteen (14) days' ` +
        `written notice. Upon termination, Contractor shall promptly deliver all Work Product completed or in ` +
        `progress, and Client shall pay for all Services rendered through the effective date of termination.` },

      { type: 'heading', text: '7. Governing Law' },
      { type: 'paragraph', text:
        `This Agreement shall be governed by the laws of the ${jurisdiction}, without regard to its ` +
        `conflict-of-laws principles.` },

      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: 'AGREED:' },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `Client: ${client_name}\n\nBy: ______________________________\nName:\nTitle:\nDate:` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `Contractor: ${contractor_name}\n\nBy: ______________________________\nDate:` },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];

    const pdf = buildPDF({
      title: 'INDEPENDENT CONTRACTOR AGREEMENT',
      subtitle: `${client_name} & ${contractor_name} · Effective ${effective_date}`,
      blocks,
    });
    return { ok: true, kind: 'pdf', filename: `Contractor_${effective_date}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Independent contractor agreement: ${client_name} engages ${contractor_name} at ${rate}, ${term_months}-month term.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Cease and Desist
// ─────────────────────────────────────────────────────────────────────────

export const CEASE_AND_DESIST = {
  name: 'legal.cease_and_desist',
  description: 'Cease-and-desist letter. Identification of conduct, demand to stop, deadline, reservation of rights.',
  inputSchema: {
    type: 'object',
    properties: {
      sender_name:    { type: 'string' },
      sender_address: { type: 'string' },
      recipient_name: { type: 'string' },
      recipient_address: { type: 'string' },
      conduct:        { type: 'string', description: 'The conduct that must cease.' },
      basis:          { type: 'string', description: 'Legal basis for the demand (e.g., trademark infringement, contract breach).' },
      deadline_days:  { type: 'number', default: 10 },
      jurisdiction:   { type: 'string', default: 'State of Texas' },
    },
    required: ['sender_name', 'recipient_name', 'conduct', 'basis'],
  },
  run(input) {
    const err = need(input, ['sender_name', 'recipient_name', 'conduct', 'basis']);
    if (err) return err;
    const {
      sender_name, sender_address = '[address on file]',
      recipient_name, recipient_address = '[address on file]',
      conduct, basis, deadline_days = 10, jurisdiction = 'State of Texas',
    } = input;
    const deadline = new Date(Date.now() + deadline_days * 86400000).toISOString().slice(0, 10);

    const blocks = [
      { type: 'paragraph', text: `${sender_name}\n${sender_address}\n\n${today()}` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: `${recipient_name}\n${recipient_address}` },
      { type: 'spacer', height: 12 },
      { type: 'paragraph', text: 'Re: CEASE AND DESIST' },
      { type: 'spacer', height: 8 },
      { type: 'paragraph', text: `Dear ${recipient_name}:` },
      { type: 'paragraph', text:
        `It has come to our attention that you have engaged in the following conduct: ${conduct} This conduct ` +
        `constitutes ${basis} and is unlawful. You are hereby directed to immediately CEASE AND DESIST from ` +
        `any further such conduct.` },
      { type: 'paragraph', text:
        `You have ${deadline_days} days from the date of this letter, until ${deadline}, to (i) confirm in ` +
        `writing that you have ceased and will not resume the conduct described above; (ii) provide an ` +
        `accounting of all such conduct to date; and (iii) take all reasonable steps to remediate any harm ` +
        `caused. If you fail to do so, the undersigned will pursue all available legal remedies, including ` +
        `seeking injunctive relief, monetary damages, costs, and attorneys' fees in the appropriate court in ` +
        `the ${jurisdiction}.` },
      { type: 'paragraph', text:
        `This letter is sent without prejudice to any rights or remedies, all of which are expressly reserved. ` +
        `Nothing herein constitutes a waiver of any claim.` },
      { type: 'spacer', height: 18 },
      { type: 'paragraph', text: 'Sincerely,\n\n\n______________________________\n' + sender_name },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];

    const pdf = buildPDF({ title: 'CEASE AND DESIST',
      subtitle: `${sender_name} → ${recipient_name} · ${today()}`, blocks });
    return { ok: true, kind: 'pdf', filename: `CeaseDesist_${today()}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Cease-and-desist from ${sender_name} to ${recipient_name}; deadline ${deadline}.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Invoice
// ─────────────────────────────────────────────────────────────────────────

export const INVOICE = {
  name: 'legal.invoice',
  description: 'Professional services invoice. Itemized line entries, totals, payment terms.',
  inputSchema: {
    type: 'object',
    properties: {
      from_name:    { type: 'string' },
      from_address: { type: 'string' },
      bill_to_name: { type: 'string' },
      bill_to_address: { type: 'string' },
      invoice_number: { type: 'string' },
      issue_date:   { type: 'string' },
      due_days:     { type: 'number', default: 30 },
      line_items:   {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            quantity:    { type: 'number' },
            rate:        { type: 'number' },
          },
          required: ['description', 'quantity', 'rate'],
        },
      },
      notes:        { type: 'string' },
    },
    required: ['from_name', 'bill_to_name', 'invoice_number', 'line_items'],
  },
  run(input) {
    const err = need(input, ['from_name', 'bill_to_name', 'invoice_number', 'line_items']);
    if (err) return err;
    const { from_name, from_address = '', bill_to_name, bill_to_address = '',
            invoice_number, issue_date = today(), due_days = 30,
            line_items, notes = '' } = input;
    const due = new Date(Date.now() + due_days * 86400000).toISOString().slice(0, 10);
    const total = line_items.reduce((s, li) => s + li.quantity * li.rate, 0);
    const fmt = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const blocks = [
      { type: 'paragraph', text: `From:\n${from_name}\n${from_address}` },
      { type: 'spacer', height: 6 },
      { type: 'paragraph', text: `Bill To:\n${bill_to_name}\n${bill_to_address}` },
      { type: 'spacer', height: 6 },
      { type: 'paragraph', text: `Invoice #: ${invoice_number}\nIssue date: ${issue_date}\nDue date: ${due}` },
      { type: 'heading', text: 'Line Items' },
      { type: 'bullets', items: line_items.map(li =>
          `${li.description} — ${li.quantity} × ${fmt(li.rate)} = ${fmt(li.quantity * li.rate)}`) },
      { type: 'spacer', height: 8 },
      { type: 'paragraph', text: `TOTAL DUE: ${fmt(total)}` },
      { type: 'heading', text: 'Payment Terms' },
      { type: 'paragraph', text:
        `Net ${due_days} days from issue date. Late balances accrue interest at the lesser of 1.5% per month ` +
        `or the maximum rate permitted by law.` },
      ...(notes ? [{ type: 'heading', text: 'Notes' }, { type: 'paragraph', text: notes }] : []),
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];
    const pdf = buildPDF({ title: `INVOICE #${invoice_number}`,
      subtitle: `${from_name} → ${bill_to_name} · ${fmt(total)}`, blocks });
    return { ok: true, kind: 'pdf', filename: `Invoice_${invoice_number}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Invoice #${invoice_number} for ${fmt(total)}, due ${due}.` };
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Engagement Letter (attorney–client retainer)
// ─────────────────────────────────────────────────────────────────────────

export const ENGAGEMENT_LETTER = {
  name: 'legal.engagement_letter',
  description: 'Attorney-client engagement / retainer letter. Scope, fees, scope limits, conflicts, termination.',
  inputSchema: {
    type: 'object',
    properties: {
      firm_name:   { type: 'string' },
      attorney:    { type: 'string' },
      client_name: { type: 'string' },
      matter:      { type: 'string', description: 'Description of the matter / scope of representation.' },
      fee_basis:   { type: 'string', description: 'e.g. "$425/hour", "flat fee of $5,000", "contingency 33%".' },
      retainer:    { type: 'number', description: 'Initial retainer USD; 0 for none.' },
      jurisdiction: { type: 'string', default: 'State of Texas' },
    },
    required: ['firm_name', 'attorney', 'client_name', 'matter', 'fee_basis'],
  },
  run(input) {
    const err = need(input, ['firm_name', 'attorney', 'client_name', 'matter', 'fee_basis']);
    if (err) return err;
    const { firm_name, attorney, client_name, matter, fee_basis,
            retainer = 0, jurisdiction = 'State of Texas' } = input;
    const blocks = [
      { type: 'paragraph', text: `${today()}` },
      { type: 'paragraph', text: `${client_name}\n[via email]` },
      { type: 'paragraph', text: `Re: Engagement of ${firm_name}` },
      { type: 'paragraph', text: `Dear ${client_name}:` },
      { type: 'paragraph', text:
        `Thank you for selecting ${firm_name} (the "Firm") to represent you. This letter sets forth the terms ` +
        `of our engagement.` },
      { type: 'heading', text: '1. Scope of Representation' },
      { type: 'paragraph', text: `The Firm will represent you in the following matter: ${matter}` },
      { type: 'heading', text: '2. Fees and Expenses' },
      { type: 'paragraph', text:
        `Our fee for this representation will be ${fee_basis}. ` +
        (retainer > 0
          ? `You agree to deposit an initial retainer of $${retainer.toLocaleString('en-US')} which will be held ` +
            `in our IOLTA trust account and applied against fees and expenses as they are incurred. `
          : '') +
        `You will be billed monthly. Invoices are due within 30 days. The Firm will incur reasonable out-of-pocket ` +
        `expenses on your behalf (court filing fees, deposition transcripts, copying, electronic research, etc.) ` +
        `which will be passed through at cost.` },
      { type: 'heading', text: '3. Responsibilities' },
      { type: 'paragraph', text:
        `The Firm will keep you informed of significant developments and respond promptly to your inquiries. ` +
        `You agree to provide truthful and complete information, cooperate in the representation, and pay invoices ` +
        `as they become due.` },
      { type: 'heading', text: '4. No Guarantees' },
      { type: 'paragraph', text:
        `The Firm has made no promises or guarantees regarding the outcome of any matter. Any expressions about ` +
        `the likely outcome are opinions only and are not assurances.` },
      { type: 'heading', text: '5. Termination' },
      { type: 'paragraph', text:
        `Either party may terminate this engagement at any time upon written notice, subject to applicable rules ` +
        `of professional conduct. Upon termination, you will pay all fees and expenses incurred through the date ` +
        `of termination.` },
      { type: 'heading', text: '6. Governing Law' },
      { type: 'paragraph', text:
        `This engagement and the attorney-client relationship are governed by the laws and ethics rules of the ` +
        `${jurisdiction}.` },
      { type: 'paragraph', text: `Please sign below to confirm your acceptance of these terms.` },
      { type: 'spacer', height: 18 },
      { type: 'paragraph', text: `Sincerely,\n\n______________________________\n${attorney}\n${firm_name}` },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: `AGREED AND ACCEPTED:\n\n______________________________\n${client_name}\nDate:` },
      { type: 'spacer', height: 24 },
      { type: 'paragraph', text: FOOTER_NOTE },
    ];
    const pdf = buildPDF({ title: 'ENGAGEMENT LETTER',
      subtitle: `${firm_name} & ${client_name}`, blocks });
    return { ok: true, kind: 'pdf', filename: `Engagement_${today()}.pdf`,
             bytes_base64: pdf.toString('base64'), bytes: pdf.length,
             summary: `Engagement letter: ${firm_name} retained by ${client_name} for ${matter}.` };
  },
};

export const LEGAL_SKILLS = [
  NDA_MUTUAL, DEMAND_LETTER, CONTRACTOR_AGREEMENT, CEASE_AND_DESIST, INVOICE, ENGAGEMENT_LETTER,
];
