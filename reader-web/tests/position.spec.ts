import { expect, test } from '@playwright/test';

import { DEFAULT_READER_PREFERENCES } from '../../src/screens/reader/engine/preferences';
import {
  lastRelocate,
  openReader,
  paginatorState,
  send,
  settle,
  waitForMessage,
  clearMessages,
  messages,
} from './harness';

test.describe('reading position', () => {
  test('scrolled: a resize keeps the place the reader scrolled to', async ({
    page,
  }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    // As a finger would: the container scrolls, the paginator follows.
    await page.evaluate(() => {
      const paginator = document.querySelector(
        'foliate-paginator',
      ) as HTMLElement & {
        containerPosition: number;
      };
      paginator.containerPosition = 2500;
    });
    await settle(page, 800);
    const before = await lastRelocate(page);
    expect(before.fraction).toBeGreaterThan(0.1);
    await page.setViewportSize({ width: 800, height: 700 });
    await settle(page, 800);
    const after = await lastRelocate(page);
    expect(after.fraction).toBeGreaterThan(before.fraction - 0.05);
    expect(after.fraction).toBeLessThan(before.fraction + 0.05);
  });

  test('switching the last page to scrolled stays at the end', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
      start: { chapterId: 1, fraction: 1 },
    });
    expect((await lastRelocate(page)).fraction).toBe(1);
    await clearMessages(page);
    await send(page, {
      type: 'preferences',
      preferences: { ...DEFAULT_READER_PREFERENCES, flow: 'scrolled' },
    });
    await waitForMessage(page, 'relocate');
    await settle(page, 800);
    const after = await lastRelocate(page);
    // No stop at the next chapter on the way.
    const visited = (await messages(page, 'relocate')).map(m => m.chapterId);
    expect(new Set(visited)).toEqual(new Set([1]));
    expect((await paginatorState(page)).scrolled).toBe(true);
    expect(after.endFraction).toBeGreaterThan(0.9);
  });
});
