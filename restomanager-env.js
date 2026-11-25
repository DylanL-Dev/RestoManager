// RM-UX-L1 isolated V3 visual preview. Never use this file on MAIN or RestoManager-V3.
// Only the approved Render preview hostname may connect; always use Supabase DEV.
if (location.origin !== 'https://restomanager-v3-uxl1-preview.onrender.com') {
  throw new Error('Aperçu V3 : hébergement non autorisé, accès désactivé.');
}
export const supabaseEnvironment = Object.freeze({
  name: 'DEV',
  url: 'https://lykoybacslvmhtzftqsf.supabase.co',
  publishableKey: 'sb_publishable_JVFRbinEtzT2sJIjdF2asA_6q0VEw4b'
});
