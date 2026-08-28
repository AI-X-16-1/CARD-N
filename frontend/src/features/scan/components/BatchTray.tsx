import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, typography } from '@/shared/theme';
import { jobLabel } from '@/shared/utils/jobTheme';

import type { BatchItem } from '../hooks/useBatchScan';

type Props = {
  items: BatchItem[];
  selectedCount: number;
  savingAll: boolean;
  onToggleSelected: (id: number) => void;
  onOpenEditor: (id: number) => void;
  onRemove: (id: number) => void;
  onSaveSelected: () => void;
};

function fieldValue(item: BatchItem, label: string): string | undefined {
  return item.fields.find((f) => f.label === label)?.value || undefined;
}

const STATUS_LABEL: Record<BatchItem['status'], string> = {
  analyzing: '분석 중',
  done: '완료',
  needs_review: '확인 필요',
  failed: '인식 실패',
};

const STATUS_COLOR: Record<BatchItem['status'], string> = {
  analyzing: colors.textMuted,
  done: colors.secondary,
  needs_review: colors.warning,
  failed: colors.textMuted,
};

function MiniCard({
  item,
  onToggleSelected,
  onOpenEditor,
  onRemove,
}: {
  item: BatchItem;
  onToggleSelected: (id: number) => void;
  onOpenEditor: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const name = fieldValue(item, 'Name');
  const title = fieldValue(item, 'Title');
  const initials = (name ?? '?').trim().slice(0, 2);
  // Nothing to review yet (still analyzing) or nothing recognized at all (outright OCR
  // failure) — tapping the card has nowhere useful to go, and the checkbox has no
  // fields to attach a saved contact to.
  const reviewable = item.status === 'done' || item.status === 'needs_review';

  return (
    <Pressable
      style={styles.card}
      onPress={() => reviewable && onOpenEditor(item.id)}
      disabled={!reviewable}
    >
      <Pressable style={styles.removeButton} onPress={() => onRemove(item.id)} hitSlop={8}>
        <Text style={styles.removeButtonLabel}>✕</Text>
      </Pressable>
      {reviewable && (
        <Pressable
          style={[styles.checkbox, item.selected && styles.checkboxChecked]}
          onPress={() => onToggleSelected(item.id)}
          hitSlop={8}
        >
          {item.selected && <Text style={styles.checkboxMark}>✓</Text>}
        </Pressable>
      )}
      <View style={styles.avatar}>
        <Text style={styles.avatarLabel}>{initials}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name ?? (item.status === 'analyzing' ? '분석 중…' : '이름 없음')}
      </Text>
      {reviewable && (
        <Text style={styles.role} numberOfLines={1}>
          {jobLabel(null)}
          {title ? ` · ${title}` : ''}
        </Text>
      )}
      <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
        {STATUS_LABEL[item.status]}
      </Text>
    </Pressable>
  );
}

export function BatchTray({
  items,
  selectedCount,
  savingAll,
  onToggleSelected,
  onOpenEditor,
  onRemove,
  onSaveSelected,
}: Props) {
  if (items.length === 0) return null;

  const disabled = selectedCount === 0 || savingAll;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>카드를 눌러 내용을 확인하고 수정하세요</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tray}>
        {items.map((item) => (
          <MiniCard
            key={item.id}
            item={item}
            onToggleSelected={onToggleSelected}
            onOpenEditor={onOpenEditor}
            onRemove={onRemove}
          />
        ))}
      </ScrollView>
      <Pressable style={[styles.saveButton, disabled && styles.saveButtonDisabled]} disabled={disabled} onPress={onSaveSelected}>
        <Text style={styles.saveButtonLabel}>
          {savingAll ? '저장 중…' : `선택한 ${selectedCount}장 저장`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  hint: {
    color: colors.textQuaternary,
    fontSize: 11,
  },
  tray: {
    flexGrow: 0,
  },
  card: {
    width: 84,
    backgroundColor: colors.surface1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 8,
    marginRight: 8,
    alignItems: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 1,
  },
  removeButtonLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  checkbox: {
    position: 'absolute',
    top: 4,
    left: 4,
    zIndex: 1,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarLabel: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '700',
  },
  name: {
    color: colors.textPrimary,
    fontSize: typography.meta.fontSize,
    fontWeight: '600',
    maxWidth: 72,
  },
  role: {
    color: colors.textQuaternary,
    fontSize: 10,
    maxWidth: 72,
    marginTop: 2,
  },
  status: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '700',
  },
});
