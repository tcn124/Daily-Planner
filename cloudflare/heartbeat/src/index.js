/**
 * Keeps the free-tier Supabase project out of its ~7-day idle pause. Has to
 * run somewhere always-on — not the user's Mac, which may be shut for the
 * fortnight in question — hence a Worker with a Cron Trigger rather than
 * anything client-side. Reads the one row of `public.heartbeat`
 * (anon-readable, see the sync plan's Phase 4) so this is unambiguously
 * database activity.
 */
export default {
  async scheduled(event, env) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/heartbeat?select=id&limit=1`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
  },
};
