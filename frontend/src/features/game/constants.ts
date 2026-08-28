import { colors } from '@/shared/theme';
import type { JobClass } from '@/features/game/engine/types';

export const JOB_COLOR: Record<JobClass, string> = {
  dev: colors.jobDev,
  design: colors.jobDesign,
  hr: colors.jobHr,
  finance: colors.jobFinance,
  legal: colors.jobLegal,
  marketing: colors.jobMarketing,
  sales: colors.jobSales,
  pm: colors.jobPm,
};

// Player-facing description of each role's always-on passive, for the card
// detail panel. Keyed by jobClass (passives are 1:1 with jobClass). The
// engine resolves the real effect; this is just how it reads in the UI.
export const PASSIVE_INFO: Record<JobClass, { name: string; effect: string }> = {
  dev: { name: '밤샘코딩', effect: '공격할 때 대상 방어력을 절반만 적용' },
  design: { name: '디테일광', effect: '이 카드를 공격한 적은 ATK가 영구 1 감소' },
  hr: { name: '복지왕', effect: '턴 시작 시 양옆 슬롯 아군 HP 1 회복' },
  finance: { name: '짠돌이', effect: '받는 피해 1 감소 (반격 포함, 최소 1)' },
  legal: { name: '빈틈없음', effect: '공격해도 반격 피해를 받지 않음' },
  marketing: { name: '트렌드세터', effect: '배치 시 다른 아군 전체 ATK +1 (영구)' },
  sales: { name: '영업왕', effect: '적 히어로를 공격하면 피해 +2' },
  pm: { name: '일정관리', effect: '턴 시작 시 핸드가 2장 이하면 카드 1장 드로우' },
};

// Korean display strings for the synergies the engine emits (keyed by the
// engine's English Synergy.name, which stays the stable identifier). Used
// for the field synergy pills and their tap-to-reveal tooltip, which shows
// both why the synergy is active (condition) and what it does (effect).
export const SYNERGY_INFO: Record<string, { name: string; condition: string; effect: string }> = {
  'GTM Team': { name: 'GTM 팀', condition: '마케팅팀 + 영업팀', effect: '아군 전체 ATK +2' },
  'Scrum Team': { name: '스크럼 팀', condition: '개발팀 + 디자이너 + 기획/PM', effect: '아군 전체 INT +3' },
  'New Hire Cohort': { name: '신입 기수', condition: '★2 이하 카드 3장 이상', effect: '아군 전체 ATK +2' },
};
