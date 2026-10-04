import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import plantumlEncoder from 'plantuml-encoder';

import {
  getDefaultConfig,
  convertMarkdownToHtml,
  buildFullHtml,
  buildStyles,
  resolveCliChromium,
  exportDocument,
  MarkdownPdfConfig,
} from '../../src/core';
import { runCli } from '../../src/cli/runner';
import { CliUi } from '../../src/cli/ui';

// Silent UI for test runs to avoid terminal spinner noise
const silentUi: CliUi = {
  info: () => {},
  warn: () => {},
  error: () => {},
  success: () => {},
  startProgress: () => {},
  updateProgress: () => {},
  stopProgress: () => {},
};

function normalizeHtml(html: string): string {
  return html
    .replace(/\r\n?/g, '\n')
    .replace(/file:\/\/\/[^\s"'<>:]*/g, 'file:///NORMALIZED_PATH')
    .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD')
    .replace(/\d{2}:\d{2}:\d{2}/g, 'HH:MM:SS');
}

describe('CLI & Core Feature Parity Suite (Tahap 5 QA)', () => {
  const fixturesDir = path.resolve(__dirname, '..', 'integration', 'fixtures');
  const expectedDir = path.resolve(__dirname, '..', 'integration', 'expected');
  const comprehensiveMdPath = path.join(fixturesDir, 'comprehensive-parity.md');

  // =========================================================================
  // SUITE 1: Advanced Markdown Features & AST Parity
  // =========================================================================
  describe('1. Advanced Markdown & Diagram Feature Compilation', () => {
    it('should compile all 5 Mermaid diagram types into language-mermaid divs', () => {
      const markdown = `
\`\`\`mermaid
flowchart TD
    A[Start] --> B[Finish]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
\`\`\`

\`\`\`mermaid
classDiagram
    class User {
        +String name
    }
\`\`\`

\`\`\`mermaid
gitGraph
    commit
    branch dev
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> Active
\`\`\`
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'test.md', 'html');
      const mermaidDivs = res.html.match(/<pre><code class="language-mermaid"><div class="mermaid">([\s\S]*?)<\/div><\/code><\/pre>/g);
      assert.ok(mermaidDivs, 'Mermaid divs should be generated');
      assert.strictEqual(mermaidDivs.length, 5, 'Should generate 5 mermaid diagram blocks');
      assert.ok(res.html.includes('flowchart TD'));
      assert.ok(res.html.includes('sequenceDiagram'));
      assert.ok(res.html.includes('classDiagram'));
      assert.ok(res.html.includes('gitGraph'));
      assert.ok(res.html.includes('stateDiagram-v2'));
    });

    it('should correctly render all KaTeX math formats (inline, display, brackets, fence)', () => {
      const markdown = `
Inline math: $E = mc^2$.
Block math:
$$
\\int_{0}^{\\infty} e^{-x} dx = 1
$$
Bracket inline: \\(\\alpha + \\beta\\).
Bracket display:
\\[
\\sum_{k=1}^n k = \\frac{n(n+1)}{2}
\\]
Fenced math block:
\`\`\`math
\\mathbf{M} = \\begin{pmatrix} 1 & 0 \\\\ 0 & 1 \\end{pmatrix}
\`\`\`
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'math-test.md', 'html');
      assert.ok(res.html.includes('class="katex"'), 'HTML must contain katex elements');
      assert.ok(res.html.includes('class="katex-display"'), 'HTML must contain katex-display elements');

      // Check full document inlines KaTeX styles and fonts
      const fullHtml = buildFullHtml(res.html, res.config);
      assert.ok(fullHtml.includes('.katex'), 'Full HTML must inline KaTeX CSS');
      assert.ok(
        fullHtml.includes('data:font/woff2;base64') || fullHtml.includes('data:application/font-woff'),
        'Full HTML must embed base64 KaTeX fonts'
      );
    });

    it('should respect KaTeX custom macros from configuration', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        math: {
          enabled: true,
          katex: {
            macros: {
              '\\RR': '\\mathbb{R}',
            },
          },
        },
      };
      const res = convertMarkdownToHtml('$\\RR$', config, 'test.md', 'html');
      assert.ok(res.html.includes('class="katex"'), 'KaTeX rendered macro');
    });

    it('should support disabling math rendering via config', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        math: {
          enabled: false,
          katex: { macros: {} },
        },
      };
      const res = convertMarkdownToHtml('Math: $E = mc^2$', config, 'test.md', 'html');
      assert.strictEqual(res.html.includes('class="katex"'), false);
      assert.ok(res.html.includes('$E = mc^2$'), 'Raw math syntax preserved when disabled');
    });

    it('should render both PlantUML standard marker and fenced code blocks', () => {
      const markdown = `
@startuml
Alice -> Bob : Authentication Request
@enduml

\`\`\`plantuml
Bob -> Alice : Authentication Response
\`\`\`
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'plantuml.md', 'html');
      const imgTags = res.html.match(/<img src="http:\/\/www\.plantuml\.com\/plantuml\/svg\/[^"]+" alt="uml diagram">/g);
      assert.ok(imgTags, 'Should find PlantUML img tags');
      assert.strictEqual(imgTags.length, 2, 'Both @startuml and ```plantuml should produce img tags');
    });

    it('should highlight code blocks in TypeScript, Python, JSON, HTML, and Bash', () => {
      const markdown = `
\`\`\`typescript
const greeting: string = "hello";
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"hello {name}"
\`\`\`

\`\`\`json
{ "key": "value" }
\`\`\`

\`\`\`html
<span class="custom">test</span>
\`\`\`

\`\`\`bash
#!/usr/bin/env bash
echo "hello"
\`\`\`
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'code.md', 'html');
      assert.ok(res.html.includes('class="hljs"'));
      assert.ok(res.html.includes('class="hljs-keyword">const</span>'));
      assert.ok(res.html.includes('class="hljs-keyword">def</span>'));
      assert.ok(res.html.includes('class="hljs-attr">&quot;key&quot;</span>'));
      assert.ok(res.html.includes('class="hljs-tag">&lt;<span class="hljs-name">span</span>'));
      assert.ok(res.html.includes('class="hljs-meta">#!/usr/bin/env bash</span>'));
    });

    it('should compile checkbox task lists, emoji shortcodes, and container callouts', () => {
      const markdown = `
- [x] Finished item :tada:
- [ ] Todo item :smile:

::: warning
Watch out for edges.
:::

::: tip
Helpful advice here.
:::
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'misc.md', 'html');
      assert.ok(res.html.includes('<input type="checkbox" id="checkbox0" checked="true">'), 'Checked box');
      assert.ok(res.html.includes('<input type="checkbox" id="checkbox1">'), 'Unchecked box');
      assert.ok(res.html.includes('class="emoji"'), 'Emoji tag with base64 data');
      assert.ok(res.html.includes('<div class="warning">'), 'Warning container div');
      assert.ok(res.html.includes('<div class="tip">'), 'Tip container div');
    });

    it('should generate slugified anchor IDs for named headers', () => {
      const markdown = '# Comprehensive CLI Parity Showcase\n\n## Sub Heading With Spaces';
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'header.md', 'html');
      assert.ok(res.html.includes('<h1 id="comprehensive-cli-parity-showcase">'));
      assert.ok(res.html.includes('<h2 id="sub-heading-with-spaces">'));
    });

    it('should recursively resolve file inclusions via markdown-it-include', () => {
      const markdown = ':[Included Section](comprehensive-include-target.md)';
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), comprehensiveMdPath, 'html');
      assert.ok(res.html.includes('<h3 id="dynamically-included-section">Dynamically Included Section</h3>'));
      assert.ok(res.html.includes('Feature inclusion verified: <strong>YES</strong>'));
    });

    it('should parse and apply YAML front matter configuration', () => {
      const markdown = `---
breaks: true
emoji: false
format: Letter
orientation: landscape
plantumlServer: https://custom-plantuml.org/plantuml
---
# FrontMatter Test
Line 1
Line 2
`;
      const res = convertMarkdownToHtml(markdown, getDefaultConfig(), 'fm.md', 'html');
      assert.strictEqual(res.config.breaks, true);
      assert.strictEqual(res.config.emoji, false);
      assert.strictEqual(res.config.format, 'Letter');
      assert.strictEqual(res.config.orientation, 'landscape');
      assert.strictEqual(res.config.plantumlServer, 'https://custom-plantuml.org/plantuml');
      // With breaks: true, newline produces <br>
      assert.ok(res.html.includes('Line 1<br>\nLine 2'));
    });
  });

  // =========================================================================
  // SUITE 2: Snapshot Parity Against VS Code Extension Fixtures
  // =========================================================================
  describe('2. Snapshot Parity with Original Extension Output', () => {
    const SNAPSHOT_FIXTURES = [
      'plantuml',
      'syntax-highlighting',
      'emoji',
      'checkbox',
      'container',
      'include',
      'mermaid',
      'plantuml-custom-marker',
      'frontmatter-breaks',
      'frontmatter-no-emoji',
      'breaks',
      'image',
      'include-codeblock',
      'math',
      'math-disabled',
      'page-break',
    ];

    for (const fixtureName of SNAPSHOT_FIXTURES) {
      it(`should produce exact HTML snapshot matching VS Code extension for "${fixtureName}"`, () => {
        const mdFile = path.join(fixturesDir, `${fixtureName}.md`);
        const expectedHtmlFile = path.join(expectedDir, `${fixtureName}.html`);

        const mdText = fs.readFileSync(mdFile, 'utf-8');
        // Extension default configuration sets highlightStyle: '' (which resolves to tomorrow.css)
        const extensionConfig = { ...getDefaultConfig(), highlightStyle: '' };

        const converted = convertMarkdownToHtml(mdText, extensionConfig, mdFile, 'html');
        const fullHtml = buildFullHtml(converted.html, converted.config, { sourceFilePath: mdFile });
        const expectedHtml = fs.readFileSync(expectedHtmlFile, 'utf-8');

        assert.strictEqual(
          normalizeHtml(fullHtml),
          normalizeHtml(expectedHtml),
          `Snapshot mismatch for fixture "${fixtureName}"`
        );
      });
    }

    it('should verify plantuml-fence decodes to identical diagram syntax', () => {
      const mdFile = path.join(fixturesDir, 'plantuml-fence.md');
      const expectedHtmlFile = path.join(expectedDir, 'plantuml-fence.html');

      const mdText = fs.readFileSync(mdFile, 'utf-8');
      const extensionConfig = { ...getDefaultConfig(), highlightStyle: '' };
      const converted = convertMarkdownToHtml(mdText, extensionConfig, mdFile, 'html');
      const fullHtml = buildFullHtml(converted.html, converted.config, { sourceFilePath: mdFile });
      const expectedHtml = fs.readFileSync(expectedHtmlFile, 'utf-8');

      // Extract generated and expected plantuml image URL hashes
      const generatedMatch = fullHtml.match(/plantuml\/svg\/([A-Za-z0-9_-]+)/);
      const expectedMatch = expectedHtml.match(/plantuml\/svg\/([A-Za-z0-9_-]+)/);
      assert.ok(generatedMatch, 'Generated HTML contains plantuml image URL');
      assert.ok(expectedMatch, 'Expected HTML contains plantuml image URL');

      const generatedCode = plantumlEncoder.decode(generatedMatch[1]);
      const expectedCode = plantumlEncoder.decode(expectedMatch[1]);
      assert.strictEqual(
        generatedCode,
        expectedCode,
        'PlantUML diagram content must be identical'
      );
    });
  });

  // =========================================================================
  // SUITE 3: Real Headless Chromium Mermaid Hydration
  // =========================================================================
  describe('3. Chromium Runtime & Mermaid Diagram Hydration', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mermaid-hydration-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it(
      'should hydrate all 5 Mermaid diagrams into SVG elements in Chromium during networkidle0',
      { timeout: 60000 },
      async () => {
        const mdText = `
# Mermaid Hydration Test

\`\`\`mermaid
flowchart TD
    A[Start] --> B{Choice}
    B -- Yes --> C[Proceed]
    B -- No --> D[Halt]
\`\`\`

\`\`\`mermaid
sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi!
\`\`\`

\`\`\`mermaid
classDiagram
    Animal <|-- Duck
    Animal : +int age
    Animal : +String gender
\`\`\`

\`\`\`mermaid
gitGraph
    commit
    branch develop
    checkout develop
    commit
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> Still
    Still --> Moving
    Moving --> Crash
    Crash --> [*]
\`\`\`
`;
        const res = convertMarkdownToHtml(mdText, getDefaultConfig(), 'mermaid-hydrate.md', 'html');
        const fullHtml = buildFullHtml(res.html, res.config);

        const htmlFile = path.join(tmpDir, 'page.html');
        fs.writeFileSync(htmlFile, fullHtml, 'utf-8');

        const chromium = await resolveCliChromium(getDefaultConfig());
        assert.strictEqual(chromium.ok, true, 'Chromium binary must be resolved');

        const browser = await puppeteer.launch({
          executablePath: chromium.path,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        try {
          const page = await browser.newPage();
          await page.goto(pathToFileURL(htmlFile).toString(), {
            waitUntil: 'networkidle0',
          });

          // Check that all 5 mermaid containers were hydrated to SVG diagrams
          const svgCount = await page.evaluate(() => {
            return document.querySelectorAll('svg').length;
          });
          assert.strictEqual(svgCount, 5, 'All 5 Mermaid diagrams must hydrate into SVG elements');

          const mermaidSvgs = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('svg')).map((el) => ({
              id: el.id,
              hasChildren: el.children.length > 0,
              width: el.getAttribute('width') || el.style.width,
            }));
          });

          assert.strictEqual(mermaidSvgs.length, 5);
          for (const svg of mermaidSvgs) {
            assert.ok(svg.id.startsWith('mermaid-') || svg.id.length > 0, 'SVG must have valid identifier');
            assert.strictEqual(svg.hasChildren, true, 'SVG diagram must contain rendered nodes/paths');
          }
        } finally {
          await browser.close();
        }
      }
    );
  });

  // =========================================================================
  // SUITE 4: Real Multi-Format CLI Conversions & File Integrity
  // =========================================================================
  describe('4. Real Multi-Format CLI Conversions & File Header Integrity', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-multi-format-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it(
      'should convert comprehensive markdown to PDF with valid %PDF- magic header',
      { timeout: 60000 },
      async () => {
        const targetPdf = path.join(tmpDir, 'test-output.pdf');
        const exitCode = await runCli(
          ['node', 'markdown-pdf', '-t', 'pdf', '-o', targetPdf, comprehensiveMdPath],
          { ui: silentUi, exitOverride: true }
        );

        assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
        assert.strictEqual(fs.existsSync(targetPdf), true, 'PDF file must exist');

        const stat = fs.statSync(targetPdf);
        assert.ok(stat.size > 1000, `PDF size (${stat.size} bytes) should be substantial`);

        const buffer = fs.readFileSync(targetPdf);
        const header = buffer.subarray(0, 5).toString('ascii');
        assert.strictEqual(header, '%PDF-', 'PDF file must begin with %PDF- magic header');
      }
    );

    it(
      'should convert comprehensive markdown to PNG with valid \\x89PNG magic header',
      { timeout: 60000 },
      async () => {
        const targetPng = path.join(tmpDir, 'test-output.png');
        const exitCode = await runCli(
          ['node', 'markdown-pdf', '-t', 'png', '-o', targetPng, comprehensiveMdPath],
          { ui: silentUi, exitOverride: true }
        );

        assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
        assert.strictEqual(fs.existsSync(targetPng), true, 'PNG file must exist');

        const stat = fs.statSync(targetPng);
        assert.ok(stat.size > 1000, `PNG size (${stat.size} bytes) should be substantial`);

        const buffer = fs.readFileSync(targetPng);
        assert.strictEqual(buffer[0], 0x89, 'PNG magic byte 0');
        assert.strictEqual(buffer[1], 0x50, 'PNG magic byte 1 (P)');
        assert.strictEqual(buffer[2], 0x4e, 'PNG magic byte 2 (N)');
        assert.strictEqual(buffer[3], 0x47, 'PNG magic byte 3 (G)');
      }
    );

    it(
      'should convert comprehensive markdown to JPEG with valid \\xFF\\xD8\\xFF magic header',
      { timeout: 60000 },
      async () => {
        const targetJpeg = path.join(tmpDir, 'test-output.jpeg');
        const exitCode = await runCli(
          ['node', 'markdown-pdf', '-t', 'jpeg', '-o', targetJpeg, comprehensiveMdPath],
          { ui: silentUi, exitOverride: true }
        );

        assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
        assert.strictEqual(fs.existsSync(targetJpeg), true, 'JPEG file must exist');

        const stat = fs.statSync(targetJpeg);
        assert.ok(stat.size > 1000, `JPEG size (${stat.size} bytes) should be substantial`);

        const buffer = fs.readFileSync(targetJpeg);
        assert.strictEqual(buffer[0], 0xff, 'JPEG magic byte 0');
        assert.strictEqual(buffer[1], 0xd8, 'JPEG magic byte 1');
        assert.strictEqual(buffer[2], 0xff, 'JPEG magic byte 2');
      }
    );

    it(
      'should convert comprehensive markdown to HTML with complete DOCTYPE, scripts, and inlined styles',
      { timeout: 30000 },
      async () => {
        const targetHtml = path.join(tmpDir, 'test-output.html');
        const exitCode = await runCli(
          ['node', 'markdown-pdf', '-t', 'html', '-o', targetHtml, comprehensiveMdPath],
          { ui: silentUi, exitOverride: true }
        );

        assert.strictEqual(exitCode, 0, 'CLI should exit with code 0');
        assert.strictEqual(fs.existsSync(targetHtml), true, 'HTML file must exist');

        const htmlContent = fs.readFileSync(targetHtml, 'utf-8');
        assert.ok(htmlContent.startsWith('<!DOCTYPE html>'), 'Must start with <!DOCTYPE html>');
        assert.ok(htmlContent.includes('<script src="https://unpkg.com/mermaid/dist/mermaid.min.js"></script>'), 'Must contain Mermaid script tag');
        assert.ok(htmlContent.includes('.katex'), 'Must contain inlined KaTeX CSS rules');
        assert.ok(htmlContent.includes('class="hljs'), 'Must contain syntax highlighted elements');
        assert.ok(htmlContent.includes('Dynamically Included Section'), 'Must include embedded markdown content');
      }
    );

    it(
      'should convert to all 4 formats simultaneously using -t all flag',
      { timeout: 90000 },
      async () => {
        const exitCode = await runCli(
          ['node', 'markdown-pdf', '-t', 'all', '-o', tmpDir, comprehensiveMdPath],
          { ui: silentUi, exitOverride: true }
        );

        assert.strictEqual(exitCode, 0, 'CLI should succeed for all formats');

        const base = path.join(tmpDir, 'comprehensive-parity');
        const formats = ['pdf', 'html', 'png', 'jpeg'];

        for (const fmt of formats) {
          const file = `${base}.${fmt}`;
          assert.strictEqual(fs.existsSync(file), true, `File ${file} must exist`);
          const stat = fs.statSync(file);
          assert.ok(stat.size > 0, `File ${file} must have non-zero size`);
        }
      }
    );
  });
});
