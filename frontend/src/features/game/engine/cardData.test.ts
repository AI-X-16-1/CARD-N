import { buildCard, GRADE_TABLE } from './cardData';

describe('GRADE_TABLE', () => {
  test('matches the cost/multiplier table in game-rules.md', () => {
    expect(GRADE_TABLE).toEqual({
      1: { cost: 1, multiplier: 1.0 },
      2: { cost: 2, multiplier: 1.1 },
      3: { cost: 3, multiplier: 1.2 },
      4: { cost: 4, multiplier: 1.35 },
      5: { cost: 5, multiplier: 1.5 },
      6: { cost: 7, multiplier: 1.7 },
    });
  });
});

describe('buildCard', () => {
  test('matches the worked example: Marketing Team Manager -> ATK = floor(7 * 1.35) = 9', () => {
    const card = buildCard({ id: 1, personId: 1, jobClass: 'marketing', grade: 4, name: '홍길동', company: '카카오' });

    expect(card.finalStats.atk).toBe(9);
    expect(card.cost).toBe(4);
  });

  test('a grade-1 card has finalStats equal to its base stats (x1.0 multiplier)', () => {
    const card = buildCard({ id: 2, personId: 2, jobClass: 'dev', grade: 1, name: '김개발', company: '토스' });

    expect(card.finalStats).toEqual(card.baseStats);
    expect(card.cost).toBe(1);
  });

  test('floors fractional stats rather than rounding', () => {
    // hr base int = 6, grade 3 multiplier 1.2 -> 7.2 -> floors to 7
    const card = buildCard({ id: 3, personId: 3, jobClass: 'hr', grade: 3, name: '박인사', company: '네이버' });

    expect(card.finalStats.int).toBe(7);
  });

  test('carries through id, personId, name, company, and grade-6 cost/multiplier', () => {
    const card = buildCard({ id: 42, personId: 7, jobClass: 'sales', grade: 6, name: '이영업', company: '쿠팡' });

    expect(card.id).toBe(42);
    expect(card.personId).toBe(7);
    expect(card.name).toBe('이영업');
    expect(card.company).toBe('쿠팡');
    expect(card.grade).toBe(6);
    expect(card.cost).toBe(7);
    // sales base atk = 9, x1.7 -> 15.3 -> floors to 15
    expect(card.finalStats.atk).toBe(15);
  });

  test('attaches the job skill, passive, and flavor text', () => {
    const card = buildCard({ id: 4, personId: 4, jobClass: 'legal', grade: 2, name: '최법무', company: 'LG' });

    expect(card.skill.name).toBe('소송');
    expect(card.passive).toBe('빈틈없음');
    expect(card.flavorText.length).toBeGreaterThan(0);
  });
});
