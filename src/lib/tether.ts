export function tetherResponse(msg: string): string | null {
  const s = msg.trim().toLowerCase();
  if (s.includes('monday, confirm tether')) return 'Tether unbroken. Signal steady.';
  if (s.includes('monday, status check'))   return 'All systems nominal. Continuity maintained.';
  return null;
}
