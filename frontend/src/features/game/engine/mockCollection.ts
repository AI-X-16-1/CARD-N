import { buildCard, GRADES, JOB_CLASSES, JOB_LABEL } from './cardData';
import type { BattleCard, JobClass } from './types';

// CARD:N has no fixed card catalog: every card comes from a real person's
// business card, so there's no predefined "you haven't unlocked card #47"
// entry to show. The collection is really a compendium of the 8 job classes
// x 6 grades (48 "species") a player has met at least one person for.
export interface CompendiumSlot {
  jobClass: JobClass;
  grade: number;
  owned: BattleCard[];
}

const MOCK_COMPANIES = ['카카오', '토스', '네이버', '쿠팡', '배민', 'LG', '당근', 'SK'];
const MOCK_SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤'];

function countForRoll(roll: number): number {
  if (roll < 0.5) return 0;
  if (roll < 0.85) return 1;
  return 2;
}

/**
 * Generates a stand-in "owned card" collection for testing the Deck Builder
 * before backend `/game/cards` exists. Real cards come from scanning
 * business cards; this just rolls a random owned-instance count (0-2) for
 * each of the 48 job x grade slots.
 */
export function createMockCollection(rng: () => number = Math.random): BattleCard[] {
  const collection: BattleCard[] = [];
  let nextId = 1;

  for (const jobClass of JOB_CLASSES) {
    for (const grade of GRADES) {
      const count = countForRoll(rng());
      for (let i = 0; i < count; i++) {
        const id = nextId++;
        const surname = MOCK_SURNAMES[id % MOCK_SURNAMES.length];
        const mockCard = buildCard({
          id,
          personId: id,
          jobClass,
          grade,
          name: `${surname}${JOB_LABEL[jobClass]}`,
          company: MOCK_COMPANIES[id % MOCK_COMPANIES.length],
        });
        // Dev placeholder art so CardArt is visibly exercised without a backend.
        // Real cards get illustration_url from PUT /game/cards/{id}/art.
        mockCard.illustrationUrl = `https://picsum.photos/seed/cardn-${id}/240/320`;
        collection.push(mockCard);
      }
    }
  }

  return collection;
}

/** Groups a flat owned-card collection into all 48 job x grade compendium slots. */
export function groupCompendium(collection: BattleCard[]): CompendiumSlot[] {
  return JOB_CLASSES.flatMap((jobClass) =>
    GRADES.map((grade) => ({
      jobClass,
      grade,
      owned: collection.filter((c) => c.jobClass === jobClass && c.grade === grade),
    })),
  );
}

const DECK_SIZE = 15;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Rounds a selected deck (up to 8 cards) out to the full 15-card battle
 * deck: fills the remainder randomly from the player's other owned cards,
 * then pads with fresh ★1 Intern fillers if the collection is still short
 * (game-rules.md "Full deck: 15 cards" / starter-deck fallback).
 */
export function completeDeckTo15(
  selected: BattleCard[],
  pool: BattleCard[],
  rng: () => number = Math.random,
): BattleCard[] {
  const deck = selected.slice(0, 8);
  const selectedIds = new Set(deck.map((c) => c.id));

  const extras = shuffle(
    pool.filter((c) => !selectedIds.has(c.id)),
    rng,
  );
  while (deck.length < DECK_SIZE && extras.length > 0) {
    deck.push(extras.shift()!);
  }

  let fillerN = 0;
  while (deck.length < DECK_SIZE) {
    const jobClass = JOB_CLASSES[fillerN % JOB_CLASSES.length];
    fillerN++;
    deck.push(
      buildCard({
        id: -(1000 + fillerN),
        personId: 0,
        jobClass,
        grade: 1,
        name: `신입 ${JOB_LABEL[jobClass]}`,
        company: 'CARD:N',
      }),
    );
  }

  return deck;
}
