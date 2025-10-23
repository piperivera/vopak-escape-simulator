// app/play/phishing/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { saveStationResult } from '@/lib/game';
import MissionDialog from '@/components/MissionDialog';
import { generateKeyPart } from '@/lib/keys';

/* ----- Pool de mensajes tipo correo ----- */
const ITEMS_POOL = [
  { id: '1', from: 'recursos@empresa.local', subject: 'Aviso de HR: actualiza tu contraseña', snippet: 'Por favor actualiza tu contraseña en el portal oficial para mantener tu cuenta activa.', label: 'safe' },
  { id: '2', from: 'soporte@segur-ity.com', subject: 'Tu cuenta será desactivada hoy', snippet: 'Verifica aquí: bit.ly/seguridad-123 — acción requerida inmediatamente.', label: 'phish' },
  { id: '3', from: 'cliente@empresa.com', subject: 'Reunión confirmada', snippet: 'Reunión confirmada con el cliente. Adjunté agenda en el drive.', label: 'safe' },
  { id: '4', from: 'facturas@descarga.local', subject: 'Factura pendiente', snippet: 'Factura pendiente. Descarga el .exe para ver el detalle.', label: 'phish' },
  { id: '5', from: 'it@empresa.local', subject: 'Mantenimiento programado', snippet: 'IT: mantenimiento programado el sábado 9pm.', label: 'safe' },
  { id: '6', from: 'promo@premios.xyz', subject: 'Has ganado un premio', snippet: 'Has ganado un premio. Ingresa tu tarjeta para reclamarlo.', label: 'phish' },
  { id: '7', from: 'no-reply@sharepoint.local', subject: 'Acceso requerido', snippet: 'SharePoint pide volver a iniciar sesión, usa la app corporativa.', label: 'safe' },
  { id: '8', from: 'alert@seguridad.ru', subject: 'Verifica tu cuenta', snippet: 'Verifica tu cuenta aquí: http://seguridad-miempresa.ru', label: 'phish' },
  { id: '9', from: 'soporte@antivirus.local', subject: 'Actualización antivirus', snippet: 'Actualización del antivirus llegará automáticamente.', label: 'safe' },
  { id: '10', from: 'helpdesk@externo.local', subject: 'Solicitud de credenciales', snippet: 'Envía tu usuario y contraseña por correo para soporte rápido.', label: 'phish' },
  { id: '11', from: 'infra@empresa.local', subject: 'Nuevo acceso remoto aprobado', snippet: 'Nuevo acceso remoto aprobado. Revisa la IP.', label: 'phish' },
  { id: '12', from: 'cobros@portal.local', subject: 'Actualice su método de pago', snippet: 'Notificación: actualice su método de pago en el portal oficial.', label: 'phish' },
  { id: '13', from: 'equipo@empresa.local', subject: 'Reporte de actividad', snippet: 'Equipo: reporte de actividad completada. Gracias.', label: 'safe' },
  { id: '14', from: 'alertas@security.local', subject: 'Archivo sospechoso detectado', snippet: 'Alerta: se detectó archivo sospechoso adjunto.', label: 'phish' },
  { id: '15', from: 'agenda@empresa.local', subject: 'Recordatorio de junta', snippet: 'Recordatorio: junta de proyecto mañana 09:00.', label: 'safe' },
];

/* ----- funciones auxiliares ----- */
function hashStringToSeed(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle<T>(arr: T[], seedNum: number) {
  const a = arr.slice();
  const rand = mulberry32(seedNum);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pickNFromPool<T extends { id: string }>(pool: T[], n: number, seedStr?: string) {
  const seed = seedStr ? hashStringToSeed(seedStr) : Math.floor(Math.random() * 2 ** 31);
  return seededShuffle(pool, seed).slice(0, n);
}

/* ----- parámetros del juego ----- */
const CARDS_PER_RUN = 10;
const MAX_SCORE = 200;
const TARGET_SEC = 60;
const HARD_LIMIT_SEC = 0; // desactivado (no corta el juego)
const PENALTY_START_SEC = 180; // 3 min
const PENALTY_PER_10SEC = 2; // resta 2 puntos cada 10 s después de 3 min

export default function PhishingPage() {
  const router = useRouter();
  const { runId } = getSession();

  useEffect(() => { if (!runId) router.push('/'); }, [runId, router]);

  const initialItems = useMemo(() => {
    const seedKey = runId ?? 'fallback';
    return pickNFromPool([...ITEMS_POOL], CARDS_PER_RUN, seedKey);
  }, [runId]);

  const [pool, setPool] = useState(() => initialItems.map(i => i.id));
  const [safe, setSafe] = useState<string[]>([]);
  const [phish, setPhish] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [missionMessage, setMissionMessage] = useState('');
  const [keyPart, setKeyPart] = useState<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);

  /* ----- timer y vibración ----- */
  const startTs = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const penaltyNotified = useRef(false);

  useEffect(() => {
    startTs.current = Date.now();
    const t = setInterval(() => {
      const e = Math.floor((Date.now() - startTs.current) / 1000);
      setElapsed(e);

      if (e > PENALTY_START_SEC && !penaltyNotified.current) {
        penaltyNotified.current = true;
        if (navigator.vibrate) navigator.vibrate(200);
      }

      if (HARD_LIMIT_SEC && e >= HARD_LIMIT_SEC) void finish();
    }, 250);
    return () => clearInterval(t);
  }, []);

  /* ----- drag & drop ----- */
  const onDragStart = (id: string) => setDragId(id);
  const animateThen = (id: string | null, cb?: () => void) => {
    if (!id) { cb?.(); return; }
    setAnimatingId(id);
    setTimeout(() => { setAnimatingId(null); cb?.(); }, 200);
  };
  const moveTo = (target: 'pool' | 'safe' | 'phish') => {
    if (!dragId) return;
    const id = dragId;
    animateThen(id, () => {
      setPool(p => p.filter(x => x !== id));
      setSafe(p => p.filter(x => x !== id));
      setPhish(p => p.filter(x => x !== id));
      if (target === 'pool') setPool(p => [...p, id]);
      if (target === 'safe') setSafe(p => [...p, id]);
      if (target === 'phish') setPhish(p => [...p, id]);
      setDragId(null);
      setSelected(null);
    });
  };

  /* ----- selección táctil ----- */
  const markSelectedAs = (target: 'pool' | 'safe' | 'phish') => {
    if (!selected) return;
    const id = selected;
    animateThen(id, () => {
      setPool(p => p.filter(x => x !== id));
      setSafe(p => p.filter(x => x !== id));
      setPhish(p => p.filter(x => x !== id));
      if (target === 'pool') setPool(p => [...p, id]);
      if (target === 'safe') setSafe(p => [...p, id]);
      if (target === 'phish') setPhish(p => [...p, id]);
      setSelected(null);
    });
  };

  const remaining = pool.length;
  const byId = useMemo(() => Object.fromEntries(initialItems.map(i => [i.id, i] as const)), [initialItems]);
  const allPlaced = remaining === 0;

  /* ----- cálculo del score ----- */
  let ok = 0, bad = 0;
  for (const id of safe) ok += byId[id]?.label === 'safe' ? 1 : 0, bad += byId[id]?.label !== 'safe' ? 1 : 0;
  for (const id of phish) ok += byId[id]?.label === 'phish' ? 1 : 0, bad += byId[id]?.label !== 'phish' ? 1 : 0;
  bad += remaining;

  const baseScore = Math.round((ok / CARDS_PER_RUN) * MAX_SCORE);
  const penaltyMistakes = bad * 5;
  const timePenalty = elapsed > PENALTY_START_SEC ? Math.floor((elapsed - PENALTY_START_SEC) / 10) * PENALTY_PER_10SEC : 0;
  const finalScore = Math.max(0, baseScore - penaltyMistakes - timePenalty);

  /* ----- guardar resultado ----- */
  async function finish() {
    if (!runId || saving) return;
    setSaving(true);
    const part = generateKeyPart(4);
    try {
      await saveStationResult({
        runId,
        stationKey: 'phishing',
        mode: 'web',
        score: finalScore,
        meta: { elapsed_sec: elapsed, correct: ok, mistakes: bad, breakdown: { baseScore, penaltyMistakes, timePenalty, finalScore }, key_part: part },
      });
      setKeyPart(part);
      setMissionMessage(`Buen trabajo detectando phishing.\n\n🔐 Parte de la LLAVE MAESTRA: ${part}`);
      setOpenDialog(true);
    } catch (e: any) { alert(e?.message ?? 'Error guardando resultado'); } 
    finally { setSaving(false); }
  }

  /* ----- componentes UI ----- */
  const Card = ({ id }: { id: string }) => {
    const item = byId[id];
    if (!item) return null;
    const isSelected = selected === id;
    const isAnimating = animatingId === id;
    return (
      <div
        draggable
        onDragStart={() => onDragStart(id)}
        onClick={() => setSelected(s => (s === id ? null : id))}
        className={`p-4 border rounded bg-white/5 hover:bg-white/10 cursor-grab select-none transition-all duration-200 shadow-sm ${
          isSelected ? 'ring-2 ring-blue-500' : ''
        } ${isAnimating ? 'translate-y-2 opacity-70 scale-95' : ''}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs opacity-70">{item.from}</div>
            <div className="text-sm font-semibold mt-1">{item.subject}</div>
            <div className="text-sm mt-2">{item.snippet}</div>
          </div>
          <div className="text-xs opacity-50 ml-2">{id.padStart(2, '0')}</div>
        </div>
      </div>
    );
  };

  const Zone = ({ label, onDrop, children }: { label: string; onDrop: () => void; children: React.ReactNode }) => (
    <div onDragOver={e => e.preventDefault()} onDrop={onDrop} className="min-h-[260px] border-2 border-dashed rounded p-3 space-y-2">
      <div className="text-sm opacity-70">{label}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );

  const timerBgClass = elapsed > PENALTY_START_SEC ? 'bg-red-700' : (elapsed <= TARGET_SEC ? 'bg-green-700' : 'bg-amber-700');
  const timeDisplay = elapsed <= PENALTY_START_SEC
    ? `sin penalización (hasta ${PENALTY_START_SEC}s)`
    : `−${timePenalty} pts (desde ${PENALTY_START_SEC}s, −${PENALTY_PER_10SEC} cada 10s)`;

  return (
    <main className="p-4 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg md:text-xl font-bold">Phishing — Clasifica rápido</h1>
          <p className="text-xs opacity-70">Penalización comienza a los {PENALTY_START_SEC}s</p>
        </div>
        <div className={`text-sm px-3 py-1 rounded flex items-center gap-2 ${timerBgClass}`}>
          <span>⏱ {elapsed}s</span>
          {elapsed > PENALTY_START_SEC && <span className="text-xs opacity-90">Tiempo extra: penalización activa</span>}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Zone label={`Bandeja (${pool.length})`} onDrop={() => moveTo('pool')}>
          {pool.map(id => <Card key={`pool-${id}`} id={id} />)}
        </Zone>
        <Zone label="Seguro" onDrop={() => moveTo('safe')}>
          {safe.map(id => <Card key={`safe-${id}`} id={id} />)}
        </Zone>
        <Zone label="Phishing" onDrop={() => moveTo('phish')}>
          {phish.map(id => <Card key={`phish-${id}`} id={id} />)}
        </Zone>
      </section>

      <section className="border rounded p-4 flex flex-wrap items-center gap-4">
        <div><div className="text-sm opacity-70">Progreso</div><div>{CARDS_PER_RUN - remaining}/{CARDS_PER_RUN}</div></div>
        <div>
          <div className="text-sm opacity-70">Puntaje</div>
          <div className="text-2xl font-bold">{finalScore} pts</div>
          <div className="text-xs opacity-70">Base {baseScore} − errores {penaltyMistakes} · {timeDisplay}</div>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="underline" onClick={() => (window.location.href = `/play?ts=${Date.now()}`)}>Salir</button>
          <button disabled={saving} onClick={finish} className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-50">
            {saving ? 'Guardando…' : allPlaced ? 'Finalizar y guardar' : 'Finalizar (parcial)'}
          </button>
        </div>
      </section>

      {/* barra táctil inferior */}
      <div className="md:hidden fixed left-0 right-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
        <div className="max-w-5xl mx-auto flex gap-2">
          <button onClick={() => markSelectedAs('safe')} disabled={!selected} className="flex-1 bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-40">Seguro</button>
          <button onClick={() => markSelectedAs('phish')} disabled={!selected} className="flex-1 bg-red-600 text-white rounded px-3 py-2 disabled:opacity-40">Phishing</button>
          <button onClick={() => markSelectedAs('pool')} disabled={!selected} className="bg-gray-600 text-white rounded px-3 py-2 disabled:opacity-40">Restaurar</button>
        </div>
        <div className="text-xs text-center mt-2 opacity-60">Toca un mensaje y usa los botones para clasificar.</div>
      </div>

      <MissionDialog open={openDialog} onOpenChange={setOpenDialog} title="🛰 Misión completada: Phishing" message={missionMessage} copyText={keyPart ?? undefined} />
    </main>
  );
}
