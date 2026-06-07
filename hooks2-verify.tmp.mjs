import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const email = `e2e-hookmx-${process.argv[2]}@pansori.local`;
await page.goto('http://localhost:5173/');
await page.evaluate(async (email) => {
  await fetch('/api/auth/test-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'include',
  });
}, email);
const ownerLogin = await fetch('http://localhost:3001/api/auth/test-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'layout-check@pansori.local' }),
});
const cookie = ownerLogin.headers.get('set-cookie').split(';')[0];
await fetch('http://localhost:3001/api/campaigns/towns-check/members', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ email, role: 'player' }),
});
await page.goto('http://localhost:5173/');
await page.waitForSelector('[data-testid="new-adventure-btn"]', { timeout: 15000 });
await page.getByTestId('new-adventure-btn').click();
const card = page.getByTestId('world-picker-towns-check');
await card.waitFor({ timeout: 10000 });
await card.click();
await page.waitForTimeout(300);
await page.getByTestId('auto-fill-party-btn').click();
await page.waitForTimeout(300);
await page.getByTestId('begin-adventure-btn').click();
await page.waitForSelector('[data-testid="game-narrative-panel"]', { timeout: 15000 });
await page.waitForTimeout(800);
const grab = async () => (await page.getByTestId('game-narrative-panel').textContent()) ?? '';
const screenshotCells = async (tag) => {
  const labels = await page
    .locator('[role="button"][aria-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  console.log(tag, 'cells:', JSON.stringify(labels.slice(0, 14)));
};
await page.locator('[aria-label*="Oakvale"]').first().click();
await page.waitForTimeout(1100);
console.log('1 first town enter:', (await grab()).slice(-120));
await screenshotCells('town');
await browser.close();
