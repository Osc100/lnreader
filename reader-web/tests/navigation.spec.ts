import { expect, test, type Page } from '@playwright/test';

import {
  chapterHtml,
  clearMessages,
  inSection,
  lastRelocate,
  messages,
  openReader,
  paginatorState,
  send,
  settle,
  waitForMessage,
} from './harness';

const turn = async (page: Page, direction: 'next' | 'prev') => {
  await clearMessages(page);
  await send(page, { type: 'turn', direction });
  await settle(page, 350);
};

const shortChapters = (count: number, paragraphs = 4) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      i + 1,
      { html: chapterHtml(i + 1, paragraphs) },
    ]),
  );

test.describe('paginated navigation', () => {
  test('turns pages forwards and back', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    expect((await lastRelocate(page)).page).toBe(1);
    await turn(page, 'next');
    expect((await lastRelocate(page)).page).toBe(2);
    await turn(page, 'next');
    expect((await lastRelocate(page)).page).toBe(3);
    await turn(page, 'prev');
    expect((await lastRelocate(page)).page).toBe(2);
  });

  test('flows from the end of a chapter into the next one', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: shortChapters(3),
      preferences: { flow: 'paginated', animation: 'none' },
    });
    for (let i = 0; i < 6; i++) {
      const relocate = await lastRelocate(page);
      if (relocate.chapterId === 2) {
        break;
      }
      await turn(page, 'next');
    }
    const relocate = await lastRelocate(page);
    expect(relocate.chapterId).toBe(2);
    expect(relocate.page).toBe(1);
  });

  test('going back from a chapter start opens the previous chapter’s end', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: shortChapters(3, 20),
      start: { chapterId: 2, fraction: 0 },
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await clearMessages(page);
    await send(page, { type: 'turn', direction: 'prev' });
    const relocate = await waitForMessage(
      page,
      'relocate',
      'm.chapterId === 1',
    );
    expect(relocate.endFraction).toBe(1);
  });

  test('reports the book boundary instead of turning past it', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: shortChapters(1),
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await turn(page, 'prev');
    expect((await messages(page, 'boundary')).map(m => m.direction)).toEqual([
      'prev',
    ]);
    for (let i = 0; i < 5; i++) {
      await turn(page, 'next');
      if ((await messages(page, 'boundary')).length) {
        break;
      }
    }
    expect((await messages(page, 'boundary')).map(m => m.direction)).toEqual([
      'next',
    ]);
    expect((await paginatorState(page)).atEnd).toBe(true);
  });

  test('sections appended later extend the book', async ({ page }) => {
    await openReader(page, {
      chapters: { ...shortChapters(1), 2: { html: chapterHtml(2, 4) } },
      sections: [{ id: 1, name: 'Chapter 1' }],
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await send(page, {
      type: 'append-sections',
      sections: [{ id: 2, name: 'Chapter 2' }],
    });
    for (let i = 0; i < 6 && (await lastRelocate(page)).chapterId !== 2; i++) {
      await turn(page, 'next');
    }
    expect((await lastRelocate(page)).chapterId).toBe(2);
  });
});

test.describe('jumps', () => {
  test('goes to a chapter and position; a reported position reopens the same page', async ({
    page,
  }) => {
    await openReader(page, { preferences: { flow: 'paginated' } });
    await clearMessages(page);
    await send(page, {
      type: 'go-to',
      location: { chapterId: 4, fraction: 0.6 },
    });
    await waitForMessage(page, 'relocate', 'm.chapterId === 4');
    await settle(page);
    const first = await lastRelocate(page);
    expect(first.chapterId).toBe(4);
    expect(first.page).toBeGreaterThan(1);
    expect(first.page).toBeLessThan(first.pages ?? 0);
    // Saving the reported position and opening it again lands on the same page.
    await send(page, {
      type: 'go-to',
      location: { chapterId: 1, fraction: 0 },
    });
    await settle(page);
    await clearMessages(page);
    await send(page, {
      type: 'go-to',
      location: { chapterId: 4, fraction: first.fraction },
    });
    await waitForMessage(page, 'relocate', 'm.chapterId === 4');
    await settle(page);
    const again = await lastRelocate(page);
    expect(again.page).toBe(first.page);
    expect(again.fraction).toBeCloseTo(first.fraction, 5);
  });

  test('the last page reports the end of the chapter', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated' },
      start: { chapterId: 2, fraction: 1 },
    });
    const relocate = await lastRelocate(page);
    expect(relocate.chapterId).toBe(2);
    expect(relocate.page).toBe(relocate.pages);
    expect(relocate.fraction).toBe(1);
    expect(relocate.endFraction).toBe(1);
  });

  test('opens at the saved position', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      start: { chapterId: 3, fraction: 0.5 },
    });
    const relocate = await lastRelocate(page);
    expect(relocate.chapterId).toBe(3);
    expect(relocate.fraction).toBeGreaterThan(0.4);
    expect(relocate.fraction).toBeLessThan(0.6);
  });

  test('only requests the chapters it shows (and neighbours)', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          i + 1,
          { html: chapterHtml(i + 1) },
        ]),
      ),
      start: { chapterId: 15, fraction: 0 },
      preferences: { flow: 'paginated' },
    });
    const requested = (await messages(page, 'request-section')).map(
      m => m.chapterId,
    );
    expect(requested).toContain(15);
    expect(requested.length).toBeLessThanOrEqual(4);
    expect(requested.every(id => id >= 13 && id <= 17)).toBe(true);
  });
});

test.describe('scrolled navigation', () => {
  test('page turns scroll by a screen and cross chapters', async ({ page }) => {
    await openReader(page, {
      // Longer than a screen, so one turn cannot skip a whole chapter.
      chapters: shortChapters(3, 16),
      preferences: { flow: 'scrolled' },
    });
    const start = (await paginatorState(page)).position;
    await turn(page, 'next');
    await settle(page, 500);
    expect((await paginatorState(page)).position).toBeGreaterThan(start);
    for (let i = 0; i < 8 && (await lastRelocate(page)).chapterId === 1; i++) {
      await turn(page, 'next');
      await settle(page, 400);
    }
    expect((await lastRelocate(page)).chapterId).toBe(2);
  });

  test('the bottom of a chapter reads as its end', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      start: { chapterId: 2, fraction: 1 },
    });
    const relocate = await lastRelocate(page);
    expect(relocate.chapterId).toBe(2);
    expect(relocate.fraction).toBe(1);
    expect(relocate.endFraction).toBe(1);
  });

  test('the middle of a chapter round-trips', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      start: { chapterId: 2, fraction: 0.5 },
    });
    const relocate = await lastRelocate(page);
    expect(relocate.fraction).toBeCloseTo(0.5, 1);
    expect(relocate.endFraction).toBeLessThan(1);
  });

  test('continuous chapters: the next one is loaded before the end', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: shortChapters(3),
      preferences: { flow: 'scrolled', continuousChapters: true },
    });
    await settle(page, 600);
    const requested = (await messages(page, 'request-section')).map(
      m => m.chapterId,
    );
    expect(requested).toContain(2);
    expect((await paginatorState(page)).loaded.length).toBeGreaterThan(1);
  });

  test('shows one chapter at a time with continuous chapters off', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: shortChapters(3),
      preferences: { flow: 'scrolled', continuousChapters: false },
    });
    await settle(page, 600);
    expect((await paginatorState(page)).loaded).toEqual([0]);
  });

  test('a turn with a distance scrolls by that much', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    const start = (await paginatorState(page)).position;
    await send(page, { type: 'turn', direction: 'next', distance: 120 });
    await settle(page, 600);
    const moved = (await paginatorState(page)).position - start;
    expect(moved).toBeGreaterThan(100);
    expect(moved).toBeLessThan(140);
  });
});

test.describe('input', () => {
  const tapAt = async (page: Page, xRatio: number, yRatio = 0.5) => {
    const size = page.viewportSize()!;
    await clearMessages(page);
    await page.mouse.click(size.width * xRatio, size.height * yRatio);
    await settle(page, 350);
  };

  test('side taps turn pages when enabled; the middle toggles the controls', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none', tapToScroll: true },
    });
    await tapAt(page, 0.9);
    expect((await lastRelocate(page)).page).toBe(2);
    await tapAt(page, 0.1);
    expect((await lastRelocate(page)).page).toBe(1);
    await tapAt(page, 0.5);
    expect(await messages(page, 'tap')).toHaveLength(1);
  });

  test('scrolled mode: top and bottom taps scroll when enabled', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled', tapToScroll: true },
    });
    const start = (await paginatorState(page)).position;
    await tapAt(page, 0.5, 0.9);
    await settle(page, 500);
    expect((await paginatorState(page)).position).toBeGreaterThan(start);
    expect(await messages(page, 'tap')).toHaveLength(0);
  });

  test('keyboard arrows and page keys turn pages', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await page.keyboard.press('ArrowRight');
    await settle(page, 350);
    expect((await lastRelocate(page)).page).toBe(2);
    await page.keyboard.press('PageUp');
    await settle(page, 350);
    expect((await lastRelocate(page)).page).toBe(1);
  });

  test('right-to-left books turn pages from the left side', async ({
    page,
  }) => {
    await openReader(page, {
      dir: 'rtl',
      preferences: { flow: 'paginated', animation: 'none', tapToScroll: true },
    });
    await tapAt(page, 0.1);
    expect((await lastRelocate(page)).page).toBe(2);
  });

  test('side taps leave the page alone when tapping is off', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await tapAt(page, 0.9);
    // The tap reaches the app (it toggles the controls) and no page turns.
    expect(await messages(page, 'relocate')).toHaveLength(0);
    expect(await messages(page, 'tap')).toHaveLength(1);
  });

  test('taps are reported as reading activity', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'paginated' } });
    await tapAt(page, 0.5);
    expect((await messages(page, 'interaction')).length).toBeGreaterThan(0);
  });
});

test.describe('gestures', () => {
  const drag = (
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ) =>
    inSection(
      page,
      1,
      `doc => {
        const target = doc.body;
        const touch = (x, y) => new Touch({ identifier: 1, target, screenX: x, screenY: y, clientX: x, clientY: y });
        target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, changedTouches: [touch(${from.x}, ${from.y})] }));
        target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(${to.x}, ${to.y})] }));
      }`,
    );

  test('scrolled: a long swipe changes chapter when enabled', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled', swipeGestures: true },
    });
    const width = await page.evaluate(() => window.screen.width);
    await clearMessages(page);
    await drag(
      page,
      { x: width * 0.9, y: 300 },
      { x: width * 0.9 - 250, y: 305 },
    );
    expect(await waitForMessage(page, 'navigate-chapter')).toMatchObject({
      direction: 'next',
    });
    await clearMessages(page);
    await drag(
      page,
      { x: width * 0.1, y: 300 },
      { x: width * 0.1 + 250, y: 305 },
    );
    expect(await waitForMessage(page, 'navigate-chapter')).toMatchObject({
      direction: 'prev',
    });
  });

  test('swipes do nothing when turned off', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    const width = await page.evaluate(() => window.screen.width);
    await clearMessages(page);
    await drag(
      page,
      { x: width * 0.9, y: 300 },
      { x: width * 0.9 - 250, y: 305 },
    );
    await settle(page, 300);
    expect(await messages(page, 'navigate-chapter')).toHaveLength(0);
  });

  test('pulling down at the top reloads the chapter', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    await clearMessages(page);
    await drag(page, { x: 200, y: 200 }, { x: 205, y: 340 });
    expect(await waitForMessage(page, 'refresh-section')).toMatchObject({
      chapterId: 1,
    });
  });

  test('long-pressing an image shows it full screen; a tap closes it', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: {
        1: {
          html: `<p>Before</p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="40" height="40"><p>After</p>`,
        },
      },
    });
    await inSection(
      page,
      1,
      `doc => doc.querySelector('img').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))`,
    );
    const shown = await page.evaluate(() => {
      const viewer = document.getElementById('ln-image')!;
      return { hidden: viewer.hidden, src: viewer.querySelector('img')!.src };
    });
    expect(shown.hidden).toBe(false);
    expect(shown.src).toContain('data:image/gif');
    await page.mouse.click(5, 5);
    expect(
      await page.evaluate(() => document.getElementById('ln-image')!.hidden),
    ).toBe(true);
  });
});
