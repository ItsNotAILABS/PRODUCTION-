'use strict';
/**
 * Microbots — X Ecosystem Entry Point
 * Aggregates platform, business, and operations micro-agents.
 */

const platform   = require('./platform/index.js');
const business   = require('./business/index.js');
const operations = require('./operations/index.js');

module.exports = { ...platform, ...business, ...operations, platform, business, operations };
