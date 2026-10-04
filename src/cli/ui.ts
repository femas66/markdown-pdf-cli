// Terminal user interface and progress indicators for markdown-pdf CLI.
import { ExportLoggerCallbacks } from '../core';

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export const symbols = {
  success: `${colors.green}✔${colors.reset}`,
  error: `${colors.red}✖${colors.reset}`,
  warn: `${colors.yellow}⚠${colors.reset}`,
  info: `${colors.cyan}ℹ${colors.reset}`,
};

export interface CliUiOptions {
  quiet?: boolean;
  debug?: boolean;
  isTTY?: boolean;
  stream?: NodeJS.WriteStream;
}

export interface CliUi {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
  startProgress(msg: string): void;
  updateProgress(msg: string): void;
  stopProgress(): void;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class DefaultCliUi implements CliUi {
  private quiet: boolean;
  private debug: boolean;
  private isTTY: boolean;
  private stream: NodeJS.WriteStream;
  private timer: NodeJS.Timeout | null = null;
  private frameIdx = 0;
  private currentProgressText = '';

  constructor(options: CliUiOptions = {}) {
    this.quiet = options.quiet ?? false;
    this.debug = options.debug ?? false;
    this.stream = options.stream || process.stderr;
    this.isTTY = options.isTTY ?? (Boolean(this.stream.isTTY) && !this.quiet);
  }

  public info(msg: string): void {
    if (this.quiet) return;
    this.stopProgress();
    this.stream.write(`${symbols.info} ${msg}\n`);
  }

  public warn(msg: string): void {
    if (this.quiet) return;
    this.stopProgress();
    this.stream.write(`${symbols.warn} ${colors.yellow}${msg}${colors.reset}\n`);
  }

  public error(msg: string): void {
    this.stopProgress();
    this.stream.write(`${symbols.error} ${colors.red}${msg}${colors.reset}\n`);
  }

  public success(msg: string): void {
    if (this.quiet) return;
    this.stopProgress();
    this.stream.write(`${symbols.success} ${msg}\n`);
  }

  public startProgress(msg: string): void {
    if (this.quiet) return;
    this.stopProgress();
    this.currentProgressText = msg;

    if (this.isTTY) {
      this.frameIdx = 0;
      this.renderSpinner();
      this.timer = setInterval(() => {
        this.frameIdx = (this.frameIdx + 1) % SPINNER_FRAMES.length;
        this.renderSpinner();
      }, 80);
      if (this.timer.unref) {
        this.timer.unref();
      }
    } else {
      this.stream.write(`${msg}...\n`);
    }
  }

  public updateProgress(msg: string): void {
    if (this.quiet) return;
    this.currentProgressText = msg;
    if (this.isTTY) {
      this.renderSpinner();
    }
  }

  public stopProgress(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY && this.currentProgressText) {
      // Clear line
      this.stream.write('\r\x1b[K');
    }
    this.currentProgressText = '';
  }

  private renderSpinner(): void {
    const frame = `${colors.cyan}${SPINNER_FRAMES[this.frameIdx]}${colors.reset}`;
    this.stream.write(`\r\x1b[K${frame} ${this.currentProgressText}`);
  }
}

/**
 * Creates logger callbacks for exportDocument that route messages to the CLI terminal.
 */
export function createExportLoggerCallbacks(
  ui: CliUi,
  debug: boolean = false
): ExportLoggerCallbacks {
  return {
    onInfo: (msg) => {
      if (debug) {
        ui.info(msg);
      }
    },
    onWarn: (msg) => {
      ui.warn(msg);
    },
    onError: (msg) => {
      ui.error(msg);
    },
    onProgress: (downloadedBytes, totalBytes) => {
      if (totalBytes > 0) {
        if (downloadedBytes >= totalBytes) {
          ui.updateProgress('Extracting Chromium...');
          return;
        }
        const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
        const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
        const pct = Math.round((downloadedBytes / totalBytes) * 100);
        ui.updateProgress(
          `Downloading Chromium: ${mbDownloaded}MB / ${mbTotal}MB (${pct}%)`
        );
      } else {
        const mbDownloaded = (downloadedBytes / (1024 * 1024)).toFixed(1);
        ui.updateProgress(`Downloading Chromium: ${mbDownloaded}MB...`);
      }
    },
  };
}
