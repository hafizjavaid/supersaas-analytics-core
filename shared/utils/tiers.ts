export const TIERS = ["launch", "growth"] as const;

export type Tier = typeof TIERS[number];
