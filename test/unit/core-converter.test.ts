import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'node:path';
import {
  getDefaultConfig,
  mergeConfigWithFrontMatter,
  mergeConfigs,
  convertMarkdownToHtml,
  buildFullHtml,
  makeHtml,
  buildStyles,
} from '../../src/core';

describe('Core Converter & Config', () => {
  describe('getDefaultConfig', () => {
    it('should return all expected default configuration values', () => {
      const config = getDefaultConfig();
      assert.strictEqual(config.format, 'A4');
      assert.strictEqual(config.orientation, 'portrait');
      assert.deepStrictEqual(config.margin, {
        top: '1.5cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm',
      });
      assert.strictEqual(config.printBackground, true);
      assert.strictEqual(config.displayHeaderFooter, true);
      assert.strictEqual(config.scale, 1);
      assert.strictEqual(config.sanitize, 'gfm');
      assert.strictEqual(config.highlight, true);
      assert.strictEqual(config.highlightStyle, 'github.css');
      assert.strictEqual(config.mermaidServer, 'https://unpkg.com/mermaid/dist/mermaid.min.js');
      assert.strictEqual(config.plantumlServer, 'http://www.plantuml.com/plantuml');
      assert.strictEqual(config.plantumlOpenMarker, '@startuml');
      assert.strictEqual(config.plantumlCloseMarker, '@enduml');
      assert.strictEqual(config.breaks, false);
      assert.strictEqual(config.emoji, true);
      assert.strictEqual(config.math.enabled, true);
      assert.deepStrictEqual(config.math.katex.macros, {});
      assert.strictEqual(config.markdownItInclude.enable, true);
      assert.strictEqual(config.includeDefaultStyles, true);
      assert.deepStrictEqual(config.styles, []);
      assert.deepStrictEqual(config.type, ['pdf']);
    });
  });

  describe('mergeConfigWithFrontMatter', () => {
    it('should merge basic frontmatter fields', () => {
      const base = getDefaultConfig();
      const merged = mergeConfigWithFrontMatter(base, {
        breaks: true,
        emoji: false,
        format: 'Letter',
        orientation: 'landscape',
        highlightStyle: 'monokai.css',
      });

      assert.strictEqual(merged.breaks, true);
      assert.strictEqual(merged.emoji, false);
      assert.strictEqual(merged.format, 'Letter');
      assert.strictEqual(merged.orientation, 'landscape');
      assert.strictEqual(merged.highlightStyle, 'monokai.css');
      // Original config must not be mutated
      assert.strictEqual(base.breaks, false);
      assert.strictEqual(base.format, 'A4');
    });

    it('should merge margins and math macros from frontmatter', () => {
      const base = getDefaultConfig();
      const merged = mergeConfigWithFrontMatter(base, {
        margin: { top: '2cm', left: '0.5cm' },
        math: {
          enabled: true,
          katex: {
            macros: { '\\RR': '\\mathbb{R}' },
          },
        },
      });

      assert.strictEqual(merged.margin.top, '2cm');
      assert.strictEqual(merged.margin.left, '0.5cm');
      assert.strictEqual(merged.margin.bottom, '1cm'); // retained default
      assert.strictEqual(merged.math.katex.macros['\\RR'], '\\mathbb{R}');
    });

    it('should support frontmatter scoped under markdown-pdf key', () => {
      const base = getDefaultConfig();
      const merged = mergeConfigWithFrontMatter(base, {
        'markdown-pdf': {
          format: 'Legal',
          breaks: true,
        },
      });

      assert.strictEqual(merged.format, 'Legal');
      assert.strictEqual(merged.breaks, true);
    });

    it('should handle boolean math in frontmatter', () => {
      const base = getDefaultConfig();
      const merged = mergeConfigWithFrontMatter(base, { math: false });
      assert.strictEqual(merged.math.enabled, false);
    });
  });

  describe('mergeConfigs', () => {
    it('should merge partial overrides into base config', () => {
      const base = getDefaultConfig();
      const merged = mergeConfigs(base, {
        format: 'A3',
        highlight: false,
        margin: { top: '3cm', bottom: '2cm', left: '1cm', right: '1cm' },
      });

      assert.strictEqual(merged.format, 'A3');
      assert.strictEqual(merged.highlight, false);
      assert.strictEqual(merged.margin.top, '3cm');
    });
  });

  describe('convertMarkdownToHtml', () => {
    it('should convert standard markdown to HTML with named headers and checkboxes', () => {
      const md = '# Main Title\n\nThis is a paragraph with **bold** text.\n\n- [ ] Task 1\n- [x] Task 2';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<h1 id="main-title">Main Title<\/h1>/);
      assert.match(result.html, /<p>This is a paragraph with <strong>bold<\/strong> text\.<\/p>/);
      assert.match(result.html, /<input type="checkbox"/);
      assert.match(result.html, /checked="true"/);
    });

    it('should render fenced mermaid blocks as <div class="mermaid">', () => {
      const md = '```mermaid\ngraph TD;\n  A-->B;\n  B-->C;\n```';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<div class="mermaid">graph TD;\n  A-->B;\n  B-->C;\n<\/div>/);
      assert.doesNotMatch(result.html, /<pre class="hljs">/);
    });

    it('should render code blocks with highlight.js syntax highlighting', () => {
      const md = '```javascript\nconst hello = "world";\n```';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<pre class="hljs"><code><div>/);
      assert.match(result.html, /class="hljs-string"/);
    });

    it('should render KaTeX inline and block math', () => {
      const md = 'Inline: $E = mc^2$\n\nBlock:\n$$\\int_0^1 x dx$$';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<span class="katex">/);
      assert.match(result.html, /<span class="katex-display">/);
    });

    it('should render KaTeX bracket math \\(...\\) and \\[...\\]', () => {
      const md = 'Bracket inline \\(x + y\\) and block:\n\n\\[\n\\sum_{i=1}^n i\n\\]';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<span class="katex">/);
      assert.match(result.html, /<span class="katex-display">/);
    });

    it('should render ```math fenced code block via KaTeX', () => {
      const md = '```math\nf(x) = x^2\n```';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<span class="katex-display">/);
      assert.doesNotMatch(result.html, /<pre class="hljs">/);
    });

    it('should render PlantUML fenced code blocks as <img> tags', () => {
      const md = '```plantuml\nAlice -> Bob: Authentication Request\n```';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<img\s+src="http:\/\/www\.plantuml\.com\/plantuml\/svg\//);
    });

    it('should render PlantUML @startuml blocks as <img> tags', () => {
      const md = '@startuml\nBob -> Alice: Response\n@enduml';
      const result = convertMarkdownToHtml(md);

      assert.match(result.html, /<img\s+src="http:\/\/www\.plantuml\.com\/plantuml\/svg\//);
    });

    it('should parse frontmatter and override config during conversion', () => {
      const md = '---\nbreaks: true\n---\nLine 1\nLine 2';
      const result = convertMarkdownToHtml(md);

      assert.strictEqual(result.config.breaks, true);
      assert.match(result.html, /Line 1<br>\nLine 2/);
    });

    it('should transform relative image paths to file:/// URLs for pdf output', () => {
      const md = '![Sample Image](./assets/sample.png)';
      const fakeSource = path.join(process.cwd(), 'docs', 'readme.md');
      const result = convertMarkdownToHtml(md, getDefaultConfig(), fakeSource, 'pdf');

      assert.match(result.html, /<img src="file:\/\/\/.*\/docs\/assets\/sample\.png"/);
    });

    it('should keep relative image paths intact for html output', () => {
      const md = '![Sample Image](./assets/sample.png)';
      const fakeSource = path.join(process.cwd(), 'docs', 'readme.md');
      const result = convertMarkdownToHtml(md, getDefaultConfig(), fakeSource, 'html');

      assert.match(result.html, /<img src="\.\/assets\/sample\.png"/);
    });
  });

  describe('HTML Builder (buildFullHtml / makeHtml)', () => {
    it('should build a complete HTML document from markdown body', () => {
      const converted = convertMarkdownToHtml('# Hello World\n\nParagraph text.');
      const html = buildFullHtml(converted.html, converted.config, {
        title: 'Custom Test Title',
      });

      assert.match(html, /<!DOCTYPE html>/);
      assert.match(html, /<title>Custom Test Title<\/title>/);
      assert.match(html, /<h1 id="hello-world">Hello World<\/h1>/);
      assert.match(html, /<script src="https:\/\/unpkg\.com\/mermaid\/dist\/mermaid\.min\.js"><\/script>/);
      assert.match(html, /mermaid\.initialize\(\{/);
      assert.match(html, /<style>/);
    });

    it('should inline default styles and highlight style in the HTML document', () => {
      const converted = convertMarkdownToHtml('```js\nconsole.log(1);\n```');
      const html = buildFullHtml(converted.html, converted.config);

      // markdown.css and markdown-pdf.css styles
      assert.match(html, /body\s*\{/);
      // highlight.js styles (github.css contains .hljs)
      assert.match(html, /\.hljs/);
    });

    it('should inline KaTeX stylesheet with embedded font data URIs when math is present', () => {
      const converted = convertMarkdownToHtml('$E = mc^2$');
      const html = buildFullHtml(converted.html, converted.config);

      assert.match(html, /<span class="katex">/);
      // KaTeX CSS inlining
      assert.match(html, /\.katex/);
      assert.match(html, /url\(data:font\/woff2;base64,/);
    });

    it('should not include KaTeX font stylesheet when math is not present', () => {
      const converted = convertMarkdownToHtml('# No Math Here\n\nJust text.');
      const html = buildFullHtml(converted.html, converted.config);

      assert.doesNotMatch(html, /url\(data:font\/woff2;base64,/);
    });

    it('should work with makeHtml alias with sourceFilePath string', () => {
      const converted = convertMarkdownToHtml('# Doc Title');
      const html = makeHtml(converted.html, converted.config, '/workspace/docs/guide.md');

      assert.match(html, /<title>guide\.md<\/title>/);
      assert.match(html, /<h1 id="doc-title">Doc Title<\/h1>/);
    });

    it('should build separate styles string via buildStyles', () => {
      const styles = buildStyles('content with class="katex"', getDefaultConfig());
      assert.match(styles, /<style>/);
      assert.match(styles, /\.katex/);
    });
  });
});
