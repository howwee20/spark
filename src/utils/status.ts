export type LotStatus = 'empty' | 'filling' | 'tight' | 'full';

const STATUS_COLORS: Record<LotStatus, string> = {
  empty: '#22c55e',
  filling: '#facc15',
  tight: '#f97316',
  full: '#ef4444',
};

const DEFAULT_COLOR = '#9ca3af';

export function statusToColor(status: LotStatus | null | undefined): string {
  if (!status) {
    return DEFAULT_COLOR;
  }

  return STATUS_COLORS[status] ?? DEFAULT_COLOR;
}

export function statusToLabel(status: LotStatus | null | undefined): string {
  if (!status) {
    return 'Unknown';
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}
