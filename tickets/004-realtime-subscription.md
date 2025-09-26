
Goal
- Subscribe to Postgres changes on `lot_current` and update markers live.
- If socket drops, poll the join query every 20s until reconnected.

Files
- src/hooks/useRealtimeLots.ts (hook used by MapScreen)

Details
- Channel: `supabase.channel('public:lot_current')` with `postgres_changes` table=lot_current event='*'.
- Update in-memory list by lot_id on messages.

Acceptance
- Two devices: submit on A updates B in <500ms when connected.
- If network toggled, polling refreshes within 20s.
