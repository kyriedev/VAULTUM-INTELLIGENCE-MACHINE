import { cacheKey } from '../../../_shared/cache-keys';
import { getCachedOrCompute } from '../../../_shared/redis';
import { buildKnowledgeCoverageReport, knowledgeDocuments } from './_knowledge-base';

export async function getKnowledgeCoverage(): Promise<any> {
  return getCachedOrCompute(cacheKey('system', 'knowledge-coverage'), async () => {
    const coverage = buildKnowledgeCoverageReport();

    return {
      generatedAt: new Date().toISOString(),
      summary: `Knowledge coverage is ${coverage.overallScore}/100. Core doctrine, macro-cycle logic, reflexivity, Kalman, regression, and volatility routing are strong; image-heavy structure PDFs remain the main fidelity gap.`,
      overallScore: coverage.overallScore,
      conceptChecks: coverage.conceptChecks,
      weakAreas: coverage.weakAreas,
      gaps: coverage.gaps,
      documents: knowledgeDocuments.map((document) => ({
        document: document.document,
        topic: document.topic,
        extractionQuality: document.extractionQuality,
        fit: document.fit,
        evidenceLevel: document.evidenceLevel,
        limitations: document.limitations,
      })),
      ontologyMap: coverage.ontologyMap,
    };
  }, 300);
}
