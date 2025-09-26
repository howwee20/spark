

Goal
- Replace starter screen with a Map that:
  1) Fetches `select l.id,l.name,l.lat,l.lng,c.status,c.confidence from lots l left join lot_current c on c.lot_id=l.id`.
  2) Renders markers (react-native-maps) centered on MSU.
  3) Colors: null=gray, empty=green, filling=yellow, tight=orange, full=red.
  4) Draws a halo (Circle/marker style) scaled by `confidence` [0..1].

Files
- App.tsx (or Expo Router entry) mounting MapScreen
- src/screens/MapScreen.tsx
- src/utils/statusColor.ts

Details
- Center: {lat: 42.727, lng: -84.483}, delta ~0.03.
- Show ActivityIndicator until data loads.

Acceptance
- App launches to map with ~15 lots drawn, smooth pan/zoom.
