import { useCallback, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

export type OcrField = {
  label: string;
  value: string;
  confidence: number;
};

export type OcrResult = {
  fields: OcrField[];
  raw_text: string;
};

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'done'; result: OcrResult }
  | { status: 'error'; message: string };

export function useOcrScan() {
  const [state, setState] = useState<ScanState>({ status: 'idle' });

  const scan = useCallback(async (photoUri: string) => {
    setState({ status: 'scanning' });
    try {
      const form = new FormData();
      form.append('image', {
        uri: photoUri,
        name: 'card.jpg',
        type: 'image/jpeg',
      } as unknown as Blob);

      const response = await axios.post<OcrResult>(`${API_BASE_URL}/scan/ocr`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setState({ status: 'done', result: response.data });
      return response.data;
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.detail ?? error.message)
        : '알 수 없는 오류가 발생했어요';
      setState({ status: 'error', message });
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
