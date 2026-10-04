// Core HTML document builder for markdown-pdf.
// Pure Node.js / TypeScript - compiles full HTML documents from template and stylesheets.
import path from 'path';
import * as utils from '../utils';
import { logWarn } from '../logger';
import { MarkdownPdfConfig, getDefaultConfig } from './config';
import { getPackageRootDir } from './paths';

export interface BuildHtmlOptions {
  sourceFilePath?: string;
  title?: string;
  baseDir?: string;
  markdownStyles?: string[];
}

/**
 * Builds the concatenated CSS stylesheets and font definitions for the document.
 * Includes default styles, highlight.js themes, user styles, and inlined KaTeX CSS/fonts.
 */
export function buildStyles(
  htmlBody: string,
  config: MarkdownPdfConfig = getDefaultConfig(),
  options?: BuildHtmlOptions
): string {
  const baseDir = options?.baseDir || getPackageRootDir();
  const resourceFsPath = options?.sourceFilePath
    ? path.resolve(options.sourceFilePath)
    : path.join(process.cwd(), 'untitled.md');
  const workspaceFsPath = process.cwd();

  const resolveHrefFn = (href: string): string => {
    return (
      utils.resolveHref(
        href,
        resourceFsPath,
        config.stylesRelativePathFile,
        workspaceFsPath
      ) || href
    );
  };

  let style = utils.buildStyleTags({
    includeDefaultStyles: config.includeDefaultStyles,
    highlight: config.highlight,
    highlightStyle: config.highlightStyle,
    markdownStyles: options?.markdownStyles || [],
    markdownPdfStyles: config.styles,
    baseDir,
    onMissingHighlightStyle: (requestedStyle, resolvedStyle) => {
      logWarn(
        `The configured highlightStyle "${requestedStyle}" is not supported or not found. Falling back to "${resolvedStyle}".`
      );
    },
    resolveHrefFn,
  }) || '';

  // Inline KaTeX CSS with base64 fonts only when math elements are present
  if (htmlBody && htmlBody.includes('class="katex')) {
    style += utils.buildKatexStyleTag(baseDir);
  }

  return style;
}

/**
 * Assembles a complete, self-contained HTML document using template/template.html.
 *
 * @param content Rendered HTML body content.
 * @param config Conversion configuration (defaults to getDefaultConfig()).
 * @param options Additional options such as sourceFilePath or title.
 */
export function buildFullHtml(
  content: string,
  config: MarkdownPdfConfig = getDefaultConfig(),
  options?: BuildHtmlOptions
): string {
  const baseDir = options?.baseDir || getPackageRootDir();
  const title =
    options?.title ||
    (options?.sourceFilePath
      ? path.basename(options.sourceFilePath)
      : 'Markdown PDF');

  // Assemble style elements
  const style = buildStyles(content, config, { ...options, baseDir });

  // Read HTML template
  const templatePath = path.join(baseDir, 'template', 'template.html');
  const template = utils.readFile(templatePath) as string;
  if (!template) {
    throw new Error(`Failed to read HTML template at: ${templatePath}`);
  }

  // Compile view data with Mermaid script tag and render template
  const view = utils.buildHtmlViewData({
    title,
    style,
    content,
    mermaidServer:
      config.mermaidServer ||
      'https://unpkg.com/mermaid/dist/mermaid.min.js',
  });

  return utils.renderTemplate(template, view);
}

/**
 * Alias for buildFullHtml, supporting an options object or a sourceFilePath string.
 */
export function makeHtml(
  content: string,
  config: MarkdownPdfConfig = getDefaultConfig(),
  options?: BuildHtmlOptions | string
): string {
  const opt: BuildHtmlOptions =
    typeof options === 'string' ? { sourceFilePath: options } : options || {};
  return buildFullHtml(content, config, opt);
}
