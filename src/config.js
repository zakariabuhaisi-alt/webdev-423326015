// Reads configuration from environment variables, once, at start-up.
// In production the app REFUSES TO START without the secrets it needs: a server that
// starts anyway and fails on the first request is much harder to diagnose.
function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const missing = [];
  const need = (name, devDefault) => {
    if (env[name]) return env[name];
    if (production || devDefault === undefined) missing.push(name);
    return devDefault;
  };

  const config = {
    production,
    port: Number(env.PORT) || 3000,
    databaseUrl: production ? need('DATABASE_URL') : env.DATABASE_URL || '',
    sessionSecret: need('SESSION_SECRET', 'dev-only-secret-change-me'),
    publicBaseUrl: (env.PUBLIC_BASE_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/$/, ''),
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
    },
  };
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See .env.example.`);
  }
  if (config.sessionSecret.length < 16) {
    throw new Error('SESSION_SECRET must be at least 16 characters long.');
  }
  return config;
}

module.exports = { loadConfig };
