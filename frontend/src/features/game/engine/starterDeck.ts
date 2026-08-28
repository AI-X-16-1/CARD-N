import { buildCard, JOB_LABEL } from './cardData';
import type { BattleCard, JobClass } from './types';

const GRADE_TITLE: Record<number, string> = { 1: '신입', 2: '대리', 3: '과장' };

// The default deck every new user starts with, identical for everyone. It's a
// deliberate baseline: ★1 for the full 8-class kit tour, a few ★2 upgrades, and
// one ★3 per archetype (aggro / value / defense) — clearly weaker than a deck
// built from scanned business cards (★4-6), so scanning stays worthwhile.
// The ★2 tier barely moves stats (×1.1 + floor) but seeds the beginner
// synergies: dev+design+pm → Scrum, marketing+sales → GTM.
const STARTER_CARDS: { jobClass: JobClass; grade: number }[] = [
  // ★1 — one of every class
  { jobClass: 'dev', grade: 1 },
  { jobClass: 'design', grade: 1 },
  { jobClass: 'hr', grade: 1 },
  { jobClass: 'finance', grade: 1 },
  { jobClass: 'legal', grade: 1 }, // legal's kit is strong for the cost, so it stays ★1 only
  { jobClass: 'marketing', grade: 1 },
  { jobClass: 'sales', grade: 1 },
  { jobClass: 'pm', grade: 1 },
  // ★2 — cheap upgrades / synergy seeds
  { jobClass: 'dev', grade: 2 },
  { jobClass: 'design', grade: 2 },
  { jobClass: 'marketing', grade: 2 },
  { jobClass: 'hr', grade: 2 },
  // ★3 — one per archetype: aggro, value, defense
  { jobClass: 'sales', grade: 3 },
  { jobClass: 'pm', grade: 3 },
  { jobClass: 'finance', grade: 3 },
];

export function createStarterDeck(): BattleCard[] {
  return STARTER_CARDS.map(({ jobClass, grade }, i) =>
    buildCard({
      id: -(i + 1), // negative id: starter card, not backed by a real person/business card
      personId: 0,
      jobClass,
      grade,
      name: `${GRADE_TITLE[grade]} ${JOB_LABEL[jobClass]}`,
      company: 'CARD:N',
    }),
  );
}
