import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseCliArgs,
  normalizeCliTypes,
  resolveCliOutputPath,
  loadConfigFile,
  cliOptionsToConfigOverrides,
} from '../../src/cli/options';
import {
  convertFile,
  runCli,
  resolveInputFiles,
} from '../../src/cli/runner';
import {
  getDefaultConfig,
  mergeConfigs,
  mergeConfigWithFrontMatter,
  ExportType,
} from '../../src/core';
import { CliUi } from '../../src/cli/ui';

describe('CLI - Argument Parsing & Options', () => {
  describe('normalizeCliTypes', () => {
    it('should default to ["pdf"] when undefined or empty', () => {
      assert.deepStrictEqual(normalizeCliTypes(), ['pdf']);
      assert.deepStrictEqual(normalizeCliTypes([]), ['pdf']);
    });

    it('should parse single type', () => {
      assert.deepStrictEqual(normalizeCliTypes('html'), ['html']);
      assert.deepStrictEqual(normalizeCliTypes(['png']), ['png']);
    });

    it('should parse multiple types in array', () => {
      assert.deepStrictEqual(normalizeCliTypes(['pdf', 'html']), ['pdf', 'html']);
    });

    it('should parse comma-separated types', () => {
      assert.deepStrictEqual(normalizeCliTypes('pdf,html,jpeg'), ['pdf', 'html', 'jpeg']);
      assert.deepStrictEqual(normalizeCliTypes(['pdf, html']), ['pdf', 'html']);
    });

    it('should expand "all" into all supported export types', () => {
      const result = normalizeCliTypes('all');
      assert.deepStrictEqual(result, ['pdf', 'html', 'png', 'jpeg']);
    });

    it('should expand "all" alongside other types and deduplicate', () => {
      const result = normalizeCliTypes(['html', 'all', 'pdf']);
      assert.deepStrictEqual(result, ['html', 'pdf', 'png', 'jpeg']);
    });

    it('should throw an error on invalid export type', () => {
      assert.throws(
        () => normalizeCliTypes('docx'),
        /Invalid output type "docx"/
      );
      assert.throws(
        () => normalizeCliTypes(['pdf', 'xml']),
        /Invalid output type "xml"/
      );
    });
  });

  describe('parseCliArgs', () => {
    it('should parse default CLI arguments when only files provided', () => {
      const { options, explicitKeys } = parseCliArgs(
        ['node', 'markdown-pdf', 'doc.md'],
        true
      );
      assert.deepStrictEqual(options.files, ['doc.md']);
      assert.strictEqual(explicitKeys.size, 0);
    });

    it('should parse -t, --type correctly', () => {
      const { options, explicitKeys } = parseCliArgs(
        ['node', 'markdown-pdf', '-t', 'html', 'png', 'doc.md'],
        true
      );
      assert.deepStrictEqual(options.type, ['html', 'png']);
      assert.deepStrictEqual(options.files, ['doc.md']);
      assert.strictEqual(explicitKeys.has('type'), true);
    });

    it('should parse paper format and landscape', () => {
      const { options, explicitKeys } = parseCliArgs(
        ['node', 'markdown-pdf', '--format', 'Letter', '--landscape', 'doc.md'],
        true
      );
      assert.strictEqual(options.format, 'Letter');
      assert.strictEqual(options.landscape, true);
      assert.strictEqual(explicitKeys.has('format'), true);
      assert.strictEqual(explicitKeys.has('landscape'), true);
    });

    it('should parse all margins and specific margin overrides', () => {
      const { options, explicitKeys } = parseCliArgs(
        [
          'node',
          'markdown-pdf',
          '--margin',
          '10mm',
          '--margin-top',
          '20mm',
          '--margin-bottom',
          '15mm',
          'doc.md',
        ],
        true
      );
      assert.strictEqual(options.margin, '10mm');
      assert.strictEqual(options.marginTop, '20mm');
      assert.strictEqual(options.marginBottom, '15mm');
      assert.strictEqual(explicitKeys.has('margin'), true);
      assert.strictEqual(explicitKeys.has('marginTop'), true);
      assert.strictEqual(explicitKeys.has('marginBottom'), true);
      assert.strictEqual(explicitKeys.has('marginLeft'), false);
    });

    it('should parse highlight and highlightStyle flags', () => {
      const { options: opts1, explicitKeys: keys1 } = parseCliArgs(
        ['node', 'markdown-pdf', '--no-highlight', 'doc.md'],
        true
      );
      assert.strictEqual(opts1.highlight, false);
      assert.strictEqual(keys1.has('highlight'), true);

      const { options: opts2, explicitKeys: keys2 } = parseCliArgs(
        ['node', 'markdown-pdf', '--highlight-style', 'monokai.css', 'doc.md'],
        true
      );
      assert.strictEqual(opts2.highlightStyle, 'monokai.css');
      assert.strictEqual(keys2.has('highlightStyle'), true);
    });

    it('should parse diagram servers and executable path', () => {
      const { options, explicitKeys } = parseCliArgs(
        [
          'node',
          'markdown-pdf',
          '--mermaid-server',
          'https://custom-mermaid.js',
          '--plantuml-server',
          'https://custom-plantuml.com',
          '--executable-path',
          '/usr/bin/google-chrome',
          '--no-auto-download',
          'doc.md',
        ],
        true
      );
      assert.strictEqual(options.mermaidServer, 'https://custom-mermaid.js');
      assert.strictEqual(options.plantumlServer, 'https://custom-plantuml.com');
      assert.strictEqual(options.executablePath, '/usr/bin/google-chrome');
      assert.strictEqual(options.autoDownload, false);
      assert.strictEqual(explicitKeys.has('mermaidServer'), true);
      assert.strictEqual(explicitKeys.has('plantumlServer'), true);
      assert.strictEqual(explicitKeys.has('executablePath'), true);
      assert.strictEqual(explicitKeys.has('autoDownload'), true);
    });

    it('should parse custom style paths', () => {
      const { options, explicitKeys } = parseCliArgs(
        ['node', 'markdown-pdf', '-s', 'custom1.css', 'custom2.css', 'doc.md'],
        true
      );
      assert.deepStrictEqual(options.style, ['custom1.css', 'custom2.css']);
      assert.deepStrictEqual(options.files, ['doc.md']);
      assert.strictEqual(explicitKeys.has('style'), true);
    });

    it('should parse --debug and -q, --quiet flags', () => {
      const { options, explicitKeys } = parseCliArgs(
        ['node', 'markdown-pdf', '--debug', '-q', 'doc.md'],
        true
      );
      assert.strictEqual(options.debug, true);
      assert.strictEqual(options.quiet, true);
      assert.strictEqual(explicitKeys.has('debug'), true);
      assert.strictEqual(explicitKeys.has('quiet'), true);
    });
  });

  describe('cliOptionsToConfigOverrides', () => {
    it('should convert CLI options into config overrides', () => {
      const { options, explicitKeys } = parseCliArgs(
        [
          'node',
          'markdown-pdf',
          '--format',
          'Legal',
          '--landscape',
          '--margin',
          '1cm',
          '--margin-top',
          '2cm',
          '--highlight-style',
          'atom-one-dark.css',
          '--no-highlight',
          'doc.md',
        ],
        true
      );

      const overrides = cliOptionsToConfigOverrides(options, explicitKeys);
      assert.strictEqual(overrides.format, 'Legal');
      assert.strictEqual(overrides.orientation, 'landscape');
      assert.strictEqual(overrides.margin?.top, '2cm');
      assert.strictEqual(overrides.margin?.bottom, '1cm');
      assert.strictEqual(overrides.margin?.left, '1cm');
      assert.strictEqual(overrides.margin?.right, '1cm');
      assert.strictEqual(overrides.highlightStyle, 'atom-one-dark.css');
      assert.strictEqual(overrides.highlight, false);
    });
  });
});

describe('CLI - Configuration Merging Hierarchy', () => {
  const tmpDir = path.join(os.tmpdir(), `markdown-pdf-cli-test-${Date.now()}`);

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should verify: Default < File Config < FrontMatter < CLI Flags', () => {
    // 1. DefaultConfig
    const defaultConfig = getDefaultConfig();
    assert.strictEqual(defaultConfig.format, 'A4');
    assert.strictEqual(defaultConfig.highlightStyle, 'github.css');
    assert.strictEqual(defaultConfig.orientation, 'portrait');

    // 2. File Config
    const configFilePath = path.join(tmpDir, 'test-config.json');
    fs.writeFileSync(
      configFilePath,
      JSON.stringify({
        format: 'Letter',
        highlightStyle: 'dark.css',
        margin: { top: '3cm' },
        orientation: 'landscape',
      })
    );
    const fileConfig = loadConfigFile(configFilePath);
    let config = mergeConfigs(defaultConfig, fileConfig);
    assert.strictEqual(config.format, 'Letter'); // overridden by file config
    assert.strictEqual(config.highlightStyle, 'dark.css'); // overridden by file config
    assert.strictEqual(config.orientation, 'landscape'); // overridden by file config
    assert.strictEqual(config.margin.top, '3cm'); // overridden by file config
    assert.strictEqual(config.margin.bottom, '1cm'); // retained default

    // 3. Document FrontMatter
    const frontMatter = {
      format: 'Tabloid',
      highlightStyle: 'solarized-dark.css',
    };
    config = mergeConfigWithFrontMatter(config, frontMatter);
    assert.strictEqual(config.format, 'Tabloid'); // overridden by frontmatter
    assert.strictEqual(config.highlightStyle, 'solarized-dark.css'); // overridden by frontmatter
    assert.strictEqual(config.orientation, 'landscape'); // retained from file config
    assert.strictEqual(config.margin.top, '3cm'); // retained from file config

    // 4. CLI Flags (highest precedence)
    const { options, explicitKeys } = parseCliArgs(
      ['node', 'markdown-pdf', '--format', 'A3', '--margin-top', '5cm', 'doc.md'],
      true
    );
    const cliOverrides = cliOptionsToConfigOverrides(options, explicitKeys);
    config = mergeConfigs(config, cliOverrides);

    assert.strictEqual(config.format, 'A3'); // CLI flag overrides frontmatter
    assert.strictEqual(config.highlightStyle, 'solarized-dark.css'); // retained frontmatter
    assert.strictEqual(config.margin.top, '5cm'); // CLI flag overrides file config
    assert.strictEqual(config.orientation, 'landscape'); // retained from file config
  });

  it('should load JSON and YAML external configuration files', () => {
    const jsonPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(jsonPath, JSON.stringify({ breaks: true, scale: 0.8 }));
    const jsonLoaded = loadConfigFile(jsonPath);
    assert.strictEqual(jsonLoaded.breaks, true);
    assert.strictEqual(jsonLoaded.scale, 0.8);

    const yamlPath = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(yamlPath, 'breaks: true\nscale: 1.5\n');
    const yamlLoaded = loadConfigFile(yamlPath);
    assert.strictEqual(yamlLoaded.breaks, true);
    assert.strictEqual(yamlLoaded.scale, 1.5);
  });

  it('should unwrap configuration scoped under "markdown-pdf" key', () => {
    const scopedPath = path.join(tmpDir, 'scoped.json');
    fs.writeFileSync(
      scopedPath,
      JSON.stringify({
        'markdown-pdf': {
          format: 'Legal',
          highlight: false,
        },
      })
    );
    const loaded = loadConfigFile(scopedPath);
    assert.strictEqual(loaded.format, 'Legal');
    assert.strictEqual(loaded.highlight, false);
  });
});

describe('CLI - Output Path Resolution', () => {
  const dummyFile = path.resolve('/workspace/docs/report.md');

  it('should resolve default output path next to source file', () => {
    const out = resolveCliOutputPath(dummyFile, 'pdf');
    assert.strictEqual(out, path.resolve('/workspace/docs/report.pdf'));

    const outHtml = resolveCliOutputPath(dummyFile, 'html');
    assert.strictEqual(outHtml, path.resolve('/workspace/docs/report.html'));
  });

  it('should resolve custom file output path when single file & type', () => {
    const out = resolveCliOutputPath(
      dummyFile,
      'pdf',
      '/custom/path/final-report.pdf',
      undefined,
      true
    );
    assert.strictEqual(out, path.resolve('/custom/path/final-report.pdf'));
  });

  it('should resolve into directory when trailing slash is present', () => {
    const out = resolveCliOutputPath(
      dummyFile,
      'pdf',
      '/output/dir/',
      undefined,
      true
    );
    assert.strictEqual(out, path.resolve('/output/dir/report.pdf'));
  });

  it('should resolve into directory when multiple files or types are converted', () => {
    const out = resolveCliOutputPath(
      dummyFile,
      'pdf',
      '/output/dir',
      undefined,
      false // multi-file or multi-type mode
    );
    assert.strictEqual(out, path.resolve('/output/dir/report.pdf'));
  });

  it('should fallback to config outputDirectory when -o is omitted', () => {
    const out = resolveCliOutputPath(
      dummyFile,
      'pdf',
      undefined,
      '/configured/output',
      true
    );
    assert.strictEqual(out, path.resolve('/configured/output/report.pdf'));
  });
});

describe('CLI - Error Handling & Validation', () => {
  it('should throw an error when source file does not exist', async () => {
    await assert.rejects(
      async () => {
        await convertFile({
          sourceFilePath: '/non/existent/path/never_existed.md',
          cliOptions: { files: ['never_existed.md'] },
        });
      },
      /File not found:.*never_existed\.md/
    );
  });

  it('should throw an error when config file does not exist', () => {
    assert.throws(
      () => loadConfigFile('/non/existent/config.json'),
      /Configuration file not found/
    );
  });

  it('should throw an error when config file contains invalid syntax', () => {
    const tmpBad = path.join(os.tmpdir(), `bad-config-${Date.now()}.json`);
    fs.writeFileSync(tmpBad, '{ invalid json syntax !!!');
    try {
      assert.throws(
        () => loadConfigFile(tmpBad),
        /Failed to parse configuration file/
      );
    } finally {
      fs.unlinkSync(tmpBad);
    }
  });

  it('should output help and exit with code 0 when no files are passed', async () => {
    let helpShown = false;
    const dummyUi: CliUi = {
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      startProgress: () => {},
      updateProgress: () => {},
      stopProgress: () => {},
    };

    const code = await runCli(['node', 'markdown-pdf'], {
      ui: dummyUi,
      exitOverride: true,
    });
    assert.strictEqual(code, 0);
  });
});

describe('CLI - End-to-End File Conversion', () => {
  const tmpDir = path.join(os.tmpdir(), `markdown-pdf-cli-e2e-${Date.now()}`);
  const sampleMd = path.join(tmpDir, 'e2e-sample.md');
  const targetHtml = path.join(tmpDir, 'e2e-sample.html');

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      sampleMd,
      '# Hello World\n\nThis is a CLI test with **markdown**.'
    );
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should convert markdown to HTML using runCli', async () => {
    const dummyUi: CliUi = {
      info: () => {},
      warn: () => {},
      error: () => {},
      success: () => {},
      startProgress: () => {},
      updateProgress: () => {},
      stopProgress: () => {},
    };

    const exitCode = await runCli(
      ['node', 'markdown-pdf', '-t', 'html', '-o', targetHtml, sampleMd],
      { ui: dummyUi, exitOverride: true }
    );

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(fs.existsSync(targetHtml), true);

    const content = fs.readFileSync(targetHtml, 'utf-8');
    assert.match(content, /<h1 id="hello-world">Hello World<\/h1>/);
    assert.match(content, /<strong>markdown<\/strong>/);
  });

  it('should return exit code 1 when conversion fails for a missing file', async () => {
    let errorLogged = false;
    const dummyUi: CliUi = {
      info: () => {},
      warn: () => {},
      error: () => {
        errorLogged = true;
      },
      success: () => {},
      startProgress: () => {},
      updateProgress: () => {},
      stopProgress: () => {},
    };

    const exitCode = await runCli(
      ['node', 'markdown-pdf', path.join(tmpDir, 'missing.md')],
      { ui: dummyUi, exitOverride: true }
    );

    assert.strictEqual(exitCode, 1);
    assert.strictEqual(errorLogged, true);
  });
});
