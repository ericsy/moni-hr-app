import AsyncStorage from '@react-native-async-storage/async-storage';

const REMEMBER_LOGIN_KEY = 'moni-hr-remember-login-v1';

type RememberLoginPayload = {
  remember: boolean;
  email: string;
  password: string;
};

export async function loadRememberLogin(): Promise<RememberLoginPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(REMEMBER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberLoginPayload;
    if (!parsed.remember || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRememberLogin(email: string, password: string) {
  const payload: RememberLoginPayload = {
    remember: true,
    email: email.trim(),
    password,
  };
  await AsyncStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify(payload));
}

export async function clearRememberLogin() {
  await AsyncStorage.removeItem(REMEMBER_LOGIN_KEY);
}
