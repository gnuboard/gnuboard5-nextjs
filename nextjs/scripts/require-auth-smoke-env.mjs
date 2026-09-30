const loginId = process.env.LOCAL_SMOKE_LOGIN_ID || process.env.E2E_LOGIN_ID || '';
const loginPassword = process.env.LOCAL_SMOKE_LOGIN_PASSWORD || process.env.E2E_LOGIN_PASSWORD || '';

if (!loginId || !loginPassword) {
  console.error(
    '[require-auth-smoke-env] Set LOCAL_SMOKE_LOGIN_ID and LOCAL_SMOKE_LOGIN_PASSWORD ' +
      'or E2E_LOGIN_ID and E2E_LOGIN_PASSWORD before running release auth smoke.'
  );
  process.exit(1);
}

console.log('[require-auth-smoke-env] auth smoke credentials are configured');
