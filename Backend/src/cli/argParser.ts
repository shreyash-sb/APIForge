import type { CliCommand, CliReporter, ParsedArgs } from './types.js';

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    reporter: 'console',
    help: false,
    version: false,
    errors: [],
  };

  const args = [...argv];
  if (args.length === 0) {
    result.help = true;
    return result;
  }

  // Check initial command or flag
  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h' || arg === 'help') {
      result.help = true;
      i++;
      continue;
    }

    if (arg === '--version' || arg === '-v' || arg === 'version') {
      result.version = true;
      i++;
      continue;
    }

    if (arg === 'run-workflow' || arg === 'run-suite') {
      result.command = arg as CliCommand;
      i++;
      // Next argument must be targetFile if it does not start with dash
      if (i < args.length && !args[i].startsWith('-')) {
        result.targetFile = args[i];
        i++;
      } else {
        result.errors.push(`Command '${arg}' requires a target JSON file path.`);
      }
      continue;
    }

    if (arg === '--env' || arg === '-e') {
      i++;
      if (i < args.length && !args[i].startsWith('-')) {
        result.envFile = args[i];
        i++;
      } else {
        result.errors.push(`Option '${arg}' requires an environment profile JSON file path.`);
      }
      continue;
    }

    if (arg === '--reporter' || arg === '-r') {
      i++;
      if (i < args.length) {
        const val = args[i].toLowerCase() as CliReporter;
        if (val === 'console' || val === 'junit' || val === 'html') {
          result.reporter = val;
        } else {
          result.errors.push(`Invalid reporter '${args[i]}'. Supported reporters: console, junit, html.`);
        }
        i++;
      } else {
        result.errors.push(`Option '${arg}' requires a reporter type (console, junit, html).`);
      }
      continue;
    }

    if (arg === '--output' || arg === '-o') {
      i++;
      if (i < args.length && !args[i].startsWith('-')) {
        result.output = args[i];
        i++;
      } else {
        result.errors.push(`Option '${arg}' requires an output destination path.`);
      }
      continue;
    }

    // Unrecognized option or argument
    if (arg.startsWith('-')) {
      result.errors.push(`Unrecognized option: '${arg}'.`);
    } else if (!result.command) {
      result.errors.push(`Unrecognized command: '${arg}'. Use 'run-workflow' or 'run-suite'.`);
    } else if (!result.targetFile) {
      result.targetFile = arg;
    } else {
      result.errors.push(`Unexpected extra argument: '${arg}'.`);
    }
    i++;
  }

  // Validate command presence if not requesting help or version
  if (!result.help && !result.version && !result.command && result.errors.length === 0) {
    result.errors.push('No command specified. Use `apiforge --help` to see available commands.');
  }

  return result;
}

export function getHelpText(): string {
  return `
APIForge Headless Test Runner & CLI (Phase 11)

USAGE:
  apiforge <command> <target.json> [options]

COMMANDS:
  run-workflow <scenario.json>    Execute an APIForge multi-step workflow scenario.
  run-suite <suite.json>          Execute an APIForge deterministic test suite.
  help                            Show this help menu.
  version                         Show CLI version.

OPTIONS:
  -e, --env <path>                Path to environment profile JSON (for run-workflow).
  -r, --reporter <type>           Report format: console, junit, html (default: console).
  -o, --output <path>             File destination to write generated JUnit XML or HTML report.
  -h, --help                      Display help and usage instructions.
  -v, --version                   Display version number.

EXIT CODES:
  0   All test assertions and workflow steps passed.
  1   One or more assertions or workflow steps failed.
  2   Configuration, argument parsing, or execution runner error.

EXAMPLES:
  apiforge run-workflow ./fixtures/user-order-flow.json --env ./fixtures/env-qa.json
  apiforge run-workflow ./scenario.json --reporter junit --output ./reports/junit.xml
  apiforge run-suite ./test-suite.json --reporter html --output ./reports/summary.html
`;
}
