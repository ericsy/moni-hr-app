import { apiRequest } from './client';

export type AppPushRegisterBody = {
  expoPushToken: string;
  platform?: 'ios' | 'android' | string;
  deviceId?: string;
  locale?: 'en' | 'zh' | string;
};

export function registerPushDevice(body: AppPushRegisterBody) {
  return apiRequest<{ registered: boolean }>('/api/v1/app/push/register', {
    method: 'POST',
    body,
  });
}

export function unregisterPushDevice(expoPushToken?: string | null) {
  return apiRequest<{ unregistered: boolean }>('/api/v1/app/push/unregister', {
    method: 'POST',
    body: expoPushToken ? { expoPushToken } : {},
  });
}
