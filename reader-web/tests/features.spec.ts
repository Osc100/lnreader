import { expect, test, type Page } from '@playwright/test';

import { DEFAULT_READER_PREFERENCES } from '../../src/screens/reader/engine/preferences';
import { HIGHLIGHTS } from '../../src/screens/reader/engine/styles';
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

const highlightSize = (page: Parameters<typeof inSection>[0], name: string) =>
  inSection<number>(
    page,
    1,
    `doc => doc.defaultView.CSS.highlights.get('${name}')?.size ?? 0`,
  );

test.describe('search', () => {
  const chapter = (needles: number) =>
    chapterHtml(1, 30).replace(/paragraph (\d+)\./g, (match, n) =>
      Number(n) <= needles * 7 && Number(n) % 7 === 0
        ? `${match} Needle here.`
        : match,
    );

  test('finds and highlights every match in the chapter', async ({ page }) => {
    await openReader(page, { chapters: { 1: { html: chapter(4) } } });
    await send(page, { type: 'search', query: 'needle' });
    const result = await waitForMessage(page, 'search-result');
    expect(result).toMatchObject({ query: 'needle', current: 1, total: 4 });
    expect(await highlightSize(page, HIGHLIGHTS.search)).toBe(4);
    expect(await highlightSize(page, HIGHLIGHTS.searchCurrent)).toBe(1);
  });

  test('steps through matches, wrapping around, and brings them into view', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: { 1: { html: chapter(4) } },
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await send(page, { type: 'search', query: 'Needle' });
    await waitForMessage(page, 'search-result');
    await clearMessages(page);
    for (let i = 0; i < 3; i++) {
      await send(page, { type: 'search-step', direction: 1 });
    }
    const results = await messages(page, 'search-result');
    expect(results.map(r => r.current)).toEqual([2, 3, 4]);
    await settle(page);
    expect((await lastRelocate(page)).page).toBeGreaterThan(1);
    await send(page, { type: 'search-step', direction: 1 });
    expect((await messages(page, 'search-result')).pop()?.current).toBe(1);
  });

  test('follows the chapter on screen instead of keeping old matches', async ({
    page,
  }) => {
    const needles = (n: number, count: number) =>
      chapterHtml(n, 30).replace(/paragraph (\d+)\./g, (match, i) =>
        Number(i) <= count * 7 && Number(i) % 7 === 0
          ? `${match} Needle here.`
          : match,
      );
    await openReader(page, {
      chapters: { 1: { html: needles(1, 2) }, 2: { html: needles(2, 3) } },
      preferences: { flow: 'scrolled', continuousChapters: true },
    });
    await send(page, { type: 'search', query: 'needle' });
    expect(await waitForMessage(page, 'search-result')).toMatchObject({
      total: 2,
    });
    await clearMessages(page);
    await send(page, {
      type: 'go-to',
      location: { chapterId: 2, fraction: 0 },
    });
    await settle(page, 800);
    expect((await messages(page, 'search-result')).pop()).toMatchObject({
      query: 'needle',
      total: 3,
    });
  });

  test('clearing removes the highlights', async ({ page }) => {
    await openReader(page, { chapters: { 1: { html: chapter(2) } } });
    await send(page, { type: 'search', query: 'needle' });
    await waitForMessage(page, 'search-result');
    await send(page, { type: 'search-clear' });
    expect(await highlightSize(page, HIGHLIGHTS.search)).toBe(0);
  });

  test('no match reports zero', async ({ page }) => {
    await openReader(page);
    await send(page, { type: 'search', query: 'zebra' });
    expect(await waitForMessage(page, 'search-result')).toMatchObject({
      current: 0,
      total: 0,
    });
  });
});

test.describe('text to speech', () => {
  test('queues the chapter’s sentences from the reading position', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await send(page, { type: 'tts-start' });
    const first = await waitForMessage(page, 'tts-queue');
    expect(first.chapterId).toBe(1);
    expect(first.utterances[0]).toMatch(/^Chapter 1 paragraph 1\./);
    expect(first.utterances.length).toBeGreaterThan(40);

    await send(page, { type: 'turn', direction: 'next' });
    await settle(page);
    await clearMessages(page);
    await send(page, { type: 'tts-start' });
    const later = await waitForMessage(page, 'tts-queue');
    expect(later.utterances.length).toBeLessThan(first.utterances.length);
  });

  test('highlights the sentence being read and follows it across pages', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await send(page, { type: 'tts-start' });
    const queue = await waitForMessage(page, 'tts-queue');
    await send(page, { type: 'tts-highlight', index: 1 });
    expect(await highlightSize(page, HIGHLIGHTS.tts)).toBe(1);
    await clearMessages(page);
    await send(page, {
      type: 'tts-highlight',
      index: queue.utterances.length - 1,
    });
    const relocate = await waitForMessage(page, 'relocate');
    expect(relocate.page).toBe(relocate.pages);
    await send(page, { type: 'tts-stop' });
    expect(await highlightSize(page, HIGHLIGHTS.tts)).toBe(0);
  });
});

test.describe('dropping the TTS controller', () => {
  const pointAt = (page: Page, n: number) =>
    page.evaluate(paragraph => {
      const paginator = document.querySelector(
        'foliate-paginator',
      ) as HTMLElement & {
        getContents(): { doc: Document }[];
      };
      const doc = paginator.getContents()[0].doc;
      const frame = doc.defaultView!.frameElement!.getBoundingClientRect();
      const rect = doc
        .getElementById(`c1p${paragraph}`)!
        .getBoundingClientRect();
      return { x: frame.left + rect.left + 10, y: frame.top + rect.top + 5 };
    }, n);

  test('marks the paragraph under the controller', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    await send(page, { type: 'tts-target', ...(await pointAt(page, 3)) });
    expect(await highlightSize(page, HIGHLIGHTS.ttsTarget)).toBe(1);
    await send(page, { type: 'tts-target-clear' });
    expect(await highlightSize(page, HIGHLIGHTS.ttsTarget)).toBe(0);
  });

  test('reads from the paragraph it is dropped on', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    await send(page, { type: 'tts-start-at', ...(await pointAt(page, 3)) });
    const queue = await waitForMessage(page, 'tts-queue');
    expect(queue.chapterId).toBe(1);
    expect(queue.utterances[0]).toMatch(/^Chapter 1 paragraph 3\./);
    expect(await highlightSize(page, HIGHLIGHTS.ttsTarget)).toBe(0);
  });

  test('empty space inside a wrapping container reads nothing', async ({
    page,
  }) => {
    // Sources wrap chapters in a container; the space between paragraphs
    // and between the pages of a spread belongs to it, not to a paragraph.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openReader(page, {
      preferences: { flow: 'paginated', columns: 'auto', animation: 'none' },
      chapters: {
        1: {
          html: `<div id="chapter-content">${chapterHtml(1, 40)}</div>`,
        },
      },
    });
    const points = await page.evaluate(() => {
      const paginator = document.querySelector(
        'foliate-paginator',
      ) as HTMLElement & {
        getContents(): { doc: Document }[];
      };
      const doc = paginator.getContents()[0].doc;
      const frame = doc.defaultView!.frameElement!.getBoundingClientRect();
      const first = doc.getElementById('c1p1')!.getBoundingClientRect();
      const second = doc.getElementById('c1p2')!.getBoundingClientRect();
      return [
        {
          x: frame.left + first.left + 10,
          y: frame.top + (first.bottom + second.top) / 2,
        },
        { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      ];
    });
    await clearMessages(page);
    for (const point of points) {
      await send(page, { type: 'tts-target', ...point });
      expect(await highlightSize(page, HIGHLIGHTS.ttsTarget)).toBe(0);
      await send(page, { type: 'tts-start-at', ...point });
    }
    await settle(page, 300);
    expect(await messages(page, 'tts-queue')).toHaveLength(0);
  });

  test('a line of text directly in a container is a paragraph', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      chapters: {
        1: { html: '<div><div id="line">Only a line of text.</div></div>' },
      },
    });
    const point = await page.evaluate(() => {
      const paginator = document.querySelector(
        'foliate-paginator',
      ) as HTMLElement & {
        getContents(): { doc: Document }[];
      };
      const doc = paginator.getContents()[0].doc;
      const frame = doc.defaultView!.frameElement!.getBoundingClientRect();
      const rect = doc.getElementById('line')!.getBoundingClientRect();
      return { x: frame.left + rect.left + 5, y: frame.top + rect.top + 5 };
    });
    await send(page, { type: 'tts-start-at', ...point });
    expect((await waitForMessage(page, 'tts-queue')).utterances).toEqual([
      'Only a line of text.',
    ]);
  });

  test('a drop off the text reads nothing', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    await clearMessages(page);
    await send(page, { type: 'tts-start-at', x: -50, y: -50 });
    await settle(page, 300);
    expect(await messages(page, 'tts-queue')).toHaveLength(0);
  });
});

test.describe('auto-scroll', () => {
  test('scrolled mode drifts by the offset per interval', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'scrolled' } });
    const start = (await paginatorState(page)).position;
    await send(page, { type: 'auto-scroll', interval: 1, distance: 300 });
    await page.waitForTimeout(1000);
    await send(page, { type: 'auto-scroll', interval: 0 });
    const moved = (await paginatorState(page)).position - start;
    expect(moved).toBeGreaterThan(150);
    expect(moved).toBeLessThan(450);
  });

  test('paginated mode turns pages on a timer', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
    });
    await send(page, { type: 'auto-scroll', interval: 0.3 });
    await page.waitForTimeout(800);
    await send(page, { type: 'auto-scroll', interval: 0 });
    await settle(page);
    expect((await lastRelocate(page)).page).toBeGreaterThanOrEqual(3);
  });
});

test.describe('footer', () => {
  test('paginated pages show the page number and no running head', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', showProgress: true },
    });
    const state = await paginatorState(page);
    expect(state.heads.every(text => text === '')).toBe(true);
    expect(state.feet[state.feet.length - 1]).toMatch(/^1 \/ \d+$/);
  });

  test('the footer survives a re-render (resize)', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', showProgress: true },
    });
    await page.setViewportSize({ width: 1200, height: 800 });
    await settle(page, 600);
    const state = await paginatorState(page);
    expect(state.feet.some(text => /\d+ \/ \d+/.test(text))).toBe(true);
  });

  test('the page colour is painted behind the pages, over the chapter’s own', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', backgroundColor: '#224466' },
      chapters: {
        1: {
          html: `<style>body{background:#ffffff}</style>${chapterHtml(1, 20)}`,
        },
      },
    });
    const colours = await page.evaluate(() => {
      const paginator = document.querySelector('foliate-paginator')!;
      const background = paginator.shadowRoot!.getElementById('background')!;
      return [...background.children].map(
        el => getComputedStyle(el).backgroundColor,
      );
    });
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.every(colour => colour === 'rgb(34, 68, 102)')).toBe(true);
  });

  test('battery and time join the footer when enabled', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', showBatteryAndTime: true },
    });
    expect((await paginatorState(page)).feet[0]).toMatch(/\d{1,2}:\d{2}.*80%/);
    await send(page, { type: 'battery', level: 0.42 });
    expect((await paginatorState(page)).feet[0]).toContain('42%');
  });

  test('everything can be hidden', async ({ page }) => {
    await openReader(page, {
      preferences: {
        flow: 'paginated',
        showProgress: false,
        showBatteryAndTime: false,
      },
    });
    expect((await paginatorState(page)).feet.every(text => text === '')).toBe(
      true,
    );
  });

  test('scrolled mode shows progress in the status line', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled', showProgress: true },
      start: { chapterId: 2, fraction: 0.5 },
    });
    const status = await page.evaluate(() => {
      const el = document.getElementById('ln-status')!;
      return { hidden: el.hidden, text: el.textContent };
    });
    expect(status.hidden).toBe(false);
    expect(status.text).toMatch(/^\d+%/);
  });

  test('the status line hides the text under it, in the current theme', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled', showProgress: true },
    });
    await send(page, {
      type: 'preferences',
      preferences: {
        ...DEFAULT_READER_PREFERENCES,
        flow: 'scrolled',
        backgroundColor: '#224466',
      },
    });
    await settle(page);
    const style = await page.evaluate(() => {
      const computed = getComputedStyle(document.getElementById('ln-status')!);
      return {
        background: computed.backgroundColor,
        opacity: computed.opacity,
      };
    });
    expect(style).toEqual({ background: 'rgb(34, 68, 102)', opacity: '1' });
  });
});
