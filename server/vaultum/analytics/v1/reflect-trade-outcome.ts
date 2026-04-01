import { getTraderReport } from './get-trader-report';
import { rememberSituation, type SituationMemoryEntry } from './_situation-memory';

function normalizeOutcome(value: unknown): SituationMemoryEntry['outcome'] {
  const outcome = String(value || 'flat').toLowerCase();
  if (outcome === 'win' || outcome === 'loss' || outcome === 'flat' || outcome === 'open') return outcome;
  return 'flat';
}

function buildLesson(input: {
  outcome: SituationMemoryEntry['outcome'];
  stance: string;
  summary: string;
  actionPlan: string;
  riskWatch: string;
  returnPct: number | null;
  notes: string;
}): string {
  const returnNote = input.returnPct == null || Number.isNaN(input.returnPct)
    ? 'Return not supplied.'
    : `Return ${input.returnPct >= 0 ? '+' : ''}${input.returnPct.toFixed(2)}%.`;

  if (input.outcome === 'win') {
    return `${returnNote} Keep favoring ${input.stance} setups when structure, flow, and scenario line up the way they did here. Preserve the same patience around action plan: ${input.actionPlan}. Risk note that still matters: ${input.riskWatch}. ${input.notes}`.trim();
  }

  if (input.outcome === 'loss') {
    return `${returnNote} Tighten entry quality and require cleaner confirmation before repeating a ${input.stance} idea. The missed piece was likely around: ${input.riskWatch}. Reframe the setup with stricter invalidation and better timing than: ${input.actionPlan}. ${input.notes}`.trim();
  }

  if (input.outcome === 'open') {
    return `${returnNote} Treat this as an open learning loop. Hold onto the current thesis only while the active plan remains valid: ${input.actionPlan}. Watch: ${input.riskWatch}. ${input.notes}`.trim();
  }

  return `${returnNote} This setup did not cleanly follow through, so future repeats should wait for stronger acceptance and less mixed risk context. Original desk note: ${input.summary}. Risk watch: ${input.riskWatch}. ${input.notes}`.trim();
}

export async function reflectTradeOutcome(input: {
  market?: string;
  timeframe?: string;
  outcome?: 'win' | 'loss' | 'flat' | 'open';
  returnPct?: number;
  notes?: string;
  decisionSummary?: string;
}): Promise<{
  stored: true;
  market: string;
  timeframe: string;
  outcome: SituationMemoryEntry['outcome'];
  lesson: string;
  memory: SituationMemoryEntry;
}> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const timeframe = String(input.timeframe || '1h').toLowerCase();
  const outcome = normalizeOutcome(input.outcome);
  const report = await getTraderReport({ market, timeframe, reportStyle: 'execution' });
  const notes = String(input.notes || '').trim();
  const lesson = buildLesson({
    outcome,
    stance: report.stance,
    summary: input.decisionSummary || report.summary,
    actionPlan: report.actionPlan,
    riskWatch: report.riskWatch,
    returnPct: typeof input.returnPct === 'number' ? input.returnPct : null,
    notes,
  });

  const memory = await rememberSituation({
    namespace: 'trader-report',
    market,
    timeframe,
    situation: [
      input.decisionSummary || report.summary,
      report.sections.structure.body,
      report.sections.flow.body,
      report.sections.risk.body,
      notes,
    ].filter(Boolean).join('\n'),
    recommendation: lesson,
    outcome,
    tags: [report.stance, report.confidence, report.metrics.macro, report.metrics.orderflow],
  });

  return {
    stored: true,
    market,
    timeframe,
    outcome,
    lesson,
    memory,
  };
}
