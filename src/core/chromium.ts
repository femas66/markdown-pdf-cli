// Chromium management and resolution for the standalone markdown-pdf core engine.
// Decoupled from VS Code APIs; uses OS home directory for browser cache.
import os from 'os';
import path from 'path';
import * as chromiumResolver from '../chromium-resolver';
import type {
  ChromiumResolution,
  ChromiumFailureReason,
  ResolveChromiumPathOptions,
} from '../chromium-resolver';
import type { MarkdownPdfConfig } from './config';

export interface ResolveCliChromiumOptions {
  cacheDir?: string;
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
}

/**
 * Returns the default directory used to store downloaded Chromium builds when running outside VS Code.
 * Standard location: ~/.markdown-pdf/chromium
 */
export function getDefaultCliCacheDir(): string {
  return path.join(os.homedir(), '.markdown-pdf', 'chromium');
}

/**
 * Resolves the Chromium executable path for CLI / standalone usage based on configuration.
 * Resolution chain:
 * 1. User-configured executablePath (if valid)
 * 2. System-installed Chrome or Edge
 * 3. Cached / downloaded Chromium in default CLI cache directory
 *
 * @param config Conversion configuration (provides executablePath and autoDownload flag).
 * @param options Optional overrides for cacheDir and download progress reporting.
 */
export async function resolveCliChromium(
  config: MarkdownPdfConfig,
  options?: ResolveCliChromiumOptions
): Promise<ChromiumResolution> {
  const cacheDir = options?.cacheDir || getDefaultCliCacheDir();
  const userExecutablePath = config.executablePath || '';
  const autoDownload = config.autoDownload !== false;

  return chromiumResolver.resolveChromiumPath(userExecutablePath, cacheDir, {
    autoDownload,
    onProgress: options?.onProgress,
  });
}

export type {
  ChromiumResolution,
  ChromiumFailureReason,
  ResolveChromiumPathOptions,
};
