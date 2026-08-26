import axios from 'axios';
import { Platform } from 'react-native';

// Local dev only (no deployment): Android emulator reaches the host machine via 10.0.2.2.
const HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const apiClient = axios.create({
  baseURL: `http://${HOST}:8000/api/v1`,
  timeout: 10000,
});
