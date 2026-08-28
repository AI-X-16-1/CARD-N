import { useCallback, useRef, useState } from 'react';

import { createPerson, parseOcrFields } from '@/features/scan/api';

import { CONFIDENCE_THRESHOLD, extractErrorMessage, uploadForOcr, type OcrField } from './useOcrScan';

export type BatchItemStatus = 'analyzing' | 'done' | 'needs_review' | 'failed';

export type BatchItem = {
  id: number;
  // Kept so BatchItemEditor can show the shot next to its fields, same as
  // ScanResultPanel does for single mode.
  photoUri: string;
  status: BatchItemStatus;
  fields: OcrField[];
  context: string;
  // Whether this shot is included in the next "선택한 N장 저장" — the user drives this
  // directly (checkbox on the tray card), not an automatic done/needs_review split.
  // Defaults to hasName() once OCR settles (see addShot/updateItem) so a clean batch
  // needs no extra taps, but reviewing or editing a card never forces it either way.
  selected: boolean;
  errorMessage?: string;
};

export function hasName(fields: OcrField[]): boolean {
  return fields.some((f) => f.label === 'Name' && f.value.trim().length > 0);
}

export function needsReview(fields: OcrField[]): boolean {
  return fields.some((f) => f.confidence < CONFIDENCE_THRESHOLD);
}

export function useBatchScan() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [savingAll, setSavingAll] = useState(false);
  const nextId = useRef(0);

  // Fire-and-forget: the shutter can be pressed again immediately (see
  // ScanCameraScreen), so each shot's OCR call resolves independently into its own
  // tray slot instead of queuing behind the previous one.
  const addShot = useCallback((photoUri: string) => {
    const id = nextId.current++;
    setItems((prev) => [
      ...prev,
      { id, photoUri, status: 'analyzing', fields: [], context: '', selected: false },
    ]);

    uploadForOcr(photoUri)
      .then((result) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: needsReview(result.fields) ? 'needs_review' : 'done',
                  fields: result.fields,
                  selected: hasName(result.fields),
                }
              : item
          )
        );
      })
      .catch((error) => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'failed', errorMessage: extractErrorMessage(error) }
              : item
          )
        );
      });
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toggleSelected = useCallback((id: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id && item.status !== 'analyzing' && item.status !== 'failed'
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  }, []);

  // Applied when the user finishes reviewing/correcting one card in BatchItemEditor.
  // Status is re-derived from the edited fields (the edit may have fixed exactly what
  // made it "needs_review", or added the name that was missing), and selection resets
  // to hasName() so confirming an edit is enough to include it — the checkbox is still
  // there afterward if the user wants to uncheck it.
  const updateItem = useCallback((id: number, fields: OcrField[], context: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              fields,
              context,
              status: needsReview(fields) ? 'needs_review' : 'done',
              selected: hasName(fields),
            }
          : item
      )
    );
  }, []);

  const reset = useCallback(() => {
    setItems([]);
    setSavingAll(false);
  }, []);

  const selectedCount = items.filter((item) => item.selected).length;

  // Saves every checked shot — sequential, not parallel, so a slow/cold backend doesn't
  // get hit with N concurrent contact-creation requests at once.
  const saveSelected = useCallback(async () => {
    const selected = items.filter((item) => item.selected);
    if (selected.length === 0) return { saved: 0, skipped: items.length };

    setSavingAll(true);
    let saved = 0;
    for (const item of selected) {
      try {
        const parsed = await parseOcrFields(item.fields, item.context || undefined);
        await createPerson(parsed);
        saved += 1;
      } catch {
        // Batch mode has no automatic retry — leave it in the tray as "failed" so the
        // skipped count in the summary alert has something concrete behind it, instead
        // of silently dropping a card the user thought was saved.
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'failed', errorMessage: '저장 실패' } : i))
        );
      }
    }
    setSavingAll(false);
    return { saved, skipped: items.length - saved };
  }, [items]);

  return {
    items,
    savingAll,
    selectedCount,
    addShot,
    removeItem,
    toggleSelected,
    updateItem,
    saveSelected,
    reset,
  };
}
