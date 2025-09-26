
Goal
- On marker tap, open a sheet/modal:
  - Lot name
  - 4 big buttons: Empty, Filling, Tight, Full
- On submit:
  - Get GPS (expo-location), block if >150m from lot centroid (toast).
  - Enforce 20-min cooldown per lot/device (AsyncStorage key `spark:cooldown:<lot_id>`).
  - Insert into `lot_status_reports` {lot_id, status, device_id, lat, lng}.
  - Optimistically update marker.

Files
- src/components/LotSheet.tsx
- src/utils/geo.ts (haversine/withinRadius)
- Integrate with MapScreen.

Acceptance
- Out-of-radius blocked with message.
- Cooldown prevents second submit within 20 min (shows remaining mm:ss).
- Valid submit updates color immediately.
