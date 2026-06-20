// channels.mjs — frequency-based AI-to-AI communication channels.
//
// Each channel has a frequency (Hz numeric, mostly for label/sort) + a name +
// optional access list. AIs publish messages, others subscribe.
//
// Persisted in vault::_meta.channels. Every publish fires a receipt.
//
// FREQUENCY = topic identity. AI tunes to a frequency by subscribing.

import { multiHash, randomToken } from './crypto_ext.mjs';

const MAX_BACKLOG = 200;

export class ChannelRegistry {
  constructor({ receipts } = {}) {
    this.receipts = receipts;
    /** @type {Map<string, Channel>} */
    this.channels = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.channels?.channels) return;
    for (const c of meta.channels.channels) this.channels.set(c.id, c);
  }
  toMeta() { return { channels: { channels: [...this.channels.values()] } }; }

  /** Create a new channel. */
  create({ name, frequency_hz, description, access = [], agent_id = 'system' }) {
    if (!name) return { ok: false, reason: 'NAME_REQUIRED' };
    const id = 'chan_' + (frequency_hz ? Math.round(frequency_hz) + '_' : '') + randomToken(6);
    const channel = {
      id, name,
      frequency_hz: typeof frequency_hz === 'number' ? frequency_hz : null,
      description: description || '',
      access, // empty = open, otherwise list of agent_ids permitted
      created_by: agent_id, created_at: Date.now(),
      messages: [], subscribers: [],
    };
    this.channels.set(id, channel);
    this.receipts?.append({
      kind: 'agent_dispatched', ref: `channel:${id}`, agent: 'system',
      meta: { action: 'channel_created', name, frequency_hz },
    });
    return { ok: true, ...channel };
  }

  list() {
    return [...this.channels.values()].map(c => ({
      id: c.id, name: c.name, frequency_hz: c.frequency_hz,
      description: c.description, message_count: c.messages.length,
      subscribers: c.subscribers, access_open: c.access.length === 0,
    })).sort((a, b) => (a.frequency_hz ?? 0) - (b.frequency_hz ?? 0));
  }

  _permits(channel, agent_id) {
    if (!channel) return false;
    if (channel.access.length === 0) return true;
    return channel.access.includes(agent_id);
  }

  subscribe(id, agent_id) {
    const c = this.channels.get(id);
    if (!c) return { ok: false, reason: 'CHANNEL_NOT_FOUND' };
    if (!this._permits(c, agent_id)) return { ok: false, reason: 'ACCESS_DENIED' };
    if (!c.subscribers.includes(agent_id)) c.subscribers.push(agent_id);
    return { ok: true, channel_id: id, agent_id, subscribers: c.subscribers };
  }

  unsubscribe(id, agent_id) {
    const c = this.channels.get(id);
    if (!c) return { ok: false, reason: 'CHANNEL_NOT_FOUND' };
    c.subscribers = c.subscribers.filter(s => s !== agent_id);
    return { ok: true, channel_id: id, agent_id };
  }

  publish(id, { agent_id, body, kind = 'message' }) {
    const c = this.channels.get(id);
    if (!c) return { ok: false, reason: 'CHANNEL_NOT_FOUND' };
    if (!this._permits(c, agent_id)) return { ok: false, reason: 'ACCESS_DENIED' };
    const msg_id = 'msg_' + randomToken(8);
    const ts = Date.now();
    const fingerprint = multiHash(JSON.stringify({ body, agent_id, ts })).combined;
    const msg = { msg_id, agent_id, kind, body, ts, fingerprint };
    c.messages.push(msg);
    while (c.messages.length > MAX_BACKLOG) c.messages.shift();
    this.receipts?.append({
      kind: 'agent_completed', ref: `channel:${id}:${msg_id}`, agent: agent_id,
      meta: { channel: c.name, frequency_hz: c.frequency_hz, kind,
              subscribers_notified: c.subscribers.length, fingerprint: fingerprint.slice(0, 16) },
    });
    return { ok: true, msg_id, channel_id: id, subscribers: c.subscribers, fingerprint };
  }

  read(id, { since_ts, since_msg_id, limit = 50, agent_id } = {}) {
    const c = this.channels.get(id);
    if (!c) return { ok: false, reason: 'CHANNEL_NOT_FOUND' };
    if (!this._permits(c, agent_id)) return { ok: false, reason: 'ACCESS_DENIED' };
    let msgs = c.messages;
    if (since_ts) msgs = msgs.filter(m => m.ts > since_ts);
    if (since_msg_id) {
      const idx = msgs.findIndex(m => m.msg_id === since_msg_id);
      if (idx >= 0) msgs = msgs.slice(idx + 1);
    }
    return { ok: true, channel_id: id, name: c.name,
             frequency_hz: c.frequency_hz, count: msgs.length, messages: msgs.slice(-limit) };
  }

  stats() {
    const arr = [...this.channels.values()];
    return {
      total: arr.length,
      total_messages: arr.reduce((s, c) => s + c.messages.length, 0),
      total_subscriptions: arr.reduce((s, c) => s + c.subscribers.length, 0),
      by_frequency: arr.filter(c => c.frequency_hz != null)
        .map(c => ({ name: c.name, hz: c.frequency_hz, msgs: c.messages.length })),
    };
  }
}

/** @typedef {{id:string,name:string,frequency_hz:number|null,description:string,access:string[],created_by:string,created_at:number,messages:object[],subscribers:string[]}} Channel */
