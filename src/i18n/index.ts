import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './resources';

const deviceLng = Localization.getLocales()[0]?.languageCode ?? 'en';
const initialLng = deviceLng.startsWith('zh') ? 'zh' : 'en';

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export function setAppLanguage(lng: 'en' | 'zh') {
  void i18n.changeLanguage(lng);
}

export default i18n;
