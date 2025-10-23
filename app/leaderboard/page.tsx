// app/leaderboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';     // ✅ usa tu cliente global
import { getSession } from '@/lib/session';

/* ===== Clasificación VOPAK ===== */
type Nivel = {
  rango: [number, number];
  nombre: string;
  emoji: string;
  mensaje: string;
};

const NIVELES: Nivel[] = [
  { rango: [1000, 9999], nombre: 'Cyber Guardian Élite',  emoji: '🥇', mensaje: 'Excelencia en seguridad digital.' },
  { rango: [800,   999], nombre: 'Cyber Guardian Experto', emoji: '🥈', mensaje: 'Buen dominio de prácticas seguras.' },
  { rango: [600,   799], nombre: 'Cyber Guardian Aprendiz',emoji: '🥉', mensaje: 'Conocimientos adecuados; aún pueden mejorar.' },
  { rango: [0,     599], nombre: 'Tripulación en Riesgo',  emoji: '⚠️', mensaje: 'Refuercen protocolos y repasen buenas prácticas.' },
];

const nivelPor = (score:number) =>
  NIVELES.find(n => score >= n.rango[0] && score <= n.rango[1]) ?? NIVELES.at(-1)!;

/* ===== Tipos ===== */
type Row = {
  run_id: string;
  team_name: string | null;
  total_score: number;
  stations_done: number;
  has_master: boolean;
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const sess = getSession(); // { runId, teamName }

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Trae resultados; incluye relación con game_runs para nombre del equipo
      const { data, error } = await supabase
        .from('station_results')
        .select('run_id, station_key, score, meta, game_runs(team_name)');

      if (error) {
        console.error('Error leaderboard:', error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      // Agrega por run_id
      const map = new Map<string, Row>();
      for (const r of (data ?? []) as any[]) {
        const runId: string = r.run_id;

        const prev = map.get(runId) ?? {
          run_id: runId,
          team_name: null,
          total_score: 0,
          stations_done: 0,
          has_master: false,
        };

        prev.total_score += Number(r?.score ?? 0); // incluye master_reset (queremos total final)
        prev.stations_done += (r.station_key === 'master_reset') ? 0 : 1; // cuenta solo estaciones de 200
        if (String(r.station_key) === 'master_reset') prev.has_master = true;

        // Preferencias para nombre de equipo
        const metaName   = r?.meta?.team_name as string | undefined;
        const joinedName = r?.game_runs?.team_name as string | undefined;
        prev.team_name = metaName ?? joinedName ?? prev.team_name;

        // Si es tu propia run activa, forzamos session name
        if (sess?.runId && runId === sess.runId && sess.teamName) prev.team_name = sess.teamName;

        map.set(runId, prev);
      }

      // Orden por puntaje desc
      const arr = Array.from(map.values()).sort((a, b) => b.total_score - a.total_score);
      setRows(arr);
      setLoading(false);
    })();
  }, [sess?.runId, sess?.teamName]);

  // Filtro por nombre
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r => (r.team_name || '').toLowerCase().includes(term));
  }, [rows, q]);

  if (loading) return <div className="p-6">Cargando clasificación…</div>;

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Clasificación de Resultados</h1>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar equipo…"
            className="border rounded px-3 py-2 text-sm w-64 max-w-full text-black"
          />
          <Link href="/play" className="underline">Volver</Link>
        </div>
      </header>

      {/* 🏆 Podio Top 3 */}
      <section className="grid md:grid-cols-3 gap-4">
        {rows.slice(0, 3).map((r, i) => {
          const name = r.team_name || 'Equipo sin nombre';
          const nivel = nivelPor(r.total_score);

          const style = [
            { medal: '🥇', bg: 'bg-yellow-100/60', ring: 'ring-2 ring-yellow-400', badge: 'bg-yellow-400 text-black', place: '1' },
            { medal: '🥈', bg: 'bg-gray-100/60',  ring: 'ring-2 ring-gray-300',  badge: 'bg-gray-300 text-black',  place: '2' },
            { medal: '🥉', bg: 'bg-amber-100/60', ring: 'ring-2 ring-amber-300', badge: 'bg-amber-300 text-black', place: '3' },
          ][i];

          return (
            <div
              key={r.run_id}
              className={`relative border rounded-xl p-4 ${style.bg} ${style.ring}`}
              aria-label={`${style.place}º lugar`}
            >
              <div className={`absolute -top-3 -left-3 px-2 py-1 rounded-full text-xs font-bold shadow ${style.badge}`}>
                {style.place}
              </div>

              <div className="flex items-start justify-between gap-2">
                <div className="text-3xl">{style.medal}{i === 0 ? ' 👑' : ''}</div>
                <div className="text-xs opacity-70">{r.total_score} pts</div>
              </div>

              <div className="font-semibold text-lg mt-1">{name}</div>

              <div className="text-sm mt-1">
                <span className="font-medium">{nivel.nombre}</span>
                <span className="opacity-80"> — {nivel.mensaje}</span>
              </div>

              <div className="text-xs opacity-70 mt-2">
                {r.stations_done} estaciones {r.has_master ? '• ✅ Master Reset' : ''}
              </div>
            </div>
          );
        })}
      </section>

      {/* 📋 Lista completa */}
      <section>
        <h2 className="font-bold text-lg mb-2">Todos los participantes</h2>
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-white/10">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Equipo</th>
                <th className="text-left px-3 py-2">Puntaje</th>
                <th className="text-left px-3 py-2">Nivel</th>
                <th className="text-left px-3 py-2">Mensaje</th>
                <th className="text-left px-3 py-2">Estaciones</th>
                <th className="text-left px-3 py-2">Master Reset</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filtered.map((r, idx) => {
                const nivel = nivelPor(r.total_score);
                return (
                  <tr key={r.run_id} className={idx < 3 ? 'bg-white/5' : ''}>
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">{r.team_name || 'Equipo sin nombre'}</td>
                    <td className="px-3 py-2">{r.total_score}</td>
                    <td className="px-3 py-2">{nivel.emoji} {nivel.nombre}</td>
                    <td className="px-3 py-2 opacity-80">{nivel.mensaje}</td>
                    <td className="px-3 py-2">{r.stations_done}</td>
                    <td className="px-3 py-2">{r.has_master ? '✅' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-60 mt-2">
          * Ordenados por puntaje total (el bonus de Master Reset se incluye cuando aplica).
        </p>
      </section>
    </main>
  );
}
