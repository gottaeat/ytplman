// Optional Playwright regression. Synthetic playlist only; no application dependency.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = 'http://127.0.0.1:3005';
const server = spawn(process.execPath, ['scripts/demo.mjs'], {
  env: { ...process.env, PORT: '3005' },
  stdio: 'pipe',
});
let browser;
try {
  const ready = await Promise.race([
    once(server.stdout, 'data').then((data) => String(data[0]).includes('Demo ready')),
    once(server, 'exit').then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 10000).unref()),
  ]);
  assert.ok(ready, 'Demo must start on isolated port 3005.');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: 1100, height: 1050 },
    colorScheme: 'light',
  });
  const external = [],
    errors = [],
    requests = [];
  await context.route('**/*', (route) => {
    if (
      !route
        .request()
        .url()
        .startsWith(base + '/')
    ) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.storageCalls = 0;
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear'])
      Storage.prototype[method] = () => {
        window.storageCalls++;
        throw new Error('Storage forbidden');
      };
    for (const method of ['open', 'deleteDatabase'])
      indexedDB[method] = () => {
        window.storageCalls++;
        throw new Error('Storage forbidden');
      };
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base);
  assert.equal(await page.locator('#load').isDisabled(), true);
  assert.equal(
    await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
    'dark',
  );
  await page.locator('#cookie').fill('SAPISID=demo');
  await page.locator('#cookie-form button').click();
  assert.equal(await page.locator('#cookie').inputValue(), '');
  assert.equal(requests.length, 0);
  await page.locator('#playlist').fill('https://youtube.com/playlist?list=PLdemo');
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelectorAll('.song').length === 22);
  const ids = () => page.locator('.song').evaluateAll((rows) => rows.map((row) => row.dataset.id));
  const original = await ids();
  const drag = async (from, to, after = false) => {
    await from.scrollIntoViewIfNeeded();
    const a = await from.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await to.scrollIntoViewIfNeeded();
    const b = await to.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + (after ? b.height - 4 : 4), { steps: 20 });
    await page.mouse.up();
  };
  await page.locator('.song input').nth(0).check();
  await page.locator('.song input').nth(1).check();
  await drag(
    page.locator('.song').nth(0).locator('.song-text'),
    page.locator('.song').nth(4),
    true,
  );
  assert.deepEqual((await ids()).slice(0, 6), [
    'entry-2',
    'entry-3',
    'entry-4',
    'entry-0',
    'entry-1',
    'entry-5',
  ]);
  await page.locator('#reset').click();
  await page.locator('.song input').nth(1).click();
  await page
    .locator('.song input')
    .nth(3)
    .click({ modifiers: ['Shift'] });
  assert.equal(await page.locator('.song input:checked').count(), 3);
  await page.locator('#down').click();
  assert.deepEqual((await ids()).slice(0, 5), [
    'entry-0',
    'entry-4',
    'entry-1',
    'entry-2',
    'entry-3',
  ]);
  await page.locator('#up').click();
  assert.deepEqual(await ids(), original);
  await page.locator('#delete').click();
  assert.equal((await ids()).length, 19);
  await page.locator('#reset').click();
  assert.deepEqual(await ids(), original);
  await drag(page.locator('.song').nth(5).locator('.grip'), page.locator('.song').nth(0));
  assert.equal((await ids())[0], 'entry-5');
  await page.locator('#reset').click();
  const grip = await page.locator('.song').first().locator('.grip').boundingBox();
  const box = await page.locator('#songs').boundingBox();
  await page.mouse.move(grip.x + 5, grip.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8, { steps: 12 });
  await page.waitForFunction(() => document.getElementById('songs').scrollTop > 150);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(await ids(), original, 'Escape cancels the scrolling drag');
  await page.locator('#sort').click();
  assert.equal((await ids()).length, 21);
  assert.ok(!(await ids()).includes('entry-6'));
  assert.equal(await page.locator('.song .song-text span').first().textContent(), 'Air');
  await page.locator('#commit').click();
  assert.equal(await page.locator('#review').isVisible(), true);
  assert.match(await page.locator('#summary').textContent(), /22 → 21 songs. 1 deletion/);
  await page.locator('#close-review').click();
  assert.equal(requests.length, 1, 'all edits and review stay local');
  for (const width of [390, 768, 1024, 1100]) {
    await page.setViewportSize({ width, height: 1050 });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `no horizontal overflow at ${width}`,
    );
  }
  await page.locator('#all').check();
  await page.locator('#all').uncheck();
  if (process.env.UI_SCREENSHOT)
    await page.screenshot({ path: process.env.UI_SCREENSHOT, fullPage: true });
  await page.locator('#commit').click();
  await page.locator('#confirm').click();
  await page.waitForFunction(
    () => document.getElementById('status').textContent === 'Committed. Playlist verified.',
  );
  assert.equal(await page.locator('#percent').textContent(), '100%');
  assert.equal(await page.locator('#commit').isDisabled(), true);
  // The list really scrolls and can be emptied after a successful commit.
  assert.ok(await page.locator('#songs').evaluate((box) => box.scrollHeight > box.clientHeight));
  await page.locator('#all').check();
  await page.locator('#delete').click();
  await page.locator('#commit').click();
  assert.match(await page.locator('#changes').textContent(), /every song will be removed/);
  await page.locator('#confirm').click();
  await page.waitForFunction(
    () => document.getElementById('status').textContent === 'Committed. Playlist verified.',
  );
  assert.equal(await page.locator('.song').count(), 0);
  assert.equal(await page.locator('#percent').textContent(), '100%');
  assert.equal(await page.evaluate(() => window.storageCalls), 0);
  assert.deepEqual(await context.cookies(), []);
  assert.deepEqual(await page.evaluate(() => indexedDB.databases()), []);
  // Reload loses the cookie and playlist. No session endpoint or restore read.
  const beforeReload = requests.length;
  await page.reload();
  assert.equal(await page.locator('#load').isDisabled(), true);
  assert.equal(await page.locator('.song').count(), 0);
  assert.equal(requests.length, beforeReload);
  // Show a partial streamed failure, freeze edits, require an explicit reload.
  await page.route('**/api/load', (route) =>
    route.fulfill({
      json: {
        id: 'PLdemo',
        owner: 'demo',
        title: '<script>not HTML</script>',
        items: [
          { id: 'a', videoId: 'a', channel: 'Z', title: 'One' },
          { id: 'b', videoId: 'b', channel: 'A', title: 'Two' },
        ],
      },
    }),
  );
  await page.locator('#cookie').fill('SAPISID=demo');
  await page.locator('#cookie-form button').click();
  await page.locator('#playlist').fill('PLdemo');
  await page.locator('#load').click();
  await page.waitForFunction(() => document.querySelectorAll('.song').length === 2);
  assert.equal(await page.locator('#title script').count(), 0);
  await page.locator('#sort').click();
  await page.locator('#commit').click();
  await page.route('**/api/commit', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body: '{"type":"progress","done":1,"total":3,"message":"Writing"}\n{"type":"error","message":"Test failure"}\n',
    }),
  );
  await page.locator('#confirm').click();
  await page.waitForFunction(() =>
    document.getElementById('status').textContent.includes('Test failure'),
  );
  assert.equal(await page.locator('#sort').isDisabled(), true);
  assert.equal(await page.locator('#load').isEnabled(), true);
  assert.notEqual(await page.locator('#percent').textContent(), '100%');
  assert.equal(await page.evaluate(() => window.storageCalls), 0);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    'Browser smoke passed: dark mode, no storage/network during edits, multi-select, drag, shift range, up/down, delete/reset, review, streamed progress, empty playlist, failure lock, reload reset and responsive layout.',
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  if (server.exitCode === null) await once(server, 'exit');
}
