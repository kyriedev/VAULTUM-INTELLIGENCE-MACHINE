import { EVENT_IMPACT_RULES } from './rules';
import { minutesAgo } from './helpers';
import type { EventDecay, ParsedEvent, XIntelPost } from './types';

export function buildDecay(parsedEvent: ParsedEvent, posts: XIntelPost[]): EventDecay {
  const rule = EVENT_IMPACT_RULES[parsedEvent.eventType];
  const lead = posts[0];
  const halfLifeMinutes = rule?.halfLifeMinutes ?? 90;
  const ageMinutes = lead?.createdAt ? minutesAgo(lead.createdAt) : 0;
  const staleMinutes = halfLifeMinutes * 3;
  const staleAfter = new Date(Date.now() + Math.max(staleMinutes - ageMinutes, 0) * 60_000).toISOString();

  return {
    impactHalfLifeMinutes: halfLifeMinutes,
    persistenceClass: rule?.persistenceClass ?? 'flash',
    staleAfter,
    decayReason: rule?.reason ?? 'This event should decay quickly unless new confirmation extends it.',
  };
}
