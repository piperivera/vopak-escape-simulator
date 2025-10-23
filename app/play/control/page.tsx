// app/play/control/page.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { computeScoreAccuracyTime, saveStationResult } from '@/lib/game';
import { generateKeyPart } from '@/lib/keys';
import MissionDialog from '@/components/MissionDialog';

/**
 * Panel Galáctico — Simón Dice (3 fases con voz, 3 vidas)
 * - Fases: Fácil → Media → Difícil
 * - Voz: "Fase 1", "Fase 2", "Fase 3" (Web Speech API)
 * - 3 vidas totales; al fallar, se repite la fase restando 1 vida
 * - Puntaje por niveles + bonus por rapidez
 * - Guarda station_key: 'control'
 * - ENTREGA LLAVE: solo si se completan las 3 fases con las 3 vidas intactas
 */

const COLORS = [
  { key: 'red', className: 'bg-red-600' },
  { key: 'blue', className: 'bg-blue-600' },
  { key: 'green', className: 'bg-green-600' },
  { key: 'yellow', className: 'bg-yellow-500' },
] as const;

type Phase = {
  name: string;
  speak: string;
  keys: typeof COLORS[number]['key'][];
  showMs: number;
  gapMs: number;
  growBy: 1 | 2;
  maxLevels: number;
};

const PHASES: Phase[] = [
  { name: 'Fase 1 (Fácil)', speak: 'Fase 1', keys: ['red', 'blue', 'green', 'yellow'], showMs: 600, gapMs: 220, growBy: 1, maxLevels: 3 },
  { name: 'Fase 2 (Media)', speak: 'Fase 2', keys: ['red', 'blue', 'green', 'yellow'], showMs: 480, gapMs: 180, growBy: 1, maxLevels: 4 },
  { name: 'Fase 3 (Difícil)', speak: 'Fase 3', keys: ['red', 'blue', 'green', 'yellow'], showMs: 380, gapMs: 150, growBy: 2, maxLevels: 5 },
];

const MAX_SCORE = 200;
const TARGET_SEC_GLOBAL = 90;
const HARD_LIMIT_SEC = 180;
const PRESS_FLASH_MS = 130;

export default function PanelSimonPhasesPage() {
  const router = useRouter();
  const { runId } = getSession();
  useEffect(() => { if (!runId) router.push('/'); }, [runId, router]);

  const [phaseIndex, setPhaseIndex] = useState(0);
  const [sequence, setSequence] = useState<string[]>([]);
  const [userInput, setUserInput] = useState<string[]>([]);
  const [isShowing, setIsShowing] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [lives, setLives] = useState(3);
  const [levelsCompleted, setLevelsCompleted] = useState(0);
  const [phaseLevel, setPhaseLevel] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore] = useState(0);
  const [saving, setSaving] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [keyPart, setKeyPart] = useState<string | null>(null);

  const startTs = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startTs.current = Date.now();
    const t = setInterval(() => {
      const e = Math.floor((Date.now() - startTs.current) / 1000);
      setElapsed(e);
      if (e >= HARD_LIMIT_SEC) void finish();
    }, 300);
    return () => clearInterval(t);
  }, []);

  function speak(text: string) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {}
  }

  const wait = (ms: number) => new Promise(res => setTimeout(res, ms));
  const rngPick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

  async function playSequence(seq: string[], phase: Phase) {
    setIsShowing(true);
    for (const c of seq) {
      setActive(c);
      await wait(phase.showMs);
      setActive(null);
      await wait(phase.gapMs);
    }
    setIsShowing(false);
  }

  async function nextLevel(reset: boolean = false) {
    const phase = PHASES[phaseIndex];
    let nextSeq = reset ? [] : sequence.slice();
    for (let i = 0; i < phase.growBy; i++) nextSeq.push(rngPick(phase.keys));
    setSequence(nextSeq);
    setUserInput([]);
    await playSequence(nextSeq, phase);
  }

  async function startPhase(index: number) {
    const phase = PHASES[index];
    speak(phase.speak);
    setPhaseIndex(index);
    setPhaseLevel(0);
    setSequence([]);
    setUserInput([]);
    await wait(400);
    await nextLevel(true);
  }

  const startGame = async () => {
    setLives(3);
    setLevelsCompleted(0);
    setPhaseLevel(0);
    setMistakes(0);
    setScore(0);
    setKeyPart(null);
    await startPhase(0);
  };

  async function handleClick(color: string) {
    if (isShowing || !sequence.length) return;

    setActive(color);
    setTimeout(() => setActive(prev => (prev === color ? null : prev)), PRESS_FLASH_MS);

    const newInput = [...userInput, color];
    setUserInput(newInput);

    const idx = newInput.length - 1;
    if (sequence[idx] !== color) {
      setMistakes(m => m + 1);
      setLives(l => l - 1);
      setActive('error');
      await wait(300);
      setActive(null);

      if (lives - 1 <= 0) {
        await finish();
        return;
      }
      await wait(500);
      await nextLevel(true);
      return;
    }

    if (newInput.length === sequence.length) {
      const levelPoints = 10 + 2 * sequence.length;
      setScore(s => s + levelPoints);
      setLevelsCompleted(n => n + 1);
      setPhaseLevel(n => n + 1);

      if (phaseLevel + 1 >= PHASES[phaseIndex].maxLevels) {
        if (phaseIndex + 1 < PHASES.length) {
          await wait(600);
          await startPhase(phaseIndex + 1);
        } else {
          await finish(); // solo al final real del juego
        }
      } else {
        await wait(600);
        await nextLevel(false);
      }
    }
  }

  const breakdown = useMemo(() => {
    const totalPotential = PHASES.reduce((s, p) => s + p.maxLevels, 0);
    const correct = levelsCompleted;
    return computeScoreAccuracyTime(
      totalPotential,
      correct,
      mistakes,
      elapsed,
      { maxScore: MAX_SCORE, targetSec: TARGET_SEC_GLOBAL, overStepSec: 3, bonusPerStep: 2 }
    );
  }, [levelsCompleted, mistakes, elapsed]);

  async function finish() {
    if (!runId || saving) return;
    setSaving(true);
    try {
      const timeBonus = breakdown.penaltyTime < 0 ? Math.abs(breakdown.penaltyTime) : 0;
      const finalScore = Math.min(MAX_SCORE, Math.max(0, score + timeBonus - breakdown.penaltyMistakes));

      // Solo otorga fragmento si completó todas las fases con 3 vidas
      let grantedKeyPart: string | null = null;
      if (lives === 3 && phaseIndex === PHASES.length - 1 && phaseLevel >= PHASES[phaseIndex].maxLevels) {
        grantedKeyPart = generateKeyPart();
        setKeyPart(grantedKeyPart);
      } else {
        setKeyPart(null);
      }

      await saveStationResult({
        runId,
        stationKey: 'control',
        mode: 'web',
        score: Math.round(finalScore),
        meta: {
          elapsed_sec: Math.min(elapsed, HARD_LIMIT_SEC),
          lives_left: Math.max(0, lives),
          phase_index: phaseIndex,
          levels_completed: levelsCompleted,
          mistakes,
          time_bonus_points: timeBonus,
          error_penalty_points: breakdown.penaltyMistakes,
          base_points: score,
          key_part: grantedKeyPart ?? undefined,
        },
      });

      setOpenDialog(true);
    } catch (e: any) {
      alert(e.message ?? 'Error guardando resultado');
    } finally {
      setSaving(false);
    }
  }

  const phase = PHASES[phaseIndex];
  const timeBadge = (
    <div className={`text-sm px-3 py-1 rounded ${elapsed <= TARGET_SEC_GLOBAL ? 'bg-green-700' : 'bg-amber-700'}`}>
      ⏱ {elapsed}s
    </div>
  );
  const lifeHearts = Array.from({ length: 3 }).map((_, i) => (
    <span key={i} className={`text-lg ${i < lives ? '' : 'opacity-30'}`}>❤️</span>
  ));

  const showingOverlay = isShowing ? (
    <div className="text-center text-xs opacity-80 -mt-1">Observa la secuencia…</div>
  ) : null;

  const dialogMsg = keyPart
    ? `🪐 ¡Misión perfecta! Has completado las 3 fases con tus 3 vidas intactas.\n\n🔑 Fragmento de la llave: ${keyPart}`
    : `Excelente coordinación. Completa las tres fases con tus 3 vidas para obtener el fragmento de la llave.`;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Panel Galáctico — Simón Dice (3 fases)</h1>
          <p className="text-xs opacity-70">Repite la secuencia de luces. Tienes 3 vidas. Si fallas, la fase actual se repite.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">{lifeHearts}</div>
          {timeBadge}
        </div>
      </header>

      <section className="text-center">
        <div className="text-sm opacity-80">{phase?.name}</div>
        <div className="text-xs opacity-60">
          Nivel en fase: {phaseLevel}/{phase?.maxLevels} • Niveles totales: {levelsCompleted}
        </div>
      </section>

      {/* Tablero */}
      <section className="flex flex-col items-center gap-2">
        <div className="flex justify-center gap-4 flex-wrap max-w-sm mx-auto mt-2">
          {COLORS.map(c => {
            const pressed = active === c.key;
            const error = active === 'error';
            return (
              <button
                key={c.key}
                onClick={() => handleClick(c.key)}
                disabled={isShowing || saving}
                aria-label={c.key}
                className={[
                  'w-24 h-24 rounded-lg border-2 transition-all duration-150',
                  c.className,
                  isShowing || saving ? 'cursor-not-allowed opacity-50' : 'hover:brightness-110',
                  pressed ? 'scale-110 border-white shadow-[0_0_0_4px_rgba(255,255,255,0.25)]' : 'opacity-85',
                  error ? 'animate-pulse border-white' : '',
                ].join(' ')}
              />
            );
          })}
        </div>
        {showingOverlay}
      </section>

      <section className="flex justify-center mt-4">
        {sequence.length === 0 && (
          <button onClick={startGame} className="bg-green-600 text-white rounded px-6 py-2">
            Iniciar
          </button>
        )}
      </section>

      <section className="text-center text-sm opacity-70">
        <div>Puntaje base: {score} pts</div>
        <div>Errores: {mistakes}</div>
      </section>

      <MissionDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        title="🪐 Misión completada: Panel Galáctico"
        message={dialogMsg}
      />
    </main>
  );
}
