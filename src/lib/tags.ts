export const GENRE_OPTIONS = [
  'bollywood', 'hindi', 'punjabi', 'tamil', 'telugu', 'malayalam', 'kannada', 'marathi', 'bengali',
  'rock', 'pop', 'english', 'japanese', 'korean', 'spanish',
  'classical', 'devotional', 'ghazal', 'folk', 'sufi',
  'rap', 'hip-hop', 'r&b', 'soul',
  'electronic', 'edm', 'lo-fi', 'ambient',
  'jazz', 'blues', 'country',
  'indie', 'alternative', 'metal', 'punk',
  'reggaeton', 'latin', 'acoustic', 'foreign'
] as const;

export const YEAR_OPTIONS = [
  'New (2020s)',
  'Recent (2010s)',
  'Classic (2000s)',
  'Retro (90s)',
  'Old School (80s)',
  'Vintage (70s & earlier)',
  'Unknown'
] as const;

export function yearToEraValue(raw: string): string {
  if (raw.startsWith('New')) return '2020s';
  if (raw.startsWith('Recent')) return '2010s';
  if (raw.startsWith('Classic')) return '2000s';
  if (raw.startsWith('Retro')) return '1990s';
  if (raw.startsWith('Old School')) return '1980s';
  if (raw.startsWith('Vintage')) return '1970s';
  if (raw === 'Unknown') return '';
  return raw;
}

export function eraToDisplayValue(raw: string): string {
  if (!raw) return '';
  if (raw === '2020s') return 'New (2020s)';
  if (raw === '2010s') return 'Recent (2010s)';
  if (raw === '2000s') return 'Classic (2000s)';
  if (raw === '1990s') return 'Retro (90s)';
  if (raw === '1980s') return 'Old School (80s)';
  if (raw === '1970s' || raw === 'before') return 'Vintage (70s & earlier)';
  return raw;
}

/** Capitalize the first letter of a genre/tag for display (values are stored lowercase). */
export function formatGenre(g: string): string {
  if (!g) return '';
  return g.charAt(0).toUpperCase() + g.slice(1);
}