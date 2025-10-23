// app/play/master-reset/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import MissionDialog from '@/components/MissionDialog';
import { saveStationResult } from '@/lib/game';
import { supabase } from '@/lib/supabaseClient'; // ✅ usa el cliente correcto

// ======= Clasificación VOPAK (barra + nivel en vivo) =======
const SCORE_MAX = 1100;    // 5 estaciones (1000) + margen bonus
const BONUS_BASE = 40;
const BONUS_PER_PART = 15;
const BONUS_FAST_MAX = 20;
const BONUS_CAP = 100;

const NIVELES = [
  { min: 1000, max: 1200, nombre: 'Cyber Guardian Élite',  emoji: '🥇', mensaje: 'Excelencia en seguridad digital.' },
  { min:  800, max:  999, nombre: 'Cyber Guardian Experto', emoji: '🥈', mensaje: 'Buen dominio de prácticas seguras.' },
  { min:  600, max:  799, nombre: 'Cyber Guardian Aprendiz',emoji: '🥉', mensaje: 'Conocimientos adecuados, oportunidades de mejora.' },
  { min:    0, max:  599, nombre: 'Tripulación en Riesgo',  emoji: '⚠️', mensaje: 'Refuercen protocolos: nueva misión sugerida.' },
] as const;

function nivelPor(score: number) {
  const s = Math.max(0, Math.min(SCORE_MAX, Math.round(score)));
  return NIVELES.find(n => s >= n.min && s <= n.max) ?? NIVELES[NIVELES.length - 1];
}

export default function MasterResetPage() {
  const router = useRouter();
  const { runId } = getSession();

  const [loading, setLoading] = useState(true);
  const [partsFromDB, setPartsFromDB] = useState<string[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [totalScore, setTotalScore] = useState(0); // suma de estaciones (sin master_reset)

  // temporizador total (para bonus de rapidez)
  const [elapsedTotal, setElapsedTotal] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const t = setInterval(() => setElapsedTotal(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(t);
  }, []);

  // modal final
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMsg, setDialogMsg] = useState('');

  // ------- Cargar partes y sumar puntajes -------
  useEffect(() => {
    if (!runId) { router.push('/'); return; }
    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('station_results')
        .select('station_key, score, meta')
        .eq('run_id', runId)
        .neq('station_key', 'master_reset'); // no sumar el bonus previo

      if (error) {
        setDialogMsg('Error cargando partes: ' + error.message);
        setOpenDialog(true);
        setLoading(false);
        return;
      }

      const parts: string[] = [];
      let sum = 0;
      for (const row of (data ?? [])) {
        sum += Number(row?.score ?? 0);
        const kp = (row as any)?.meta?.key_part;
        if (kp) parts.push(String(kp).toUpperCase().trim());
      }

      setTotalScore(sum);
      setPartsFromDB(parts);
      setInputs(Array(parts.length).fill(''));
      setLoading(false);
    })();
  }, [runId, router]);

  const needed = partsFromDB.length;
  const canSubmit = useMemo(
    () => inputs.length === needed && inputs.every(x => x && x.trim().length > 0),
    [inputs, needed]
  );

  function updateInput(i: number, v: string) {
    setInputs(prev => {
      const copy = [...prev];
      copy[i] = v.toUpperCase().trim();
      return copy;
    });
  }

  function arraysMatchUnordered(a: string[], b: string[]) {
    const map = new Map<string, number>();
    for (const x of a) map.set(x, (map.get(x) ?? 0) + 1);
    for (const y of b) {
      if (!map.has(y)) return false;
      const c = (map.get(y) ?? 0) - 1;
      if (c <= 0) map.delete(y); else map.set(y, c);
    }
    return map.size === 0;
  }

  // Cálculo del BONUS (0–100)
  function computeBonus(validParts: number, secs: number) {
    const fast = Math.max(0, BONUS_FAST_MAX - Math.floor(secs / 15)); // -1 cada 15s
    const raw = BONUS_BASE + validParts * BONUS_PER_PART + fast;
    return Math.max(0, Math.min(BONUS_CAP, raw));
  }

  // ------- Guardar Master Reset -------
  async function submit() {
    if (!runId) return;
    if (!canSubmit) { alert('Introduce todas las partes.'); return; }

    const entered = inputs.map(s => s.toUpperCase().trim());
    const expected = partsFromDB.map(s => s.toUpperCase().trim());
    const ok = arraysMatchUnordered(entered, expected);
    if (!ok) { alert('Las partes no coinciden. Revisa y vuelve a intentar.'); return; }

    const validParts = needed;
    const masterBonus = computeBonus(validParts, elapsedTotal); // 0–100

    const displayTotal = Math.max(0, Math.min(SCORE_MAX, totalScore + masterBonus));
    const nivel = nivelPor(displayTotal);

    setSaving(true);
    try {
      await saveStationResult({
        runId,
        stationKey: 'master_reset',
        mode: 'web',
        score: masterBonus, // solo BONUS; el total final se calcula sumando estaciones + bonus
        meta: {
          parts: entered,
          parts_count: validParts,
          elapsed_sec: elapsedTotal,
          bonus_breakdown: {
            base: BONUS_BASE,
            per_part: BONUS_PER_PART,
            fast_bonus: Math.max(0, BONUS_FAST_MAX - Math.floor(elapsedTotal / 15)),
            cap: BONUS_CAP,
          },
          display_total_after_bonus: displayTotal,
          level: { name: nivel.nombre, emoji: nivel.emoji, range: [nivel.min, nivel.max] },
        },
      });

      setDialogMsg(
        `✅ Llave maestra verificada. ¡La nave ha sido salvada!\n\n` +
        `Bonus Master Reset: +${masterBonus} pts.\n` +
        `${nivel.emoji} ${nivel.nombre} — Total final estimado: ${displayTotal} pts.`
      );
      setOpenDialog(true);
    } catch (e: any) {
      alert(e.message ?? 'Error guardando Master Reset');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Cargando partes de la llave…</div>;

  if (needed === 0) {
    return (
      <main className="p-6 max-w-xl mx-auto space-y-3">
        <h1 className="text-xl font-bold">Master Reset</h1>
        <p className="opacity-70 text-sm">
          Aún no hay partes de llave para esta partida. Completa las estaciones para conseguirlas.
        </p>
        <button className="underline" onClick={() => router.push('/play')}>Volver</button>
      </main>
    );
  }

  // ------- Vista con barra + nivel en vivo -------
  const previewBonus = computeBonus(needed, elapsedTotal);
  const previewFinal = Math.max(0, Math.min(SCORE_MAX, totalScore + previewBonus));
  const pct = Math.round((previewFinal / SCORE_MAX) * 100);
  const nivelPreview = nivelPor(previewFinal);

  return (
    <main className="p-6 max-w-xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Master Reset — Ensambla la llave</h1>

      <div className="space-y-2">
        <div className="text-sm opacity-70">
          Puntaje de estaciones: <b>{totalScore}</b> pts
          {' • '}Bonus previsto Master Reset: <b>+{previewBonus}</b> pts
          {' = '}Total estimado: <b>{previewFinal}</b> pts
        </div>

        <div className="w-full h-3 bg-white/10 rounded">
          <div
            style={{ width: `${pct}%` }}
            className="h-3 bg-green-600 rounded transition-all"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="text-xs opacity-70">{pct}% de {SCORE_MAX} pts</div>

        <div className="mt-1">
          <div className="text-base font-semibold">
            {nivelPreview.emoji} {nivelPreview.nombre}
          </div>
          <div className="text-sm opacity-80">{nivelPreview.mensaje}</div>
        </div>
      </div>

      <p className="text-sm opacity-70">
        Introduce las {needed} partes obtenidas. El orden no importa.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {inputs.map((v, i) => (
          <input
            key={i}
            value={v}
            onChange={(e) => updateInput(i, e.target.value)}
            placeholder={`Parte #${i + 1}`}
            className="border rounded p-2 text-center uppercase"
            maxLength={8}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button className="underline" onClick={() => router.push('/play')}>Volver</button>
        <button
          onClick={submit}
          disabled={!canSubmit || saving}
          className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-50"
        >
          {saving ? 'Validando…' : 'Validar y salvar la nave'}
        </button>
      </div>

      <MissionDialog
        open={openDialog}
        onOpenChange={(v) => {
          setOpenDialog(v);
          if (!v) router.replace('/play'); // vuelve al hub al cerrar
        }}
        title="🚀 Master Reset"
        message={dialogMsg || 'Llave verificada.'}
      />
    </main>
  );
}
