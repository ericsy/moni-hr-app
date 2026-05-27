import { Alert } from 'react-native';

import i18n from '../i18n';

let alertVisible = false;

/** 401 登录失效：按当前 i18n 语言弹窗，确认后执行 onConfirm（通常清除会话） */
export function showSessionExpiredAlert(onConfirm: () => void) {
  if (alertVisible) return;
  alertVisible = true;

  Alert.alert(
    i18n.t('sessionExpiredTitle'),
    i18n.t('sessionExpiredMessage'),
    [
      {
        text: i18n.t('sessionExpiredOk'),
        onPress: () => {
          alertVisible = false;
          onConfirm();
        },
      },
    ],
    { cancelable: false },
  );
}

export function resetSessionExpiredAlert() {
  alertVisible = false;
}
