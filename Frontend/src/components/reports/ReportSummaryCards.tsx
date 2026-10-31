import { Activity, Bot, CheckCircle2, ClipboardCheck, FlaskConical, XCircle } from 'lucide-react';
import type { ReportSummary } from '@/types/report.types';

export function ReportSummaryCards({ report }: { report: ReportSummary }) {
  const cards = [
    ['Total Tests', report.execution.totalTests, FlaskConical, 'text-sky-700 bg-sky-50'],
    ['Executed', report.execution.executedTests, Activity, 'text-violet-700 bg-violet-50'],
    ['Execution Pass', report.execution.passRate === null ? '—' : `${report.execution.passRate}%`, CheckCircle2, 'text-emerald-700 bg-emerald-50'],
    ['Validation Pass', report.validation.totalValidated ? `${Math.round(report.validation.validationPassed / report.validation.totalValidated * 100)}%` : '—', ClipboardCheck, 'text-teal-700 bg-teal-50'],
    ['Failed Assertions', report.validation.failedAssertions, XCircle, 'text-rose-700 bg-rose-50'],
    ['AI Diagnoses', report.diagnosis.diagnosedTests, Bot, 'text-amber-700 bg-amber-50'],
  ] as const;
  return <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value, Icon, tone]) => <div key={label} className="panel-surface p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p></div><Icon className={`h-5 w-5 rounded-lg p-1 ${tone}`} /></div></div>)}</section>;
}
