'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { getSession } from '@/lib/session';
import { generateKeyPart } from '@/lib/keys';
import { ensureRun } from '@/lib/game';

type Station = {
  station_key: string;
  title: string;
  max_score: number;
  order_index: number;
};
type Result = Record<string, { mode: 'presencial' | 'web'; score: number; keyPart?: string }>;

const NORM = (s: string) => String(s ?? '').toLowerCase().trim();
const ASCII = (s: string) => NORM(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const POSTER_BY_KEY: Record<string, string> = {
  phishing: '/posters/estacion-1.png',
  passwords: '/posters/estacion-2.png',
  firewall: '/posters/estacion-3.png',
  drones: '/posters/estacion-4.png',
  control: '/posters/estacion-5.png',
  master_reset: '/posters/estacion-6.png',
};

function resolveKey(results: Result, rawKey: string): string | null {
  const k = NORM(rawKey);
  if (results[k]) return k;
  if (k.endsWith('s') && results[k.slice(0, -1)]) return k.slice(0, -1);
  if (!k.endsWith('s') && results[k + 's']) return k + 's';
  const noDash = k.replace(/[-_]+/g, '');
  for (const rKey of Object.keys(results)) {
    if (rKey.replace(/[-_]+/g, '') === noDash) return rKey;
  }
  return null;
}

export default function Play() {
  const [stations, setStations] = useState<Station[]>([]);
  const [results, setResults] = useState<Result>({});
  const [loading, setLoading] = useState(true);

  const s = getSession();
  const runId = s.runId ?? null;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [openPoster, setOpenPoster] = useState(false);
  const [selected, setSelected] = useState<Station | null>(null);

  // 🔴 Penalización solo visual en PUNTOS (no BD). Se acumula de 25 en 25.
  const [penaltyPoints, setPenaltyPoints] = useState<number>(0);

  const openStation = (st: Station) => {
    const kResolved = resolveKey(results, st.station_key);
    const done = kResolved ? results[kResolved] : undefined;
    if (done?.keyPart) {
      navigator.clipboard
        .writeText(done.keyPart)
        .then(() => alert(`Parte de la LLAVE MAESTRA copiada: ${done.keyPart}`))
        .catch(() => alert(`Parte de la LLAVE MAESTRA: ${done.keyPart} (cópiala manualmente)`));
      return;
    }
    setSelected(st);
    setOpenPoster(true);
  };

  const loadAll = async () => {
    if (!runId) return;
    setLoading(true);

    try { await ensureRun(runId, s.teamName || 'Equipo sin nombre'); } catch {}

    const { data: defs } = await supabase
      .from('station_defs')
      .select('station_key,title,max_score,order_index')
      .order('order_index', { ascending: true });

    // Por si hubiera algo llamado penalty/penalización en defs, se oculta de la UI.
    const filtered = (defs ?? []).filter(st => {
      const t = ASCII(st.title);
      const k = ASCII(st.station_key);
      const isPenalty =
        t.includes('penalizacion') || t.includes('penalidad') || t.includes('penalty') ||
        k.includes('penalizacion') || k.includes('penalidad') || k.includes('penalty');
      return !isPenalty;
    });
    setStations(filtered);

    const { data: rows } = await supabase
      .from('station_results')
      .select('station_key, mode, score, meta, created_at')
      .eq('run_id', runId);

    const best: Result = {};
    for (const r of rows ?? []) {
      const key = NORM(r.station_key);
      const score = Number(r.score ?? 0) || 0;
      const mode = (r.mode as 'web' | 'presencial') ?? 'web';
      const keyPart = (r as any)?.meta?.key_part || undefined;
      if (!best[key] || score > best[key]!.score) best[key] = { mode, score, keyPart };
    }
    setResults(best);
    setLoading(false);
  };

  useEffect(() => {
    if (!runId) { window.location.href = '/'; return; }
    loadAll();

    const onFocus = () => loadAll();
    const onVis = () => { if (document.visibilityState === 'visible') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);

    channelRef.current = supabase
      .channel(`sr-${runId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'station_results', filter: `run_id=eq.${runId}` },
        () => loadAll()
      )
      .subscribe();

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, s.teamName]);

  // ---- Totales (Master Reset SÍ suma)
  const totalMax = useMemo(
    () => stations.reduce((a, st) => a + (Number(st.max_score) || 0), 0),
    [stations]
  );

  const totalScore = useMemo(
    () => stations.reduce((sum, st) => {
      const k = resolveKey(results, st.station_key);
      const sc = k ? results[k]?.score ?? 0 : 0;
      return sum + (Number(sc) || 0);
    }, 0),
    [stations, results]
  );

  // Aplicar penalización visual en PUNTOS
  const totalScoreVisual = Math.max(0, totalScore - penaltyPoints);

  // Porcentaje a partir del score visual
  const energyPct = totalMax
    ? Math.max(0, Math.min(100, Math.round((totalScoreVisual / totalMax) * 100)))
    : 0;

  const save = async (station_key: string, mode: 'presencial' | 'web', score: number, meta?: any) => {
    if (!runId) return;
    try {
      const payload: any = { run_id: runId, station_key, mode, score };
      if (meta) payload.meta = meta;

      const { data, error } = await supabase
        .from('station_results')
        .upsert(payload, { onConflict: 'run_id,station_key' })
        .select('station_key, mode, score, meta')
        .single();
      if (error) throw error;

      const canonical = resolveKey(results, data.station_key) ?? NORM(data.station_key);
      setResults(prev => ({
        ...prev,
        [canonical]: {
          mode: data.mode as 'web' | 'presencial',
          score: Number(data.score ?? 0) || 0,
          keyPart: data?.meta?.key_part || prev[canonical]?.keyPart,
        },
      }));

      const kp = data?.meta?.key_part as string | undefined;
      if (kp) {
        try { await navigator.clipboard.writeText(kp); alert(`Parte de la LLAVE MAESTRA copiada: ${kp}`); }
        catch { alert(`Parte de la LLAVE MAESTRA: ${kp} (cópiala manualmente)`); }
      }
    } catch (e: any) {
      alert(e?.message ?? 'Error guardando resultado');
    }
  };

  const playWeb = (st: Station) => {
    const key = NORM(st.station_key);
    if (key === 'phishing')  return void (window.location.href = '/play/phishing');
    if (key === 'passwords') return void (window.location.href = '/play/passwords');
    if (key === 'firewall')  return void (window.location.href = '/play/firewall');
    if (key === 'drones' || key === 'drone') return void (window.location.href = '/play/drones');
    if (key === 'control')   return void (window.location.href = '/play/control');
    if (key === 'master_reset') return void (window.location.href = '/play/master-reset');
    console.warn('Ruta web no encontrada para', st.station_key);
  };

  if (loading) return <main className="p-8">Cargando…</main>;

  return (
    <main className="p-8 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Equipo: {s.teamName}</h1>
        <Link className="underline" href="/leaderboard">Ver Top 3</Link>
      </header>

      {/* Bloque Energía */}
      <div>
        <div className="text-sm mb-1">
          Energía de la nave: {totalScoreVisual}/{totalMax} ({energyPct}%)
        </div>
        <div className="h-3 w-full bg-gray-700 rounded">
          <div className="h-3 bg-green-500 rounded" style={{ width: `${energyPct}%` }} />
        </div>
        <div className="text-xs opacity-70 mt-1">
          <br />
          * El botón rojo resta 25 puntos a la barra de de energía.
        </div>

        {/* 🔴 Botón debajo de la barra: resta 25 puntos (sin revertir) */}
        <div className="mt-3">
          <button
            className="bg-red-600 text-white rounded px-3 py-2"
            onClick={() => setPenaltyPoints(p => p + 25)}
            title="Resta 25 puntos del marcador mostrado"
          >
            Falta / penalización (−25 pts)
          </button>
          {penaltyPoints > 0 && (
            <span className="ml-3 text-sm opacity-80">Penalización aplicada: −{penaltyPoints} pts</span>
          )}
        </div>
      </div>

      <section className="space-y-4">
        {stations.map((st) => {
          const kResolved = resolveKey(results, st.station_key);
          const done = kResolved ? results[kResolved] : undefined;

          const hint = done?.keyPart
            ? 'Toca para copiar la parte de la llave'
            : 'Toca para ver detalles';

          return (
            <button
              key={st.station_key}
              className="w-full text-left border rounded p-4 space-y-3 hover:bg-white/5 transition"
              onClick={() => openStation(st)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{st.title}</div>
                  <div className="text-xs opacity-70">Máximo: {st.max_score}</div>
                </div>

                {done ? (
                  <div className="text-sm">
                    ✅ Completada ({done.mode}) — {done.score} pts
                  </div>
                ) : (
                  <div className="text-sm opacity-70">{hint}</div>
                )}
              </div>

              {!!done?.keyPart && (
                <div className="border rounded p-3 bg-white/5 flex items-center justify-between">
                  <div className="text-sm">
                    🔐 Parte de la LLAVE MAESTRA:&nbsp;<b>{done.keyPart}</b>
                  </div>
                  <span className="text-xs opacity-80">Toca para copiar</span>
                </div>
              )}
            </button>
          );
        })}
      </section>

      {/* Modal Cartel */}
      {openPoster && selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog" aria-modal="true"
          onClick={() => setOpenPoster(false)}
        >
          <div
            className="relative w-full max-w-xl bg-zinc-900 rounded-2xl overflow-hidden border border-white/10"
            onClick={(e) => e.stopPropagation()}
            style={{ transform: 'scale(0.6)', transformOrigin: 'center' }}
          >
            <div className="relative w-full aspect-[3/5] bg-black">
              {POSTER_BY_KEY[NORM(selected.station_key)] ? (
                <Image
                  src={POSTER_BY_KEY[NORM(selected.station_key)]}
                  alt={selected.title}
                  fill
                  className="object-contain"
                  priority
                />
              ) : (
                <div className="p-6 text-center">{selected.title}</div>
              )}
            </div>

            <div className="p-4 flex flex-wrap items-center gap-3 justify-between">
              <div className="text-sm opacity-80">{selected.title}</div>
              <div className="flex gap-2">
                <button
                  className="bg-purple-600 text-white rounded px-3 py-2"
                  onClick={() => { setOpenPoster(false); playWeb(selected); }}
                >
                  Jugar (Web)
                </button>
                <PresencialButton
                  st={selected}
                  onSave={async (score) => {
                    const keyPart = generateKeyPart(4);
                    await save(
                      selected.station_key,
                      'presencial',
                      Math.max(0, Math.min(selected.max_score, Number(score) || 0)),
                      { key_part: keyPart, team_name: s.teamName }
                    );
                    try { await navigator.clipboard.writeText(keyPart); alert(`Registrado. Parte copiada: ${keyPart}`); }
                    catch { alert(`Registrado. Parte: ${keyPart} (cópiala manualmente)`); }
                    setOpenPoster(false);
                    setSelected(null);
                  }}
                />
                <button className="px-3 py-2 rounded border" onClick={() => setOpenPoster(false)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PresencialButton({ st, onSave }: { st: Station; onSave: (score: number) => void; }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState<string>('0');
  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button className="bg-amber-600 text-white rounded px-3 py-2" onClick={() => setOpen(true)}>
          Registrar presencial
        </button>
      ) : (
        <>
          <input
            type="number"
            min={0}
            max={Number(st.max_score) || 0}
            className="border rounded p-2 w-24 text-black"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
          <button
            className="bg-green-600 text-white rounded px-3 py-2"
            onClick={() => { onSave(Number(val) || 0); setOpen(false); }}
          >
            Guardar
          </button>
        </>
      )}
    </div>
  );
}
