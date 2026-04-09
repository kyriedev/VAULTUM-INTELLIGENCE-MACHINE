import { invokeVaultumRpc } from '@/services/rpc';

export interface VaultumAiResponse {
  provider: string;
  providerTrace: string[];
  marketDataTrace: string[];
  intent: string;
  toolsUsed: string[];
  confidence: 'low' | 'medium' | 'high';
  conclusion: string;
  supportingSignals: string[];
  caveats: string[];
  watchItems: string[];
  confirmedSignals: string[];
  inferredImplications: string[];
  estimatedSignals: string[];
  missingData: string[];
  tradePlan?: {
    bias: string;
    biasScore: number;
    entrySuggestion: string;
    reEntrySuggestion: string;
    exitSuggestion: string;
    monteCarloSummary: string;
    optionsMathSummary: string;
    institutionalSummary: string;
    quotedEvidence: Array<{
      label: string;
      quote: string;
      source: string;
      status: 'confirmed' | 'derived' | 'estimated';
    }>;
  };
  memoryMatches?: Array<{
    createdAt: string;
    outcome: 'win' | 'loss' | 'flat' | 'open' | null;
    similarityScore: number;
    recommendation: string;
  }>;
  answer: string;
  contextSnapshot: string;
}

export interface VaultumChartReviewResponse extends VaultumAiResponse {
  market: string;
  timeframe: string;
  reviewMode: 'vision+live' | 'live-only-fallback';
  imageReviewed: boolean;
  executionPhase: 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition' | 'unknown';
  executionPhaseReason: string;
  chartReadSummary: string;
  alignment: 'aligned' | 'mixed' | 'conflicted' | 'unknown';
  alignmentScore: number | null;
  thesisScore: number | null;
  extractedLevels: string[];
  overlayComparisons: string[];
  chartLogic: {
    majorStructure: string;
    minorStructure: string;
    phase: 'impulse' | 'correction' | 'continuation' | 'reversal' | 'transition' | 'unclear';
    setupType: 'continuation' | 'reversal' | 'no-trade';
    structureStatus: 'valid' | 'invalid' | 'unclear';
    bias: 'bullish' | 'bearish' | 'neutral';
    zoneLabel: string;
    zone: string;
    executionLayer: string;
    bestEntryPrice: string;
    invalidation: string;
    tp1: string;
    tp2: string;
    participation: {
      state: 'confirmed' | 'building' | 'absent';
      liquidityInteraction: string;
      displacementReaction: string;
      microStructureShift: string;
    };
    keyEvents: string[];
    actionLines: string[];
    missing: string[];
    invalidates: string[];
    summary: string;
    sourceLineage: string[];
  };
  knowledgeContext?: {
    summary: string;
    focusConcepts: string[];
    sourceLineage: string[];
    structureRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    macroRules: Array<{ label: string; operationalUse: string; whenItMatters: string }>;
    agentFocus: Array<{ key: string; label: string; mission: string }>;
  } | null;
}

export async function askVaultum(
  question: string,
  localContext?: string,
  focus?: { market?: string; timeframe?: string },
): Promise<VaultumAiResponse | null> {
  return invokeVaultumRpc<VaultumAiResponse>('ai', 'ask-vaultum', {
    question,
    localContext,
    market: focus?.market,
    timeframe: focus?.timeframe,
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Unable to read the selected image.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode the selected image.'));
    image.src = dataUrl;
  });
}

export async function prepareChartReviewImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file for chart review.');
  }

  const original = await readFileAsDataUrl(file);
  const image = await loadImage(original);
  const maxDimension = 1400;
  const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return original;

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.84);
}

export async function reviewVaultumChart(input: {
  market: string;
  timeframe: string;
  question: string;
  imageDataUrl: string;
}): Promise<VaultumChartReviewResponse | null> {
  return invokeVaultumRpc<VaultumChartReviewResponse>('ai', 'review-chart', input);
}

export async function summarizeRegime(): Promise<{ summary: string } | null> {
  return invokeVaultumRpc<{ summary: string }>('ai', 'summarize-regime', {});
}
