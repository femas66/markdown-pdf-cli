// Core markdown-to-HTML converter for markdown-pdf.
// Pure Node.js / TypeScript - completely independent of the VS Code runtime.
import path from 'path';
import markdownIt from 'markdown-it';
import hljs from 'highlight.js';
import { full as markdownItEmojiFull } from 'markdown-it-emoji';
import markdownItContainer from 'markdown-it-container';
import markdownItPlantuml from 'markdown-it-plantuml';
import markdownItKatex from '@vscode/markdown-it-katex';

import * as utils from '../utils';
import { logWarn, formatError } from '../logger';
import { installSanitizeRules } from '../markdown-it-sanitize';
import { markdownItCheckbox } from '../markdown-it-checkbox';
import { markdownItNamedHeaders } from '../markdown-it-named-headers';
import { mathFencePlugin } from '../markdown-it-math-fence';
import { mathBracketsPlugin } from '../markdown-it-math-brackets';
import { renderMath } from '../math-renderer';
import { markdownItInclude } from '../markdown-it-include';
import {
  MarkdownPdfConfig,
  getDefaultConfig,
  mergeConfigWithFrontMatter,
  mergeConfigs,
} from './config';
import { getPackageRootDir } from './paths';

export interface MarkdownConvertResult {
  html: string;
  report: utils.SanitizeReport;
  config: MarkdownPdfConfig;
  frontMatter: Record<string, unknown>;
}

/**
 * Converts markdown text to an HTML body fragment using markdown-it and all
 * configured plugins (Mermaid, PlantUML, KaTeX, Emoji, Checkbox, Container, Include, Sanitize).
 *
 * @param markdownText Raw markdown string.
 * @param config Optional configuration object (defaults to getDefaultConfig()).
 * @param sourceFilePath Optional file path of the source markdown (used for relative includes and images).
 * @param outputType Optional export format ('pdf', 'html', 'png', 'jpeg').
 * @param cliOverrides Optional configuration overrides from CLI flags.
 */
export function convertMarkdownToHtml(
  markdownText: string,
  config: MarkdownPdfConfig = getDefaultConfig(),
  sourceFilePath?: string,
  outputType?: string,
  cliOverrides?: Partial<MarkdownPdfConfig>
): MarkdownConvertResult {
  // 1. Parse YAML front matter and merge into config
  const matterParts = utils.parseFrontMatter(markdownText);
  let mergedConfig = mergeConfigWithFrontMatter(config, matterParts.data);
  if (cliOverrides) {
    mergedConfig = mergeConfigs(mergedConfig, cliOverrides);
  }

  // 2. Resolve source file path and directory for relative assets
  const resolvedFilePath = sourceFilePath
    ? path.resolve(sourceFilePath)
    : path.resolve('untitled.md');
  const rootDir = sourceFilePath ? path.dirname(resolvedFilePath) : process.cwd();

  // Resolve target output format for image URI rewriting
  const resolvedType =
    outputType ||
    (mergedConfig.type.length === 1 && mergedConfig.type[0] === 'html'
      ? 'html'
      : 'pdf');

  // 3. Instantiate markdown-it with breaks and highlight callback (including Mermaid support)
  const md = markdownIt(
    utils.buildMarkdownItOptions({
      breaks: mergedConfig.breaks,
      hljs: hljs,
      escapeHtml: markdownIt().utils.escapeHtml,
    }) as markdownIt.Options
  );

  // 4. Transform image src paths for local/relative images
  const defaultRender = md.renderer.rules.image;
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    if (token.attrs && token.attrIndex('src') >= 0) {
      const srcIndex = token.attrIndex('src');
      const href = token.attrs[srcIndex][1];
      token.attrs[srcIndex][1] = utils.transformImageHref(
        href,
        resolvedType,
        resolvedFilePath
      );
    }
    if (defaultRender) {
      return defaultRender(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  // 5. Install sanitization rules
  const sanitizeMode = (mergedConfig.sanitize || 'gfm') as utils.SanitizeMode;
  const sanitizeReport: utils.SanitizeReport = {
    removedElements: [],
    strippedAttributes: [],
  };
  installSanitizeRules(
    md,
    sanitizeMode,
    sanitizeReport,
    resolvedType !== 'html'
      ? function (h: string) {
          return utils.transformHtmlBlock(h, resolvedFilePath);
        }
      : undefined
  );

  // 6. Checkbox task list plugin
  md.use(markdownItCheckbox);

  // 7. Emoji plugin
  if (mergedConfig.emoji) {
    const pkgRoot = getPackageRootDir();
    const emojiPath = path.join(pkgRoot, 'data', 'emoji.json');
    const emojiesRaw = utils.readFile(emojiPath) as string;
    if (emojiesRaw) {
      try {
        const emojiesDefs = JSON.parse(emojiesRaw);
        md.use(markdownItEmojiFull, { defs: emojiesDefs });
        md.renderer.rules.emoji = function (token, idx) {
          const emoji = token[idx].markup;
          const emojipath = path.join(
            pkgRoot,
            'node_modules',
            'emoji-images',
            'pngs',
            emoji + '.png'
          );
          const emojiBuffer = utils.readFile(emojipath, null);
          const emojidata = Buffer.isBuffer(emojiBuffer)
            ? emojiBuffer.toString('base64')
            : '';
          return utils.buildEmojiTag(emoji, emojidata);
        };
      } catch (err) {
        logWarn('Failed to parse emoji definitions: ' + formatError(err));
      }
    }
  }

  // 8. Named headers plugin for TOC anchors
  md.use(markdownItNamedHeaders, { slugify: utils.Slug });

  // 9. Container plugin (::: container syntax)
  md.use(markdownItContainer, '', utils.buildContainerRenderer());

  // 10. PlantUML diagram plugin (@startuml syntax)
  const plantumlOptions = utils.buildPlantumlOptions({
    frontmatterOpenMarker: mergedConfig.plantumlOpenMarker,
    frontmatterCloseMarker: mergedConfig.plantumlCloseMarker,
    settingsOpenMarker: mergedConfig.plantumlOpenMarker || '',
    settingsCloseMarker: mergedConfig.plantumlCloseMarker || '',
    server: mergedConfig.plantumlServer || '',
  });
  md.use(markdownItPlantuml, plantumlOptions);

  // 11. KaTeX Math rendering ($...$, $$...$$, \(...\), \[...\], ```math)
  if (mergedConfig.math.enabled) {
    md.use(markdownItKatex, {
      enableBareBlocks: true,
      enableMathBlockInHtml: false,
    });
    md.use(mathBracketsPlugin);
    const mathMacros = mergedConfig.math.katex?.macros || {};
    md.renderer.rules.math_inline = function (tokens, idx) {
      const token = tokens[idx];
      const displayMode = token.markup === '\\[';
      return renderMath(token.content, displayMode, { macros: mathMacros });
    };
    md.renderer.rules.math_block = function (tokens, idx) {
      return renderMath(tokens[idx].content, true, { macros: mathMacros });
    };
    md.use(mathFencePlugin, { macros: mathMacros });
  }

  // 12. PlantUML fenced code block handler (```plantuml)
  const defaultFenceRenderer = md.renderer.rules.fence;
  md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    if (token.info.trim().toLowerCase() === 'plantuml') {
      return utils.buildPlantumlImgTag(token.content, plantumlOptions.server);
    }
    if (defaultFenceRenderer) {
      return defaultFenceRenderer(tokens, idx, options, env, self);
    }
    return self.renderToken(tokens, idx, options);
  };

  // 13. Include markdown fragments with :[alt](relative.md)
  if (mergedConfig.markdownItInclude.enable) {
    md.use(markdownItInclude, {
      root: rootDir,
      throwError: false,
    });
  }

  // 14. Render markdown content to HTML
  const html = md.render(matterParts.content);

  // 15. Check and log any include errors
  const includeErrorRe = /INCLUDE ERROR: (.+?)(?=<\/h1>|<\/p>|\n)/g;
  let match;
  while ((match = includeErrorRe.exec(html)) !== null) {
    logWarn(`markdown-it-include: ${match[1]}`);
  }

  return {
    html,
    report: sanitizeReport,
    config: mergedConfig,
    frontMatter: matterParts.data,
  };
}
