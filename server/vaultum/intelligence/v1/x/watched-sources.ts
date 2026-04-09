import type { SourceProfile, XAccountConfig, XSourceTier } from './types';

const SOURCE_PROFILES: Record<string, Omit<SourceProfile, 'handle'>> = {
  walterbloomberg: {
    displayName: 'Walter Bloomberg',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 84,
    historicalHitRate: 81,
    falseAlarmPenalty: 8,
    speedBonus: 12,
    marketMovingRelevanceScore: 88,
  },
  financialjuice: {
    displayName: 'FinancialJuice',
    category: 'macro',
    sourceTier: 'tier2',
    baseCredibilityScore: 79,
    historicalHitRate: 77,
    falseAlarmPenalty: 9,
    speedBonus: 10,
    marketMovingRelevanceScore: 82,
  },
  deltaone: {
    displayName: 'DeItaone',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 78,
    historicalHitRate: 75,
    falseAlarmPenalty: 10,
    speedBonus: 11,
    marketMovingRelevanceScore: 80,
  },
  deitaone: {
    displayName: 'DeItaone',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 78,
    historicalHitRate: 75,
    falseAlarmPenalty: 10,
    speedBonus: 11,
    marketMovingRelevanceScore: 80,
  },
  unusual_whales: {
    displayName: 'Unusual Whales',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 76,
    historicalHitRate: 73,
    falseAlarmPenalty: 11,
    speedBonus: 10,
    marketMovingRelevanceScore: 84,
  },
  investinglive_: {
    displayName: 'investingLive',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 74,
    historicalHitRate: 71,
    falseAlarmPenalty: 11,
    speedBonus: 10,
    marketMovingRelevanceScore: 78,
  },
  firstsquawk: {
    displayName: 'First Squawk',
    category: 'headline',
    sourceTier: 'tier2',
    baseCredibilityScore: 81,
    historicalHitRate: 79,
    falseAlarmPenalty: 8,
    speedBonus: 11,
    marketMovingRelevanceScore: 85,
  },
  reuters: {
    displayName: 'Reuters',
    category: 'wire',
    sourceTier: 'tier1',
    baseCredibilityScore: 95,
    historicalHitRate: 93,
    falseAlarmPenalty: 4,
    speedBonus: 6,
    marketMovingRelevanceScore: 92,
  },
  bloomberg: {
    displayName: 'Bloomberg',
    category: 'wire',
    sourceTier: 'tier1',
    baseCredibilityScore: 94,
    historicalHitRate: 92,
    falseAlarmPenalty: 4,
    speedBonus: 6,
    marketMovingRelevanceScore: 92,
  },
  whitehouse: {
    displayName: 'The White House',
    category: 'official',
    sourceTier: 'tier1',
    baseCredibilityScore: 97,
    historicalHitRate: 96,
    falseAlarmPenalty: 3,
    speedBonus: 5,
    marketMovingRelevanceScore: 90,
  },
  potus: {
    displayName: 'POTUS',
    category: 'official',
    sourceTier: 'tier1',
    baseCredibilityScore: 96,
    historicalHitRate: 95,
    falseAlarmPenalty: 3,
    speedBonus: 6,
    marketMovingRelevanceScore: 91,
  },
  treasurydept: {
    displayName: 'US Treasury',
    category: 'official',
    sourceTier: 'tier1',
    baseCredibilityScore: 97,
    historicalHitRate: 96,
    falseAlarmPenalty: 3,
    speedBonus: 4,
    marketMovingRelevanceScore: 88,
  },
  federalreserve: {
    displayName: 'Federal Reserve',
    category: 'official',
    sourceTier: 'tier1',
    baseCredibilityScore: 98,
    historicalHitRate: 97,
    falseAlarmPenalty: 2,
    speedBonus: 4,
    marketMovingRelevanceScore: 90,
  },
};

function defaultsForCategory(category: string): {
  displayName: string;
  category: string;
  sourceTier: XSourceTier;
  baseCredibilityScore: number;
  historicalHitRate: number;
  falseAlarmPenalty: number;
  speedBonus: number;
  marketMovingRelevanceScore: number;
} {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'official' || normalized === 'government' || normalized === 'central-bank') {
    return {
      displayName: 'Official Source',
      category: normalized || 'official',
      sourceTier: 'tier1',
      baseCredibilityScore: 94,
      historicalHitRate: 92,
      falseAlarmPenalty: 4,
      speedBonus: 4,
      marketMovingRelevanceScore: 90,
    };
  }
  if (normalized === 'headline' || normalized === 'wire' || normalized === 'policy') {
    return {
      displayName: 'Headline Desk',
      category: normalized || 'headline',
      sourceTier: 'tier2',
      baseCredibilityScore: 80,
      historicalHitRate: 77,
      falseAlarmPenalty: 9,
      speedBonus: 10,
      marketMovingRelevanceScore: 83,
    };
  }
  if (normalized === 'macro' || normalized === 'desk' || normalized === 'analyst') {
    return {
      displayName: 'Macro Desk',
      category: normalized || 'macro',
      sourceTier: 'tier3',
      baseCredibilityScore: 69,
      historicalHitRate: 67,
      falseAlarmPenalty: 12,
      speedBonus: 8,
      marketMovingRelevanceScore: 74,
    };
  }
  return {
    displayName: 'Commentary Source',
    category: normalized || 'commentary',
    sourceTier: 'tier4',
    baseCredibilityScore: 54,
    historicalHitRate: 50,
    falseAlarmPenalty: 16,
    speedBonus: 6,
    marketMovingRelevanceScore: 58,
  };
}

export function resolveSourceProfiles(accounts: XAccountConfig[]): SourceProfile[] {
  return accounts.map((account) => {
    const preset = SOURCE_PROFILES[account.handle.toLowerCase()];
    const fallback = defaultsForCategory(account.category);
    const profile = preset ?? fallback;
    return {
      handle: account.handle.toLowerCase(),
      displayName: profile.displayName,
      category: account.category || profile.category,
      sourceTier: profile.sourceTier,
      baseCredibilityScore: profile.baseCredibilityScore,
      historicalHitRate: profile.historicalHitRate,
      falseAlarmPenalty: profile.falseAlarmPenalty,
      speedBonus: profile.speedBonus,
      marketMovingRelevanceScore: profile.marketMovingRelevanceScore,
    } satisfies SourceProfile;
  });
}
