

Goal
- Add a Supabase client configured from env.
- Add a util to persist a stable device_id (UUID v4 in AsyncStorage).

Files
- src/lib/supabase.ts
- src/utils/device.ts

Details
- src/lib/supabase.ts:
  - export `supabase` from `createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!)`.
  - Throw clear error if env missing.
- src/utils/device.ts:
  - async `getDeviceId()`: read AsyncStorage key `spark:device_id`; if missing, generate uuid v4, persist, return.

Acceptance
- `import { supabase } from '@/lib/supabase'` works.
- `await getDeviceId()` returns same id across restarts.
