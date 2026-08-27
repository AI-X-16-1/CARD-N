import { createStarterDeck } from './starterDeck';
import type { JobClass } from './types';

const ALL_JOB_CLASSES: JobClass[] = ['dev', 'design', 'hr', 'finance', 'legal', 'marketing', 'sales', 'pm'];

describe('createStarterDeck', () => {
  test('returns a full 15-card deck', () => {
    expect(createStarterDeck()).toHaveLength(15);
  });

  test('every card is a cost-1, grade-1 basic card', () => {
    const deck = createStarterDeck();

    for (const card of deck) {
      expect(card.grade).toBe(1);
      expect(card.cost).toBe(1);
    }
  });

  test('covers all 8 job classes at least once', () => {
    const deck = createStarterDeck();
    const jobClasses = new Set(deck.map((card) => card.jobClass));

    for (const jobClass of ALL_JOB_CLASSES) {
      expect(jobClasses.has(jobClass)).toBe(true);
    }
  });

  test('every card has a unique id', () => {
    const deck = createStarterDeck();
    const ids = new Set(deck.map((card) => card.id));

    expect(ids.size).toBe(deck.length);
  });

  test('finalStats matches baseStats at grade 1 (x1.0 multiplier)', () => {
    const deck = createStarterDeck();

    for (const card of deck) {
      expect(card.finalStats).toEqual(card.baseStats);
    }
  });
});
