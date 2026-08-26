import { buildBackendUrls, JarvisApiClient } from '@jarvis/api-client';

const urls = buildBackendUrls(process.env.EXPO_PUBLIC_JARVIS_BACKEND_URL ?? 'http://127.0.0.1:8000');

export const jarvisApi = new JarvisApiClient({ baseUrl: urls.httpUrl });
export const jarvisBackendUrls = urls;

