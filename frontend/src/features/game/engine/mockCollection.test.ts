import { buildCard } from './cardData';
import { completeDeckTo15, createMockCollection, groupCompendium } from './mockCollection';
import type { BattleCard } from './types';

function constantRng(value: number) {
  return () => value;
}

describe('createMockCollection', () => {
  test('an rng that always rolls low produces an empty collection', () => {
    expect(createMockCollection(constantRng(0))).toEqual([]);
  });

  test('an rng that always rolls high gives every one of the 48 job x grade slots 2 owned instances', () => {
    const collection = createMockCollection(constantRng(0.99));

    expect(collection).toHaveLength(8 * 6 * 2);
  });

  test('every generated card matches buildCard() stats for its own jobClass/grade', () => {
    const collection = createMockCollection(constantRng(0.99));

    for (const card of collection) {
      const expected = buildCard({
        id: card.id,
        personId: card.personId,
        jobClass: card.jobClass,
        grade: card.grade,
        name: card.name,
        company: card.company,
      });
      expect(card.finalStats).toEqual(expected.finalStats);
      expect(card.cost).toBe(expected.cost);
    }
  });

  test('every card gets a unique id', () => {
    const collection = createMockCollection(constantRng(0.99));
    const ids = collection.map((c) => c.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('groupCompendium', () => {
  test('always returns all 48 job x grade slots, even for an empty collection', () => {
    const slots = groupCompendium([]);

    expect(slots).toHaveLength(8 * 6);
    expect(slots.every((s) => s.owned.length === 0)).toBe(true);
  });

  test('groups owned cards under their matching jobClass/grade slot', () => {
    const a = buildCard({ id: 1, personId: 1, jobClass: 'dev', grade: 3, name: 'A', company: 'X' });
    const b = buildCard({ id: 2, personId: 2, jobClass: 'dev', grade: 3, name: 'B', company: 'Y' });
    const c = buildCard({ id: 3, personId: 3, jobClass: 'sales', grade: 1, name: 'C', company: 'Z' });

    const slots = groupCompendium([a, b, c]);

    const devGrade3 = slots.find((s) => s.jobClass === 'dev' && s.grade === 3);
    expect(devGrade3?.owned.map((c) => c.id).sort()).toEqual([1, 2]);

    const salesGrade1 = slots.find((s) => s.jobClass === 'sales' && s.grade === 1);
    expect(salesGrade1?.owned.map((c) => c.id)).toEqual([3]);

    const devGrade1 = slots.find((s) => s.jobClass === 'dev' && s.grade === 1);
    expect(devGrade1?.owned).toEqual([]);
  });
});

describe('completeDeckTo15', () => {
  function pool(n: number, startId = 100): BattleCard[] {
    return Array.from({ length: n }, (_, i) =>
      buildCard({ id: startId + i, personId: startId + i, jobClass: 'dev', grade: 1, name: `P${i}`, company: 'Co' }),
    );
  }

  test('always returns exactly 15 cards', () => {
    expect(completeDeckTo15([], [])).toHaveLength(15);
    expect(completeDeckTo15([], pool(30))).toHaveLength(15);
  });

  test('keeps every selected card in the result', () => {
    const selected = pool(3, 1);

    const result = completeDeckTo15(selected, selected);

    for (const card of selected) {
      expect(result.some((c) => c.id === card.id)).toBe(true);
    }
  });

  test('fills the remainder from the pool, without duplicating a selected card, before padding with fillers', () => {
    const selected = pool(2, 1); // ids 1, 2
    const extraPool = [...selected, ...pool(20, 3)]; // ids 1,2 + 3..22

    const result = completeDeckTo15(selected, extraPool);

    const ids = result.map((c) => c.id);
    expect(new Set(ids).size).toBe(15); // no duplicate ids
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });

  test('pads with filler cards when the pool has too few extra cards', () => {
    const result = completeDeckTo15([], []);

    expect(result).toHaveLength(15);
  });

  test('does not mutate the selected or pool arrays', () => {
    const selected = pool(2, 1);
    const poolArr = pool(5, 3);
    const selectedCopy = [...selected];
    const poolCopy = [...poolArr];

    completeDeckTo15(selected, poolArr);

    expect(selected).toEqual(selectedCopy);
    expect(poolArr).toEqual(poolCopy);
  });
});
