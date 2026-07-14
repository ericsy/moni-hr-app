import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import {
  cancelDutyLocalNotification,
  configureForegroundNotificationHandler,
  dutyLocalNotificationId,
} from '../notifications/dutyPush';

function extractDutyInstanceId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const id = r.instanceId ?? r.dutyInstanceId;
  return id != null && String(id) ? String(id) : null;
}

/** 前台展示策略 + 点击通知回到排班页；远端到达时取消同 id 本地预约。 */
export function DutyPushBootstrap() {
  useEffect(() => {
    configureForegroundNotificationHandler();

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const id = extractDutyInstanceId(notification.request.content.data);
      if (id) {
        void cancelDutyLocalNotification(id);
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      const id = extractDutyInstanceId(data);
      if (id) {
        void Notifications.cancelScheduledNotificationAsync(dutyLocalNotificationId(id)).catch(
          () => undefined,
        );
      }
      try {
        router.push('/(main)/(tabs)/schedule');
      } catch {
        // ignore navigation race before root ready
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return null;
}
