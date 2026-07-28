// Example steps module for record.js. Drives the REAL console (served by
// apps/aether-desktop/server.js or the Python backend — anything that
// serves apps/aether-console's index.html) through the Worker Foundry tab:
// open the catalog, configure Price Tracker's real params, and download a
// real forged zip. Selectors below are read straight from
// apps/aether-console/index.html — verify against that file if the console
// markup changes.

async function typeSlow(locator, text, delay = 24) {
  await locator.click();
  await locator.fill('');
  await locator.type(text, { delay });
}

async function run(page, { pause }) {
  await page.waitForSelector('.nav-item[data-page="foundry"]');
  await pause(600);
  await page.click('.nav-item[data-page="foundry"]');
  await pause(1200);

  const card = page.locator('.wcard', { has: page.locator('h4', { hasText: 'Price Tracker' }) }).first();
  await card.scrollIntoViewIfNeeded();
  await pause(600);

  // First button in the card's .row toggles it open ("Configure").
  await card.locator('.row button').first().click();
  await pause(700);

  const urlInput = card.locator('input[data-name="URLS"]');
  await typeSlow(urlInput, 'https://example.com/product,https://rival.example.com/product');
  await pause(700);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.locator('.row button', { hasText: 'Download' }).click(),
  ]);
  await download.path(); // wait for the real zip to finish writing
  await pause(1400);
}

module.exports = { run };
