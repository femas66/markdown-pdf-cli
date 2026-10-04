// Command line options parsing, normalization, and configuration merging for markdown-pdf.
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Command } from 'commander';
import {
  MarkdownPdfConfig,
  MarkdownPdfMargin,
  ExportType,
} from '../core';
import { SanitizeMode } from '../utils';

export interface CliOptions {
  files: string[];
  type?: string[];
  output?: string;
  style?: string[];
  format?: string;
  landscape?: boolean;
  margin?: string;
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  highlight?: boolean;
  highlightStyle?: string;
  mermaidServer?: string;
  plantumlServer?: string;
  executablePath?: string;
  autoDownload?: boolean;
  config?: string;
  debug?: boolean;
  quiet?: boolean;
  scale?: number;
  width?: string;
  height?: string;
  pageRanges?: string;
  sanitize?: string;
  breaks?: boolean;
  headerFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface ParseCliResult {
  options: CliOptions;
  explicitKeys: Set<string>;
  program: Command;
}

const SUPPORTED_EXPORT_TYPES: ExportType[] = ['pdf', 'html', 'png', 'jpeg'];

/**
 * Normalizes and validates export types passed from the CLI or configuration.
 * Expands 'all' into ['pdf', 'html', 'png', 'jpeg'], splits comma-separated strings,
 * lowercases values, and eliminates duplicates.
 */
export function normalizeCliTypes(types?: string | string[]): ExportType[] {
  if (!types) {
    return ['pdf'];
  }

  const rawList = (Array.isArray(types) ? types : [types])
    .flatMap((t) => (typeof t === 'string' ? t.split(',') : []))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  if (rawList.length === 0) {
    return ['pdf'];
  }

  const expanded: ExportType[] = [];
  for (const item of rawList) {
    if (item === 'all') {
      for (const t of SUPPORTED_EXPORT_TYPES) {
        if (!expanded.includes(t)) {
          expanded.push(t);
        }
      }
    } else if (SUPPORTED_EXPORT_TYPES.includes(item as ExportType)) {
      const exportType = item as ExportType;
      if (!expanded.includes(exportType)) {
        expanded.push(exportType);
      }
    } else {
      throw new Error(
        `Invalid output type "${item}". Supported types are: ${SUPPORTED_EXPORT_TYPES.join(
          ', '
        )}, all.`
      );
    }
  }

  return expanded.length > 0 ? expanded : ['pdf'];
}

/**
 * Builds and configures the Commander program instance for markdown-pdf CLI.
 */
export function buildCliProgram(): Command {
  const program = new Command();

  program
    .name('markdown-pdf')
    .description('Convert Markdown to PDF, HTML, PNG, and JPEG via CLI')
    .version('2.2.0', '-v, --version', 'Output the current version')
    .argument('[files...]', 'Markdown file(s) or glob pattern(s) to convert')
    .option(
      '-t, --type <types...>',
      'Output format (pdf, html, png, jpeg, all)'
    )
    .option('-o, --output <path>', 'Output file or directory path')
    .option('-s, --style <paths...>', 'Additional CSS stylesheet file paths')
    .option(
      '--format <format>',
      'PDF paper format (A4, Letter, Legal, Tabloid, etc.)'
    )
    .option('--landscape', 'Set PDF orientation to landscape')
    .option('--margin <margin>', 'Margin for all sides (e.g. 1cm, 10mm)')
    .option('--margin-top <margin>', 'Top margin (e.g. 1.5cm)')
    .option('--margin-bottom <margin>', 'Bottom margin (e.g. 1cm)')
    .option('--margin-left <margin>', 'Left margin (e.g. 1cm)')
    .option('--margin-right <margin>', 'Right margin (e.g. 1cm)')
    .option(
      '--highlight-style <name>',
      'Highlight.js style sheet name (default: github.css)'
    )
    .option('--no-highlight', 'Disable syntax highlighting')
    .option('--mermaid-server <url>', 'Mermaid script URL (default: unpkg)')
    .option('--plantuml-server <url>', 'PlantUML server URL')
    .option(
      '--executable-path <path>',
      'Path to custom Chromium or Chrome executable'
    )
    .option(
      '--no-auto-download',
      'Do not automatically download Chromium if not found'
    )
    .option(
      '-c, --config <path>',
      'Path to external JSON or YAML configuration file'
    )
    .option('--debug', 'Keep temporary HTML files and display detailed logs')
    .option('-q, --quiet', 'Quiet mode (suppress output except errors)')
    .option('--scale <scale>', 'Page rendering scale')
    .option('--width <width>', 'Custom paper width (e.g. 8in, 210mm)')
    .option('--height <height>', 'Custom paper height (e.g. 11in, 297mm)')
    .option(
      '--page-ranges <ranges>',
      'Paper ranges to print, e.g. "1-5, 8, 11-13"'
    )
    .option(
      '--sanitize <mode>',
      'Sanitize mode for raw HTML (gfm, gfm-allow-style, none)'
    )
    .option('--breaks', 'Enable line breaks')
    .option('--no-header-footer', 'Disable header and footer in PDF export')
    .option('--header-template <template>', 'HTML template for PDF header')
    .option('--footer-template <template>', 'HTML template for PDF footer');

  return program;
}

/**
 * Parses command-line arguments and determines which options were explicitly provided by the user.
 */
export function parseCliArgs(
  argv: string[],
  exitOverride: boolean = false
): ParseCliResult {
  const program = buildCliProgram();
  if (exitOverride) {
    program.exitOverride();
  }

  program.parse(argv);

  const opts = program.opts();
  const explicitKeys = new Set<string>();

  // Check which options were explicitly provided on the CLI (not default values)
  const optionKeys = [
    'type',
    'output',
    'style',
    'format',
    'landscape',
    'margin',
    'marginTop',
    'marginBottom',
    'marginLeft',
    'marginRight',
    'highlight',
    'highlightStyle',
    'mermaidServer',
    'plantumlServer',
    'executablePath',
    'autoDownload',
    'config',
    'debug',
    'quiet',
    'scale',
    'width',
    'height',
    'pageRanges',
    'sanitize',
    'breaks',
    'headerFooter',
    'headerTemplate',
    'footerTemplate',
  ];

  for (const key of optionKeys) {
    if (program.getOptionValueSource(key) === 'cli') {
      explicitKeys.add(key);
    }
  }

  const rawFiles = [...(program.args || [])];
  const files: string[] = [];

  const isLikelyMarkdownFile = (str: string): boolean => {
    if (typeof str !== 'string') return false;
    const lower = str.toLowerCase();
    if (SUPPORTED_EXPORT_TYPES.includes(lower as ExportType) || lower === 'all') {
      return false;
    }
    if (/\.(md|markdown)$/i.test(str)) {
      return true;
    }
    if (fs.existsSync(str) && !str.endsWith('.css')) {
      return true;
    }
    return false;
  };

  if (Array.isArray(opts.type)) {
    const cleanedTypes: string[] = [];
    for (const item of opts.type) {
      if (isLikelyMarkdownFile(item)) {
        files.push(item);
      } else {
        cleanedTypes.push(item);
      }
    }
    opts.type = cleanedTypes;
  }

  if (Array.isArray(opts.style)) {
    const cleanedStyles: string[] = [];
    for (const item of opts.style) {
      if (isLikelyMarkdownFile(item)) {
        files.push(item);
      } else {
        cleanedStyles.push(item);
      }
    }
    opts.style = cleanedStyles;
  }

  files.push(...rawFiles);

  const cliOptions: CliOptions = {
    files,
    ...opts,
  };

  return {
    options: cliOptions,
    explicitKeys,
    program,
  };
}

/**
 * Loads an external JSON or YAML configuration file.
 */
export function loadConfigFile(configPath: string): Partial<MarkdownPdfConfig> {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  let data: unknown;
  try {
    data = yaml.load(content);
  } catch (err) {
    throw new Error(
      `Failed to parse configuration file "${configPath}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(
      `Configuration file "${configPath}" must contain a JSON/YAML object.`
    );
  }

  const record = data as Record<string, unknown>;
  // Unwrap if scoped under markdown-pdf or markdown_pdf
  if (
    record['markdown-pdf'] &&
    typeof record['markdown-pdf'] === 'object' &&
    !Array.isArray(record['markdown-pdf'])
  ) {
    return record['markdown-pdf'] as Partial<MarkdownPdfConfig>;
  }
  if (
    record['markdown_pdf'] &&
    typeof record['markdown_pdf'] === 'object' &&
    !Array.isArray(record['markdown_pdf'])
  ) {
    return record['markdown_pdf'] as Partial<MarkdownPdfConfig>;
  }

  return record as Partial<MarkdownPdfConfig>;
}

/**
 * Converts CLI parsed options into Partial<MarkdownPdfConfig> overrides.
 * If explicitKeys is provided, only explicitly supplied CLI flags will be converted.
 */
export function cliOptionsToConfigOverrides(
  opts: CliOptions,
  explicitKeys?: Set<string>
): Partial<MarkdownPdfConfig> {
  const overrides: Partial<MarkdownPdfConfig> = {};
  const isExplicit = (k: string) => !explicitKeys || explicitKeys.has(k);

  if (isExplicit('type') && opts.type !== undefined) {
    overrides.type = normalizeCliTypes(opts.type);
  }
  if (isExplicit('format') && opts.format) {
    overrides.format = opts.format;
  }
  if (isExplicit('landscape') && opts.landscape) {
    overrides.orientation = 'landscape';
  }
  if (isExplicit('highlight') && opts.highlight !== undefined) {
    overrides.highlight = opts.highlight;
  }
  if (isExplicit('highlightStyle') && opts.highlightStyle) {
    overrides.highlightStyle = opts.highlightStyle;
  }
  if (isExplicit('mermaidServer') && opts.mermaidServer) {
    overrides.mermaidServer = opts.mermaidServer;
  }
  if (isExplicit('plantumlServer') && opts.plantumlServer) {
    overrides.plantumlServer = opts.plantumlServer;
  }
  if (isExplicit('executablePath') && opts.executablePath) {
    overrides.executablePath = opts.executablePath;
  }
  if (isExplicit('autoDownload') && opts.autoDownload !== undefined) {
    overrides.autoDownload = opts.autoDownload;
  }
  if (isExplicit('debug') && opts.debug !== undefined) {
    overrides.debug = opts.debug;
  }
  if (isExplicit('style') && opts.style) {
    const rawStyles = Array.isArray(opts.style) ? opts.style : [opts.style];
    overrides.styles = rawStyles
      .flatMap((s) => (typeof s === 'string' ? s.split(',') : []))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Margin handling
  const margin: Partial<MarkdownPdfMargin> = {};
  if (isExplicit('margin') && opts.margin) {
    margin.top = opts.margin;
    margin.right = opts.margin;
    margin.bottom = opts.margin;
    margin.left = opts.margin;
  }
  if (isExplicit('marginTop') && opts.marginTop) margin.top = opts.marginTop;
  if (isExplicit('marginRight') && opts.marginRight) margin.right = opts.marginRight;
  if (isExplicit('marginBottom') && opts.marginBottom) margin.bottom = opts.marginBottom;
  if (isExplicit('marginLeft') && opts.marginLeft) margin.left = opts.marginLeft;
  if (Object.keys(margin).length > 0) {
    overrides.margin = margin as MarkdownPdfMargin;
  }

  if (isExplicit('scale') && opts.scale !== undefined) {
    overrides.scale = Number(opts.scale);
  }
  if (isExplicit('width') && opts.width) {
    overrides.width = opts.width;
  }
  if (isExplicit('height') && opts.height) {
    overrides.height = opts.height;
  }
  if (isExplicit('pageRanges') && opts.pageRanges) {
    overrides.pageRanges = opts.pageRanges;
  }
  if (isExplicit('sanitize') && opts.sanitize) {
    overrides.sanitize = opts.sanitize as SanitizeMode;
  }
  if (isExplicit('breaks') && opts.breaks !== undefined) {
    overrides.breaks = opts.breaks;
  }
  if (isExplicit('headerFooter') && opts.headerFooter !== undefined) {
    overrides.displayHeaderFooter = opts.headerFooter;
  }
  if (isExplicit('headerTemplate') && opts.headerTemplate !== undefined) {
    overrides.headerTemplate = opts.headerTemplate;
  }
  if (isExplicit('footerTemplate') && opts.footerTemplate !== undefined) {
    overrides.footerTemplate = opts.footerTemplate;
  }

  return overrides;
}

/**
 * Resolves the destination output path for a file conversion.
 *
 * Rules:
 * - If cliOutput is specified:
 *   - If isSingleFileAndSingleType is true:
 *     - If cliOutput exists as a directory or ends with a path separator ('/' or '\\'):
 *       Output file is placed inside that directory, named `${baseName}.${type}`.
 *     - Otherwise, cliOutput is treated as an explicit file path.
 *   - If isSingleFileAndSingleType is false:
 *     - cliOutput is treated as an output directory, and each file is placed inside it.
 * - If cliOutput is NOT specified:
 *   - If configOutputDir is specified, placed inside configOutputDir.
 *   - Otherwise, placed next to the source markdown file with extension replaced by `.${type}`.
 */
export function resolveCliOutputPath(
  sourceFilePath: string,
  type: ExportType,
  cliOutput?: string,
  configOutputDir?: string,
  isSingleFileAndSingleType: boolean = true
): string {
  const ext = path.extname(sourceFilePath);
  const baseName = path.basename(sourceFilePath, ext);
  const targetFileName = `${baseName}.${type}`;

  if (cliOutput && cliOutput.trim().length > 0) {
    const rawOutput = cliOutput.trim();

    if (!isSingleFileAndSingleType) {
      // Multiple files or multiple output types: cliOutput must be a directory
      return path.resolve(path.join(rawOutput, targetFileName));
    }

    // Single file & single type:
    const isExplicitDir =
      rawOutput.endsWith('/') ||
      rawOutput.endsWith('\\') ||
      (fs.existsSync(rawOutput) && fs.statSync(rawOutput).isDirectory());

    if (isExplicitDir) {
      return path.resolve(path.join(rawOutput, targetFileName));
    }

    // If it has an extension or is a file name, treat as destination file
    return path.resolve(rawOutput);
  }

  if (configOutputDir && configOutputDir.trim().length > 0) {
    return path.resolve(path.join(configOutputDir.trim(), targetFileName));
  }

  // Default: place next to source markdown file
  return path.resolve(path.join(path.dirname(sourceFilePath), targetFileName));
}
