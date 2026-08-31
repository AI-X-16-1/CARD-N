import { createStarterDeck, isStarterCard } from './starterDeck';
import type { JobClass } from './types';

const ALL_JOB_CLASSES: JobClass[] = ['dev', 'design', 'hr', 'finance', 'legal', 'marketing', 'sales', 'pm'];

describe('createStarterDeck', () => {
  test('returns a full 15-card deck', () => {
    expect(createStarterDeck()).toHaveLength(15);
  });

  test('has the intended grade spread: 8x star1, 4x star2, 3x star3, nothing above star3', () => {
    const deck = createStarterDeck();
    const byGrade = (g: number) => deck.filter((c) => c.grade === g).length;

    expect(byGrade(1)).toBe(8);
    expect(byGrade(2)).toBe(4);
    expect(byGrade(3)).toBe(3);
    expect(deck.every((c) => c.grade <= 3)).toBe(true);
  });

  test('cost follows the grade table (1 / 2 / 3)', () => {
    const expected: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

    for (const card of createStarterDeck()) {
      expect(card.cost).toBe(expected[card.grade]);
    }
  });

  test('keeps a low curve — average cost under 2', () => {
    const deck = createStarterDeck();
    const avg = deck.reduce((sum, c) => sum + c.cost, 0) / deck.length;

    expect(avg).toBeLessThan(2);
  });

  test('covers all 8 job classes at least once', () => {
    const jobClasses = new Set(createStarterDeck().map((card) => card.jobClass));

    for (const jobClass of ALL_JOB_CLASSES) {
      expect(jobClasses.has(jobClass)).toBe(true);
    }
  });

  test('every card has a unique id', () => {
    const ids = new Set(createStarterDeck().map((card) => card.id));

    expect(ids.size).toBe(15);
  });

  test('star1 cards have finalStats equal to baseStats (x1.0 multiplier)', () => {
    for (const card of createStarterDeck().filter((c) => c.grade === 1)) {
      expect(card.finalStats).toEqual(card.baseStats);
    }
  });
});

describe('isStarterCard', () => {
  test('every card the starter deck hands out is a starter card', () => {
    expect(createStarterDeck().every(isStarterCard)).toBe(true);
  });

  test('a card built from a scanned contact (positive id) is not a starter card', () => {
    expect(isStarterCard({ id: 42 })).toBe(false);
  });
});
