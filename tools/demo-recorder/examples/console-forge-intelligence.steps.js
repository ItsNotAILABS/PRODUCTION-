// Example steps module for record.js. Drives the REAL console (served by
// apps/aether-desktop/server.js or the Python backend) through all three
// Forge Intelligence modes in the Worker Foundry tab: New worker, Configure
// a blueprint, Remix a blueprint. Selectors are read straight from
// apps/aether-console/index.html — verify against that file if the studio
// markup changes. Without ANTHROPIC_API_KEY set on the server, each mode
// ends on the real, honest "needs an API key" error — that's correct
// behavior to record, not a bug to work around.

async function typeSlow(page, sel, text, delay = 16) {
  await page.click(sel);
  await page.fill(sel, '');
  await page.type(sel, text, { delay });
}

async function run(page, { pause }) {
  await page.waitForSelector('.nav-item[data-page="foundry"]');
  await pause(600);
  await page.click('.nav-item[data-page="foundry"]');
  await pause(1200);
  await page.locator('.section-title', { hasText: 'Forge Intelligence' }).scrollIntoViewIfNeeded();
  await pause(900);

  // New worker tab (default)
  await typeSlow(page, '#studio-prompt',
    'A headless node that logs into our dashboard, exports the CSV, and uploads it to our endpoint every hour');
  await pause(600);
  await page.click('#studio-pane-generate button');
  await pause(1600);

  // Configure tab
  await page.click('.studio-tab[data-mode="configure"]');
  await pause(700);
  await page.selectOption('#studio-cfg-template', 'price-tracker');
  await pause(500);
  await typeSlow(page, '#studio-cfg-goal', 'Watch our pricing page and two competitors, alert only on real changes');
  await pause(500);
  await page.click('#studio-pane-configure button');
  await pause(1600);

  // Remix tab
  await page.click('.studio-tab[data-mode="remix"]');
  await pause(700);
  await page.selectOption('#studio-rmx-template', 'uptime-monitor');
  await pause(500);
  await typeSlow(page, '#studio-rmx-request', 'Also check TLS certificate expiry for each URL');
  await pause(500);
  await page.click('#studio-pane-remix button');
  await pause(1800);

  await page.locator('.section-title', { hasText: 'ready-made type' }).scrollIntoViewIfNeeded();
  await pause(1400);
}

module.exports = { run };
