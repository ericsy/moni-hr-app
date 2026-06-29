import { apiRequest } from './client';
import type {
  AppAccountLookup,
  AppActivationRequest,
  AppActivationSendCode,
  AppActivationSendCodeRequest,
  AppPasswordResetRequest,
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

/** POST /api/v1/app/auth/lookup — 登录前预检邮箱是否存在、是否已激活 */
export function lookupAccountByEmail(body: AppActivationSendCodeRequest) {
  return apiRequest<AppAccountLookup>('/api/v1/app/auth/lookup', {
    method: 'POST',
    auth: false,
    body,
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

/** POST /api/v1/app/auth/password-reset/send-code — 向已激活员工邮箱发送 4 位重置验证码 */
export function sendPasswordResetCode(body: AppActivationSendCodeRequest) {
  return apiRequest<AppActivationSendCode>('/api/v1/app/auth/password-reset/send-code', {
    method: 'POST',
    auth: false,
    body,
  });
}

/** POST /api/v1/app/auth/password-reset/confirm — 验证码 + 新密码重置 */
export function confirmPasswordReset(body: AppPasswordResetRequest) {
  return apiRequest<null>('/api/v1/app/auth/password-reset/confirm', {
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

export function fetchCurrentEmployee(storeId?: string | number) {
  return apiRequest<AppEmployeeUser>('/api/v1/app/auth/me', {
    storeId,
  });
}

/** 更新 App 最近选用门店（PUT /api/v1/app/auth/last-store） */
export function updateLastStore(storeId: number) {
  return apiRequest<null>('/api/v1/app/auth/last-store', {
    method: 'PUT',
    body: { storeId },
    storeId,
  });
}

/** 员工修改登录密码 PUT /api/v1/app/auth/password（Bearer + X-Lang） */
export function changeEmployeePassword(body: AppChangePasswordRequest) {
  return apiRequest<null>('/api/v1/app/auth/password', {
    method: 'PUT',
    body,
  });
}
