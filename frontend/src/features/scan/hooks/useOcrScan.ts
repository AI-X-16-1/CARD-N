import { useCallback, useState } from 'react';
import axios from 'axios';
import { Platform } from 'react-native';

import { apiClient } from '@/shared/api/client';

export type OcrField = {
  label: string;
  value: string;
  confidence: number;
};

export type OcrResult = {
  fields: OcrField[];
  raw_text: string;
  // A staging token for the corrected card image (app/core/image_store.py) — pass this
  // through to createPerson() to actually keep the picture. null if the pipeline
  // couldn't produce one for this photo.
  image_token: string | null;
};

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: OcrResult }
  | { status: 'error'; message: string };

// Mirrors ui-spec.md §3-2's >=90% split — the field-type accuracy figures backing it
// live server-side (backend/app/features/scan/service.py's FIELD_CONFIDENCE), this is
// just where the UI threshold lives. Shared so OcrFieldList (single mode) and
// useBatchScan (batch mode) apply the exact same rule.
export const CONFIDENCE_THRESHOLD = 0.9;

// FastAPI's default validation error shape is { detail: string | { loc, msg, type }[] } —
// on web in particular a malformed request (e.g. a bad multipart file part) surfaces the
// array form, which must never be handed to <Text> as-is (React can't render an object).
// Exported so callers (e.g. ScanCameraScreen's save flow) don't reimplement this and drift.
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => item?.msg ?? String(item)).join(', ');
    }
    return error.message;
  }
  return '알 수 없는 오류가 발생했어요';
}

// Like Home's cold-start retry: the backend may still be coming up right after an app/
// Docker restart. Only retry when the request never reached the server at all (no
// `response` — connection refused / timed out) — a real 4xx/5xx from the server is a
// genuine failure and should surface immediately, not get silently retried.
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function isConnectionError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

async function postOcrWithRetry(form: FormData) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await apiClient.post<OcrResult>('/scan/ocr', form, { timeout: 60000 });
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isConnectionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

// The actual upload, shared by single-shot scan() below and useBatchScan (which tracks
// per-shot status itself instead of a single ScanState) — kept out of the hook so batch
// mode isn't forced to reuse a state machine built for exactly one in-flight scan.
export async function uploadForOcr(photoUri: string): Promise<OcrResult> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // Browsers don't understand RN's { uri, name, type } shorthand below, so build a
    // real Blob from the camera's blob: URL instead.
    const photoBlob = await (await fetch(photoUri)).blob();
    form.append('image', photoBlob, 'card.jpg');
  } else {
    // RN's FormData/networking bridge expects this shape for a file part — it maps it
    // to native blob storage internally. A W3C-style Blob (e.g. from expo-blob or
    // fetch().blob()) isn't recognized the same way and silently fails to reach the
    // server at all (surfaces as a bare axios "Network Error", no request in the logs).
    form.append('image', {
      uri: photoUri,
      name: 'card.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  // No explicit Content-Type here: a multipart boundary must be generated per-request,
  // and hardcoding 'multipart/form-data' without one produces a malformed body that
  // fails before any HTTP response comes back (surfaces as a generic network error).
  // Longer timeout than apiClient's default 10s: OCR inference on a full-size photo
  // (plus PaddleOCR's one-time model warmup on a cold backend) can run past that.
  const response = await postOcrWithRetry(form);
  return response.data;
}

export function useOcrScan() {
  const [state, setState] = useState<ScanState>({ status: 'idle' });

  const scan = useCallback(async (photoUri: string) => {
    setState({ status: 'scanning' });
    try {
      const result = await uploadForOcr(photoUri);
      setState({ status: 'done', result });
      return result;
    } catch (error) {
      setState({ status: 'error', message: extractErrorMessage(error) });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return {
    state,
    isScanning: state.status === 'scanning',
    scan,
    reset,
  };
}
