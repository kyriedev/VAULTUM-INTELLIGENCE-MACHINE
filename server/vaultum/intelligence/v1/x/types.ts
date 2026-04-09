import type { FeedSnapshotMeta } from '../../../_shared/feed-health';

export type XIntelState =
  | 'active'
  | 'configured-no-token'
  | 'configured-no-accounts'
  | 'inactive'
  | 'error';

export type XSourceTier = 'tier1' | 'tier2' | 'tier3' | 'tier4';
export type XEventIntensity = 'low' | 'medium' | 'high';
export type XSurpriseLevel = 'expected' | 'semi-surprise' | 'shock';
export type XImpactDirection = 'bullish' | 'bearish' | 'mixed';
export type XImpactHorizon = 'instant' | 'intraday' | 'swing';
export type XReactionValidation = 'confirmed' | 'partial' | 'not_confirmed' | 'contradictory';
export type XActionabilityState =
  | 'IGNORE'
  | 'LOG_ONLY'
  | 'MONITOR'
  | 'MACRO_BIAS_SHIFT'
  | 'EXECUTION_CAUTION'
  | 'TRADEABLE_CATALYST';
export type XPersistenceClass = 'flash' | 'intraday' | 'multi-day';
export type XEventCardTone = 'red' | 'green' | 'amber' | 'gray';
export type XEventStatus = 'developing' | 'confirmed' | 'contradicted' | 'stale';

export type XEventType =
  | 'tariff_announcement'
  | 'tariff_threat'
  | 'trade_talk_progress'
  | 'trade_talk_breakdown'
  | 'sanctions'
  | 'export_control'
  | 'military_escalation'
  | 'military_deescalation'
  | 'ceasefire'
  | 'shipping_disruption'
  | 'strait_or_chokepoint_risk'
  | 'oil_supply_risk'
  | 'energy_infrastructure_attack'
  | 'diplomatic_statement'
  | 'central_bank_comment'
  | 'inflation_signal'
  | 'growth_signal'
  | 'fiscal_signal'
  | 'regulatory_action'
  | 'rumor_unconfirmed'
  | 'narrative_noise';

export type XMarketAsset =
  | 'XAUUSD'
  | 'WTI'
  | 'BRENT'
  | 'DXY'
  | 'EURUSD'
  | 'USDJPY'
  | 'US500'
  | 'NASDAQ'
  | 'US30'
  | 'US2Y'
  | 'US10Y'
  | 'VIX';

export type XAccountConfig = {
  handle: string;
  weight: number;
  category: string;
};

export type SourceProfile = {
  handle: string;
  displayName: string;
  category: string;
  sourceTier: XSourceTier;
  baseCredibilityScore: number;
  historicalHitRate: number;
  falseAlarmPenalty: number;
  speedBonus: number;
  marketMovingRelevanceScore: number;
};

export type ParsedEntities = {
  people: string[];
  leaders: string[];
  countries: string[];
  institutions: string[];
  commodities: string[];
  indices: string[];
  currencies: string[];
  militaryTerms: string[];
  tradeTerms: string[];
  policyTerms: string[];
  symbols: string[];
  keywords: string[];
};

export type RawSocialPost = {
  id: string;
  sourceHandle: string;
  sourceDisplayName: string;
  timestamp: string;
  rawText: string;
  cleanedText: string;
  urls: string[];
  quotedPost: { id?: string; text?: string } | null;
  repostedPost: { id?: string; text?: string } | null;
  mediaFlags: string[];
  hasMedia: boolean;
  language: string | null;
  engagementMetrics: {
    likes: number;
    reposts: number;
    replies: number;
    quotes: number;
    impressions: number;
    bookmarks: number;
  };
  detectedEntities: ParsedEntities;
  profile: SourceProfile;
  duplicateKey: string;
  normalizedHash: string;
  opinionOnly: boolean;
  rumorFlag: boolean;
  contradictionFlag: boolean;
};

export type ParsedEvent = {
  eventType: XEventType;
  subtypes: XEventType[];
  geography: string[];
  intensity: XEventIntensity;
  surpriseLevel: XSurpriseLevel;
  keywords: string[];
  entities: string[];
  classificationReason: string;
};

export type ImpactAssessment = {
  impactedAssets: Array<{
    asset: XMarketAsset;
    directionBias: XImpactDirection;
    impactMagnitude: number;
    horizon: XImpactHorizon;
    reason: string;
    role: 'primary' | 'secondary';
  }>;
  summary: string;
};

export type MarketReactionValidation = {
  reactionValidation: XReactionValidation;
  observedMoves: Array<{
    asset: XMarketAsset;
    expectedDirection: XImpactDirection;
    oneMinuteMovePct: number | null;
    fiveMinuteMovePct: number | null;
    fifteenMinuteMovePct: number | null;
    sixtyMinuteMovePct: number | null;
    aligned: boolean | null;
  }>;
  crossAssetAlignmentScore: number;
  explanation: string;
};

export type ActionabilityDecision = {
  state: XActionabilityState;
  impactScore: number;
  credibility: number;
  validationStatus: XReactionValidation;
  actionabilityScore: number;
  reason: string;
};

export type TradingGuidance = {
  regimeEffect: string;
  directionalBiasByAsset: Array<{
    asset: XMarketAsset;
    bias: XImpactDirection;
    strength: number;
    reason: string;
  }>;
  setupAdjustments: string[];
  riskFlags: string[];
  expiryOrDecayWindow: string;
};

export type EventDecay = {
  impactHalfLifeMinutes: number;
  persistenceClass: XPersistenceClass;
  staleAfter: string;
  decayReason: string;
};

export type XIntelPost = {
  id: string;
  authorHandle: string;
  authorName: string;
  verified: boolean;
  category: string;
  createdAt: string | null;
  text: string;
  cleanedText: string;
  url: string | null;
  eventType: XEventType;
  credibility: number;
  bias: XImpactDirection | 'neutral';
  biasScore: number;
  impact: 'high' | 'medium' | 'low';
  relevanceScore: number;
  marketRelevance: 'direct' | 'context' | 'weak';
  engagementScore: number;
  whyItMatters: string;
  detectedEntities: ParsedEntities;
};

export type EventCluster = {
  id: string;
  key: string;
  headline: string;
  cleanedSummary: string;
  status: XEventStatus;
  tone: XEventCardTone;
  firstDetectedAt: string;
  latestUpdateAt: string;
  eventType: XEventType;
  subtypes: XEventType[];
  geography: string[];
  intensity: XEventIntensity;
  surpriseLevel: XSurpriseLevel;
  sourceHandles: string[];
  sourceTiers: XSourceTier[];
  sourceCredibilityScore: number;
  eventCredibilityScore: number;
  crossConfirmationScore: number;
  contradictionScore: number;
  stalePenalty: number;
  noisePenalty: number;
  overallImpactScore: number;
  tradabilityScore: number;
  macroRelevanceScore: number;
  confidenceScore: number;
  parsedEvent: ParsedEvent;
  impactAssessment: ImpactAssessment;
  validation: MarketReactionValidation;
  actionability: ActionabilityDecision;
  tradingGuidance: TradingGuidance;
  decay: EventDecay;
  explanation: {
    whyItMatters: string;
    transmissionPath: string;
    exposedAssets: string[];
    missingConfirmation: string;
    whyActionable: string;
  };
  posts: XIntelPost[];
  timeline: Array<{
    timestamp: string;
    handle: string;
    label: string;
    note: string;
  }>;
};

export type XIntelResponse = {
  generatedAt: string;
  market: string;
  timeframe: string;
  state: XIntelState;
  summary: string;
  accounts: XAccountConfig[];
  sourceProfiles: SourceProfile[];
  posts: XIntelPost[];
  clusters: EventCluster[];
  sampleClusters: EventCluster[];
  sentiment: {
    label: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    score: number;
    summary: string;
  };
  snapshotMeta?: FeedSnapshotMeta;
  sourceLabel: string;
  blindspots: string[];
  monitor: {
    activelyMonitoring: boolean;
    pollingMs: number;
    watchCount: number;
    lastUpdatedAt: string;
    nextPollDueAt: string;
  };
};

export type MockPostSeed = {
  id: string;
  handle: string;
  displayName: string;
  category: string;
  timestamp: string;
  text: string;
  likes?: number;
  reposts?: number;
  replies?: number;
  quotes?: number;
  verified?: boolean;
  mockReaction?: MarketReactionValidation;
};
