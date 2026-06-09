import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';
import { appDisplayName, getApiBaseUrl, resolveAppEnv } from './config/apiEnv.js';

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = resolveAppEnv(process.env.APP_ENV);
  const base = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...base,
    name: appDisplayName(appEnv, base.name ?? 'Moni HR'),
    extra: {
      ...(base.extra ?? {}),
      appEnv,
      apiBaseUrl: getApiBaseUrl(appEnv),
    },
  };
};
