/**
 * Minimal provider routing helper with transient-failure fallback.
 */

/** @typedef {'openrouter' | 'openai'} Provider */
const PRIMARY = (process.env.PRIMARY_PROVIDER) || 'openrouter';
const FALLBACK = (process.env.FALLBACK_PROVIDER) || 'openai';

/**
 * @param {*} err
 * @returns {boolean}
 */
function isTransient(err) {
  const s = String(err || '');
  return /429|5\d\d|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH/i.test(s);
}

/**
 * @param {*} payload
 * @param {(payload: any) => Promise<any>} callOpenRouter
 * @param {(payload: any) => Promise<any>} callOpenAI
 */
export async function routedCompletion(payload, callOpenRouter, callOpenAI) {
  let provider = /** @type {Provider} */ (PRIMARY);

  try {
    return await (provider === 'openrouter' ? callOpenRouter(payload) : callOpenAI(payload));
  } catch (err) {
    if (!isTransient(err)) throw err;

    const backup = /** @type {Provider} */ (provider === 'openrouter' ? FALLBACK : PRIMARY);
    if (backup === provider) throw err;

    console.warn('[provider] transient error on', provider, '→ fallback', backup, 'err=', String(err));
    return await (backup === 'openrouter' ? callOpenRouter(payload) : callOpenAI(payload));
  }
}
