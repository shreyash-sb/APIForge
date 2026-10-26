export type CliCommand = 'run-workflow' | 'run-suite' | 'help' | 'version';

export type CliReporter = 'console' | 'junit' | 'html';

export interface ParsedArgs {
  command?: CliCommand;
  targetFile?: string;
  envFile?: string;
  reporter: CliReporter;
  output?: string;
  help: boolean;
  version: boolean;
  errors: string[];
}

export interface AssertionDetail {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
}

export interface ExecutionItemResult {
  id: string;
  name: string;
  status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
  durationMs: number;
  errorMessage?: string;
  details?: string;
  isTeardown?: boolean;
  isSetup?: boolean;
  assertions?: AssertionDetail[];
}

export interface CliRunSummary {
  title: string;
  type: 'WORKFLOW' | 'TEST_SUITE';
  targetFile: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  items: ExecutionItemResult[];
  rawExecutionResult?: unknown;
}
