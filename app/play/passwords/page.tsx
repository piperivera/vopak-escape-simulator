// app/play/passwords/page.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { saveStationResult } from '@/lib/game';
import MissionDialog from '@/components/MissionDialog';
import { generateKeyPart } from '@/lib/keys';

/**
 * Cámara de Contraseñas — 3 contraseñas válidas y diferentes
 * Cambios solicitados:
 * - Al finalizar: mostrar llave y al cerrar ir a /play (no volver a instrucciones).
 * - Sin “políticas” emergentes; solo mensaje inicial con parámetros.
 * - Sin bonus de ningún tipo: el puntaje de cada intento depende SOLO de reglas cumplidas.
 * - Penalización: desde 120s, −2 puntos cada 10s (acumulativa).
 */

const MAX_SCORE = 200;                 // Puntaje total de la estación
const REQUIRED_ATTEMPTS = 3;           // 3 contraseñas
const PENALTY_START_SEC = 120;         // 2 minutos
const PENALTY_STEP_SEC = 10;           // cada 10 s
const PENALTY_PER_STEP = 2;            // −2 pts por bloque
const HARD_LIMIT_SEC_TOTAL = 180;      // si ya lo usas en tu HUD, lo mantengo igual
const PLAY_HOME = '/play';             // ruta a la que volvemos al cerrar el diálogo

const COMMON = [
  'password', 'contraseña', 'qwerty', 'admin', '1234', '123456',
  'letmein', 'welcome', 'abc123', 'iloveyou', 'vopak'
];

// Hash sencillo (FNV-1a) para evitar repetir contraseñas
function hashStringFNV1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

function estimateEntropyBits(pw: string) {
  if (!pw) return 0;
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw))   pool += 10;
  if (/[^A-Za-z0-9\s]/.test(pw)) pool += 32;
  const bitsPerChar = Math.log2(Math.max(pool, 1));
  return Math.round(pw.length * bitsPerChar);
}

export default function PasswordsPage() {
  const router = useRouter();
  const { runId } = getSession();
  useEffect(() => { if (!runId) router.push('/'); }, [runId, router]);

  // Estado de inicio (hasta que pulsan "Comenzar")
  const [started, setStarted] = useState(false);

  // Cronómetro global
  const startTs = useRef<number | null>(null);
  const [elapsedTotal, setElapsedTotal] = useState(0);
  useEffect(() => {
    if (!started) return;
    startTs.current = Date.now();
    setElapsedTotal(0);
    const t = setInterval(() => {
      if (!startTs.current) return;
      setElapsedTotal(Math.floor((Date.now() - startTs.current) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, [started]);

  // Penalización por tardanza (solo después de 120s)
  const [decayPoints, setDecayPoints] = useState(0);
  const decayIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!started) return;
    if (elapsedTotal >= PENALTY_START_SEC && decayIntervalRef.current == null) {
      // aplicar primer bloque de penalización al llegar a 120s y luego cada 10s
      setDecayPoints(p => p + PENALTY_PER_STEP);
      decayIntervalRef.current = window.setInterval(() => {
        setDecayPoints(p => p + PENALTY_PER_STEP);
      }, PENALTY_STEP_SEC * 1000) as unknown as number;
    }
  }, [elapsedTotal, started]);

  useEffect(() => {
    return () => { if (decayIntervalRef.current) clearInterval(decayIntervalRef.current); };
  }, []);

  // Intento actual
  const [pw, setPw] = useState('');
  const [attemptStartTs, setAttemptStartTs] = useState<number | null>(null);
  const [attemptElapsed, setAttemptElapsed] = useState(0);
  const attemptTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!attemptStartTs) return;
    attemptTimerRef.current = window.setInterval(() => {
      setAttemptElapsed(Math.floor((Date.now() - attemptStartTs) / 1000));
    }, 250);
    return () => { if (attemptTimerRef.current) clearInterval(attemptTimerRef.current); };
  }, [attemptStartTs]);

  // Metadatos de intentos
  type AttemptMeta = {
    entropy_bits: number;
    length: number;
    rules: Record<string, boolean>;
    elapsed_sec: number;
    score: number;      // SIN bonus, solo por reglas cumplidas
    all_ok: boolean;
  };
  const [attempts, setAttempts] = useState<AttemptMeta[]>([]);
  const [attemptHashes, setAttemptHashes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Diálogo misión / key part
  const [openDialog, setOpenDialog] = useState(false);
  const [missionMessage, setMissionMessage] = useState('');
  const [keyPart, setKeyPart] = useState<string | null>(null);

  // Reglas del intento actual
  const entropy = useMemo(() => estimateEntropyBits(pw), [pw]);
  const rules = useMemo(() => [
    { key: 'len12',   label: '≥ 12 caracteres', ok: pw.length >= 12 },
    { key: 'lower',   label: 'Tiene minúsculas', ok: /[a-z]/.test(pw) },
    { key: 'upper',   label: 'Tiene mayúsculas', ok: /[A-Z]/.test(pw) },
    { key: 'digit',   label: 'Tiene números', ok: /\d/.test(pw) },
    { key: 'symbol',  label: 'Tiene símbolos', ok: /[^A-Za-z0-9\s]/.test(pw) },
    { key: 'entropy', label: 'Entropía ≥ 60 bits', ok: entropy >= 60 },
    { key: 'common',  label: 'No contiene palabras comunes', ok: !COMMON.some(c => pw.toLowerCase().includes(c)) },
  ], [pw, entropy]);

  const totalRules = rules.length;
  const correctRules = rules.filter(r => r.ok).length;
  const allRulesOk = correctRules === totalRules;

  // Puntaje de intento SIN bonus (proporcional a reglas cumplidas)
  const attemptScore = useMemo(() => {
    if (totalRules === 0) return 0;
    // Puntaje por intento: proporción de reglas * MAX_SCORE (capado 0..MAX_SCORE)
    // No hay bonus por tiempo ni nada extra.
    return Math.round((correctRules / totalRules) * MAX_SCORE);
  }, [correctRules, totalRules]);

  const saveAttemptLocally = () => {
    if (!started) { alert('Pulsa "Comenzar estación" primero.'); return; }
    if (!pw) { alert('Escribe una contraseña antes de guardar.'); return; }
    if (attempts.length >= REQUIRED_ATTEMPTS) { alert(`Ya registraste las ${REQUIRED_ATTEMPTS} contraseñas.`); return; }

    const h = hashStringFNV1a(pw);
    if (attemptHashes.includes(h)) {
      alert('La contraseña debe ser diferente a las anteriores.');
      return;
    }

    const meta: AttemptMeta = {
      entropy_bits: entropy,
      length: pw.length,
      rules: Object.fromEntries(rules.map(r => [r.key, r.ok])),
      elapsed_sec: Math.min(attemptElapsed || 0, HARD_LIMIT_SEC_TOTAL),
      score: attemptScore,
      all_ok: allRulesOk,
    };

    setAttempts(prev => [...prev, meta]);
    setAttemptHashes(prev => [...prev, h]);

    // Reset del intento
    setPw('');
    setAttemptStartTs(Date.now());
    setAttemptElapsed(0);
  };

  const finishStation = async () => {
    if (!runId) { alert('Sesión no válida. Reinicia con nombre de equipo.'); return; }
    if (attempts.length !== REQUIRED_ATTEMPTS) {
      alert(`Debes registrar ${REQUIRED_ATTEMPTS} contraseñas (pueden ser parciales) para finalizar.`);
      return;
    }

    setSaving(true);
    const part = generateKeyPart(4);

    try {
      // Promedio simple de los 3 intentos (0..200)
      const scores = attempts.map(a => a.score);
      const avg = Math.round(scores.reduce((s, n) => s + n, 0) / scores.length);

      // Puntaje final = promedio − penalización por tardanza
      let finalScore = Math.round(avg - decayPoints);
      finalScore = Math.max(0, Math.min(MAX_SCORE, finalScore));

      await saveStationResult({
        runId,
        stationKey: 'passwords',
        mode: 'web',
        score: finalScore,
        meta: {
          attempts_count: attempts.length,
          attempts, // solo metadatos
          total_elapsed_sec: elapsedTotal,
          decay_points: decayPoints,
          key_part: part
        }
      });

      // Mostrar llave y, al cerrar, ir a /play (NO volver a instrucciones)
      setKeyPart(part);
      setMissionMessage(
        `Resultado final: ${finalScore} / ${MAX_SCORE} pts.\n\n` +
        `🔐 Parte de la LLAVE MAESTRA: ${part}\n\n` +
        `Detalles: promedio de intentos ${avg} pts, penalización por tardanza ${decayPoints} pts.`
      );
      setOpenDialog(true);

      // Detenemos la penalización, pero NO devolvemos a instrucciones
      if (decayIntervalRef.current) { clearInterval(decayIntervalRef.current); decayIntervalRef.current = null; }
    } catch (e: any) {
      alert(e.message ?? 'Error guardando estación');
    } finally {
      setSaving(false);
    }
  };

  // UI helpers
  const canSaveAttempt = pw.length > 0 && attempts.length < REQUIRED_ATTEMPTS;
  const remainingSlots = Math.max(0, REQUIRED_ATTEMPTS - attempts.length);

  const timeChip = (
    <div className={`text-sm px-3 py-1 rounded ${elapsedTotal <= HARD_LIMIT_SEC_TOTAL ? 'bg-green-700' : 'bg-red-800'}`}>
      ⏱ {elapsedTotal}s
    </div>
  );

  function strengthLabel(score: number) {
    if (score >= 180) return 'Excelente';
    if (score >= 150) return 'Fuerte';
    if (score >= 110) return 'Media';
    return 'Débil';
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cámara Criogénica de Contraseñas — 3 contraseñas</h1>
          <p className="text-xs opacity-70">
            Deben crear <b>{REQUIRED_ATTEMPTS}</b> contraseñas. Se puntúa SOLO por cumplimiento de reglas.
            Después de <b>2 minutos</b> se activa una penalización de <b>−2 puntos cada 10 segundos</b>.
            La estación vale <b>{MAX_SCORE} puntos</b> en total.
          </p>
        </div>
        {timeChip}
      </header>

      {/* Instrucciones previas (parámetros) */}
      {!started && (
        <section className="border rounded p-4 space-y-3 bg-slate-900/30">
          <h3 className="font-semibold">Antes de empezar</h3>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>Registra <b>3 contraseñas diferentes</b>.</li>
            <li>Parámetros: ≥12 caracteres, minúsculas, mayúsculas, números, símbolos, entropía ≥60 bits y sin palabras comunes.</li>
            <li>La penalización por tiempo inicia a los 2 minutos desde que pulses <b>Comenzar</b>.</li>
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => router.push(PLAY_HOME)} className="underline">Volver</button>
            <button
              onClick={() => { setStarted(true); setAttemptStartTs(Date.now()); setPw(''); setDecayPoints(0); setAttempts([]); setAttemptHashes([]); }}
              className="bg-emerald-600 text-white rounded px-4 py-2"
            >
              Comenzar estación
            </button>
          </div>
        </section>
      )}

      {/* Interfaz de juego */}
      {started && (
        <section className="border rounded p-4 space-y-4">
          <label className="block text-sm">Contraseña (nueva):</label>
          <div className="flex gap-2">
            <input
              type="password"
              className="border rounded p-2 w-full text-black"
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="Escribe tu contraseña aquí…"
            />
            <button
              onClick={saveAttemptLocally}
              disabled={!canSaveAttempt}
              className={`rounded px-3 text-white ${canSaveAttempt ? 'bg-emerald-600' : 'bg-emerald-900/50 cursor-not-allowed'}`}
              title={allRulesOk ? 'Guardar intento válido' : 'Guardar intento (parcial)'}
            >
              Guardar intento ({attempts.length}/{REQUIRED_ATTEMPTS})
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {rules.map(r => (
              <div key={r.key} className={`flex items-center gap-2 p-2 rounded ${r.ok ? 'bg-green-900/30 border border-green-700' : 'bg-white/5'}`}>
                <span>{r.ok ? '✅' : '⬜'}</span>
                <span className="text-sm">{r.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-6 pt-2">
            <div>
              <div className="text-sm opacity-70">Entropía</div>
              <div>{entropy} bits</div>
            </div>

            <div>
              <div className="text-sm opacity-70">Reglas</div>
              <div>{correctRules}/{totalRules} correctas {allRulesOk ? '✅' : '❌'}</div>
            </div>

            <div>
              <div className="text-sm opacity-70">Puntaje intento</div>
              <div className="text-2xl font-bold">
                {attemptScore} pts <span className="text-sm opacity-70">({strengthLabel(attemptScore)})</span>
              </div>
              <div className="text-xs opacity-70">Sin bonus; solo reglas cumplidas.</div>
            </div>

            <div className="ml-auto text-sm opacity-80">
              <div>Tiempo intento: {attemptElapsed}s</div>
              <div>Faltan intentos: {Math.max(0, REQUIRED_ATTEMPTS - attempts.length)}</div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold">Intentos registrados</h3>
            {attempts.length === 0 && <div className="text-xs opacity-70">Aún no hay intentos.</div>}
            <ol className="list-decimal pl-5 space-y-1 mt-2">
              {attempts.map((a, i) => (
                <li key={i} className="text-sm">
                  #{i + 1}: {a.score} pts — Entropía {a.entropy_bits} bits — {a.length} caracteres — {a.elapsed_sec}s — {a.all_ok ? '✅ Válida' : '⚠ Parcial'}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <div>Penalización por tardanza: <b>{decayPoints} pts</b></div>
              {elapsedTotal >= PENALTY_START_SEC
                ? <div className="text-xs opacity-70">Activa: −{PENALTY_PER_STEP} pts cada {PENALTY_STEP_SEC} s</div>
                : <div className="text-xs opacity-70">Se activará a los {PENALTY_START_SEC} s</div>}
            </div>

            <div className="flex gap-2">
              <button onClick={() => router.push(PLAY_HOME)} className="underline">Cancelar</button>
              <button
                onClick={finishStation}
                disabled={saving || attempts.length !== REQUIRED_ATTEMPTS}
                className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : `Finalizar estación (${attempts.length}/${REQUIRED_ATTEMPTS})`}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Diálogo: llave y regreso a /play al cerrar */}
      <MissionDialog
        open={openDialog}
        onOpenChange={(v) => {
          setOpenDialog(v);
          if (!v) router.push(PLAY_HOME);
        }}
        title="🔐 Misión completada: Contraseñas"
        message={missionMessage}
        copyText={keyPart ?? undefined}
      />
    </main>
  );
}
