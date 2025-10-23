// lib/game.ts
import { supabase } from '@/lib/supabaseClient';
import { getSession } from './session';

/** Crea/asegura el run para evitar FK */
export async function ensureRun(runId: string, teamName: string) {
  const { error } = await supabase
    .from('game_runs')
    .upsert({ run_id: runId, team_name: teamName }, { onConflict: 'run_id' });
  if (error) throw error;
}

/** Desglose de puntaje */
export type ScoreBreakdown = {
  score: number;
  base: number;
  penaltyMistakes: number; // positivo (se resta)
  penaltyTime: number;     // NEGATIVO cuando hay bonus (se suma)
};

export function computeScoreAccuracyTime(
  totalItems: number,
  correct: number,
  mistakes: number,
  elapsedSec: number,
  opts = { maxScore: 200, targetSec: 60, overStepSec: 3, bonusPerStep: 2 }
): ScoreBreakdown {
  const base = Math.round(opts.maxScore * (correct / Math.max(totalItems, 1)));
  const penaltyMistakes = mistakes * 10;
  const under = Math.max(0, opts.targetSec - elapsedSec);
  const bonusSteps = Math.floor(under / opts.overStepSec);
  const bonusTime = bonusSteps * opts.bonusPerStep;
  const raw = Math.max(0, base - penaltyMistakes + bonusTime);

  return {
    score: Math.min(opts.maxScore, raw),
    base,
    penaltyMistakes,
    penaltyTime: -bonusTime, // negativo = bonus
  };
}

/** Guarda resultado con UPSERT (run_id, station_key) + reintento si falta game_runs */
export async function saveStationResult(params: {
  runId: string;
  stationKey: string;
  mode: 'web' | 'presencial';
  score: number;
  meta?: Record<string, any>;
}) {
  const { teamName } = getSession();
  const payload = {
    run_id: params.runId,
    station_key: params.stationKey,
    mode: params.mode,
    score: params.score,
    meta: { ...(params.meta ?? {}), team_name: teamName ?? null },
  };

  async function doUpsert() {
    return supabase
      .from('station_results')
      .upsert(payload, { onConflict: 'run_id,station_key' })
      .select('run_id, station_key, mode, score, meta')
      .single();
  }

  // Primer intento
  let { data, error } = await doUpsert();

  // Si falla por FK, asegura el run y reintenta
  if (error && String((error as any).code) === '23503') {
    await ensureRun(params.runId, teamName || 'Equipo sin nombre');
    ({ data, error } = await doUpsert());
  }

  if (error) throw error;
  return data;
}

/** Variante: solo sube si el nuevo score es mayor */
export async function saveStationResultMax(params: {
  runId: string;
  stationKey: string;
  mode: 'web' | 'presencial';
  score: number;
  meta?: Record<string, any>;
}) {
  const { data: existing, error: selErr } = await supabase
    .from('station_results')
    .select('score')
    .eq('run_id', params.runId)
    .eq('station_key', params.stationKey)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing && existing.score >= params.score) {
    // conserva el mayor; actualiza meta opcionalmente
    const { teamName } = getSession();
    const meta = { ...(params.meta ?? {}), team_name: teamName ?? null };
    const { error } = await supabase
      .from('station_results')
      .upsert(
        {
          run_id: params.runId,
          station_key: params.stationKey,
          mode: params.mode,
          score: existing.score,
          meta,
        },
        { onConflict: 'run_id,station_key' }
      );
    if (error) throw error;
    return { station_key: params.stationKey, mode: params.mode, score: existing.score, meta };
  }

  return saveStationResult(params);
}
