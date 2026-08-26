import axios from 'axios';
import { Platform } from 'react-native';

// Local dev only (no deployment). EXPO_PUBLIC_API_URL (see .env.local) is required for a
// physical device, which must reach the host machine's LAN IP — neither `localhost` nor
// the Android-emulator-only `10.0.2.2` resolve to the dev machine from a real phone.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEFAULT_BASE_URL = `http://${HOST}:8000/api/v1`;

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL,
  timeout: 10000,
});
