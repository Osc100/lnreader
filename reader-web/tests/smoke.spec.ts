import { expect, test } from '@playwright/test';

import { inSection, lastRelocate, messages, openReader } from './harness';

test('opens the start chapter and reports its position', async ({ page }) => {
  await openReader(page, { preferences: { flow: 'paginated' } });
  const relocate = await lastRelocate(page);
  expect(relocate.chapterId).toBe(1);
  expect(relocate.fraction).toBe(0);
  expect(relocate.pages).toBeGreaterThan(1);
  const requests = await messages(page, 'request-section');
  expect(requests.map(r => r.chapterId)).toContain(1);
  const text = await inSection<string>(page, 1, 'doc => doc.body.innerText');
  expect(text).toContain('Chapter 1 paragraph 1.');
});
