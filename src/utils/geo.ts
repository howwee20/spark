export const MSU_REGION = {
  latitude: 42.727,
  longitude: -84.483,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const s1 = toRad(a.lat);
  const s2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(s1) * Math.cos(s2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const nowMs = () => Date.now();
