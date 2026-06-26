/** @type {'dev' | 'test' | 'pro'} */
const API_URL_BY_ENV = {
  dev: 'https://dev-api.monihr.com',
  test: 'https://test-api.monihr.com',
  pro: 'https://api.monihr.com',
};

/** @param {string | undefined} raw */
function resolveAppEnv(raw) {
  if (raw === 'dev' || raw === 'test' || raw === 'pro') return raw;
  return 'dev';
}

/** @param {'dev' | 'test' | 'pro'} env */
function getApiBaseUrl(env) {
  return API_URL_BY_ENV[env];
}

/** @param {'dev' | 'test' | 'pro'} env @param {string} [baseName] */
function appDisplayName(env, baseName = 'Moni HR') {
  if (env === 'pro') return baseName;
  return env === 'dev' ? `${baseName} Dev` : `${baseName} Test`;
}

module.exports = {
  API_URL_BY_ENV,
  resolveAppEnv,
  getApiBaseUrl,
  appDisplayName,
};
