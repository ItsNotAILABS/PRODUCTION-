'use strict';
/**
 * Platform Micro-Agents — X Ecosystem
 * One agent per commerce platform; each wraps the corresponding XPlatformConnector.
 */

const SquareAgent      = require('./square-agent.js');
const ShopifyAgent     = require('./shopify-agent.js');
const StripeAgent      = require('./stripe-agent.js');
const QuickBooksAgent  = require('./quickbooks-agent.js');
const PayPalAgent      = require('./paypal-agent.js');
const WooCommerceAgent = require('./woocommerce-agent.js');

module.exports = { SquareAgent, ShopifyAgent, StripeAgent, QuickBooksAgent, PayPalAgent, WooCommerceAgent };
