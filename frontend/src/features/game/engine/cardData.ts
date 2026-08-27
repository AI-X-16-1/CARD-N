import type { BattleCard, JobClass, Skill, Stats } from './types';

export const BASE_STATS: Record<JobClass, Stats> = {
  dev: { atk: 7, def: 3, int: 7, hp: 8 },
  design: { atk: 4, def: 5, int: 9, hp: 8 },
  hr: { atk: 4, def: 5, int: 6, hp: 10 },
  finance: { atk: 4, def: 9, int: 6, hp: 8 },
  legal: { atk: 6, def: 8, int: 7, hp: 6 },
  marketing: { atk: 7, def: 3, int: 6, hp: 10 },
  sales: { atk: 9, def: 3, int: 4, hp: 10 },
  pm: { atk: 6, def: 6, int: 6, hp: 10 },
};

export const JOB_LABEL: Record<JobClass, string> = {
  dev: '개발팀',
  design: '디자이너',
  hr: '인사팀',
  finance: '재무팀',
  legal: '법무팀',
  marketing: '마케팅팀',
  sales: '영업팀',
  pm: '기획/PM',
};

export const SKILL: Record<JobClass, Skill> = {
  dev: { name: '핫픽스', cost: 2, description: '아군 전체 HP + ceil(INT/2) 회복' },
  design: {
    name: 'UI 개편',
    cost: 2,
    description: '적 필드에서 ATK가 가장 높은 카드의 ATK를 ceil(INT/2)만큼 감소',
  },
  hr: { name: '복지 포인트', cost: 2, description: '아군 전체 최대 HP +2 & 2 회복, 카드 1장 드로우' },
  finance: { name: '긴축 예산', cost: 2, description: '아군 전체 DEF +3 (영구)' },
  legal: { name: '소송', cost: 3, description: '적 히어로에게 INT만큼 직접 피해' },
  marketing: { name: '캠페인', cost: 2, description: '아군 전체 ATK +2 (영구)' },
  sales: { name: '콜드콜', cost: 3, description: '적 필드의 무작위 카드에게 INT+3 피해' },
  pm: { name: '로드맵', cost: 2, description: '카드 2장 드로우' },
};

export const PASSIVE: Record<JobClass, string> = {
  dev: '밤샘코딩',
  design: '디테일광',
  hr: '복지왕',
  finance: '짠돌이',
  legal: '빈틈없음',
  marketing: '트렌드세터',
  sales: '영업왕',
  pm: '일정관리',
};

export const FLAVOR_TEXT: Record<JobClass, string> = {
  dev: '오늘도 야근, 그래도 코드는 돌아간다',
  design: '픽셀 1개도 그냥 넘어가지 않는다',
  hr: '연차는 아끼는 게 아니라 쓰는 것',
  finance: '엑셀 한 줄로 예산을 지킨다',
  legal: '계약서 한 줄 한 줄이 무기',
  marketing: '트렌드는 내가 만든다',
  sales: '숫자로 증명하는 사람',
  pm: '일정표가 곧 인생',
};

export const JOB_CLASSES: JobClass[] = [
  'dev',
  'design',
  'hr',
  'finance',
  'legal',
  'marketing',
  'sales',
  'pm',
];

export const GRADES = [1, 2, 3, 4, 5, 6] as const;

// Grade & Multiplier by Position table from game-rules.md.
export const GRADE_TABLE: Record<number, { cost: number; multiplier: number }> = {
  1: { cost: 1, multiplier: 1.0 },
  2: { cost: 2, multiplier: 1.1 },
  3: { cost: 3, multiplier: 1.2 },
  4: { cost: 4, multiplier: 1.35 },
  5: { cost: 5, multiplier: 1.5 },
  6: { cost: 7, multiplier: 1.7 },
};

function scaleStats(base: Stats, multiplier: number): Stats {
  return {
    atk: Math.floor(base.atk * multiplier),
    def: Math.floor(base.def * multiplier),
    int: Math.floor(base.int * multiplier),
    hp: Math.floor(base.hp * multiplier),
  };
}

export function buildCard(params: {
  id: number;
  personId: number;
  jobClass: JobClass;
  grade: number;
  name: string;
  company: string;
}): BattleCard {
  const { id, personId, jobClass, grade, name, company } = params;
  const baseStats = BASE_STATS[jobClass];
  const { cost, multiplier } = GRADE_TABLE[grade];

  return {
    id,
    personId,
    name,
    company,
    jobClass,
    jobLabel: JOB_LABEL[jobClass],
    grade,
    cost,
    baseStats: { ...baseStats },
    finalStats: scaleStats(baseStats, multiplier),
    skill: SKILL[jobClass],
    passive: PASSIVE[jobClass],
    flavorText: FLAVOR_TEXT[jobClass],
  };
}
