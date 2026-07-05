/**
 * PROTO-GEN-001: Multimodal Synthesis Protocol
 * ═══════════════════════════════════════════════════════════════════
 *
 * Coordinates the generation of outputs across modalities:
 *   text · code · image-spec · audio-spec · structured-data
 *
 * Each modality is a "channel" with its own phi-weighted quality score.
 * The synthesis engine fuses channel outputs into a coherent artifact.
 * Channel quality is maintained via phi-decay feedback — low-quality
 * channel outputs decay their weight so stronger channels dominate.
 *
 * Use cases: AI assistant responses, co-generation platforms, websites,
 * game asset pipelines, financial reports, architecture specs.
 */

'use strict';

const PHI     = 1.618033988749895;
const PHI_INV = 0.618033988749895;

const MODALITY = Object.freeze({
  TEXT:       'text',
  CODE:       'code',
  IMAGE_SPEC: 'image_spec',
  AUDIO_SPEC: 'audio_spec',
  DATA:       'data',
  UI_SPEC:    'ui_spec',
  DIAGRAM:    'diagram',
});

class ModalityChannel {
  constructor(type, weight = 1.0) {
    this.type    = type;
    this.weight  = weight;
    this.quality = 1.0;
    this.outputs = [];
  }

  push(content, metadata = {}) {
    const entry = { content, metadata, ts: Date.now(), quality: this.quality };
    this.outputs.push(entry);
    return entry;
  }

  latest() { return this.outputs[this.outputs.length - 1] || null; }

  reinforce(success) {
    this.quality = success
      ? Math.min(PHI, this.quality * PHI)
      : Math.max(0.01, this.quality * PHI_INV);
  }

  effectiveWeight() { return this.weight * this.quality; }
}

class MultimodalSynthesizer {
  constructor(activeModalities = Object.values(MODALITY)) {
    this.channels = {};
    for (const m of activeModalities) {
      this.channels[m] = new ModalityChannel(m, 1.0);
    }
    this._artifacts = [];
    this._beat = 0;
  }

  /**
   * Accept a generation output for a given modality.
   */
  receive(modality, content, metadata = {}) {
    if (!this.channels[modality]) {
      this.channels[modality] = new ModalityChannel(modality, PHI_INV);
    }
    return this.channels[modality].push(content, metadata);
  }

  /**
   * Fuse all channel outputs into a multimodal artifact.
   * Channels are weighted by effectiveWeight; empty channels are skipped.
   */
  fuse(label = 'artifact') {
    const parts = [];
    const totalWeight = Object.values(this.channels)
      .reduce((s, c) => s + c.effectiveWeight(), 0) || 1;

    for (const [type, ch] of Object.entries(this.channels)) {
      const latest = ch.latest();
      if (!latest) continue;
      parts.push({
        modality:        type,
        content:         latest.content,
        weight:          ch.effectiveWeight() / totalWeight,
        quality:         ch.quality,
      });
    }

    parts.sort((a, b) => b.weight - a.weight);

    const artifact = {
      id:        `artifact-${Date.now().toString(36)}`,
      label,
      beat:      this._beat,
      parts,
      phiScore:  parts.reduce((s, p) => s + p.weight * p.quality, 0),
      createdAt: Date.now(),
    };
    this._artifacts.push(artifact);
    return artifact;
  }

  /**
   * Reinforce all channels based on artifact quality feedback.
   */
  feedback(success) {
    for (const ch of Object.values(this.channels)) {
      if (ch.latest()) ch.reinforce(success);
    }
  }

  pulse() {
    this._beat++;
    return { beat: this._beat, channels: Object.keys(this.channels).length };
  }

  snapshot() {
    return {
      beat:      this._beat,
      channels:  Object.fromEntries(
        Object.entries(this.channels).map(([k, ch]) => [k, {
          weight:  ch.effectiveWeight().toFixed(4),
          quality: ch.quality.toFixed(4),
          outputs: ch.outputs.length,
        }])
      ),
      artifacts: this._artifacts.length,
    };
  }
}

/**
 * Build a standard synthesis request object.
 */
function synthRequest(prompt, modalities = [MODALITY.TEXT, MODALITY.CODE], context = {}) {
  return { prompt, modalities, context, ts: Date.now() };
}

module.exports = {
  MultimodalSynthesizer, ModalityChannel, MODALITY, synthRequest, PHI, PHI_INV,
};
