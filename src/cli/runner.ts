// Main execution pipeline for markdown-pdf CLI.
import fs from 'fs';
import path from 'path';
import { CommanderError } from 'commander';
import {
  MarkdownPdfConfig,
  getDefaultConfig,
  mergeConfigs,
  mergeConfigWithFrontMatter,
  convertMarkdownToHtml,
  buildFullHtml,
  exportDocument,
  ExportLoggerCallbacks,
} from '../core';
import * as utils from '../utils';
import {
  CliOptions,
  parseCliArgs,
  loadConfigFile,
  cliOptionsToConfigOverrides,
  normalizeCliTypes,
  resolveCliOutputPath,
} from './options';
import {
  CliUi,
  DefaultCliUi,
  createExportLoggerCallbacks,
} from './ui';

export interface RunCliOptions {
  ui?: CliUi;
  loggerCallbacks?: ExportLoggerCallbacks;
  exitOverride?: boolean;
}

export interface ConvertFileOptions {
  sourceFilePath: string;
  cliOptions: CliOptions;
  explicitKeys?: Set<string>;
  fileConfig?: Partial<MarkdownPdfConfig>;
  isSingleFileAndSingleType?: boolean;
  ui?: CliUi;
  loggerCallbacks?: ExportLoggerCallbacks;
}

/**
 * Resolves input file paths and expands glob patterns or directory paths.
 */
export function resolveInputFiles(patterns: string[]): string[] {
  const resolved: string[] = [];

  for (const rawPattern of patterns) {
    if (!rawPattern || rawPattern.trim().length === 0) {
      continue;
    }

    const pattern = rawPattern.trim();

    // Check if pattern contains wildcard characters
    const hasWildcards = /[*?{}\[\]]/.test(pattern);

    if (hasWildcards) {
      if (typeof fs.globSync === 'function') {
        const matches = fs.globSync(pattern, { cwd: process.cwd() });
        if (matches.length > 0) {
          for (const match of matches) {
            resolved.push(path.resolve(match));
          }
          continue;
        }
      }
    }

    // Direct path check
    const absolute = path.resolve(pattern);
    if (fs.existsSync(absolute)) {
      const stat = fs.statSync(absolute);
      if (stat.isDirectory()) {
        // Find markdown files in the directory
        const entries = fs.readdirSync(absolute);
        const mdFiles = entries
          .filter((e) => /\.(md|markdown)$/i.test(e))
          .map((e) => path.join(absolute, e));
        resolved.push(...mdFiles);
      } else {
        resolved.push(absolute);
      }
    } else {
      // Keep literal path so convertFile will report "File not found"
      resolved.push(absolute);
    }
  }

  return Array.from(new Set(resolved));
}

/**
 * Converts a single markdown file into the requested export types.
 * Follows the configuration hierarchy:
 * DefaultConfig < File Config (if --config) < FrontMatter < CLI options/flags.
 */
export async function convertFile(options: ConvertFileOptions): Promise<string[]> {
  const {
    sourceFilePath,
    cliOptions,
    explicitKeys,
    fileConfig,
    isSingleFileAndSingleType = true,
    ui,
    loggerCallbacks,
  } = options;

  const resolvedSource = path.resolve(sourceFilePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`File not found: ${sourceFilePath}`);
  }

  const stat = fs.statSync(resolvedSource);
  if (stat.isDirectory()) {
    throw new Error(`Input path is a directory, not a file: ${sourceFilePath}`);
  }

  // Read raw markdown content
  const markdownText = await fs.promises.readFile(resolvedSource, 'utf-8');

  // Hierarchy step 1: Base default configuration
  let config = getDefaultConfig();

  // Hierarchy step 2: Merge external configuration file if provided
  if (fileConfig) {
    config = mergeConfigs(config, fileConfig);
  }

  // Hierarchy step 3: Merge document YAML front matter
  const frontMatter = utils.parseFrontMatter(markdownText).data;
  config = mergeConfigWithFrontMatter(config, frontMatter);

  // Hierarchy step 4: Merge CLI flags (highest precedence)
  const cliOverrides = cliOptionsToConfigOverrides(cliOptions, explicitKeys);
  config = mergeConfigs(config, cliOverrides);

  // Determine export types (CLI flags override frontmatter/config types)
  const explicitTypeSpecified = explicitKeys ? explicitKeys.has('type') : Boolean(cliOptions.type);
  const targetTypes = explicitTypeSpecified && cliOptions.type
    ? normalizeCliTypes(cliOptions.type)
    : normalizeCliTypes(config.type);

  const exportedPaths: string[] = [];

  for (const type of targetTypes) {
    const filename = path.basename(resolvedSource);
    ui?.startProgress(`Converting ${filename} to ${type.toUpperCase()}...`);

    // 1. Convert markdown to HTML body fragment (passing CLI overrides to preserve precedence)
    const converted = convertMarkdownToHtml(
      markdownText,
      config,
      resolvedSource,
      type,
      cliOverrides
    );

    // Ensure finalConfig holds CLI overrides
    const finalConfig = mergeConfigs(converted.config, cliOverrides);

    // 2. Build complete standalone HTML document with styles and scripts
    const fullHtml = buildFullHtml(converted.html, finalConfig, {
      sourceFilePath: resolvedSource,
    });

    // 3. Resolve destination output file path
    const outputPath = resolveCliOutputPath(
      resolvedSource,
      type,
      cliOptions.output,
      finalConfig.outputDirectory,
      isSingleFileAndSingleType
    );

    // 4. Export document to target format (PDF, HTML, PNG, JPEG)
    const exportedPath = await exportDocument(
      fullHtml,
      outputPath,
      type,
      finalConfig,
      loggerCallbacks
    );

    const relativeDisplayPath =
      path.relative(process.cwd(), exportedPath) || exportedPath;
    ui?.success(`Converted ${filename} -> ${relativeDisplayPath}`);

    exportedPaths.push(exportedPath);
  }

  return exportedPaths;
}

/**
 * Entry point for running the CLI command.
 *
 * @param argv Command line arguments (typically process.argv).
 * @param runOptions Optional overrides for testing or embedding.
 * @returns Resolves to process exit code: 0 on success, 1 on failure.
 */
export async function runCli(
  argv: string[],
  runOptions?: RunCliOptions
): Promise<number> {
  const exitOverride = runOptions?.exitOverride ?? false;

  let parseResult;
  try {
    parseResult = parseCliArgs(argv, exitOverride);
  } catch (err) {
    if (err instanceof CommanderError) {
      if (
        err.code === 'commander.helpDisplayed' ||
        err.code === 'commander.version'
      ) {
        return 0;
      }
      return 1;
    }
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  const { options, explicitKeys, program } = parseResult;

  // Setup terminal UI
  const ui =
    runOptions?.ui ||
    new DefaultCliUi({
      quiet: options.quiet,
      debug: options.debug,
    });

  // If no arguments or files provided, display help and return
  if (!options.files || options.files.length === 0) {
    program.outputHelp();
    return 0;
  }

  // Load external configuration file if specified (-c, --config)
  let fileConfig: Partial<MarkdownPdfConfig> | undefined;
  if (options.config) {
    try {
      fileConfig = loadConfigFile(options.config);
    } catch (err) {
      ui.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
  }

  // Resolve input files and globs
  const inputFiles = resolveInputFiles(options.files);
  if (inputFiles.length === 0) {
    ui.error('No matching markdown files found to convert.');
    return 1;
  }

  // Prepare logger callbacks
  const loggerCallbacks =
    runOptions?.loggerCallbacks ||
    createExportLoggerCallbacks(ui, options.debug);

  // Check if this run is a single conversion (1 file to 1 type)
  const targetTypes = options.type
    ? normalizeCliTypes(options.type)
    : ['pdf'];
  const isSingleFileAndSingleType =
    inputFiles.length === 1 && targetTypes.length === 1;

  let hasErrors = false;

  for (const sourceFile of inputFiles) {
    try {
      await convertFile({
        sourceFilePath: sourceFile,
        cliOptions: options,
        explicitKeys,
        fileConfig,
        isSingleFileAndSingleType,
        ui,
        loggerCallbacks,
      });
    } catch (err) {
      hasErrors = true;
      const message = err instanceof Error ? err.message : String(err);
      ui.error(`Failed to convert ${path.basename(sourceFile)}: ${message}`);
      if (options.debug && err instanceof Error && err.stack) {
        ui.info(err.stack);
      }
    }
  }

  return hasErrors ? 1 : 0;
}
