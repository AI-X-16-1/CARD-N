// The real client pulls in axios + react-native, which this bare jest config
// can't transform; toBattleCard is pure and needs none of it.
jest.mock('@/shared/api/client', () => ({ apiClient: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));

import { toBattleCard } from './api';

describe('toBattleCard', () => {
  const apiCard = {
    id: 10,
    person_id: 3,
    name: '홍길동',
    company: '카카오',
    job_class: 'marketing',
    job_label: '마케팅팀',
    grade: 4,
    grade_label: '부장/팀장',
    stars: 4,
    cost: 4,
    base_stats: { atk: 7, def: 3, int: 6, hp: 10 },
    final_stats: { atk: 9, def: 4, int: 8, hp: 13 },
    skill: { name: '캠페인', cost: 2, description: '아군 전체 ATK +2 (영구)' },
    passive: '트렌드세터',
    flavor_text: '트렌드는 내가 만든다',
    created_at: '2026-08-27T00:00:00Z',
  };

  test('maps the snake_case wire shape onto the camelCase BattleCard', () => {
    expect(toBattleCard(apiCard)).toEqual({
      id: 10,
      personId: 3,
      name: '홍길동',
      company: '카카오',
      jobClass: 'marketing',
      jobLabel: '마케팅팀',
      grade: 4,
      cost: 4,
      baseStats: { atk: 7, def: 3, int: 6, hp: 10 },
      finalStats: { atk: 9, def: 4, int: 8, hp: 13 },
      skill: { name: '캠페인', cost: 2, description: '아군 전체 ATK +2 (영구)' },
      passive: '트렌드세터',
      flavorText: '트렌드는 내가 만든다',
    });
  });

  test('falls back to an empty company string when the person has none', () => {
    expect(toBattleCard({ ...apiCard, company: null }).company).toBe('');
  });
});
