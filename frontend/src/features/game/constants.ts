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

// Korean display strings for the synergies the engine emits (keyed by the
// engine's English Synergy.name, which stays the stable identifier). Used
// for the field synergy pills and their tap-to-reveal tooltip, which shows
// both why the synergy is active (condition) and what it does (effect).
export const SYNERGY_INFO: Record<string, { name: string; condition: string; effect: string }> = {
  'GTM Team': { name: 'GTM 팀', condition: '마케팅팀 + 영업팀', effect: '아군 전체 ATK +2' },
  'Scrum Team': { name: '스크럼 팀', condition: '개발팀 + 디자이너 + 기획/PM', effect: '아군 전체 INT +3' },
  'New Hire Cohort': { name: '신입 기수', condition: '★2 이하 카드 3장 이상', effect: '아군 전체 ATK +2' },
};
