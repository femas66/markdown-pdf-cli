// Path resolver utilities for the standalone markdown-pdf core engine.
import fs from 'fs';
import path from 'path';

/**
 * Resolves the root directory of the markdown-pdf package.
 * Works under both development (from src/core) and bundled production (from dist/).
 */
export function getPackageRootDir(): string {
  const candidates = [
    path.resolve(__dirname, '..'), // e.g. dist/ -> package root
    path.resolve(__dirname, '../..'), // e.g. src/core/ -> package root
    process.cwd(),
  ];

  for (const dir of candidates) {
    if (
      fs.existsSync(path.join(dir, 'template', 'template.html')) &&
      fs.existsSync(path.join(dir, 'styles', 'markdown.css'))
    ) {
      return dir;
    }
  }

  // Fallback to two levels up from current directory
  return path.resolve(__dirname, '../..');
}
