import { colors } from '@/shared/theme';

// Mirrors features/contacts/jobLabels.ts's JOB_COLORS/JOB_LABELS. Not imported directly
// since features/* -> features/* imports are forbidden (docs/architecture.md); this is
// the small subset Home's recent-contacts row needs.
const JOB_COLORS: Record<string, string> = {
  dev: colors.jobDev,
  design: colors.jobDesign,
  hr: colors.jobHr,
  finance: colors.jobFinance,
  legal: colors.jobLegal,
  marketing: colors.jobMarketing,
  sales: colors.jobSales,
  pm: colors.jobPm,
};

const JOB_LABELS: Record<string, string> = {
  dev: '개발',
  marketing: '마케팅',
  design: '디자인',
  hr: '인사',
  finance: '재무',
  legal: '법무',
  sales: '영업',
  pm: '기획',
};

export function jobColor(jobClass: string | null): string {
  return (jobClass && JOB_COLORS[jobClass]) || colors.textMuted;
}

export function jobLabel(jobClass: string | null): string {
  return (jobClass && JOB_LABELS[jobClass]) || '미분류';
}
