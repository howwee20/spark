export type LotStatus = 'empty' | 'filling' | 'tight' | 'full';

const STATUS_COLORS: Record<LotStatus, string> = {
  empty: '#2ecc71',
  filling: '#f1c40f',
  tight: '#e67e22',
  full: '#e74c3c',
};

const DEFAULT_COLOR = '#7f8c8d';

export function getStatusColor(status: LotStatus | null | undefined) {
  if (!status) {
    return DEFAULT_COLOR;
  }

  return STATUS_COLORS[status];
}

export function getStatusLabel(status: LotStatus) {
  switch (status) {
    case 'empty':
      return 'Empty';
    case 'filling':
      return 'Filling';
    case 'tight':
      return 'Tight';
    case 'full':
      return 'Full';
    default:
      return status;
  }
}
