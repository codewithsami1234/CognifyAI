export const colors = {
  background: '#f4f1ea',
  card: '#ffffff',
  ink: '#1c1915',
  muted: '#5c564e',
  line: '#c4b8a5',
  accent: '#1f4d3a',
  accentSoft: '#e7f0ea',
  warn: '#8a4b08',
  warnSoft: '#f8efe3',
  danger: '#7a2e2e',
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'Unknown';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(iso: string): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return iso;
  }
  return new Date(parsed).toLocaleString();
}

export function createLocalId(prefix: string): string {
  const random = Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
