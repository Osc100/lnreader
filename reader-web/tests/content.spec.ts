import { expect, test } from '@playwright/test';

import { DEFAULT_READER_PREFERENCES } from '../../src/screens/reader/engine/preferences';
import {
  chapterHtml,
  clearMessages,
  inSection,
  messages,
  openReader,
  send,
  settle,
  waitForMessage,
} from './harness';

const endingText = (page: Parameters<typeof inSection>[0], chapter = 1) =>
  inSection<string>(
    page,
    chapter,
    `doc => doc.querySelector('.ln-chapter-end')?.textContent ?? ''`,
  );

test.describe('chapter ending', () => {
  test('closes the chapter with its name and a button to the next one', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      sections: [
        { id: 1, name: 'The Beginning' },
        { id: 2, name: 'The Middle' },
      ],
      chapters: {
        1: { html: chapterHtml(1, 3) },
        2: { html: chapterHtml(2, 3) },
      },
    });
    expect(await endingText(page)).toBe(
      'Finished: The BeginningNext: The Middle',
    );
    await clearMessages(page);
    await inSection(
      page,
      1,
      `doc => doc.querySelector('.ln-next-chapter').click()`,
    );
    expect(await waitForMessage(page, 'navigate-chapter')).toMatchObject({
      direction: 'next',
    });
    expect(await messages(page, 'open-link')).toHaveLength(0);
  });

  test('is neither searched nor read aloud', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      sections: [{ id: 1, name: 'The End' }],
      chapters: { 1: { html: '<p>Only text.</p>' } },
    });
    await send(page, { type: 'search', query: 'Finished' });
    expect(await waitForMessage(page, 'search-result')).toMatchObject({
      total: 0,
    });
    await send(page, { type: 'tts-start' });
    expect((await waitForMessage(page, 'tts-queue')).utterances).toEqual([
      'Only text.',
    ]);
  });

  test('says so when there is no next chapter', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled' },
      sections: [{ id: 1, name: 'The End' }],
      chapters: { 1: { html: chapterHtml(1, 3) } },
    });
    expect(await endingText(page)).toBe('Finished: The EndNo next chapter');
  });

  test('is hidden when chapters are continuous', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'scrolled', continuousChapters: true },
    });
    const display = await inSection<string>(
      page,
      1,
      `doc => getComputedStyle(doc.querySelector('.ln-chapter-end')).display`,
    );
    expect(display).toBe('none');
  });

  test('is hidden in paginated mode', async ({ page }) => {
    await openReader(page, { preferences: { flow: 'paginated' } });
    const display = await inSection<string>(
      page,
      1,
      `doc => getComputedStyle(doc.querySelector('.ln-chapter-end')).display`,
    );
    expect(display).toBe('none');
  });

  test('no title is inserted by default', async ({ page }) => {
    await openReader(page, {
      sections: [{ id: 1, name: 'The Beginning' }],
      chapters: { 1: { html: chapterHtml(1, 3) } },
    });
    const headings = await inSection<number>(
      page,
      1,
      `doc => doc.querySelectorAll('.ln-chapter-title').length`,
    );
    expect(headings).toBe(0);
  });
});

const titleCount = (page: Parameters<typeof inSection>[0], chapter = 1) =>
  inSection<number>(
    page,
    chapter,
    `doc => doc.querySelectorAll('.ln-chapter-title').length`,
  );

test.describe('chapter title (when enabled)', () => {
  test('is added when the chapter does not start with it', async ({ page }) => {
    await openReader(page, {
      preferences: { showChapterTitle: true },
      sections: [{ id: 1, name: 'The Beginning' }],
      chapters: { 1: { html: chapterHtml(1, 3) } },
    });
    expect(await titleCount(page)).toBe(1);
    const text = await inSection<string>(
      page,
      1,
      `doc => doc.querySelector('.ln-chapter-title').textContent`,
    );
    expect(text).toBe('The Beginning');
  });

  test('is not repeated when the chapter already opens with it', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { showChapterTitle: true },
      sections: [{ id: 1, name: 'Chapter 1: The Beginning' }],
      chapters: {
        1: { html: `<h3>Chapter 1: The Beginning</h3>${chapterHtml(1, 3)}` },
      },
    });
    expect(await titleCount(page)).toBe(0);
  });

  test('a paragraph that merely starts with the words is not a title', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { showChapterTitle: true },
      sections: [{ id: 1, name: 'Chapter 1' }],
      chapters: { 1: { html: chapterHtml(1, 3) } },
    });
    expect(await titleCount(page)).toBe(1);
  });

  test('can be turned off (the chapter is rebuilt in place)', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { showChapterTitle: true },
      sections: [{ id: 1, name: 'The Beginning' }],
      chapters: { 1: { html: chapterHtml(1, 3) } },
    });
    await clearMessages(page);
    await send(page, {
      type: 'preferences',
      preferences: { ...DEFAULT_READER_PREFERENCES, showChapterTitle: false },
    });
    await waitForMessage(page, 'relocate');
    await settle(page);
    expect(await titleCount(page)).toBe(0);
  });
});

test.describe('transforms', () => {
  test('bionic reading bolds the start of words, not code', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { bionicReading: true },
      chapters: { 1: { html: '<p>Reading quickly</p><pre>code stays</pre>' } },
    });
    const result = await inSection<{ bold: string[]; pre: number }>(
      page,
      1,
      `doc => ({ bold: [...doc.querySelectorAll('p .ln-bionic')].map(b => b.textContent),
                pre: doc.querySelectorAll('pre .ln-bionic').length })`,
    );
    // 7 letters: the first 4 are bold.
    expect(result.bold).toEqual(['Read', 'quic']);
    expect(result.pre).toBe(0);
  });

  test('user snippets rewrite the chapter html before it renders', async ({
    page,
  }) => {
    await openReader(page, {
      customJs: "html = html.replace(/lazy dog/g, 'sleepy cat');",
    });
    const text = await inSection<string>(
      page,
      1,
      'doc => doc.body.textContent',
    );
    expect(text).toContain('sleepy cat');
    expect(text).not.toContain('lazy dog');
  });

  test('snippets get the chapter details, document and qs', async ({
    page,
  }) => {
    await openReader(page, {
      customJs: `
        html = html.replace('paragraph 1.', 'paragraph 1. [' + novelName + '|' + chapterName + '|' + sourceId + '|' + chapterId + '|' + novelId + ']');
        qs('#LNReader-chapter').dataset.touched = document.title;
      `,
    });
    const result = await inSection<{ text: string; touched?: string }>(
      page,
      1,
      `doc => ({ text: doc.querySelector('#c1p1').textContent,
                touched: doc.getElementById('LNReader-chapter').dataset.touched })`,
    );
    expect(result.text).toContain('[Test Novel|Chapter 1|test-source|1|7]');
    // The snippet saw the chapter's own document through \`qs\` and \`document\`.
    expect(result.touched).toBe('Chapter 1');
  });

  test('snippets run on the live chapter: listeners and timers keep working', async ({
    page,
  }) => {
    await openReader(page, {
      customJs: `
        document.addEventListener('click', () => { document.body.dataset.clicked = 'yes'; });
        window.setTimeout(() => { document.body.dataset.later = String(window === document.defaultView); }, 50);
      `,
    });
    await inSection(page, 1, 'doc => { doc.body.click(); return true; }');
    await settle(page, 300);
    const data = await inSection<{ clicked?: string; later?: string }>(
      page,
      1,
      'doc => ({ clicked: doc.body.dataset.clicked, later: doc.body.dataset.later })',
    );
    expect(data).toEqual({ clicked: 'yes', later: 'true' });
  });

  test('custom CSS can target the source and use the reader variables', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: {
        cssVariables: { 'theme-primary': '#123456' },
        customCss:
          '#sourceId-test-source #LNReader-chapter p { color: var(--theme-primary) !important; }',
      },
    });
    const color = await inSection<string>(
      page,
      1,
      `doc => doc.defaultView.getComputedStyle(doc.querySelector('#LNReader-chapter p')).color`,
    );
    expect(color).toBe('rgb(18, 52, 86)');
  });

  test('a broken snippet leaves the chapter as it was', async ({ page }) => {
    await openReader(page, { customJs: 'html = html.replace((' });
    const text = await inSection<string>(
      page,
      1,
      'doc => doc.body.textContent',
    );
    expect(text).toContain('lazy dog');
    expect((await messages(page, 'log')).some(m => m.level === 'warn')).toBe(
      true,
    );
  });

  test('plugin scripts run inside each chapter document', async ({ page }) => {
    await openReader(page, {
      pluginJs: "document.body.dataset.plugin = 'ran';",
    });
    expect(
      await inSection<string>(page, 1, 'doc => doc.body.dataset.plugin'),
    ).toBe('ran');
  });

  test('chapter styling is ignored; the reader theme applies', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { textColor: '#112233', fontSize: 18 },
      chapters: {
        1: {
          html: `<html><head><style>p { color: red; font-size: 40px; font-family: cursive }</style>
            <link rel="stylesheet" href="https://evil.example/theme.css"></head>
            <body bgcolor="#ff0000"><p style="color: lime; font-size: 50px">Styled</p>
            <p><font color="red" size="7" face="cursive">Old font</font></p></body></html>`,
        },
      },
    });
    const result = await inSection<Record<string, unknown>>(
      page,
      1,
      `doc => {
        const [styled, old] = doc.querySelectorAll('p');
        const s1 = doc.defaultView.getComputedStyle(styled);
        const s2 = doc.defaultView.getComputedStyle(old.querySelector('font'));
        return {
          styles: doc.querySelectorAll('style:not([data-ln]), link').length,
          color: s1.color, size: s1.fontSize, oldColor: s2.color,
          inline: styled.hasAttribute('style'), bgcolor: doc.body.hasAttribute('bgcolor'),
        };
      }`,
    );
    expect(result.color).toBe('rgb(17, 34, 51)');
    expect(result.size).toBe('18px');
    expect(result.oldColor).toBe('rgb(17, 34, 51)');
    expect(result.inline).toBe(false);
    expect(result.bgcolor).toBe(false);
  });

  test('no code from a chapter runs', async ({ page }) => {
    await openReader(page, {
      chapters: {
        1: {
          html: `<p id="target">Text</p>
            <img src="img/x.png" onload="document.body.dataset.a='1'" onerror="document.body.dataset.a='1'">
            <a id="js" href="javascript:document.body.dataset.b='1'">link</a>
            <svg><script>document.body.dataset.c='1'</script></svg>
            <iframe srcdoc="<script>parent.document.body.dataset.d='1'</script>"></iframe>
            <object data="x.swf"></object><embed src="x.swf">
            <div onclick="document.body.dataset.e='1'">click</div>`,
          baseUrl: 'http://reader.test/',
        },
      },
    });
    await settle(page, 500);
    const result = await inSection<Record<string, unknown>>(
      page,
      1,
      `doc => {
        doc.querySelector('div').click();
        return {
          data: { ...doc.body.dataset },
          handlers: [...doc.querySelectorAll('*')].some(el => [...el.attributes].some(a => a.name.startsWith('on'))),
          jsLink: doc.getElementById('js').getAttribute('href'),
          embeds: doc.querySelectorAll('script, iframe, object, embed').length,
          policy: doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
        };
      }`,
    );
    expect(result.data).toEqual({});
    expect(result.handlers).toBe(false);
    expect(result.jsLink).toBeNull();
    expect(result.embeds).toBe(0);
    expect(result.policy).toContain("script-src 'none'");
  });

  test('scripts inside chapters are removed', async ({ page }) => {
    await openReader(page, {
      chapters: {
        1: {
          html: `<p>Safe</p><script>document.body.dataset.evil = '1'</script>`,
        },
      },
    });
    const result = await inSection<{ scripts: number; evil?: string }>(
      page,
      1,
      `doc => ({ scripts: doc.querySelectorAll('script').length, evil: doc.body.dataset.evil })`,
    );
    expect(result.scripts).toBe(0);
    expect(result.evil).toBeUndefined();
  });
});

test.describe('loading', () => {
  test('a failed chapter shows its error with a retry link', async ({
    page,
  }) => {
    await openReader(page, {
      sections: [{ id: 1, name: 'Broken' }],
      chapters: { 1: { error: 'Network is down' } },
    });
    const text = await inSection<string>(
      page,
      1,
      'doc => doc.body.textContent',
    );
    expect(text).toContain('Network is down');
    await clearMessages(page);
    await inSection(page, 1, `doc => doc.querySelector('a').click()`);
    const refresh = await waitForMessage(page, 'refresh-section');
    expect(refresh.chapterId).toBe(1);
  });

  test('reloading a chapter fetches it again', async ({ page }) => {
    await openReader(page, {
      sections: [{ id: 1, name: 'Chapter 1' }],
      chapters: { 1: { error: 'Try later' } },
    });
    await page.evaluate(html => {
      (
        window as unknown as { __chapters: Record<number, unknown> }
      ).__chapters[1] = { html };
    }, chapterHtml(1, 3));
    await clearMessages(page);
    await send(page, { type: 'reload-section', chapterId: 1 });
    await waitForMessage(page, 'relocate');
    await settle(page);
    const text = await inSection<string>(
      page,
      1,
      'doc => doc.body.textContent',
    );
    expect(text).toContain('Chapter 1 paragraph 1.');
    expect(
      (await messages(page, 'request-section')).map(m => m.chapterId),
    ).toContain(1);
  });

  test('relative images resolve against the chapter’s site', async ({
    page,
  }) => {
    await openReader(page, {
      chapters: {
        1: {
          html: '<p>Art</p><img src="img/cover.png">',
          baseUrl: 'http://reader.test/',
        },
      },
    });
    const image = await inSection<{ src: string; loaded: boolean }>(
      page,
      1,
      `async doc => { const img = doc.querySelector('img');
        if (!img.complete) await new Promise(r => img.addEventListener('load', r, { once: true }));
        return { src: img.currentSrc, loaded: img.naturalWidth > 0 }; }`,
    );
    expect(image.src).toBe('http://reader.test/img/cover.png');
    expect(image.loaded).toBe(true);
  });
});

test.describe('links and selection', () => {
  test('external links are handed to the app', async ({ page }) => {
    await openReader(page, {
      chapters: {
        1: {
          html: '<p><a href="/novel/2">Next novel</a></p>',
          baseUrl: 'https://site.example/',
        },
      },
    });
    await clearMessages(page);
    await inSection(page, 1, `doc => doc.querySelector('a').click()`);
    const link = await waitForMessage(page, 'open-link');
    expect(link.href).toBe('https://site.example/novel/2');
    expect(await messages(page, 'tap')).toHaveLength(0);
  });

  test('footnote links jump within the chapter', async ({ page }) => {
    await openReader(page, {
      preferences: { flow: 'paginated', animation: 'none' },
      chapters: {
        1: {
          html: `<p><a href="#note">1</a></p>${chapterHtml(
            1,
            30,
          )}<p id="note">The note</p>`,
        },
      },
    });
    await clearMessages(page);
    await inSection(
      page,
      1,
      `doc => doc.querySelector('a[href="#note"]').click()`,
    );
    const relocate = await waitForMessage(page, 'relocate');
    expect(relocate.page).toBeGreaterThan(1);
    expect(await messages(page, 'open-link')).toHaveLength(0);
  });

  test('selected text is reported for the text actions', async ({ page }) => {
    await openReader(page);
    await inSection(
      page,
      1,
      `doc => { const range = doc.createRange(); const p = doc.querySelector('#c1p1');
        range.setStart(p.firstChild, 0); range.setEnd(p.firstChild, 9);
        const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(range); }`,
    );
    const selection = await waitForMessage(page, 'selection');
    expect(selection.text).toBe('Chapter 1');
    await send(page, { type: 'clear-selection' });
    await waitForMessage(page, 'selection-cleared');
  });

  test('removing and replacing text updates the page at once', async ({
    page,
  }) => {
    await openReader(page);
    await send(page, { type: 'text-edit', action: 'remove', text: 'quick ' });
    await send(page, {
      type: 'text-edit',
      action: 'replace',
      text: 'brown fox',
      replacement: 'red panda',
    });
    const text = await inSection<string>(
      page,
      1,
      'doc => doc.body.textContent',
    );
    expect(text).not.toContain('quick ');
    expect(text).toContain('red panda');
  });
});
