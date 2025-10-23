// lib/session.ts
export type Sess = { runId: string | null; teamName: string | null };
const KEY = 'vopak_session';

function uuid() {
  return ([1e7] as any+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c:any) =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

export function getSession(): Sess {
  if (typeof window === 'undefined') return { runId: null, teamName: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { runId: null, teamName: null };
    return JSON.parse(raw);
  } catch {
    return { runId: null, teamName: null };
  }
}

export function setSession({ teamName }: { teamName: string }) {
  const prev = getSession();
  const runId = prev.runId ?? uuid();
  const payload: Sess = { runId, teamName };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}
