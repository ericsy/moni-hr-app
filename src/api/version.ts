import { apiRequest } from './client';

export type AppVersionCheckResult = {
  updateRequired: boolean;
  forceUpdate: boolean;
  latestVersion?: string | null;
  minVersion?: string | null;
  storeUrl?: string | null;
  releaseNotes?: string | null;
  promptToken?: string | null;
};

/** 版本信息由请求头 X-App-Version / X-App-Platform 携带，无需 query 参数 */
export function fetchAppVersionCheck() {
  return apiRequest<AppVersionCheckResult>('/api/v1/app/version-check', {
    auth: false,
  });
}
