#!/usr/bin/env node
import { CliRunner } from './runner.js';

async function main(): Promise<void> {
  const runner = new CliRunner();
  const result = await runner.run(process.argv.slice(2));

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.exitCode);
}

main().catch((err) => {
  process.stderr.write(`Fatal Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
