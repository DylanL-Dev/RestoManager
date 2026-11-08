# V3 full clone — Supabase migration plan

Source: `feature/refonte-service-responsive-v3` (unaltered production UI).
Development branch: `feature/v3-supabase-full-clone`.
Full clone preview: https://restomanager-v3-clone-complet.onrender.com (currently deployed from official branch, not yet connected to Supabase).
Existing Supabase proof-of-concept remains on `feature/supabase-auth-realtime-v3`.

## Non-negotiable data safety rules
- Supabase is the **only authoritative source** for shared reservations, room/table states and booking history after cutover.
- Keep a local **read-only last-known-good cache** (prefer IndexedDB; localStorage only for small non-sensitive preferences). Show the time of the last confirmed sync and a clear offline/stale-data warning.
- Do not use localStorage as a second independently writable reservation database. Never silently upload old local reservations over newer server data.
- Offline mode phase 1: read-only. Disable creating/editing/releasing bookings until connected and authenticated. Offline writes require a later explicit conflict-resolution protocol.
- Keep encrypted, independently stored, access-controlled database backups with scheduled restore tests. Browser caches are not backups.
- Minimize cached guest data and clear it on logout or account changes. Never cache credentials, access tokens in custom app storage, or service-role keys.
- Existing service worker must be reviewed to ensure no stale scripts, auth responses or reservation API data are cached unsafely.

## Migration sequence
1. Confirm full V3 visual and functional parity on a standalone Render clone (completed deploy, user acceptance pending).
2. Switch the test deployment to this branch without changing the official V3.
3. Bring over the existing Supabase auth/bridge implementation and test role-based access, while preserving all V3 HTML/CSS/Lucide resources.
4. Inventory every localStorage read/write and replace shared-state operations with authenticated Supabase reads and atomic RPCs.
5. Add an IndexedDB snapshot cache of non-sensitive/minimized service data, with stale-state indicator and offline read-only gate.
6. Integrate F&B alert bell, multi-device Realtime refresh, table conflict tests and safe logout.
7. Configure actual independent database backups and perform a restoration rehearsal.
8. Only after acceptance tests and explicit user approval, merge into the official V3 branch.

**Status:** planning only; this document does not claim any cache, backup or Supabase integration is implemented.
