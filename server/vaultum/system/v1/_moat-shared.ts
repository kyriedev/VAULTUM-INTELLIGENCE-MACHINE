export type MoatStatus = 'strong' | 'building' | 'thin';
export type TrustStatus = 'strong' | 'building' | 'fragile';
export type SteeringTrackStatus = 'active' | 'building' | 'missing';
export type SteeringTrackPriority = 'now' | 'soon' | 'later';

export type SteeringTrack = {
  key: 'data-backbone' | 'execution-workflow' | 'analyst-os' | 'portfolio-risk' | 'reliability-governance';
  title: string;
  priority: SteeringTrackPriority;
  status: SteeringTrackStatus;
  summary: string;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))];
}

export function moatStatus(score: number): MoatStatus {
  if (score >= 72) return 'strong';
  if (score >= 50) return 'building';
  return 'thin';
}

export function trustStatus(score: number): TrustStatus {
  if (score >= 78) return 'strong';
  if (score >= 58) return 'building';
  return 'fragile';
}

