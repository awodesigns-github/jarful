/** "3 weeks ago", for the line above a revealed note. Calm, never a count of missed days. */
export function ageLabel(createdAt: number, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - createdAt) / 86_400_000));
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

export function dateLabel(createdAt: number): string {
  return new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
