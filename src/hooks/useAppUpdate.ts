import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { fetchAppVersionCheck, type AppVersionCheckResult } from '../api/version';

const DISMISS_STORAGE_KEY = 'moni-hr-update-dismissed-v1';

export type AppUpdateState = {
  visible: boolean;
  forceUpdate: boolean;
  latestVersion?: string;
  releaseNotes?: string;
  storeUrl?: string;
  promptToken?: string;
};

async function isPromptDismissed(token: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return !!map[token];
  } catch {
    return false;
  }
}

async function markPromptDismissed(token: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_STORAGE_KEY);
    let map: Record<string, boolean> = {};
    if (raw) {
      try {
        map = JSON.parse(raw) as Record<string, boolean>;
      } catch {
        map = {};
      }
    }
    map[token] = true;
    await AsyncStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function mapCheckToState(result: AppVersionCheckResult): AppUpdateState | null {
  if (!result.updateRequired) return null;
  if (!result.forceUpdate && result.promptToken) {
    return {
      visible: true,
      forceUpdate: false,
      latestVersion: result.latestVersion ?? undefined,
      releaseNotes: result.releaseNotes ?? undefined,
      storeUrl: result.storeUrl ?? undefined,
      promptToken: result.promptToken ?? undefined,
    };
  }
  return {
    visible: true,
    forceUpdate: !!result.forceUpdate,
    latestVersion: result.latestVersion ?? undefined,
    releaseNotes: result.releaseNotes ?? undefined,
    storeUrl: result.storeUrl ?? undefined,
    promptToken: result.promptToken ?? undefined,
  };
}

export function useAppUpdate() {
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const checkingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkForUpdate = useCallback(async () => {
    if (checkingRef.current) return;
    if (updateState?.forceUpdate) return;
    checkingRef.current = true;
    try {
      const result = await fetchAppVersionCheck();
      if (!result.updateRequired) {
        setUpdateState(null);
        return;
      }
      if (!result.forceUpdate && result.promptToken) {
        const dismissed = await isPromptDismissed(result.promptToken);
        if (dismissed) {
          setUpdateState(null);
          return;
        }
      }
      setUpdateState(mapCheckToState(result));
    } catch {
      // 网络失败不阻断使用
      setUpdateState(null);
    } finally {
      checkingRef.current = false;
    }
  }, [updateState?.forceUpdate]);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const cameToForeground = /inactive|background/.test(prev) && nextState === 'active';
      if (cameToForeground) {
        void checkForUpdate();
      }
    });
    return () => sub.remove();
  }, [checkForUpdate]);

  const openStore = useCallback(async () => {
    const url = updateState?.storeUrl?.trim();
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch {
      // ignore
    }
  }, [updateState?.storeUrl]);

  const dismissOptional = useCallback(async () => {
    if (!updateState || updateState.forceUpdate) return;
    if (updateState.promptToken) {
      await markPromptDismissed(updateState.promptToken);
    }
    setUpdateState(null);
  }, [updateState]);

  return {
    updateState,
    openStore,
    dismissOptional,
    recheck: checkForUpdate,
  };
}
