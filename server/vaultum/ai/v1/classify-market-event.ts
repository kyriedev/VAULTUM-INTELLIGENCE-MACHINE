import { classifyIntent } from './planner';
import { classifyEvent } from '../../intelligence/v1/classify-event';

export async function classifyMarketEvent(input: { text: string }): Promise<{ confirmed: string[]; inferred: string[]; missing: string[] }> {
  const classified = await classifyEvent({ title: input.text });
  return {
    confirmed: [`intent ${classifyIntent(input.text)}`, `event category ${classified.category}`],
    inferred: [classified.marketImpact],
    missing: ['No immediate post-event price tape is attached to this request.'],
  };
}
