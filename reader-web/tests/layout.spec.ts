import { expect, test } from '@playwright/test';

import { DEFAULT_READER_PREFERENCES } from '../../src/screens/reader/engine/preferences';
import {
  chapterHtml,
  inSection,
  lastRelocate,
  openReader,
  paginatorState,
  send,
  settle,
  waitForMessage,
  clearMessages,
} from './harness';

const TABLET_LANDSCAPE = { width: 1280, height: 800 };
const TABLET_PORTRAIT = { width: 800, height: 1280 };
const PHONE = { width: 412, height: 915 };

/** Chapters that fill an odd number of columns on a landscape tablet. */
const oddChapters = () =>
  Object.fromEntries(
    [1, 2, 3, 4, 5].map(id => [id, { html: chapterHtml(id, 20) }]),
  );

const viewSpreads = (page: Parameters<typeof lastRelocate>[0]) =>
  page.evaluate(() => {
    const paginator = document.querySelector('foliate-paginator') as
      | (HTMLElement & {
          size: number;
          getContents(): { doc: Document }[];
        })
      | null;
    return (paginator?.getContents() ?? []).map(
      ({ doc }) =>
        doc.defaultView!.frameElement!.parentElement!.getBoundingClientRect()
          .width / paginator!.size,
    );
  });

test.describe('spreads', () => {
  test('auto: two pages side by side on a landscape tablet', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto' },
    });
    const state = await paginatorState(page);
    expect(state.columnCount).toBe(2);
    expect(state.feet).toHaveLength(2);
  });

  test('auto: a single page in portrait and on phones', async ({ page }) => {
    await page.setViewportSize(TABLET_PORTRAIT);
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto' },
    });
    expect((await paginatorState(page)).columnCount).toBe(1);
    await page.setViewportSize(PHONE);
    await settle(page, 600);
    expect((await paginatorState(page)).columnCount).toBe(1);
  });

  test('forced two pages also in portrait', async ({ page }) => {
    await page.setViewportSize(TABLET_PORTRAIT);
    await openReader(page, { preferences: { flow: 'paginated', columns: 2 } });
    expect((await paginatorState(page)).columnCount).toBe(2);
  });

  test('forced one page on a landscape tablet', async ({ page }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, { preferences: { flow: 'paginated', columns: 1 } });
    expect((await paginatorState(page)).columnCount).toBe(1);
  });

  test('rotating re-lays the spread and keeps the position', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto' },
      start: { chapterId: 1, fraction: 0.5 },
    });
    const before = await lastRelocate(page);
    await page.setViewportSize(TABLET_PORTRAIT);
    await settle(page, 800);
    expect((await paginatorState(page)).columnCount).toBe(1);
    const after = await lastRelocate(page);
    expect(after.chapterId).toBe(1);
    // The page on screen before rotating is (within) the page after it.
    expect(after.fraction).toBeLessThanOrEqual(before.fraction + 0.01);
    expect(after.endFraction).toBeGreaterThanOrEqual(before.fraction);
  });
});

test.describe('chapters on spreads', () => {
  test('every chapter keeps to whole spreads', async ({ page }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto' },
      chapters: oddChapters(),
      start: { chapterId: 2, fraction: 0 },
    });
    await settle(page, 600);
    const spreads = await viewSpreads(page);
    expect(spreads.length).toBeGreaterThan(1);
    for (const width of spreads) {
      expect(Math.abs(width - Math.round(width))).toBeLessThan(0.01);
    }
    const location = await lastRelocate(page);
    expect(location.chapterId).toBe(2);
    expect(location.page).toBe(1);
  });

  test('turning past a chapter opens the next on its first page', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto', animation: 'none' },
      chapters: oddChapters(),
      start: { chapterId: 1, fraction: 1 },
    });
    await settle(page, 600);
    expect((await lastRelocate(page)).chapterId).toBe(1);
    await clearMessages(page);
    await send(page, { type: 'turn', direction: 'next' });
    await waitForMessage(page, 'relocate');
    await settle(page, 600);
    const location = await lastRelocate(page);
    expect(location.chapterId).toBe(2);
    expect(location.page).toBe(1);
  });

  test('switching from scrolling to pages stays in the chapter', async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    const preferences = {
      ...DEFAULT_READER_PREFERENCES,
      columns: 'auto' as const,
      continuousChapters: true,
    };
    await openReader(page, {
      preferences: { ...preferences, flow: 'scrolled' },
      chapters: oddChapters(),
      start: { chapterId: 3, fraction: 0.5 },
    });
    await send(page, {
      type: 'go-to',
      location: { chapterId: 4, fraction: 0.4 },
    });
    await settle(page, 800);
    await send(page, {
      type: 'preferences',
      preferences: { ...preferences, flow: 'paginated' },
    });
    await settle(page, 1200);
    expect((await lastRelocate(page)).chapterId).toBe(4);
  });
});

test.describe('page geometry', () => {
  test('the line width never exceeds the maximum', async ({ page }) => {
    await page.setViewportSize(TABLET_LANDSCAPE);
    await openReader(page, { preferences: { flow: 'scrolled' } });
    const width = await inSection<number>(
      page,
      1,
      `doc => doc.querySelector('p').getBoundingClientRect().width`,
    );
    expect(width).toBeLessThanOrEqual(720);
    expect(width).toBeGreaterThan(600);
  });

  test('side margins keep text off the edges on phones', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openReader(page, {
      preferences: { flow: 'paginated', padding: 32 },
    });
    const left = await page.evaluate(() => {
      const paginator = document.querySelector(
        'foliate-paginator',
      ) as HTMLElement & {
        getContents(): { doc: Document }[];
      };
      const doc = paginator.getContents()[0].doc;
      const frame = doc.defaultView!.frameElement!.getBoundingClientRect();
      const rect = doc.querySelector('p')!.getClientRects()[0];
      return frame.left + rect.left;
    });
    expect(left).toBeGreaterThanOrEqual(16);
  });

  test('bigger text means more pages', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', fontSize: 16 },
    });
    const small = (await lastRelocate(page)).pages ?? 0;
    await clearMessages(page);
    await send(page, {
      type: 'preferences',
      preferences: {
        ...DEFAULT_READER_PREFERENCES,
        flow: 'paginated',
        fontSize: 28,
      },
    });
    await waitForMessage(page, 'relocate');
    await settle(page, 600);
    const large = (await lastRelocate(page)).pages ?? 0;
    expect(large).toBeGreaterThan(small);
  });
});

test.describe('flow', () => {
  test('switching between pages and scrolling keeps the chapter', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated' },
      start: { chapterId: 2, fraction: 0.4 },
    });
    expect((await paginatorState(page)).scrolled).toBe(false);
    await clearMessages(page);
    await send(page, {
      type: 'preferences',
      preferences: { ...DEFAULT_READER_PREFERENCES, flow: 'scrolled' },
    });
    await waitForMessage(page, 'relocate');
    await settle(page, 600);
    const state = await paginatorState(page);
    expect(state.scrolled).toBe(true);
    const relocate = await lastRelocate(page);
    expect(relocate.chapterId).toBe(2);
    expect(relocate.page).toBeUndefined();
  });

  test('scrolled mode reports the visible share of the chapter', async ({
    page,
  }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    const relocate = await lastRelocate(page);
    expect(relocate.fraction).toBe(0);
    expect(relocate.endFraction).toBeGreaterThan(0);
    expect(relocate.endFraction).toBeLessThan(1);
  });
});
