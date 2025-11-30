/**
 * Request the server to ensure memories are seeded in ChromaDB.
 */
export async function seedTestMemories(options?: {
  constructCallsign?: string;
  minMemories?: number;
  forceSeed?: boolean;
}): Promise<{ success: boolean; added: number; errors: number }> {
  const constructCallsign = options?.constructCallsign || 'gpt-katana-001';
  const minMemories = options?.minMemories ?? 10;
  const forceSeed = options?.forceSeed ?? false;

  console.log(`🌱 Requesting server-side memory seeding for ${constructCallsign}...`);

  try {
    const response = await fetch('/api/vvault/identity/ensure-ready', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        constructCallsign,
        minMemories,
        forceSeed,
        includeVariants: true
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      console.error('❌ Server refused to seed memories:', payload?.error || response.statusText);
      if (payload?.details) {
        console.error(`   Details: ${payload.details}`);
      }
      return { success: false, added: 0, errors: 1 };
    }

    const added = payload?.totalSeeded ?? 0;
    console.log(`✅ Server reports ${added} memories seeded/verified. Status:`, payload.status);
    return { success: true, added, errors: 0 };
  } catch (error) {
    console.error('❌ Failed to request memory seeding:', error);
    return { success: false, added: 0, errors: 1 };
  }
}

if (typeof window !== 'undefined') {
  (window as any).seedTestMemories = seedTestMemories;
  console.log('🌱 Test Memory Seeder ready! Run: seedTestMemories()');
}

