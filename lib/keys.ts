// lib/keys.ts
export function generateKeyPart(len = 4) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/I/1
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
