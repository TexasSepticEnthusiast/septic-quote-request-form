const {test, expect} = require('@playwright/test');
const config = require('../../form-config.json');

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
async function setConfig(page, settings) {
  await page.route('**/form-config.json', route => route.fulfill({json:settings}));
}
async function fill(page, name = 'Synthetic Test') {
  await page.locator('#name').fill(name);
  await page.locator('#phone').fill('555-0100');
  await page.locator('#address').fill('Synthetic test property; not a real customer');
  await page.locator('#county').selectOption('Palo Pinto');
  await page.locator('#home').selectOption('New construction');
  await page.getByLabel('New conventional system', {exact:true}).check();
}

test('configured email produces a safely rendered unsent draft and no outbound submission', async ({page}) => {
  const posts = []; page.on('request', request => {if (request.method() === 'POST') posts.push(request.url());});
  await setConfig(page, {...config, recipient_email:'chosen@example.invalid'});
  await page.goto('/');
  await fill(page, '<img src=x onerror=alert(1)>');
  await page.getByRole('button', {name:'Prepare email draft'}).click();
  await expect(page.locator('#status')).toContainText('not sent');
  await expect(page.locator('#draft-recipient')).toHaveText('chosen@example.invalid');
  await expect(page.locator('#draft-text')).toHaveValue(/<img src=x onerror=alert\(1\)>/);
  await expect(page.locator('#draft-preview img')).toHaveCount(0);
  await expect(page.locator('#open-draft')).toHaveAttribute('href', /^mailto:chosen%40example.invalid/);
  expect(posts).toEqual([]); expect(page.url()).toBe('http://127.0.0.1:4173/');
});
test('long requests keep their full text without an oversized mail link', async ({page}) => {
  await page.goto('/'); await fill(page); await page.locator('#notes').fill('x'.repeat(5000));
  await page.getByRole('button', {name:'Prepare email draft'}).click();
  await expect(page.locator('#open-draft')).toBeHidden();
  await expect(page.locator('#draft-text')).toHaveValue(new RegExp('x{5000}'));
  await expect(page.locator('#status')).toContainText('copy the full text');
});
test('missing configuration fails closed with no alternate delivery', async ({page}) => {
  await page.route('**/form-config.json', route => route.fulfill({status:404, body:'missing'}));
  await page.goto('/');
  await expect(page.locator('#status')).toContainText('unavailable');
  await expect(page.locator('button.primary')).toBeDisabled();
});
test('webhook without a URL cannot silently fall back to email', async ({page}) => {
  await setConfig(page, {submit_mode:'webhook', webhook_url:''}); await page.goto('/');
  await expect(page.locator('button.primary')).toBeDisabled();
  await expect(page.locator('#status')).toContainText('could not be loaded or validated');
});
test('webhook accepts all selected services and retains entered details', async ({page}) => {
  const submitted = [];
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.route('https://forms.example.invalid/inbox', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'}});
    submitted.push(route.request().postDataJSON());
    await route.fulfill({status:202, headers:{'Access-Control-Allow-Origin':'*'}, body:'accepted'});
  });
  await page.goto('/'); await fill(page); await page.getByLabel('Inspection', {exact:true}).check();
  await page.getByRole('button', {name:'Send request'}).click();
  await expect(page.locator('#status')).toContainText('Delivery to Out West Septic and a reply are not yet confirmed');
  expect(submitted).toHaveLength(1); expect(submitted[0].services).toEqual(['New conventional system','Inspection']);
  await expect(page.locator('#name')).toHaveValue('Synthetic Test');
});
test('failed webhook preserves values and does not claim delivery', async ({page}) => {
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.route('https://forms.example.invalid/inbox', route => route.abort());
  await page.goto('/'); await fill(page); await page.getByRole('button', {name:'Send request'}).click();
  await expect(page.locator('#status')).toContainText('No confirmation was received');
  await expect(page.locator('#name')).toHaveValue('Synthetic Test');
  await expect(page.locator('button.primary')).toBeEnabled();
});
test('whitespace-only required values and no service topic are rejected', async ({page}) => {
  await page.goto('/'); await fill(page, '   '); await page.getByRole('button', {name:'Prepare email draft'}).click();
  await expect(page.locator('#status')).toContainText('Please enter name');
  await page.locator('#name').fill('Synthetic Test'); await page.getByLabel('New conventional system', {exact:true}).uncheck();
  await page.getByRole('button', {name:'Prepare email draft'}).click();
  await expect(page.locator('#status')).toContainText('at least one');
  await expect(page.locator('#draft-preview')).toBeHidden();
});
test('mobile form remains usable without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await fill(page);
  await page.getByRole('button', {name:'Prepare email draft'}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:'output/playwright/form-mobile.png', fullPage:true});
});

test('a pending webhook cannot be submitted twice', async ({page}) => {
  let count = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.route('https://forms.example.invalid/inbox', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status:204, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type'}});
    count += 1;
    await pending;
    await route.fulfill({status:202, headers:{'Access-Control-Allow-Origin':'*'}, body:'accepted'});
  });
  await page.goto('/'); await fill(page); await page.getByRole('button', {name:'Send request'}).click();
  await expect.poll(() => count).toBe(1);
  await expect(page.locator('button.primary')).toBeDisabled();
  await page.locator('#quote-form').dispatchEvent('submit');
  release();
  await expect(page.locator('#status')).toContainText('accepted your request');
  expect(count).toBe(1);
});

test('a timed-out submission preserves the draft and allows a deliberate retry', async ({page}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (url, options) => String(url).startsWith('https://forms.example.invalid/')
      ? new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')), {once:true}))
      : original(url, options);
  });
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.goto('/'); await fill(page); await page.getByRole('button', {name:'Send request'}).click();
  await page.clock.fastForward(15001);
  await expect(page.locator('#status')).toContainText('No confirmation was received');
  await expect(page.locator('#name')).toHaveValue('Synthetic Test');
  await expect(page.locator('button.primary')).toBeEnabled();
});

test('an HTTP rejection is not reported as an accepted request', async ({page}) => {
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.route('https://forms.example.invalid/inbox', route => route.fulfill({status:503, headers:{'Access-Control-Allow-Origin':'*'}, body:'unavailable'}));
  await page.goto('/'); await fill(page); await page.getByRole('button', {name:'Send request'}).click();
  await expect(page.locator('#status')).toContainText('No confirmation was received');
  await expect(page.locator('#name')).toHaveValue('Synthetic Test');
});

test('webhook redirects do not forward contact data to a different destination', async ({page}) => {
  const forwarded = [];
  page.on('request', request => { if (request.url().startsWith('https://other.example.invalid/')) forwarded.push(request.url()); });
  await setConfig(page, {submit_mode:'webhook', webhook_url:'https://forms.example.invalid/inbox'});
  await page.route('https://forms.example.invalid/inbox', route => route.fulfill({status:307, headers:{'Access-Control-Allow-Origin':'*',Location:'https://other.example.invalid/inbox'}}));
  await page.goto('/'); await fill(page); await page.getByRole('button', {name:'Send request'}).click();
  await expect(page.locator('#status')).toContainText('No confirmation was received');
  expect(forwarded).toEqual([]);
  await expect(page.locator('#name')).toHaveValue('Synthetic Test');
});
