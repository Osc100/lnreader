import { expect, test } from '@playwright/test';

import { DEFAULT_READER_PREFERENCES } from '../../src/screens/reader/engine/preferences';
import { chapterHtml, inSection, openReader, send, settle } from './harness';

const paragraphStyle = (page: Parameters<typeof inSection>[0], index = 0) =>
  inSection<Record<string, string>>(
    page,
    1,
    `doc => {
      const p = doc.querySelectorAll('p')[${index}];
      const s = doc.defaultView.getComputedStyle(p);
      return {
        fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
        lineHeight: s.lineHeight, marginBottom: s.marginBottom, textIndent: s.textIndent,
        textAlign: s.textAlign, letterSpacing: s.letterSpacing, wordSpacing: s.wordSpacing,
        hyphens: s.hyphens, color: s.color,
        // The paginator paints the page colour behind the chapter (on the
        // element holding its frame) and clears it inside the chapter.
        background: getComputedStyle(doc.defaultView.frameElement.parentElement).backgroundColor,
      };
    }`,
  );

test.describe('typography', () => {
  test('applies the bundled font through @font-face and loads it', async ({
    page,
  }) => {
    await openReader(page, { preferences: { fontFamily: 'lora' } });
    const style = await paragraphStyle(page);
    expect(style.fontFamily).toContain('lora');
    const loaded = await inSection<boolean>(
      page,
      1,
      `async doc => { await doc.fonts.ready; return doc.fonts.check('16px "lora"') &&
        [...doc.fonts].some(f => f.family.includes('lora') && f.status === 'loaded'); }`,
    );
    expect(loaded).toBe(true);
  });

  test('the original font is the default font; chapter fonts are ignored', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { fontFamily: '' },
      chapters: {
        1: {
          html: `<p style="font-family: monospace">Mono ${chapterHtml(
            1,
            1,
          )}</p>`,
        },
      },
    });
    const style = await paragraphStyle(page);
    expect(style.fontFamily).not.toContain('monospace');
    const faces = await inSection<number>(page, 1, 'doc => doc.fonts.size');
    expect(faces).toBe(0);
  });

  test('overrides the chapter’s fonts with the chosen one', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { fontFamily: 'lora' },
      chapters: {
        1: {
          html: `<p class="x" style="font-family: monospace">A</p><style>.x{font-family:cursive}</style>`,
        },
      },
    });
    const style = await paragraphStyle(page);
    expect(style.fontFamily).toContain('lora');
  });

  test('applies size, spacing, indent, alignment and colours', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: {
        fontSize: 20,
        lineHeight: 1.8,
        paragraphSpacing: 1.5,
        textIndent: 2,
        textAlign: 'justify',
        textColor: '#112233',
        backgroundColor: '#fafafa',
      },
    });
    const style = await paragraphStyle(page, 1);
    expect(style.fontSize).toBe('20px');
    expect(parseFloat(style.lineHeight)).toBeCloseTo(36, 0);
    expect(parseFloat(style.marginBottom)).toBeCloseTo(30, 0);
    expect(parseFloat(style.textIndent)).toBeCloseTo(40, 0);
    expect(style.textAlign).toBe('justify');
    expect(style.color).toBe('rgb(17, 34, 51)');
    expect(style.background).toBe('rgb(250, 250, 250)');
  });

  test('the first paragraph after a heading is not indented', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { textIndent: 2 },
      chapters: { 1: { html: `<h2>Part</h2>${chapterHtml(1, 3)}` } },
    });
    const indents = await inSection<string[]>(
      page,
      1,
      `doc => [...doc.querySelectorAll('p')].slice(0, 2).map(p => doc.defaultView.getComputedStyle(p).textIndent)`,
    );
    expect(indents[0]).toBe('0px');
    expect(parseFloat(indents[1])).toBeGreaterThan(0);
  });

  test('links use the theme colour; custom CSS applies', async ({ page }) => {
    await openReader(page, {
      preferences: {
        cssVariables: { 'theme-primary': '#ff0000' },
        customCss: 'p { text-transform: uppercase; }',
      },
      chapters: {
        1: { html: `<p>Go <a href="https://example.com">there</a></p>` },
      },
    });
    const result = await inSection<{ link: string; transform: string }>(
      page,
      1,
      `doc => ({ link: doc.defaultView.getComputedStyle(doc.querySelector('a')).color,
                transform: doc.defaultView.getComputedStyle(doc.querySelector('p')).textTransform })`,
    );
    expect(result.link).toBe('rgb(255, 0, 0)');
    expect(result.transform).toBe('uppercase');
  });

  test('style changes apply live without reloading the chapter', async ({
    page,
  }) => {
    await openReader(page);
    const marker = await inSection<string>(
      page,
      1,
      `doc => { doc.body.dataset.marker = 'kept'; return doc.body.dataset.marker; }`,
    );
    expect(marker).toBe('kept');
    await send(page, {
      type: 'preferences',
      preferences: { ...DEFAULT_READER_PREFERENCES, fontSize: 24 },
    });
    await settle(page);
    const style = await paragraphStyle(page);
    expect(style.fontSize).toBe('24px');
    const stillMarked = await inSection<string>(
      page,
      1,
      'doc => doc.body.dataset.marker',
    );
    expect(stillMarked).toBe('kept');
  });

  test('extra paragraph spacing removal hides blank lines', async ({
    page,
  }) => {
    await openReader(page, {
      preferences: { removeExtraParagraphSpacing: true },
      chapters: { 1: { html: '<p>One</p><p></p><p>Two<br><br>Three</p>' } },
    });
    const hidden = await inSection<string[]>(
      page,
      1,
      `doc => [doc.querySelectorAll('p')[1], doc.querySelectorAll('br')[1]].map(el => doc.defaultView.getComputedStyle(el).display)`,
    );
    expect(hidden).toEqual(['none', 'none']);
  });
});
