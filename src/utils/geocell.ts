const GRID_SIZE = 0.005;

function roundToGrid(value: number) {
  const steps = Math.round(value / GRID_SIZE);
  const rounded = steps * GRID_SIZE;
  return Number(rounded.toFixed(3));
}

export function coordsToCellId(lat: number, lng: number) {
  const latCell = roundToGrid(lat);
  const lngCell = roundToGrid(lng);
  return `${latCell},${lngCell}`;
}

export function cellIdToCoords(cellId: string) {
  if (!cellId) return null;
  const [latStr, lngStr] = cellId.split(',');
  const lat = Number.parseFloat(latStr);
  const lng = Number.parseFloat(lngStr);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

export const paceGridSizeDegrees = GRID_SIZE;
