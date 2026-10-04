// CLI entry point for markdown-pdf.
import { runCli } from './runner';

export * from './options';
export * from './runner';
export * from './ui';

// When invoked directly from the command line, run the CLI
if (require.main === module) {
  runCli(process.argv)
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
