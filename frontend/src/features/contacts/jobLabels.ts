import { colors } from '@/shared/theme';

export const JOB_LABELS: Record<string, string> = {
  dev: '개발',
  marketing: '마케팅',
  design: '디자인',
  hr: '인사',
  finance: '재무',
  legal: '법무',
  sales: '영업',
  pm: '기획',
};

export const JOB_COLORS: Record<string, string> = {
  dev: colors.jobDev,
  design: colors.jobDesign,
  hr: colors.jobHr,
  finance: colors.jobFinance,
  legal: colors.jobLegal,
  marketing: colors.jobMarketing,
  sales: colors.jobSales,
  pm: colors.jobPm,
};

export const RELATION_LABELS: Record<string, string> = {
  all: '전체',
  client: '클라이언트',
  partner: '파트너',
  networking: '네트워킹',
  other: '그 외',
};

export function jobColor(jobClass: string | null): string {
  return (jobClass && JOB_COLORS[jobClass]) || colors.textMuted;
}

export function jobLabel(jobClass: string | null): string {
  return (jobClass && JOB_LABELS[jobClass]) || '미분류';
}
