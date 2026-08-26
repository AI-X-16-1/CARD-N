import { colors } from '@/shared/theme';

// design-tokens.md "Job Theme Colors" — applied to graph nodes, avatar rings, badges,
// and card borders.
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

export const JOB_LABELS: Record<string, string> = {
  dev: '개발',
  design: '디자인',
  hr: '인사',
  finance: '재무',
  legal: '법무',
  marketing: '마케팅',
  sales: '영업',
  pm: '기획',
};

export function jobColor(jobClass: string | null | undefined): string {
  return (jobClass && JOB_COLORS[jobClass]) || colors.textMuted;
}

export function jobLabel(jobClass: string | null | undefined): string {
  return (jobClass && JOB_LABELS[jobClass]) || '미분류';
}
