import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getDefaultConfig,
  getDefaultCliCacheDir,
  resolveCliChromium,
  buildPdfExportOptions,
  buildImageExportOptions,
  exportDocument,
  CLOSE_BROWSER_TIMEOUT_MS,
  MarkdownPdfConfig,
} from '../../src/core';

describe('Core Exporter & Chromium Resolver', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pdf-exporter-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('getDefaultCliCacheDir', () => {
    it('should return the standard CLI cache path under the user home directory', () => {
      const cacheDir = getDefaultCliCacheDir();
      const expected = path.join(os.homedir(), '.markdown-pdf', 'chromium');
      assert.strictEqual(cacheDir, expected);
    });
  });

  describe('buildPdfExportOptions', () => {
    it('should generate standard PDF options from default config', () => {
      const config = getDefaultConfig();
      const outputPath = '/path/to/output.pdf';
      const options = buildPdfExportOptions(config, outputPath);

      assert.strictEqual(options.path, outputPath);
      assert.strictEqual(options.format, 'A4');
      assert.strictEqual(options.landscape, false);
      assert.strictEqual(options.printBackground, true);
      assert.strictEqual(options.scale, 1);
      assert.strictEqual(options.displayHeaderFooter, true);
      assert.deepStrictEqual(options.margin, {
        top: '1.5cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm',
      });
      assert.strictEqual(options.timeout, 0);
    });

    it('should respect landscape orientation', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        orientation: 'landscape',
        format: 'Letter',
      };
      const options = buildPdfExportOptions(config, '/path/to/doc.pdf');

      assert.strictEqual(options.landscape, true);
      assert.strictEqual(options.format, 'Letter');
    });

    it('should prioritize explicit width and height over format string', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        width: '100mm',
        height: '200mm',
      };
      const options = buildPdfExportOptions(config, '/path/to/custom.pdf');

      assert.strictEqual(options.width, '100mm');
      assert.strictEqual(options.height, '200mm');
      assert.strictEqual(options.format, '');
    });

    it('should map custom margins and pageRanges', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        pageRanges: '1-3, 5',
        margin: {
          top: '2cm',
          right: '2cm',
          bottom: '2cm',
          left: '2cm',
        },
      };
      const options = buildPdfExportOptions(config, '/path/to/paged.pdf');

      assert.strictEqual(options.pageRanges, '1-3, 5');
      assert.deepStrictEqual(options.margin, {
        top: '2cm',
        right: '2cm',
        bottom: '2cm',
        left: '2cm',
      });
    });
  });

  describe('buildImageExportOptions', () => {
    it('should build options for full-page PNG with omitted quality', () => {
      const config = getDefaultConfig();
      const outputPath = '/path/to/image.png';
      const options = buildImageExportOptions(config, outputPath, 'png');

      assert.strictEqual(options.path, outputPath);
      assert.strictEqual(options.fullPage, true);
      assert.strictEqual(options.quality, undefined);
      assert.strictEqual(options.omitBackground, false);
      assert.strictEqual(options.clip, undefined);
    });

    it('should build options for JPEG with quality from config', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        quality: 85,
        omitBackground: true,
      };
      const outputPath = '/path/to/image.jpeg';
      const options = buildImageExportOptions(config, outputPath, 'jpeg');

      assert.strictEqual(options.path, outputPath);
      assert.strictEqual(options.fullPage, true);
      assert.strictEqual(options.quality, 85);
      assert.strictEqual(options.omitBackground, true);
    });

    it('should handle clipping rectangle', () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        clip: {
          x: 10,
          y: 20,
          width: 300,
          height: 400,
        },
      };
      const options = buildImageExportOptions(config, '/path/to/clip.png', 'png');

      assert.strictEqual(options.fullPage, false);
      assert.deepStrictEqual(options.clip, {
        x: 10,
        y: 20,
        width: 300,
        height: 400,
      });
    });
  });

  describe('resolveCliChromium', () => {
    it('should resolve immediately when userExecutablePath points to an existing file', async () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath,
      };
      const resolution = await resolveCliChromium(config, {
        cacheDir: path.join(tmpDir, 'cache'),
      });

      assert.strictEqual(resolution.ok, true);
      if (resolution.ok) {
        assert.strictEqual(resolution.path, process.execPath);
        assert.strictEqual(resolution.source, 'user-setting');
      }
    });

    it('should fail with autodownload-disabled when autoDownload=false and no valid executable is configured', async () => {
      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: '/non/existent/browser/binary',
        autoDownload: false,
      };
      // Use an empty cache directory so no cached browser is found
      const emptyCache = path.join(tmpDir, 'empty-cache');
      fs.mkdirSync(emptyCache, { recursive: true });

      const resolution = await resolveCliChromium(config, { cacheDir: emptyCache });
      // If the host machine has a system Chrome/Edge, resolution.ok may be true (source: system).
      // Otherwise, resolution.ok must be false with reason 'autodownload-disabled'.
      if (!resolution.ok) {
        assert.strictEqual(resolution.reason, 'autodownload-disabled');
      } else {
        assert.strictEqual(resolution.source, 'system');
      }
    });
  });

  describe('exportDocument', () => {
    it('should validate outputPath and throw on empty path', async () => {
      await assert.rejects(
        async () => {
          await exportDocument('<h1>Hello</h1>', '', 'html');
        },
        { message: /outputPath must be a non-empty string/ }
      );
    });

    it('should validate export type and throw on unsupported type', async () => {
      await assert.rejects(
        async () => {
          await exportDocument('<h1>Hello</h1>', path.join(tmpDir, 'test.txt'), 'txt' as any);
        },
        { message: /Invalid export type "txt"/ }
      );
    });

    it('should export HTML directly to disk without browser invocation', async () => {
      const outputPath = path.join(tmpDir, 'subfolder', 'output.html');
      const htmlContent = '<!DOCTYPE html><html><body><h1>Test HTML</h1></body></html>';
      const infoLogs: string[] = [];

      const result = await exportDocument(htmlContent, outputPath, 'html', getDefaultConfig(), {
        onInfo: (msg) => infoLogs.push(msg),
      });

      assert.strictEqual(result, path.resolve(outputPath));
      assert.strictEqual(fs.existsSync(outputPath), true);
      const writtenContent = fs.readFileSync(outputPath, 'utf-8');
      assert.strictEqual(writtenContent, htmlContent);
      assert.ok(infoLogs.some((msg) => msg.includes('Exported HTML')));
    });

    it('should export PDF using custom puppeteerLaunch and clean up temp HTML', async () => {
      const outputPath = path.join(tmpDir, 'document.pdf');
      const htmlContent = '<html><body><h1>PDF Doc</h1></body></html>';
      const expectedTmpFile = path.resolve(path.join(tmpDir, 'document_tmp.html'));

      let gotoUrl = '';
      let gotoOptions: any = null;
      let pdfCalledWithOptions: any = null;
      let dialogHandlerAttached = false;
      let defaultTimeoutSet = false;
      let browserClosed = false;

      const mockPage = {
        on: (event: string, handler: Function) => {
          if (event === 'dialog') {
            dialogHandlerAttached = true;
          }
        },
        setDefaultTimeout: (timeout: number) => {
          defaultTimeoutSet = true;
        },
        goto: async (url: string, options: any) => {
          gotoUrl = url;
          gotoOptions = options;
          // While page is rendering, temporary HTML file must exist on disk!
          assert.strictEqual(fs.existsSync(expectedTmpFile), true);
        },
        pdf: async (options: any) => {
          pdfCalledWithOptions = options;
        },
        screenshot: async () => {},
      };

      const mockBrowser = {
        newPage: async () => mockPage,
        close: async () => {
          browserClosed = true;
        },
      };

      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath, // Real file so resolution succeeds
        format: 'A4',
        debug: false,
      };

      const infoLogs: string[] = [];
      const result = await exportDocument(htmlContent, outputPath, 'pdf', config, {
        onInfo: (msg) => infoLogs.push(msg),
        puppeteerLaunch: async (options) => {
          assert.strictEqual(options.executablePath, process.execPath);
          assert.deepStrictEqual(options.args, ['--no-sandbox', '--disable-setuid-sandbox']);
          return mockBrowser as any;
        },
      });

      assert.strictEqual(result, path.resolve(outputPath));
      assert.strictEqual(dialogHandlerAttached, true);
      assert.strictEqual(defaultTimeoutSet, true);
      assert.ok(gotoUrl.startsWith('file://'));
      assert.strictEqual(gotoOptions.waitUntil, 'networkidle0');
      assert.strictEqual(pdfCalledWithOptions.path, path.resolve(outputPath));
      assert.strictEqual(pdfCalledWithOptions.format, 'A4');
      assert.strictEqual(browserClosed, true);

      // Verify temp file was cleaned up because debug is false
      assert.strictEqual(fs.existsSync(expectedTmpFile), false);
      assert.ok(infoLogs.some((msg) => msg.includes('Exported PDF')));
    });

    it('should export PNG using custom puppeteerLaunch and screenshot options', async () => {
      const outputPath = path.join(tmpDir, 'image.png');
      const htmlContent = '<html><body><h1>PNG Image</h1></body></html>';
      let screenshotOptions: any = null;
      let browserClosed = false;

      const mockPage = {
        on: () => {},
        setDefaultTimeout: () => {},
        goto: async () => {},
        pdf: async () => {},
        screenshot: async (options: any) => {
          screenshotOptions = options;
        },
      };

      const mockBrowser = {
        newPage: async () => mockPage,
        close: async () => {
          browserClosed = true;
        },
      };

      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath,
      };

      const result = await exportDocument(htmlContent, outputPath, 'png', config, {
        puppeteerLaunch: async () => mockBrowser as any,
      });

      assert.strictEqual(result, path.resolve(outputPath));
      assert.strictEqual(screenshotOptions.path, path.resolve(outputPath));
      assert.strictEqual(screenshotOptions.fullPage, true);
      assert.strictEqual(browserClosed, true);
    });

    it('should preserve temporary HTML file when config.debug is true', async () => {
      const outputPath = path.join(tmpDir, 'debug-doc.pdf');
      const htmlContent = '<html><body><h1>Debug Mode</h1></body></html>';
      const expectedTmpFile = path.resolve(path.join(tmpDir, 'debug-doc_tmp.html'));

      const mockPage = {
        on: () => {},
        setDefaultTimeout: () => {},
        goto: async () => {},
        pdf: async () => {},
      };

      const mockBrowser = {
        newPage: async () => mockPage,
        close: async () => {},
      };

      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath,
        debug: true,
      };

      await exportDocument(htmlContent, outputPath, 'pdf', config, {
        puppeteerLaunch: async () => mockBrowser as any,
      });

      // In debug mode, temporary file must still exist
      assert.strictEqual(fs.existsSync(expectedTmpFile), true);
      const tmpContent = fs.readFileSync(expectedTmpFile, 'utf-8');
      assert.strictEqual(tmpContent, htmlContent);
    });

    it('should close browser and clean temp file even if PDF rendering fails', async () => {
      const outputPath = path.join(tmpDir, 'failing-doc.pdf');
      const htmlContent = '<html><body><h1>Error Test</h1></body></html>';
      const expectedTmpFile = path.resolve(path.join(tmpDir, 'failing-doc_tmp.html'));
      let browserClosed = false;
      const errorLogs: string[] = [];

      const mockPage = {
        on: () => {},
        setDefaultTimeout: () => {},
        goto: async () => {
          throw new Error('Simulated navigation crash');
        },
        pdf: async () => {},
      };

      const mockBrowser = {
        newPage: async () => mockPage,
        close: async () => {
          browserClosed = true;
        },
      };

      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath,
        debug: false,
      };

      await assert.rejects(
        async () => {
          await exportDocument(htmlContent, outputPath, 'pdf', config, {
            onError: (msg) => errorLogs.push(msg),
            puppeteerLaunch: async () => mockBrowser as any,
          });
        },
        { message: /Simulated navigation crash/ }
      );

      // Browser must be closed and temp file cleaned up in finally block
      assert.strictEqual(browserClosed, true);
      assert.strictEqual(fs.existsSync(expectedTmpFile), false);
      assert.ok(errorLogs.some((msg) => msg.includes('Failed to export pdf')));
    });

    it('should handle blocking dialogs by auto-dismissing them', async () => {
      const outputPath = path.join(tmpDir, 'dialog-test.pdf');
      const htmlContent = '<html><body><script>alert("blocking");</script></body></html>';
      const warnLogs: string[] = [];
      let registeredDialogHandler: Function | null = null;

      const mockPage = {
        on: (event: string, handler: Function) => {
          if (event === 'dialog') {
            registeredDialogHandler = handler;
          }
        },
        setDefaultTimeout: () => {},
        goto: async () => {
          // Trigger the registered dialog handler as if page fired alert()
          if (registeredDialogHandler) {
            let dismissed = false;
            await registeredDialogHandler({
              type: () => 'alert',
              message: () => 'Test alert message',
              dismiss: async () => {
                dismissed = true;
              },
            });
            assert.strictEqual(dismissed, true);
          }
        },
        pdf: async () => {},
      };

      const mockBrowser = {
        newPage: async () => mockPage,
        close: async () => {},
      };

      const config: MarkdownPdfConfig = {
        ...getDefaultConfig(),
        executablePath: process.execPath,
      };

      await exportDocument(htmlContent, outputPath, 'pdf', config, {
        onWarn: (msg) => warnLogs.push(msg),
        puppeteerLaunch: async () => mockBrowser as any,
      });

      assert.ok(warnLogs.some((msg) => msg.includes('Dismissed a blocking dialog')));
    });
  });

  describe('CLOSE_BROWSER_TIMEOUT_MS constant', () => {
    it('should equal 5000 ms to match extension timeout', () => {
      assert.strictEqual(CLOSE_BROWSER_TIMEOUT_MS, 5000);
    });
  });
});
