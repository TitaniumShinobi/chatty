import '../loadEnv.js';
import { performance } from 'node:perf_hooks';
import { loadCanonicalConstructIdentity } from '../lib/constructIdentityRepository.js';
import { resolveSupabaseUserIdFromEmailOrId } from '../lib/supabaseUserResolver.js';

const BUDGET_MS = Number(process.env.CHATTY_SMOKE_DETAIL_BUDGET_MS || 500);
const requestedUser = process.env.CHATTY_SMOKE_USER || '7e34f6b8-e33a-48b5-8ddb-95b94d18e296';

function printBudget(label, valueMs) {
  const ok = valueMs <= BUDGET_MS;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${valueMs.toFixed(1)}ms (budget ${BUDGET_MS}ms)`);
  return ok;
}

async function main() {
  const supabaseUserId = await resolveSupabaseUserIdFromEmailOrId(requestedUser);
  if (!supabaseUserId) {
    throw new Error(`Unable to resolve smoke user: ${requestedUser}`);
  }

  await loadCanonicalConstructIdentity({ constructId: 'nova-001', supabaseUserId });
  const started = performance.now();
  const nova = await loadCanonicalConstructIdentity({ constructId: 'nova-001', supabaseUserId });
  const elapsedMs = performance.now() - started;
  const variant = await loadCanonicalConstructIdentity({ constructId: 'gpt-nova-001-seed', supabaseUserId });
  const lin = await loadCanonicalConstructIdentity({ constructId: 'lin-001', supabaseUserId });

  console.log('\nSummary');
  console.log('-------');
  console.log(JSON.stringify({
    nova: {
      exists: nova.exists,
      constructId: nova.constructId,
      name: nova.name,
      avatar: Boolean(nova.avatarDescriptor),
      avatarFilename: nova.avatarDescriptor?.filename || null,
      sourceFiles: Object.keys(nova.sourceFiles),
    },
    variant: {
      exists: variant.exists,
      constructId: variant.constructId,
      name: variant.name,
    },
    lin: {
      exists: lin.exists,
      constructId: lin.constructId,
      name: lin.name,
    },
  }, null, 2));

  if (!nova.exists) throw new Error('nova-001 did not resolve canonically');
  if (variant.constructId !== 'nova-001') throw new Error('gpt-nova-001-seed did not normalize to nova-001');
  if (!lin.exists) throw new Error('lin-001 did not resolve canonically');
  if (!nova.name) throw new Error('nova-001 detail payload is missing name');
  if (Object.keys(nova.sourceFiles).includes('identity.bak.json')) {
    throw new Error('nova-001 runtime identity still includes identity.bak.json');
  }
  if (nova.avatarDescriptor && !String(nova.avatarDescriptor.filename || '').endsWith('/avatar.png')) {
    throw new Error(`nova-001 avatar is not canonical avatar.png (${nova.avatarDescriptor.filename})`);
  }
  if (!printBudget('canonical detail load', elapsedMs)) {
    throw new Error('canonical detail load exceeded latency budget');
  }

  console.log('\nPASS canonical:detail:smoke');
}

main().catch((error) => {
  console.error(`FAIL canonical:detail:smoke - ${error.message}`);
  process.exit(1);
});
