import fs from 'node:fs';
import path from 'node:path';
import { WorkflowEngineService } from '../services/workflowEngine.service.js';
import { WorkflowSanitizerService } from '../services/workflowSanitizer.service.js';
import { TestExecutionService } from '../services/testExecution.service.js';
import { ValidationService } from '../services/validation.service.js';
import type { EnvironmentProfile, WorkflowScenario } from '../types/workflow.types.js';
import type { TestCase, TestSuite } from '../types/testCase.types.js';
import type { CliReporter, CliRunSummary, ExecutionItemResult } from './types.js';
import { getHelpText, parseArgs } from './argParser.js';
import { formatConsoleReport } from './reporters/consoleReporter.js';
import { formatJUnitReport } from './reporters/junitReporter.js';
import { formatHtmlReport } from './reporters/htmlReporter.js';

export interface CliRunOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
  summary?: CliRunSummary;
}

export class CliRunner {
  private readonly workflowEngine: WorkflowEngineService;
  private readonly workflowSanitizer: WorkflowSanitizerService;
  private readonly testExecutionService: TestExecutionService;
  private readonly validationService: ValidationService;

  constructor(
    workflowEngine: WorkflowEngineService = new WorkflowEngineService(),
    workflowSanitizer: WorkflowSanitizerService = new WorkflowSanitizerService(),
    testExecutionService: TestExecutionService = new TestExecutionService(),
    validationService: ValidationService = new ValidationService()
  ) {
    this.workflowEngine = workflowEngine;
    this.workflowSanitizer = workflowSanitizer;
    this.testExecutionService = testExecutionService;
    this.validationService = validationService;
  }

  /**
   * Main entry point for CLI execution
   */
  async run(argv: string[]): Promise<CliRunOutput> {
    const parsed = parseArgs(argv);
    let stdoutBuffer = '';
    let stderrBuffer = '';

    const logOut = (msg: string) => {
      stdoutBuffer += `${msg}\n`;
    };
    const logErr = (msg: string) => {
      stderrBuffer += `${msg}\n`;
    };

    if (parsed.help) {
      logOut(getHelpText());
      return { exitCode: 0, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    if (parsed.version) {
      logOut('APIForge CLI v1.0.0');
      return { exitCode: 0, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    if (parsed.errors.length > 0) {
      logErr('APIForge CLI Error:');
      for (const err of parsed.errors) {
        logErr(`  - ${err}`);
      }
      logErr('\nRun `apiforge --help` for usage information.');
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    try {
      if (parsed.command === 'run-workflow') {
        return await this.runWorkflow(
          parsed.targetFile!,
          parsed.envFile,
          parsed.reporter,
          parsed.output
        );
      }

      if (parsed.command === 'run-suite') {
        return await this.runSuite(
          parsed.targetFile!,
          parsed.reporter,
          parsed.output
        );
      }

      logErr(`Unknown command: '${parsed.command}'.`);
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    } catch (err) {
      logErr(`Fatal Runner Error: ${err instanceof Error ? err.message : String(err)}`);
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }
  }

  /**
   * Executes a workflow scenario file
   */
  async runWorkflow(
    scenarioPath: string,
    envPath?: string,
    reporter: CliReporter = 'console',
    outputPath?: string
  ): Promise<CliRunOutput> {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // 1. Read & parse workflow scenario JSON
    let scenario: WorkflowScenario;
    try {
      const fullPath = path.resolve(process.cwd(), scenarioPath);
      if (!fs.existsSync(fullPath)) {
        stderrBuffer += `Error: Workflow scenario file not found: '${scenarioPath}'\n`;
        return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
      }
      const rawContent = fs.readFileSync(fullPath, 'utf-8');
      scenario = JSON.parse(rawContent) as WorkflowScenario;
    } catch (err) {
      stderrBuffer += `Error reading or parsing scenario JSON: ${err instanceof Error ? err.message : String(err)}\n`;
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    if (!scenario || !scenario.id || !Array.isArray(scenario.steps)) {
      stderrBuffer += `Error: Invalid workflow scenario format. Expected JSON object with 'id' and 'steps' array.\n`;
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    // 2. Read & parse optional environment profile JSON
    let environment: EnvironmentProfile | undefined;
    if (envPath) {
      try {
        const fullEnvPath = path.resolve(process.cwd(), envPath);
        if (!fs.existsSync(fullEnvPath)) {
          stderrBuffer += `Error: Environment profile file not found: '${envPath}'\n`;
          return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
        }
        const rawEnv = fs.readFileSync(fullEnvPath, 'utf-8');
        environment = JSON.parse(rawEnv) as EnvironmentProfile;
      } catch (err) {
        stderrBuffer += `Error reading or parsing environment profile JSON: ${err instanceof Error ? err.message : String(err)}\n`;
        return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
      }
    }

    // 3. Execute scenario using existing WorkflowEngineService
    const rawResult = await this.workflowEngine.executeScenario(scenario, environment);

    // 4. Sanitize result using existing WorkflowSanitizerService
    const sanitizedResult = this.workflowSanitizer.sanitizeExecutionResult(
      rawResult,
      scenario,
      environment
    );

    // 5. Build CliRunSummary
    const items: ExecutionItemResult[] = sanitizedResult.stepResults.map((step) => {
      let status: 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR' = 'PASSED';
      let errorMessage: string | undefined;

      if (step.status === 'SKIPPED') {
        status = 'SKIPPED';
        errorMessage = step.skipReason;
      } else if (
        step.status === 'FAILED_EXECUTION' ||
        step.status === 'ERROR' ||
        step.validationResult?.status === 'VALIDATION_FAILED'
      ) {
        status = 'FAILED';
        errorMessage =
          step.validationResult?.summary?.failedAssertions && step.validationResult.summary.failedAssertions > 0
            ? 'Contract validation failed'
            : step.error?.message || 'Step execution failed';
      }

      const assertions = step.validationResult?.assertions.map((a) => ({
        id: a.id,
        name: a.category,
        passed: a.passed,
        message: a.message,
      }));

      return {
        id: step.stepId,
        name: step.stepName,
        status,
        durationMs: step.durationMs,
        errorMessage,
        isTeardown: Boolean(step.isTeardown),
        isSetup: Boolean(step.isSetup),
        assertions,
      };
    });

    const passed = items.filter((i) => i.status === 'PASSED').length;
    const failed = items.filter((i) => i.status === 'FAILED' || i.status === 'ERROR').length;
    const skipped = items.filter((i) => i.status === 'SKIPPED').length;

    const summary: CliRunSummary = {
      title: scenario.name || scenario.id,
      type: 'WORKFLOW',
      targetFile: scenarioPath,
      total: items.length,
      passed,
      failed,
      skipped,
      durationMs: sanitizedResult.durationMs,
      items,
      rawExecutionResult: sanitizedResult,
    };

    // 6. Format and output report
    this.handleReportOutput(summary, reporter, outputPath, (text) => (stdoutBuffer += `${text}\n`));

    const exitCode = failed > 0 ? 1 : 0;
    return { exitCode, stdout: stdoutBuffer, stderr: stderrBuffer, summary };
  }

  /**
   * Executes a test suite file
   */
  async runSuite(
    suitePath: string,
    reporter: CliReporter = 'console',
    outputPath?: string
  ): Promise<CliRunOutput> {
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // 1. Read & parse test suite JSON
    let testCases: TestCase[];
    let suiteTitle = 'API Test Suite';

    try {
      const fullPath = path.resolve(process.cwd(), suitePath);
      if (!fs.existsSync(fullPath)) {
        stderrBuffer += `Error: Test suite file not found: '${suitePath}'\n`;
        return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
      }
      const rawContent = fs.readFileSync(fullPath, 'utf-8');
      const parsed = JSON.parse(rawContent) as unknown;

      if (Array.isArray(parsed)) {
        testCases = parsed as TestCase[];
      } else if (typeof parsed === 'object' && parsed !== null && 'tests' in parsed) {
        testCases = (parsed as TestSuite).tests;
        if ((parsed as TestSuite).specificationTitle) {
          suiteTitle = (parsed as TestSuite).specificationTitle;
        }
      } else {
        stderrBuffer += `Error: Invalid test suite format. Expected JSON array of TestCase or object with 'tests' array.\n`;
        return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
      }
    } catch (err) {
      stderrBuffer += `Error reading or parsing test suite JSON: ${err instanceof Error ? err.message : String(err)}\n`;
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    if (!Array.isArray(testCases) || testCases.length === 0) {
      stderrBuffer += `Error: Test suite contains no test cases to execute.\n`;
      return { exitCode: 2, stdout: stdoutBuffer, stderr: stderrBuffer };
    }

    // 2. Execute test batch sequentially via TestExecutionService
    const suiteExecution = await this.testExecutionService.executeBatch(testCases);

    // 3. Validate results via ValidationService
    const executionMap = new Map(suiteExecution.results.map((r) => [r.testCaseId, r]));
    const items: ExecutionItemResult[] = [];

    for (const testCase of testCases) {
      const execResult = executionMap.get(testCase.id);
      if (!execResult) {
        items.push({
          id: testCase.id,
          name: testCase.name || testCase.id,
          status: 'ERROR',
          durationMs: 0,
          errorMessage: 'Execution result missing',
        });
        continue;
      }

      if (execResult.status === 'SKIPPED') {
        items.push({
          id: testCase.id,
          name: testCase.name || testCase.id,
          status: 'SKIPPED',
          durationMs: 0,
          errorMessage: 'Test disabled or skipped',
        });
        continue;
      }

      const validation = this.validationService.validateSingle(testCase, execResult);

      const assertions = validation.assertions.map((a) => ({
        id: a.id,
        name: a.category,
        passed: a.passed,
        message: a.message,
      }));

      const isPassed =
        validation.status === 'VALIDATION_PASSED' ||
        (execResult.status === 'PASSED_EXECUTION' && validation.status !== 'VALIDATION_FAILED');

      const status: 'PASSED' | 'FAILED' = isPassed ? 'PASSED' : 'FAILED';
      let errorMessage: string | undefined;

      if (!isPassed) {
        errorMessage =
          validation.summary.failedAssertions > 0
            ? 'Contract validation failed'
            : execResult.error?.message || 'Request execution failed';
      }

      items.push({
        id: testCase.id,
        name: testCase.name || testCase.id,
        status,
        durationMs: execResult.durationMs,
        errorMessage,
        assertions,
      });
    }

    const passed = items.filter((i) => i.status === 'PASSED').length;
    const failed = items.filter((i) => i.status === 'FAILED' || i.status === 'ERROR').length;
    const skipped = items.filter((i) => i.status === 'SKIPPED').length;

    const summary: CliRunSummary = {
      title: suiteTitle,
      type: 'TEST_SUITE',
      targetFile: suitePath,
      total: items.length,
      passed,
      failed,
      skipped,
      durationMs: suiteExecution.summary.totalDurationMs,
      items,
      rawExecutionResult: suiteExecution,
    };

    // 4. Output report
    this.handleReportOutput(summary, reporter, outputPath, (text) => (stdoutBuffer += `${text}\n`));

    const exitCode = failed > 0 ? 1 : 0;
    return { exitCode, stdout: stdoutBuffer, stderr: stderrBuffer, summary };
  }

  /**
   * Helper to write output or print report
   */
  private handleReportOutput(
    summary: CliRunSummary,
    reporter: CliReporter,
    outputPath: string | undefined,
    logOut: (msg: string) => void
  ): void {
    const reportContent =
      reporter === 'junit'
        ? formatJUnitReport(summary)
        : reporter === 'html'
        ? formatHtmlReport(summary)
        : formatConsoleReport(summary);

    if (outputPath) {
      try {
        const fullOutputPath = path.resolve(process.cwd(), outputPath);
        fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
        fs.writeFileSync(fullOutputPath, reportContent, 'utf-8');
        logOut(formatConsoleReport(summary));
        logOut(`[APIForge] Report successfully written to: ${outputPath}`);
      } catch (err) {
        throw new Error(
          `Failed to write report to '${outputPath}': ${err instanceof Error ? err.message : String(err)}`,
          { cause: err }
        );
      }
    } else {
      logOut(reportContent);
    }
  }
}
