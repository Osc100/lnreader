import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
} from '../../src/screens/reader/engine/preferences';
import type {
  NativeToWebMessage,
  ReaderLocation,
  ReaderOpenMessage,
  ReaderSection,
  WebToNativeMessage,
} from '../../src/screens/reader/engine/protocol';
import { buildShellHtml } from '../../src/screens/reader/engine/shell';

export const ORIGIN = 'http://reader.test';
const ROOT = path.resolve(__dirname, '..', '..');

const LOREM =
  'The quick brown fox jumps over the lazy dog while the river keeps running ' +
  'past the old mill, and the travellers count the stars one by one until ' +
  'the morning light spills over the hills and wakes the sleeping village.';

export const chapterHtml = (chapter: number, paragraphs = 40, extra = '') =>
  Array.from(
    { length: paragraphs },
    (_, i) =>
      `<p id="c${chapter}p${i + 1}">Chapter ${chapter} paragraph ${
        i + 1
      }. ${LOREM}</p>`,
  ).join('\n') + extra;

export interface Fixture {
  html?: string;
  baseUrl?: string;
  error?: string;
}

export interface OpenOptions {
  chapters?: Record<number, Fixture>;
  sections?: ReaderSection[];
  start?: ReaderLocation;
  preferences?: Partial<ReaderPreferences>;
  customJs?: string;
  pluginJs?: string;
  dir?: 'ltr' | 'rtl';
  delay?: number;
}

const defaultChapters = (count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      i + 1,
      { html: chapterHtml(i + 1) },
    ]),
  ) as Record<number, Fixture>;

const serveFile = (file: string) => ({
  status: 200,
  body: fs.readFileSync(file),
  contentType: file.endsWith('.js')
    ? 'text/javascript'
    : file.endsWith('.ttf')
    ? 'font/ttf'
    : file.endsWith('.png')
    ? 'image/png'
    : 'application/octet-stream',
});

export const openReader = async (page: Page, options: OpenOptions = {}) => {
  const chapters = options.chapters ?? defaultChapters(5);
  const preferences: ReaderPreferences = {
    ...DEFAULT_READER_PREFERENCES,
    ...options.preferences,
  };
  await page.route(`${ORIGIN}/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/index.html') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: buildShellHtml(ORIGIN, preferences.backgroundColor),
      });
    }
    if (url.pathname === '/app/reader.js') {
      return route.fulfill(
        serveFile(path.join(ROOT, 'assets/reader/app/reader.js')),
      );
    }
    if (url.pathname.startsWith('/fonts/')) {
      return route.fulfill(
        serveFile(path.join(ROOT, 'assets/reader', url.pathname)),
      );
    }
    if (url.pathname.startsWith('/img/')) {
      return route.fulfill(serveFile(path.join(ROOT, 'assets/logo.png')));
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.addInitScript(
    ({ fixtures, delay }) => {
      const host = window as unknown as {
        __messages: WebToNativeMessage[];
        __chapters: Record<number, Fixture>;
        ReactNativeWebView: { postMessage(raw: string): void };
        lnReader?: { receive(message: NativeToWebMessage): void };
      };
      host.__messages = [];
      host.__chapters = fixtures;
      host.ReactNativeWebView = {
        postMessage(raw) {
          const message = JSON.parse(raw) as WebToNativeMessage;
          host.__messages.push(message);
          if (message.type === 'request-section') {
            const fixture = host.__chapters[message.chapterId];
            setTimeout(() => {
              host.lnReader?.receive(
                fixture && !fixture.error
                  ? {
                      type: 'section-content',
                      requestId: message.requestId,
                      html: fixture.html ?? '',
                      baseUrl: fixture.baseUrl,
                    }
                  : {
                      type: 'section-error',
                      requestId: message.requestId,
                      message: fixture?.error ?? 'Missing chapter',
                    },
              );
            }, delay);
          }
        },
      };
    },
    { fixtures: chapters, delay: options.delay ?? 5 },
  );
  await page.goto(`${ORIGIN}/index.html`);
  await waitForMessage(page, 'ready');

  const sections =
    options.sections ??
    Object.keys(chapters).map(id => ({
      id: Number(id),
      name: `Chapter ${id}`,
    }));
  const open: ReaderOpenMessage = {
    type: 'open',
    novelName: 'Test Novel',
    novelId: 7,
    pluginId: 'test-source',
    sections,
    start: options.start ?? { chapterId: sections[0].id, fraction: 0 },
    preferences,
    assetsUri: ORIGIN,
    dir: options.dir ?? 'ltr',
    lang: 'en',
    customJs: options.customJs ?? '',
    pluginJs: options.pluginJs ?? '',
    battery: 0.8,
    strings: {
      retry: 'Retry',
      finished: 'Finished',
      nextChapter: 'Next: %{name}',
      noNextChapter: 'No next chapter',
    },
  };
  await page.evaluate(list => {
    (window as unknown as { __sections: ReaderSection[] }).__sections = list;
  }, sections);
  await send(page, open);
  await waitForMessage(page, 'relocate');
  await settle(page);
  return { preferences, sections };
};

export const send = (page: Page, message: NativeToWebMessage) =>
  page.evaluate(msg => {
    (
      window as unknown as { lnReader: { receive(m: unknown): void } }
    ).lnReader.receive(msg);
  }, message);

export const messages = <T extends WebToNativeMessage['type']>(
  page: Page,
  type: T,
) =>
  page.evaluate(
    t =>
      (
        window as unknown as { __messages: WebToNativeMessage[] }
      ).__messages.filter(message => message.type === t),
    type,
  ) as Promise<Extract<WebToNativeMessage, { type: T }>[]>;

export const clearMessages = (page: Page) =>
  page.evaluate(() => {
    (window as unknown as { __messages: unknown[] }).__messages.length = 0;
  });

export const waitForMessage = async <T extends WebToNativeMessage['type']>(
  page: Page,
  type: T,
  predicate: string = 'true',
) => {
  const handle = await page.waitForFunction(
    ({ t, p }) => {
      const list = (window as unknown as { __messages: { type: string }[] })
        .__messages;

      const test = new Function('m', `return (${p});`) as (
        m: unknown,
      ) => boolean;
      return list.filter(m => m.type === t).find(m => test(m)) ?? false;
    },
    { t: type, p: predicate },
  );
  return (await handle.jsonValue()) as Extract<WebToNativeMessage, { type: T }>;
};

export const lastRelocate = async (page: Page) => {
  const list = await messages(page, 'relocate');
  return list[list.length - 1];
};

export const settle = async (page: Page, ms = 400) => {
  await page.evaluate(
    wait =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => setTimeout(() => resolve(), wait)),
      ),
    ms,
  );
};

export const inSection = <R>(
  page: Page,
  chapterId: number,
  fn: string,
): Promise<R> =>
  page.evaluate(
    ({ id, body }) => {
      const host = window as unknown as {
        __sections: { id: number }[];
        lnReaderInstance: {
          paginator: { getContents(): { index: number; doc: Document }[] };
        };
      };
      const index = host.__sections.findIndex(section => section.id === id);
      const doc = host.lnReaderInstance.paginator
        .getContents()
        .find(content => content.index === index)?.doc;
      if (!doc) {
        throw new Error(`Chapter ${id} is not loaded`);
      }

      return new Function('doc', `return (${body})(doc);`)(doc) as R;
    },
    { id: chapterId, body: fn },
  );

export const paginatorState = (page: Page) =>
  page.evaluate(() => {
    const paginator = (
      window as unknown as {
        lnReaderInstance: {
          paginator: {
            getContents(): { index: number }[];
            columnCount?: number;
            heads?: HTMLElement[] | null;
            feet?: HTMLElement[] | null;
            atStart: boolean;
            atEnd: boolean;
            scrolled: boolean;
            containerPosition: number;
            primaryIndex: number;
          };
        };
      }
    ).lnReaderInstance.paginator;
    return {
      loaded: paginator.getContents().map(content => content.index),
      columnCount: paginator.columnCount,
      heads: (paginator.heads ?? []).map(head => head.textContent ?? ''),
      feet: (paginator.feet ?? []).map(foot => foot.textContent ?? ''),
      atStart: paginator.atStart,
      atEnd: paginator.atEnd,
      scrolled: paginator.scrolled,
      position: paginator.containerPosition,
      primaryIndex: paginator.primaryIndex,
    };
  });
