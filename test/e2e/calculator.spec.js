'use strict';

// End-to-end regression: drives the real UI in a browser against the real server.

const { test, expect } = require('@playwright/test');

const KEY_SELECTORS = {
  '+': '[data-op="add"]',
  '-': '[data-op="subtract"]',
  '*': '[data-op="multiply"]',
  '/': '[data-op="divide"]',
  '.': '[data-action="decimal"]',
  '=': '[data-action="equals"]',
  C: '[data-action="clear"]',
  B: '[data-action="backspace"]',
  S: '[data-action="sign"]',
};

// press(page, '12+7=') clicks each on-screen key in turn.
async function press(page, sequence) {
  for (const ch of sequence) {
    const selector = /\d/.test(ch) ? `[data-digit="${ch}"]` : KEY_SELECTORS[ch];
    if (!selector) throw new Error(`No key for "${ch}"`);
    await page.click(`#keys ${selector}`);
  }
}

const value = (page) => page.locator('#value');
const expression = (page) => page.locator('#expression');
const notice = (page) => page.locator('#notice');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(value(page)).toHaveText('0');
});

test.describe('arithmetic', () => {
  for (const [keys, result] of [
    ['12+7=', '19'],
    ['9-15=', '−6'],
    ['6*7=', '42'],
    ['10/4=', '2.5'],
    ['1/3=', '0.333333333'],
    ['.1+.2=', '0.3'],
  ]) {
    test(`${keys} shows ${result}`, async ({ page }) => {
      await press(page, keys);
      await expect(value(page)).toHaveText(result);
    });
  }

  test('shows the full expression after equals', async ({ page }) => {
    await press(page, '12+7=');
    await expect(expression(page)).toHaveText('12 + 7 =');
  });

  test('chains operations left to right', async ({ page }) => {
    await press(page, '2+3*4=');
    await expect(value(page)).toHaveText('20');
  });

  test('changing the operator before the second number replaces it', async ({ page }) => {
    await press(page, '8+-*3=');
    await expect(value(page)).toHaveText('24');
  });

  test('can keep calculating on a result', async ({ page }) => {
    await press(page, '5*5=');
    await press(page, '+5=');
    await expect(value(page)).toHaveText('30');
  });
});

test.describe('10-digit limit', () => {
  test('LIMIT OVER when the result exceeds 10 digits', async ({ page }) => {
    await press(page, '9999999999*2=');
    await expect(value(page)).toHaveText('Limit Over');
    await expect(notice(page)).toHaveText('Result is more than 10 digits');
    await expect(page.locator('#display')).toHaveClass(/error/);
  });

  test('a 10-digit result is shown normally', async ({ page }) => {
    await press(page, '9999999998+1=');
    await expect(value(page)).toHaveText('9999999999');
    await expect(page.locator('#display')).not.toHaveClass(/error/);
  });

  test('input stops at 10 digits and the meter shows 10/10', async ({ page }) => {
    await press(page, '12345678901');
    await expect(value(page)).toHaveText('1234567890');
    await expect(page.locator('#digitMeter')).toHaveText('10/10');
    await expect(notice(page)).toHaveText('Max 10 digits per number');
  });

  test('LIMIT OVER mid-chain stops the chain', async ({ page }) => {
    await press(page, '9999999999+1+');
    await expect(value(page)).toHaveText('Limit Over');
  });

  test('typing after an error starts fresh', async ({ page }) => {
    await press(page, '9999999999*9=');
    await press(page, '4');
    await expect(value(page)).toHaveText('4');
    await expect(page.locator('#display')).not.toHaveClass(/error/);
  });
});

test.describe('errors and editing', () => {
  test('division by zero shows a message', async ({ page }) => {
    await press(page, '5/0=');
    await expect(value(page)).toHaveText("Can't ÷ 0");
  });

  test('AC clears everything', async ({ page }) => {
    await press(page, '12+3C');
    await expect(value(page)).toHaveText('0');
    await expect(expression(page)).toHaveText('');
  });

  test('backspace removes the last digit', async ({ page }) => {
    await press(page, '123B');
    await expect(value(page)).toHaveText('12');
    await press(page, 'BBB');
    await expect(value(page)).toHaveText('0');
  });

  test('only one decimal point per number', async ({ page }) => {
    await press(page, '1..5');
    await expect(value(page)).toHaveText('1.5');
  });

  test('± toggles the sign', async ({ page }) => {
    await press(page, '7S');
    await expect(value(page)).toHaveText('−7');
    await press(page, 'S');
    await expect(value(page)).toHaveText('7');
  });
});

test.describe('keyboard', () => {
  test('full calculation from the keyboard', async ({ page }) => {
    await page.keyboard.type('144/12');
    await page.keyboard.press('Enter');
    await expect(value(page)).toHaveText('12');
    await page.keyboard.press('Escape');
    await expect(value(page)).toHaveText('0');
  });
});

test.describe('history', () => {
  test('records calculations and reuses a result when clicked', async ({ page }) => {
    await expect(page.locator('#historyEmpty')).toBeVisible();
    await press(page, '6*7=');
    await press(page, 'C');
    const item = page.locator('.history-item').first();
    await expect(item).toContainText('6 × 7 =');
    await expect(item).toContainText('42');
    await item.click();
    await expect(value(page)).toHaveText('42');
  });

  test('records errors too', async ({ page }) => {
    await press(page, '9999999999*2=');
    await expect(page.locator('.history-item.is-error')).toContainText('Limit Over');
  });

  test('clear empties the list', async ({ page }) => {
    await press(page, '1+1=');
    await page.click('#historyClear');
    await expect(page.locator('.history-item')).toHaveCount(0);
  });
});

test.describe('layout', () => {
  test('no horizontal scroll', async ({ page }) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.reload();
    await press(page, '1+1=');
    expect(errors).toEqual([]);
  });
});

// ---- Bug registry (frontend). Never delete; see docs/REGRESSION.md ----

test('BUG-006: ± right after an operator starts a new negative number', async ({ page }) => {
  await press(page, '5+S3=');
  await expect(value(page)).toHaveText('2'); // 5 + (−3); before the fix this gave 5 + (−53)
});

test('BUG-007: keys pressed while a calculation is in flight are ignored', async ({ page }) => {
  // Slow the API down so we can press keys mid-request.
  await page.route('**/api/calculate', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await press(page, '2+3');
  await page.click('[data-action="equals"]');
  await press(page, '9'); // while pending
  // Before the fix the display flickered to "39" until the answer arrived.
  expect(await value(page).textContent()).toBe('3');
  await expect(value(page)).toHaveText('5');
});

test('BUG-008: starting a new number after "=" clears the old expression', async ({ page }) => {
  await press(page, '2+2=');
  await expect(expression(page)).toHaveText('2 + 2 =');
  await press(page, '7');
  await expect(expression(page)).toHaveText('');
});
