// Universal configuration options and types for markdown-pdf.
// Decoupled from VS Code APIs to allow standalone execution via CLI or library.
import { SanitizeMode } from '../utils';

export interface MarkdownPdfMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface MarkdownPdfClip {
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
}

export interface MarkdownPdfMathConfig {
  enabled: boolean;
  katex: {
    macros: Record<string, string>;
  };
}

export interface MarkdownPdfIncludeConfig {
  enable: boolean;
}

export interface MarkdownPdfConfig {
  type: string[];
  format: string;
  orientation: 'portrait' | 'landscape';
  margin: MarkdownPdfMargin;
  printBackground: boolean;
  headerTemplate: string;
  footerTemplate: string;
  displayHeaderFooter: boolean;
  scale: number;
  width: string;
  height: string;
  pageRanges: string;

  sanitize: SanitizeMode;
  highlight: boolean;
  highlightStyle: string;

  mermaidServer: string;
  plantumlServer: string;
  plantumlOpenMarker: string;
  plantumlCloseMarker: string;

  breaks: boolean;
  emoji: boolean;
  math: MarkdownPdfMathConfig;
  markdownItInclude: MarkdownPdfIncludeConfig;

  outputDirectory: string;
  outputDirectoryRelativePathFile: boolean;
  styles: string[];
  stylesRelativePathFile: boolean;
  includeDefaultStyles: boolean;

  quality: number;
  clip: MarkdownPdfClip;
  omitBackground: boolean;

  executablePath?: string;
  autoDownload?: boolean;
  debug?: boolean;
}

export type PartialMarkdownPdfConfig = Partial<{
  [K in keyof MarkdownPdfConfig]: MarkdownPdfConfig[K] extends Record<string, unknown>
    ? Partial<MarkdownPdfConfig[K]>
    : MarkdownPdfConfig[K];
}>;

/** Returns a fresh default configuration matching the VS Code extension defaults. */
export function getDefaultConfig(): MarkdownPdfConfig {
  return {
    type: ['pdf'],
    format: 'A4',
    orientation: 'portrait',
    margin: {
      top: '1.5cm',
      right: '1cm',
      bottom: '1cm',
      left: '1cm',
    },
    printBackground: true,
    headerTemplate: '<div style="font-size: 9px; margin-left: 1cm;"> <span class=\'title\'></span></div> <div style="font-size: 9px; margin-left: auto; margin-right: 1cm; ">%%ISO-DATE%%</div>',
    footerTemplate: '<div style="font-size: 9px; margin: 0 auto;\"> <span class=\'pageNumber\'></span> / <span class=\'totalPages\'></span></div>',
    displayHeaderFooter: true,
    scale: 1,
    width: '',
    height: '',
    pageRanges: '',

    sanitize: 'gfm',
    highlight: true,
    highlightStyle: 'github.css',

    mermaidServer: 'https://unpkg.com/mermaid/dist/mermaid.min.js',
    plantumlServer: 'http://www.plantuml.com/plantuml',
    plantumlOpenMarker: '@startuml',
    plantumlCloseMarker: '@enduml',

    breaks: false,
    emoji: true,
    math: {
      enabled: true,
      katex: {
        macros: {},
      },
    },
    markdownItInclude: {
      enable: true,
    },

    outputDirectory: '',
    outputDirectoryRelativePathFile: false,
    styles: [],
    stylesRelativePathFile: false,
    includeDefaultStyles: true,

    quality: 100,
    clip: {
      x: null,
      y: null,
      width: null,
      height: null,
    },
    omitBackground: false,

    executablePath: '',
    autoDownload: true,
    debug: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep clones a MarkdownPdfConfig object to prevent mutation of the original.
 */
export function cloneConfig(config: MarkdownPdfConfig): MarkdownPdfConfig {
  return {
    ...config,
    type: [...config.type],
    margin: { ...config.margin },
    math: {
      enabled: config.math.enabled,
      katex: {
        macros: { ...(config.math.katex?.macros || {}) },
      },
    },
    markdownItInclude: { ...config.markdownItInclude },
    styles: [...config.styles],
    clip: { ...config.clip },
  };
}

/**
 * Merges frontmatter properties into a base configuration, returning a new MarkdownPdfConfig.
 */
export function mergeConfigWithFrontMatter(
  baseConfig: MarkdownPdfConfig,
  frontMatter?: Record<string, unknown>
): MarkdownPdfConfig {
  const result = cloneConfig(baseConfig);
  if (!frontMatter || !isPlainRecord(frontMatter)) {
    return result;
  }

  // Flatten frontmatter if scoped under markdown-pdf or markdown_pdf
  const data: Record<string, unknown> = { ...frontMatter };
  if (isPlainRecord(data['markdown-pdf'])) {
    Object.assign(data, data['markdown-pdf']);
  } else if (isPlainRecord(data['markdown_pdf'])) {
    Object.assign(data, data['markdown_pdf']);
  }

  if (typeof data.breaks === 'boolean') {
    result.breaks = data.breaks;
  }

  if (typeof data.emoji === 'boolean') {
    result.emoji = data.emoji;
  }

  if (typeof data.plantumlOpenMarker === 'string') {
    result.plantumlOpenMarker = data.plantumlOpenMarker;
  }

  if (typeof data.plantumlCloseMarker === 'string') {
    result.plantumlCloseMarker = data.plantumlCloseMarker;
  }

  if (typeof data.plantumlServer === 'string') {
    result.plantumlServer = data.plantumlServer;
  }

  if (typeof data.mermaidServer === 'string') {
    result.mermaidServer = data.mermaidServer;
  }

  if (typeof data.format === 'string') {
    result.format = data.format;
  }

  if (data.orientation === 'portrait' || data.orientation === 'landscape') {
    result.orientation = data.orientation;
  }

  if (isPlainRecord(data.margin)) {
    if (typeof data.margin.top === 'string' || typeof data.margin.top === 'number') {
      result.margin.top = String(data.margin.top);
    }
    if (typeof data.margin.right === 'string' || typeof data.margin.right === 'number') {
      result.margin.right = String(data.margin.right);
    }
    if (typeof data.margin.bottom === 'string' || typeof data.margin.bottom === 'number') {
      result.margin.bottom = String(data.margin.bottom);
    }
    if (typeof data.margin.left === 'string' || typeof data.margin.left === 'number') {
      result.margin.left = String(data.margin.left);
    }
  }

  if (typeof data.printBackground === 'boolean') {
    result.printBackground = data.printBackground;
  }

  if (typeof data.headerTemplate === 'string') {
    result.headerTemplate = data.headerTemplate;
  }

  if (typeof data.footerTemplate === 'string') {
    result.footerTemplate = data.footerTemplate;
  }

  if (typeof data.displayHeaderFooter === 'boolean') {
    result.displayHeaderFooter = data.displayHeaderFooter;
  }

  if (typeof data.scale === 'number') {
    result.scale = data.scale;
  }

  if (typeof data.width === 'string' || typeof data.width === 'number') {
    result.width = String(data.width);
  }

  if (typeof data.height === 'string' || typeof data.height === 'number') {
    result.height = String(data.height);
  }

  if (typeof data.pageRanges === 'string' || typeof data.pageRanges === 'number') {
    result.pageRanges = String(data.pageRanges);
  }

  if (data.sanitize === 'gfm' || data.sanitize === 'gfm-allow-style' || data.sanitize === 'none') {
    result.sanitize = data.sanitize;
  }

  if (typeof data.highlight === 'boolean') {
    result.highlight = data.highlight;
  }

  if (typeof data.highlightStyle === 'string') {
    result.highlightStyle = data.highlightStyle;
  }

  if (typeof data.includeDefaultStyles === 'boolean') {
    result.includeDefaultStyles = data.includeDefaultStyles;
  }

  if (typeof data.outputDirectory === 'string') {
    result.outputDirectory = data.outputDirectory;
  }

  if (typeof data.outputDirectoryRelativePathFile === 'boolean') {
    result.outputDirectoryRelativePathFile = data.outputDirectoryRelativePathFile;
  }

  if (Array.isArray(data.styles)) {
    result.styles = data.styles.map(String);
  } else if (typeof data.styles === 'string') {
    result.styles = [data.styles];
  }

  if (typeof data.stylesRelativePathFile === 'boolean') {
    result.stylesRelativePathFile = data.stylesRelativePathFile;
  }

  if (Array.isArray(data.type)) {
    result.type = data.type.map(String);
  } else if (typeof data.type === 'string') {
    result.type = [data.type];
  }

  if (typeof data.quality === 'number') {
    result.quality = data.quality;
  }

  if (typeof data.debug === 'boolean') {
    result.debug = data.debug;
  }

  // Math config
  if (typeof data.math === 'boolean') {
    result.math.enabled = data.math;
  } else if (isPlainRecord(data.math)) {
    if (typeof data.math.enabled === 'boolean') {
      result.math.enabled = data.math.enabled;
    }
    const katexRecord = isPlainRecord(data.math.katex) ? data.math.katex : undefined;
    if (katexRecord && isPlainRecord(katexRecord.macros)) {
      for (const [k, v] of Object.entries(katexRecord.macros)) {
        if (typeof v === 'string') {
          result.math.katex.macros[k] = v;
        }
      }
    }
  }

  // markdown-it-include config
  if (typeof data.markdownItInclude === 'boolean') {
    result.markdownItInclude.enable = data.markdownItInclude;
  } else if (typeof data['markdown-it-include'] === 'boolean') {
    result.markdownItInclude.enable = data['markdown-it-include'];
  } else if (isPlainRecord(data.markdownItInclude) && typeof data.markdownItInclude.enable === 'boolean') {
    result.markdownItInclude.enable = data.markdownItInclude.enable;
  } else if (isPlainRecord(data['markdown-it-include']) && typeof data['markdown-it-include'].enable === 'boolean') {
    result.markdownItInclude.enable = data['markdown-it-include'].enable;
  }

  return result;
}

/**
 * Merges partial config overrides into baseConfig.
 */
export function mergeConfigs(
  baseConfig: MarkdownPdfConfig,
  overrides?: Partial<MarkdownPdfConfig>
): MarkdownPdfConfig {
  const result = cloneConfig(baseConfig);
  if (!overrides) {
    return result;
  }

  const { margin, math, markdownItInclude, clip, ...rest } = overrides;
  Object.assign(result, rest);

  if (margin) {
    result.margin = { ...result.margin, ...margin };
  }
  if (clip) {
    result.clip = { ...result.clip, ...clip };
  }
  if (math) {
    result.math = {
      enabled: math.enabled ?? result.math.enabled,
      katex: {
        macros: {
          ...result.math.katex.macros,
          ...(math.katex?.macros || {}),
        },
      },
    };
  }
  if (markdownItInclude) {
    result.markdownItInclude = {
      enable: markdownItInclude.enable ?? result.markdownItInclude.enable,
    };
  }

  return result;
}
