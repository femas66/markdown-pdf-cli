// Document exporter for markdown-pdf: HTML, PDF, PNG, and JPEG.
// Pure Node.js / TypeScript - completely independent of the VS Code runtime.
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';
import type { Browser, LaunchOptions, Dialog } from 'puppeteer-core';
import * as utils from '../utils';
import { MarkdownPdfConfig, getDefaultConfig } from './config';
import { resolveCliChromium } from './chromium';

export type ExportType = 'pdf' | 'html' | 'png' | 'jpeg';

export const CLOSE_BROWSER_TIMEOUT_MS = 5000;

export interface ExportLoggerCallbacks {
  onInfo?: (msg: string) => void;
  onWarn?: (msg: string) => void;
  onError?: (msg: string) => void;
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
  /** Custom launcher for Puppeteer (useful for mocking/testing without launching real Chromium). */
  puppeteerLaunch?: (options: LaunchOptions) => Promise<Browser>;
}

/**
 * Builds the PDF options object passed to Puppeteer's page.pdf() call based on configuration.
 */
export function buildPdfExportOptions(
  config: MarkdownPdfConfig,
  outputPath: string
): Record<string, unknown> {
  const pdfConfig = {
    path: outputPath,
    width: config.width || '',
    height: config.height || '',
    format: config.format || 'A4',
    orientation: config.orientation || '',
    scale: config.scale,
    displayHeaderFooter: config.displayHeaderFooter,
    headerTemplate: config.headerTemplate || '',
    footerTemplate: config.footerTemplate || '',
    printBackground: config.printBackground,
    pageRanges: config.pageRanges || '',
    margin: {
      top: config.margin?.top || '',
      right: config.margin?.right || '',
      bottom: config.margin?.bottom || '',
      left: config.margin?.left || '',
    },
  };
  return utils.buildPdfOptions(pdfConfig);
}

/**
 * Builds the screenshot options object passed to Puppeteer's page.screenshot() call based on configuration.
 */
export function buildImageExportOptions(
  config: MarkdownPdfConfig,
  outputPath: string,
  type: 'png' | 'jpeg'
): Record<string, unknown> {
  return utils.buildImageOptions({
    path: outputPath,
    type: type,
    quality: config.quality || 100,
    clip: {
      x: config.clip?.x ?? null,
      y: config.clip?.y ?? null,
      width: config.clip?.width ?? null,
      height: config.clip?.height ?? null,
    },
    omitBackground: config.omitBackground ?? false,
  });
}

/**
 * Exports compiled HTML to the designated output format (PDF, HTML, PNG, or JPEG).
 *
 * For HTML export:
 * - Writes the HTML directly to disk at outputPath.
 *
 * For PDF/PNG/JPEG export:
 * - Writes a temporary HTML file next to outputPath.
 * - Resolves Chromium binary (user setting -> system Chrome/Edge -> managed cache/auto-download).
 * - Spawns headless browser with dialog auto-dismiss handler.
 * - Navigates to the file:// URL waiting for networkidle0 so Mermaid and external assets hydrate.
 * - Generates PDF or screenshot based on MarkdownPdfConfig options.
 * - Safely terminates the browser and removes temporary files in the finally block.
 *
 * @param html The full HTML document string to export.
 * @param outputPath Destination file path on disk.
 * @param type Export format ('pdf' | 'html' | 'png' | 'jpeg').
 * @param config Conversion configuration.
 * @param loggerCallbacks Optional notification/logging callbacks.
 * @returns Resolves to the absolute output path of the created document.
 */
export async function exportDocument(
  html: string,
  outputPath: string,
  type: ExportType,
  config: MarkdownPdfConfig = getDefaultConfig(),
  loggerCallbacks?: ExportLoggerCallbacks
): Promise<string> {
  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('outputPath must be a non-empty string');
  }

  const validTypes: ExportType[] = ['pdf', 'html', 'png', 'jpeg'];
  if (!validTypes.includes(type)) {
    throw new Error(
      `Invalid export type "${type}". Supported types are: ${validTypes.join(', ')}`
    );
  }

  const resolvedOutputPath = path.resolve(outputPath);
  await fs.promises.mkdir(path.dirname(resolvedOutputPath), { recursive: true });

  // Fast path for HTML export: write directly to disk without spawning browser
  if (type === 'html') {
    await fs.promises.writeFile(resolvedOutputPath, html, 'utf-8');
    loggerCallbacks?.onInfo?.(`Exported HTML to ${resolvedOutputPath}`);
    return resolvedOutputPath;
  }

  let tmpfilename: string | undefined;
  let browser: Browser | undefined;

  try {
    tmpfilename = utils.generateTmpHtmlFilename(resolvedOutputPath);
    await fs.promises.writeFile(tmpfilename, html, 'utf-8');

    const resolution = await resolveCliChromium(config, {
      onProgress: loggerCallbacks?.onProgress,
    });

    if (!resolution.ok) {
      let message = `Could not resolve Chromium: ${resolution.reason}`;
      if (resolution.reason === 'autodownload-disabled') {
        message =
          'Chromium auto-download is disabled and no local Chromium/Chrome executable was found.';
      } else if (resolution.reason === 'network') {
        message =
          'Could not download Chromium due to a network error. Please check your internet connection or proxy.';
      } else if (resolution.reason === 'download-failed') {
        message =
          'Could not obtain Chromium. Please check permissions or configure executablePath.';
      }
      loggerCallbacks?.onError?.(message);
      throw new Error(message);
    }

    loggerCallbacks?.onInfo?.(
      `Chromium: ${resolution.path} (source: ${resolution.source})`
    );

    const launchOptions: LaunchOptions = {
      executablePath: resolution.path,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    const launchFn = loggerCallbacks?.puppeteerLaunch || puppeteer.launch;
    browser = await launchFn(launchOptions);
    const page = await browser.newPage();

    // Auto-dismiss blocking JavaScript dialogs during headless export
    page.on('dialog', async (dialog: Dialog) => {
      const info = `(${dialog.type()}): ${dialog.message()}`;
      try {
        await dialog.dismiss();
        loggerCallbacks?.onWarn?.(`Dismissed a blocking dialog during rendering ${info}`);
      } catch (error) {
        loggerCallbacks?.onWarn?.(
          `Failed to dismiss a blocking dialog during rendering ${info} - ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });

    await page.setDefaultTimeout(0);

    const fileUrl = pathToFileURL(tmpfilename).toString();
    await page.goto(fileUrl, { waitUntil: 'networkidle0' });

    if (type === 'pdf') {
      const pdfOptions = buildPdfExportOptions(config, resolvedOutputPath);
      await page.pdf(pdfOptions as Parameters<typeof page.pdf>[0]);
    } else if (type === 'png' || type === 'jpeg') {
      const imageOptions = buildImageExportOptions(config, resolvedOutputPath, type);
      await page.screenshot(imageOptions as Parameters<typeof page.screenshot>[0]);
    }

    loggerCallbacks?.onInfo?.(`Exported ${type.toUpperCase()} to ${resolvedOutputPath}`);
    return resolvedOutputPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    loggerCallbacks?.onError?.(`Failed to export ${type}: ${message}`);
    throw error;
  } finally {
    if (browser) {
      try {
        const closeResult = await utils.awaitWithTimeout(
          browser.close(),
          CLOSE_BROWSER_TIMEOUT_MS
        );
        if (closeResult.timedOut) {
          loggerCallbacks?.onWarn?.(
            'Timed out while closing Chromium after export; continuing.'
          );
        }
      } catch (error) {
        loggerCallbacks?.onWarn?.(
          'Failed to close Chromium after export: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

    const debug = config.debug || false;
    if (!debug && tmpfilename) {
      try {
        if (fs.existsSync(tmpfilename)) {
          await fs.promises.unlink(tmpfilename);
        }
      } catch (error) {
        loggerCallbacks?.onWarn?.(
          'Failed to delete temporary HTML file: ' +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }
  }
}
