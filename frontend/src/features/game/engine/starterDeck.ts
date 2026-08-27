import { buildCard, JOB_CLASSES, JOB_LABEL } from './cardData';
import type { BattleCard } from './types';

const STARTER_DECK_SIZE = 15;

/**
 * A newly-signed-up user has no scanned business cards yet, so they can't
 * build a deck from an owned collection. This hands them a fixed 15-card
 * deck of ★1 Intern cards (cost 1, x1.0 multiplier), cycling through all 8
 * job classes, so the "Full deck: 15 cards" rule is satisfied immediately.
 */
export function createStarterDeck(): BattleCard[] {
  return Array.from({ length: STARTER_DECK_SIZE }, (_, i) => {
    const jobClass = JOB_CLASSES[i % JOB_CLASSES.length];
    return buildCard({
      id: -(i + 1), // negative id: starter card, not backed by a real person/business card
      personId: 0,
      jobClass,
      grade: 1,
      name: `신입 ${JOB_LABEL[jobClass]}`,
      company: 'CARD:N',
    });
  });
}
