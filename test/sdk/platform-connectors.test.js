/**
 * Test suite: X Platform Connectors (all 50)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { XPlatformConnector, X_PLATFORM_CONNECTORS_COUNT, X_PLATFORM_CONNECTORS_VERSION } from '../../sdk/x-platform-connectors/src/index.js';

// Original 7
import { SquareConnector }      from '../../sdk/x-platform-connectors/src/connectors/square.js';
import { ShopifyConnector }     from '../../sdk/x-platform-connectors/src/connectors/shopify.js';
import { StripeConnector }      from '../../sdk/x-platform-connectors/src/connectors/stripe.js';
import { QuickBooksConnector }  from '../../sdk/x-platform-connectors/src/connectors/quickbooks.js';
import { PayPalConnector }      from '../../sdk/x-platform-connectors/src/connectors/paypal.js';
import { WooCommerceConnector } from '../../sdk/x-platform-connectors/src/connectors/woocommerce.js';
import { GenericRestConnector } from '../../sdk/x-platform-connectors/src/connectors/generic-rest.js';

// E-commerce
import { AmazonSellerConnector }      from '../../sdk/x-platform-connectors/src/connectors/amazon-seller.js';
import { EbayConnector }              from '../../sdk/x-platform-connectors/src/connectors/ebay.js';
import { EtsyConnector }              from '../../sdk/x-platform-connectors/src/connectors/etsy.js';
import { BigCommerceConnector }       from '../../sdk/x-platform-connectors/src/connectors/bigcommerce.js';
import { MagentoConnector }           from '../../sdk/x-platform-connectors/src/connectors/magento.js';
import { WalmartSellerConnector }     from '../../sdk/x-platform-connectors/src/connectors/walmart-seller.js';
import { TikTokShopConnector }        from '../../sdk/x-platform-connectors/src/connectors/tiktok-shop.js';
import { PinterestShoppingConnector } from '../../sdk/x-platform-connectors/src/connectors/pinterest-shopping.js';

// Payments / Fintech
import { BraintreeConnector }         from '../../sdk/x-platform-connectors/src/connectors/braintree.js';
import { AuthorizeNetConnector }      from '../../sdk/x-platform-connectors/src/connectors/authorize-net.js';
import { KlarnaConnector }            from '../../sdk/x-platform-connectors/src/connectors/klarna.js';
import { AfterpayConnector }          from '../../sdk/x-platform-connectors/src/connectors/afterpay.js';
import { AdyenConnector }             from '../../sdk/x-platform-connectors/src/connectors/adyen.js';
import { PlaidConnector }             from '../../sdk/x-platform-connectors/src/connectors/plaid.js';
import { CoinbaseCommerceConnector }  from '../../sdk/x-platform-connectors/src/connectors/coinbase-commerce.js';
import { VenmoBusinessConnector }     from '../../sdk/x-platform-connectors/src/connectors/venmo-business.js';

// Accounting / Finance
import { XeroConnector }       from '../../sdk/x-platform-connectors/src/connectors/xero.js';
import { FreshBooksConnector } from '../../sdk/x-platform-connectors/src/connectors/freshbooks.js';
import { WaveConnector }       from '../../sdk/x-platform-connectors/src/connectors/wave.js';
import { ZohoBooksConnector }  from '../../sdk/x-platform-connectors/src/connectors/zoho-books.js';
import { NetSuiteConnector }   from '../../sdk/x-platform-connectors/src/connectors/netsuite.js';
import { SageConnector }       from '../../sdk/x-platform-connectors/src/connectors/sage.js';

// CRM / Sales
import { SalesforceConnector } from '../../sdk/x-platform-connectors/src/connectors/salesforce.js';
import { HubSpotConnector }    from '../../sdk/x-platform-connectors/src/connectors/hubspot.js';
import { PipedriveConnector }  from '../../sdk/x-platform-connectors/src/connectors/pipedrive.js';
import { ZohoCRMConnector }    from '../../sdk/x-platform-connectors/src/connectors/zoho-crm.js';
import { FreshsalesConnector } from '../../sdk/x-platform-connectors/src/connectors/freshsales.js';

// Marketing / Communication
import { MailchimpConnector }      from '../../sdk/x-platform-connectors/src/connectors/mailchimp.js';
import { KlaviyoConnector }        from '../../sdk/x-platform-connectors/src/connectors/klaviyo.js';
import { SendGridConnector }       from '../../sdk/x-platform-connectors/src/connectors/sendgrid.js';
import { TwilioConnector }         from '../../sdk/x-platform-connectors/src/connectors/twilio.js';
import { ActiveCampaignConnector } from '../../sdk/x-platform-connectors/src/connectors/activecampaign.js';

// Analytics / Data
import { GoogleAnalyticsConnector } from '../../sdk/x-platform-connectors/src/connectors/google-analytics.js';
import { MixpanelConnector }        from '../../sdk/x-platform-connectors/src/connectors/mixpanel.js';
import { SegmentConnector }         from '../../sdk/x-platform-connectors/src/connectors/segment.js';

// Logistics / Shipping
import { ShipStationConnector } from '../../sdk/x-platform-connectors/src/connectors/shipstation.js';
import { EasyPostConnector }    from '../../sdk/x-platform-connectors/src/connectors/easypost.js';
import { FedExConnector }       from '../../sdk/x-platform-connectors/src/connectors/fedex.js';
import { UPSConnector }         from '../../sdk/x-platform-connectors/src/connectors/ups.js';

// HR / Payroll
import { GustoConnector }    from '../../sdk/x-platform-connectors/src/connectors/gusto.js';
import { RipplingConnector } from '../../sdk/x-platform-connectors/src/connectors/rippling.js';

// Productivity / Data
import { AirtableConnector }     from '../../sdk/x-platform-connectors/src/connectors/airtable.js';
import { GoogleSheetsConnector } from '../../sdk/x-platform-connectors/src/connectors/google-sheets.js';

// ─── Index exports ─────────────────────────────────────────────────────────────
describe('x-platform-connectors/index', () => {
  it('exports X_PLATFORM_CONNECTORS_COUNT = 50', () => {
    assert.equal(X_PLATFORM_CONNECTORS_COUNT, 50);
  });
  it('exports X_PLATFORM_CONNECTORS_VERSION', () => {
    assert.ok(typeof X_PLATFORM_CONNECTORS_VERSION === 'string');
  });
});

// ─── XPlatformConnector base ───────────────────────────────────────────────────
describe('XPlatformConnector (base)', () => {
  it('requires name', () => {
    assert.throws(() => new XPlatformConnector({ name: '' }), /name/i);
  });

  it('isConnected starts false', () => {
    const c = new SquareConnector();
    assert.equal(c.isConnected, false);
  });

  it('connect sets isConnected true', async () => {
    const c = new SquareConnector();
    await c.connect();
    assert.equal(c.isConnected, true);
  });

  it('execute throws on unknown operation', async () => {
    const c = new SquareConnector();
    await c.connect();
    await assert.rejects(() => c.execute('bogus.op'), /unknown operation/i);
  });

  it('_requireConnected throws if not connected', async () => {
    const c = new AmazonSellerConnector();
    await assert.rejects(() => c.execute('products.list'), /not connected/i);
  });

  it('health returns status', async () => {
    const c = new StripeConnector();
    const h = await c.health();
    assert.ok(h.status);
  });

  it('toJSON returns name and capabilities', () => {
    const c = new QuickBooksConnector();
    const j = c.toJSON();
    assert.ok(j.name);
    assert.ok(Array.isArray(j.capabilities));
  });
});

// ─── Generic connector smoke test helper ──────────────────────────────────────
async function smokeTest(ConnectorClass, firstOp) {
  const c = new ConnectorClass();
  assert.ok(c.name, `${ConnectorClass.name} has name`);
  assert.ok(Array.isArray(c.capabilities), `${ConnectorClass.name} has capabilities`);
  assert.equal(c.isConnected, false, `${ConnectorClass.name} starts disconnected`);
  await c.connect();
  assert.equal(c.isConnected, true);
  const ops = c._operations();
  assert.ok(Object.keys(ops).length > 0, `${ConnectorClass.name} has operations`);
  if (firstOp) {
    const result = await c.execute(firstOp);
    assert.ok(result !== null && result !== undefined, `${ConnectorClass.name}.${firstOp} returns result`);
  }
}

// ─── Original 7 connectors ────────────────────────────────────────────────────
describe('SquareConnector',      () => { it('smoke', () => smokeTest(SquareConnector,      'payments.list')); });
describe('ShopifyConnector',     () => { it('smoke', () => smokeTest(ShopifyConnector,     'products.list')); });
describe('StripeConnector',      () => { it('smoke', () => smokeTest(StripeConnector,      'payments.list')); });
describe('QuickBooksConnector',  () => { it('smoke', () => smokeTest(QuickBooksConnector,  'accounts.list')); });
describe('PayPalConnector',      () => { it('smoke', () => smokeTest(PayPalConnector,      'orders.create')); });
describe('WooCommerceConnector', () => { it('smoke', () => smokeTest(WooCommerceConnector, 'products.list')); });
describe('GenericRestConnector', () => {
  it('smoke', async () => {
    const c = new GenericRestConnector({ baseUrl: 'https://api.example.com' });
    assert.ok(c.name);
    await c.connect();
    assert.equal(c.isConnected, true);
    const ops = c._operations();
    assert.ok(Object.keys(ops).length > 0);
  });
});

// ─── E-commerce connectors ────────────────────────────────────────────────────
describe('AmazonSellerConnector',      () => { it('smoke', () => smokeTest(AmazonSellerConnector,      'products.list')); });
describe('EbayConnector',              () => { it('smoke', () => smokeTest(EbayConnector,              'listings.list')); });
describe('EtsyConnector',              () => { it('smoke', () => smokeTest(EtsyConnector,              'listings.list')); });
describe('BigCommerceConnector',       () => { it('smoke', () => smokeTest(BigCommerceConnector,       'products.list')); });
describe('MagentoConnector',           () => { it('smoke', () => smokeTest(MagentoConnector,           'products.list')); });
describe('WalmartSellerConnector',     () => { it('smoke', () => smokeTest(WalmartSellerConnector,     'items.list')); });
describe('TikTokShopConnector',        () => { it('smoke', () => smokeTest(TikTokShopConnector,        'products.list')); });
describe('PinterestShoppingConnector', () => { it('smoke', () => smokeTest(PinterestShoppingConnector, 'catalogs.list')); });

// ─── Payments / Fintech connectors ────────────────────────────────────────────
describe('BraintreeConnector',         () => { it('smoke', () => smokeTest(BraintreeConnector,         'payments.sale')); });
describe('AuthorizeNetConnector',      () => { it('smoke', () => smokeTest(AuthorizeNetConnector,      'payments.charge')); });
describe('KlarnaConnector',            () => { it('smoke', () => smokeTest(KlarnaConnector,            'orders.create')); });
describe('AfterpayConnector',          () => { it('smoke', () => smokeTest(AfterpayConnector,          'orders.create')); });
describe('AdyenConnector',             () => { it('smoke', () => smokeTest(AdyenConnector,             'payments.create')); });
describe('PlaidConnector',             () => { it('smoke', () => smokeTest(PlaidConnector,             'accounts.get')); });
describe('CoinbaseCommerceConnector',  () => { it('smoke', () => smokeTest(CoinbaseCommerceConnector,  'charges.create')); });
describe('VenmoBusinessConnector',     () => { it('smoke', () => smokeTest(VenmoBusinessConnector,     'payments.create')); });

// ─── Accounting / Finance connectors ─────────────────────────────────────────
describe('XeroConnector',       () => { it('smoke', () => smokeTest(XeroConnector,       'invoices.list')); });
describe('FreshBooksConnector', () => { it('smoke', () => smokeTest(FreshBooksConnector, 'invoices.list')); });
describe('WaveConnector',       () => { it('smoke', () => smokeTest(WaveConnector,       'invoices.list')); });
describe('ZohoBooksConnector',  () => { it('smoke', () => smokeTest(ZohoBooksConnector,  'invoices.list')); });
describe('NetSuiteConnector',   () => { it('smoke', () => smokeTest(NetSuiteConnector,   'records.get')); });
describe('SageConnector',       () => { it('smoke', () => smokeTest(SageConnector,       'invoices.list')); });

// ─── CRM / Sales connectors ───────────────────────────────────────────────────
describe('SalesforceConnector', () => { it('smoke', () => smokeTest(SalesforceConnector, 'leads.list')); });
describe('HubSpotConnector',    () => { it('smoke', () => smokeTest(HubSpotConnector,    'contacts.list')); });
describe('PipedriveConnector',  () => { it('smoke', () => smokeTest(PipedriveConnector,  'deals.list')); });
describe('ZohoCRMConnector',    () => { it('smoke', () => smokeTest(ZohoCRMConnector,    'leads.list')); });
describe('FreshsalesConnector', () => { it('smoke', () => smokeTest(FreshsalesConnector, 'leads.list')); });

// ─── Marketing / Communication connectors ─────────────────────────────────────
describe('MailchimpConnector',      () => { it('smoke', () => smokeTest(MailchimpConnector,      'campaigns.list')); });
describe('KlaviyoConnector',        () => { it('smoke', () => smokeTest(KlaviyoConnector,        'profiles.list')); });
describe('SendGridConnector',       () => { it('smoke', () => smokeTest(SendGridConnector,       'email.send')); });
describe('TwilioConnector',         () => { it('smoke', () => smokeTest(TwilioConnector,         'sms.send')); });
describe('ActiveCampaignConnector', () => { it('smoke', () => smokeTest(ActiveCampaignConnector, 'contacts.list')); });

// ─── Analytics / Data connectors ──────────────────────────────────────────────
describe('GoogleAnalyticsConnector', () => { it('smoke', () => smokeTest(GoogleAnalyticsConnector, 'reports.run')); });
describe('MixpanelConnector',        () => { it('smoke', () => smokeTest(MixpanelConnector,        'events.track')); });
describe('SegmentConnector',         () => { it('smoke', () => smokeTest(SegmentConnector,         'track.event')); });

// ─── Logistics / Shipping connectors ─────────────────────────────────────────
describe('ShipStationConnector', () => { it('smoke', () => smokeTest(ShipStationConnector, 'orders.list')); });
describe('EasyPostConnector',    () => { it('smoke', () => smokeTest(EasyPostConnector,    'shipments.create')); });
describe('FedExConnector',       () => { it('smoke', () => smokeTest(FedExConnector,       'rates.get')); });
describe('UPSConnector',         () => { it('smoke', () => smokeTest(UPSConnector,         'rates.shop')); });

// ─── HR / Payroll connectors ──────────────────────────────────────────────────
describe('GustoConnector',    () => { it('smoke', () => smokeTest(GustoConnector,    'employees.list')); });
describe('RipplingConnector', () => { it('smoke', () => smokeTest(RipplingConnector, 'employees.list')); });

// ─── Productivity / Data connectors ──────────────────────────────────────────
describe('AirtableConnector',     () => { it('smoke', () => smokeTest(AirtableConnector,     'bases.list')); });
describe('GoogleSheetsConnector', () => { it('smoke', () => smokeTest(GoogleSheetsConnector, 'spreadsheets.get')); });
