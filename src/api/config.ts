import Constants from 'expo-constants';

import {
  getApiBaseUrl,
  resolveAppEnv,
  type AppEnv,
} from '../../config/apiEnv.js';

type AppExtra = {
  appEnv?: string;
  apiBaseUrl?: string;
};

const extra = Constants.expoConfig?.extra as AppExtra | undefined;

export const APP_ENV: AppEnv = resolveAppEnv(extra?.appEnv);

/** 构建时写入 extra.apiBaseUrl；本地未配置时按 APP_ENV 回退 */
export const API_BASE_URL = extra?.apiBaseUrl ?? getApiBaseUrl(APP_ENV);
