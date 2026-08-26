import { buildCard } from './cardData';
import { averageCost, compendiumCompletion } from './deckStats';
import type { CompendiumSlot } from './mockCollection';

describe('averageCost', () => {
  test('returns 0 for an empty deck', () => {
    expect(averageCost([])).toBe(0);
  });

  test('averages the cost field across the given cards', () => {
    const cards = [
      buildCard({ id: 1, personId: 1, jobClass: 'dev', grade: 1, name: 'A', company: 'X' }), // cost 1
      buildCard({ id: 2, personId: 2, jobClass: 'dev', grade: 4, name: 'B', company: 'X' }), // cost 4
    ];

    expect(averageCost(cards)).toBe(2.5);
  });
});

describe('compendiumCompletion', () => {
  function slot(owned: number): CompendiumSlot {
    return {
      jobClass: 'dev',
      grade: 1,
      owned: owned > 0 ? [buildCard({ id: 1, personId: 1, jobClass: 'dev', grade: 1, name: 'A', company: 'X' })] : [],
    };
  }

  test('returns 0 when no slots are owned', () => {
    expect(compendiumCompletion([slot(0), slot(0)])).toBe(0);
  });

  test('returns 100 when every slot has at least one owned card', () => {
    expect(compendiumCompletion([slot(1), slot(1)])).toBe(100);
  });

  test('rounds the percentage of owned slots', () => {
    // 1 of 3 owned -> 33.33... -> rounds to 33
    expect(compendiumCompletion([slot(1), slot(0), slot(0)])).toBe(33);
  });
});
