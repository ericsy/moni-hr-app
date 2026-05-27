/**
 * 用「服务端时刻 + performance.now 单调间隔」推算当前时间，减轻用户手动改系统时间
 * 导致的打卡按钮/「今天」判断错误。需在成功 API 响应后刷新锚点（见 apiRequest Date 头）。
 *
 * 与「门店时区」的关系：HTTP Date / punchedAt 均为绝对时刻（UTC 毫秒），与设备 Date.now()
 * 比较可发现本机系统时间是否严重跑偏；各店当地日历仍应由接口返回的门店时区字段驱动（若有）。
 */

type Anchor = { serverMs: number; perfMs: number };

let anchor: Anchor | null = null;

/** 与服务器时间相差超过此值则提示用户检查本机时间（毫秒） */
const CLOCK_SKEW_WARN_MS = 2 * 60 * 1000;

let warnedThisSession = false;

type ClockSkewHandler = (skewMs: number) => void;

let clockSkewHandler: ClockSkewHandler | null = null;

/** 由 AuthProvider 注册，用于弹窗提示（登出时 handler 可保留，锚点会清） */
export function setClockSkewWarningHandler(handler: ClockSkewHandler | null): void {
  clockSkewHandler = handler;
}

/** 登出或清会话时调用：清除锚点并允许下次登录再次提示时间偏差 */
export function resetServerClockState(): void {
  anchor = null;
  warnedThisSession = false;
}

function perfNow(): number {
  const p = globalThis.performance?.now;
  if (typeof p === 'function') return p.call(globalThis.performance);
  return Date.now();
}

function maybeNotifyClockSkew(serverMs: number, deviceWallMs: number): void {
  const skewMs = serverMs - deviceWallMs;
  if (Math.abs(skewMs) < CLOCK_SKEW_WARN_MS) return;
  if (warnedThisSession) return;
  warnedThisSession = true;
  const h = clockSkewHandler;
  if (!h) return;
  setTimeout(() => {
    h(skewMs);
  }, 0);
}

/** 用服务端给出的 Unix 毫秒时间刷新锚点，并检测设备 wall clock 是否与服务器大致一致 */
export function syncServerTimeFromMillis(serverMs: number): void {
  const deviceWallMs = Date.now();
  anchor = { serverMs, perfMs: perfNow() };
  maybeNotifyClockSkew(serverMs, deviceWallMs);
}

/** 解析 HTTP `Date` 响应头（RFC 7231） */
export function syncServerTimeFromHttpDateHeader(headerValue: string | null | undefined): void {
  if (headerValue == null || headerValue === '') return;
  const ms = Date.parse(headerValue);
  if (!Number.isFinite(ms)) return;
  syncServerTimeFromMillis(ms);
}

/**
 * 用于 UI（打卡时间窗、「今天」日期键等）。无锚点时回退设备时间。
 * 锚点存在后，与 `Date.now()` 篡改解耦，仅依赖单调时钟与上次同步误差。
 */
export function getApproximateServerNowDate(): Date {
  if (!anchor) return new Date();
  return new Date(anchor.serverMs + (perfNow() - anchor.perfMs));
}
