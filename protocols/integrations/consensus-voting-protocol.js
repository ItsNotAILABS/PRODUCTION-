/**
 * PROTO-I031: Consensus Voting Protocol (CVP)
 * Derives from: IntegrationOrchestrationProtocol, DataNormalizationProtocol
 * Multi-model consensus voting with phi-weighted reliability calibration.
 */

const PHI     = 1.618033988749895;
const PHI_INV = 1 / PHI;

export class ConsensusVotingProtocol {
  #voters = new Map(); // id → { model, weight, reliability, votes, agreements }

  constructor(config = {}) {
    this.version = '1.0.0';
    this.domain  = 'integrations';
    this.metrics = { rounds: 0, consensuses: 0, dissents: 0 };
  }

  /** Register a voter with an initial phi-weighted reliability. */
  registerVoter(id, model, weight = 1) {
    this.#voters.set(id, {
      model,
      weight,
      reliability: PHI_INV,
      votes      : 0,
      agreements : 0,
    });
    return { id, model, weight, reliability: PHI_INV };
  }

  /**
   * Collect votes from all voters (simulated) and return consensus.
   * Each voter produces a mock response — here we simulate diverse answers
   * using the voter's reliability to influence confidence.
   *
   * @param {string}  query
   * @param {{ timeout, minVoters }} opts
   * @returns {{ answer, confidence, agreement, dissents, votes }}
   */
  async vote(query, { timeout = 3000, minVoters = 2 } = {}) {
    if (this.#voters.size < minVoters) {
      throw new Error(`Need at least ${minVoters} voters; have ${this.#voters.size}`);
    }

    // Simulate vote collection with mock responses
    const votes = [...this.#voters.entries()].map(([voterId, voter]) => {
      // Simulate two possible answers; voter reliability biases toward 'answer_A'
      const answer     = Math.random() < voter.reliability ? 'answer_A' : 'answer_B';
      const confidence = Math.round((voter.reliability * PHI_INV + Math.random() * PHI_INV ** 2) * 1000) / 1000;
      voter.votes++;
      return { voterId, answer, confidence };
    });

    this.metrics.rounds++;
    const consensus = this.resolveConsensus(votes);
    return { ...consensus, votes };
  }

  /**
   * Resolve consensus from a list of votes.
   * Each vote is weighted by voter.weight * voter.reliability * confidence.
   *
   * @param {Array<{ voterId, answer, confidence }>} votes
   * @returns {{ answer, confidence, agreement, dissents }}
   */
  resolveConsensus(votes) {
    // Accumulate weighted scores per answer
    const answerScores = new Map();

    for (const vote of votes) {
      const voter = this.#voters.get(vote.voterId);
      const w     = voter
        ? voter.weight * voter.reliability * vote.confidence
        : vote.confidence;

      const prev = answerScores.get(vote.answer) ?? 0;
      answerScores.set(vote.answer, prev + w);
    }

    // Pick winning answer
    let winAnswer = null, winScore = -Infinity;
    for (const [answer, score] of answerScores) {
      if (score > winScore) { winScore = score; winAnswer = answer; }
    }

    const totalScore = [...answerScores.values()].reduce((s, v) => s + v, 0);
    const confidence = totalScore === 0 ? 0 : Math.round((winScore / totalScore) * 1000) / 1000;
    const agreement  = Math.round((votes.filter(v => v.answer === winAnswer).length / votes.length) * 1000) / 1000;
    const dissents   = votes.filter(v => v.answer !== winAnswer).map(v => ({ voterId: v.voterId, answer: v.answer }));

    this.metrics.consensuses++;
    if (dissents.length > 0) this.metrics.dissents += dissents.length;

    return { answer: winAnswer, confidence, agreement, dissents };
  }

  /**
   * Update voter reliability based on correctness.
   * If correct: reliability *= PHI (capped at 1).
   * If wrong:   reliability *= PHI_INV (floored at 0.1).
   */
  calibrateWeights(voterId, wasCorrect) {
    const voter = this.#voters.get(voterId);
    if (!voter) throw new Error(`Unknown voter: ${voterId}`);

    if (wasCorrect) {
      voter.reliability = Math.min(1, voter.reliability * PHI);
      voter.agreements++;
    } else {
      voter.reliability = Math.max(0.1, voter.reliability * PHI_INV);
    }

    return { voterId, reliability: Math.round(voter.reliability * 10000) / 10000 };
  }

  /** List all voters with current stats. */
  getVoters() {
    return [...this.#voters.entries()].map(([id, v]) => ({
      id,
      model       : v.model,
      weight      : v.weight,
      reliability : Math.round(v.reliability * 10000) / 10000,
      votes       : v.votes,
      agreements  : v.agreements,
      accuracyRate: v.votes === 0 ? 0 : Math.round((v.agreements / v.votes) * 1000) / 1000,
    }));
  }

  report() {
    return { version: this.version, domain: this.domain, metrics: this.metrics };
  }
}

export default ConsensusVotingProtocol;
