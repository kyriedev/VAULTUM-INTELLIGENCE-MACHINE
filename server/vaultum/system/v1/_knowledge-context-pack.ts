import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { getAgentRulebooks } from './get-agent-rulebooks';
import { getDetectionEngine } from './get-detection-engine';
import { getKnowledgeGraph } from './get-knowledge-graph';
import { getModelSelectionEngine } from './get-model-selection-engine';
import { getTradingDoctrine } from './get-trading-doctrine';

export type KnowledgeContextTask = 'chart-analysis' | 'chart-review' | 'execution' | 'signal-explanation';

function normalizeTask(value?: string): KnowledgeContextTask {
  const task = String(value || '').toLowerCase();
  if (task === 'chart-review' || task === 'execution' || task === 'signal-explanation') return task;
  return 'chart-analysis';
}

function buildFocusConcepts(task: KnowledgeContextTask, doctrine: any, detection: any, graph: any): string[] {
  const keys = new Set<string>();
  detection?.concepts?.forEach((concept: any) => keys.add(concept.label));
  graph?.retrieval?.concepts?.forEach((concept: any) => keys.add(concept.label ?? concept.key));

  if (task === 'chart-analysis' || task === 'chart-review') {
    ['Major Structure', 'Minor Structure', 'Impulse', 'Correction', 'Continuation', 'Reversal', 'Liquidity Sweep', 'Displacement', 'Premium And Discount', 'Main Fib', 'Minor Fib', 'Orderflow Confirmation'].forEach((label) => keys.add(label));
  }

  if ((doctrine?.focusMarket?.market ?? '') === 'XAUUSD') keys.add('Gold macro and structure playbook');
  if ((doctrine?.focusMarket?.market ?? '') === 'US30') keys.add('US30 macro and structure playbook');
  return [...keys].slice(0, 12);
}

export async function getKnowledgeContextPack(input: {
  market?: string;
  question?: string;
  task?: KnowledgeContextTask | string;
  phase?: string;
  readiness?: string;
  confidence?: number;
  macroReflexivity?: string;
  eventRisk?: 'live' | 'soon' | 'clear';
}): Promise<any> {
  const market = String(input.market || 'XAUUSD').toUpperCase();
  const question = String(input.question || '').trim();
  const task = normalizeTask(input.task);

  return getCachedOrCompute(cacheKey('system', `knowledge-context-pack:${market}:${task}:${question || 'default'}:${input.phase || 'auto'}:${input.readiness || 'auto'}`), async () => {
    const [doctrine, graph, detection, modelSelection, rulebooks] = await Promise.all([
      getTradingDoctrine({ market, question }),
      getKnowledgeGraph({ market, question, topN: 6 }),
      getDetectionEngine({ market, question, topN: 8 }),
      getModelSelectionEngine({
        market,
        question,
        phase: input.phase,
        readiness: input.readiness,
        confidence: input.confidence,
        macroReflexivity: input.macroReflexivity,
        eventRisk: input.eventRisk,
      }),
      getAgentRulebooks({ market, question }),
    ]);

    const focusMarket = doctrine?.focusMarket;
    const focusConcepts = buildFocusConcepts(task, doctrine, detection, graph);
    const structureRules = (doctrine?.marketStructureOntology ?? []).slice(0, 12).map((term: any) => ({
      label: term.label,
      operationalUse: term.operationalUse,
      whenItMatters: term.whenItMatters,
    }));
    const macroRules = [
      ...(doctrine?.macroOntology ?? []),
      ...(doctrine?.forexMechanics ?? []),
    ].slice(0, 10).map((term: any) => ({
      label: term.label,
      operationalUse: term.operationalUse,
      whenItMatters: term.whenItMatters,
    }));

    return {
      generatedAt: new Date().toISOString(),
      market,
      task,
      question,
      summary: `Knowledge context pack binds doctrine, ontology, detection rules, model routing, and agent handoff rules into a chart-safe retrieval layer for ${market}.`,
      focusMarket,
      focusConcepts,
      structureRules,
      macroRules,
      modelRouting: modelSelection?.decision ?? null,
      retrieval: graph?.retrieval ?? null,
      sourceLineage: [
        ...(graph?.retrieval?.documents?.map((item: any) => item.document) ?? []),
        ...(doctrine?.sourceLedger?.slice(0, 6).map((item: any) => item.document) ?? []),
      ].filter((value: string, index: number, values: string[]) => values.indexOf(value) === index),
      agentFocus: (rulebooks?.agents ?? []).map((agent: any) => ({
        key: agent.key,
        label: agent.label,
        mission: agent.mission,
      })),
    };
  }, 300);
}
