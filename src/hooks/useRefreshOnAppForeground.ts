import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * 从后台回到前台且当前屏幕处于聚焦时，执行页面数据刷新（与下拉刷新逻辑一致，不展示 RefreshControl）。
 */
export function useRefreshOnAppForeground(
  onRefresh: () => void | Promise<void>,
  enabled = true,
) {
  const isFocused = useIsFocused();
  const isFocusedRef = useRef(isFocused);
  const onRefreshRef = useRef(onRefresh);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  isFocusedRef.current = isFocused;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const sub = AppState.addEventListener('change', (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      const cameToForeground =
        /inactive|background/.test(prevState) && nextState === 'active';
      if (cameToForeground && isFocusedRef.current) {
        void onRefreshRef.current();
      }
    });

    return () => sub.remove();
  }, [enabled]);
}
