import { apiRequest } from './client';
import type {
  AppActivationRequest,
  AppActivationSendCode,
  AppActivationSendCodeRequest,
  AppChangePasswordRequest,
  AppEmployeeUser,
  AppLoginResult,
} from './types';

export function loginWithEmail(email: string, password: string) {
  return apiRequest<AppLoginResult>('/api/v1/app/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
}

/** POST /api/v1/app/auth/activation/send-code — 向未激活员工邮箱发送 4 位验证码 */
export function sendActivationCode(body: AppActivationSendCodeRequest) {
  return apiRequest<AppActivationSendCode>('/api/v1/app/auth/activation/send-code', {
    method: 'POST',
    auth: false,
    body,
  });
}

/** POST /api/v1/app/auth/activation/activate — 验证码 + 密码激活，返回与 login 相同 */
export function activateEmployeeAccount(body: AppActivationRequest) {
  return apiRequest<AppLoginResult>('/api/v1/app/auth/activation/activate', {
    method: 'POST',
    auth: false,
    body,
  });
}

export function logoutSession() {
  return apiRequest<null>('/api/v1/app/auth/logout', {
    method: 'POST',
  });
}

export function fetchCurrentEmployee() {
  return apiRequest<AppEmployeeUser>('/api/v1/app/auth/me');
}

/** 更新 App 最近选用门店（PUT /api/v1/app/auth/last-store） */
export function updateLastStore(storeId: number) {
  return apiRequest<null>('/api/v1/app/auth/last-store', {
    method: 'PUT',
    body: { storeId },
  });
}

/** 员工修改登录密码 PUT /api/v1/app/auth/password（Bearer + X-Lang） */
export function changeEmployeePassword(body: AppChangePasswordRequest) {
  return apiRequest<null>('/api/v1/app/auth/password', {
    method: 'PUT',
    body,
  });
}
