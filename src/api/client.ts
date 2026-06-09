import { API_BASE_URL } from './config';
import type { ApiLang, ApiResult } from './types';
import { syncServerTimeFromHttpDateHeader } from '../utils/serverClock';

export class ApiError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function isApiSuccess(code: number): boolean {
  return code === 0 || code === 200;
}

export function isUnauthorized(httpStatus: number, apiCode?: number): boolean {
  return httpStatus === 401 || apiCode === 401;
}

/** AuthContext 映射为 i18n loginErrorInvalidResponse */
export const API_INVALID_RESPONSE = 'API_INVALID_RESPONSE';

let tokenGetter: () => string | null = () => null;
let langGetter: () => ApiLang = () => 'en';
let unauthorizedHandler: (() => void) | null = null;
let unauthorizedNotified = false;

export function configureApiClient(getToken: () => string | null, getLang: () => ApiLang) {
  tokenGetter = getToken;
  langGetter = getLang;
}

/** 401 时清除本地会话并跳转登录（由 AuthProvider 注册） */
export function configureUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

/** 登录成功后重置，允许下次再提示 */
export function resetUnauthorizedGuard() {
  unauthorizedNotified = false;
}

function shouldNotifyUnauthorized(options: RequestOptions): boolean {
  if (options.auth === false) return false;
  return !!tokenGetter();
}

function notifyUnauthorized(options: RequestOptions) {
  if (!shouldNotifyUnauthorized(options)) return;
  if (unauthorizedNotified) return;
  unauthorizedNotified = true;
  unauthorizedHandler?.();
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** 默认 true；登录等接口传 false */
  auth?: boolean;
  /** 排班等接口要求的当前门店 id（X-Store-Id） */
  storeId?: string | number;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, storeId } = options;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Lang': langGetter(),
  };

  if (storeId != null && String(storeId).trim() !== '') {
    headers['X-Store-Id'] = String(storeId);
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const token = tokenGetter();
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const dateHeader = res.headers.get('date') ?? res.headers.get('Date');
  syncServerTimeFromHttpDateHeader(dateHeader);

  const raw = await res.text();
  let json: ApiResult<T> | null = null;
  try {
    json = JSON.parse(raw) as ApiResult<T>;
  } catch {
    if (isUnauthorized(res.status)) {
      notifyUnauthorized(options);
      throw new ApiError(401, 'Unauthorized');
    }
    throw new ApiError(res.status, API_INVALID_RESPONSE);
  }

  if (json && !isApiSuccess(json.code)) {
    if (isUnauthorized(res.status, json.code)) {
      notifyUnauthorized(options);
      throw new ApiError(401, json.message || 'Unauthorized');
    }
    throw new ApiError(json.code, json.message || 'Request failed');
  }

  if (isUnauthorized(res.status)) {
    notifyUnauthorized(options);
    throw new ApiError(401, json?.message || 'Unauthorized');
  }

  return json!.data;
}
