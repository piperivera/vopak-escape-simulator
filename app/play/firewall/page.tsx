// app/play/firewall/page.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { saveStationResult } from '@/lib/game';
import MissionDialog from '@/components/MissionDialog';
import { generateKeyPart } from '@/lib/keys';

type Rule = { id: string; text: string; label: 'allow' | 'block' };

const RULES_POOL: Rule[] = [
  { id: '1',  text: 'Abrir un correo de tu jefe conocido.', label: 'allow' },
  { id: '2',  text: 'Descargar un archivo .exe desde un mensaje desconocido.', label: 'block' },
  { id: '3',  text: 'Ingresar al portal oficial de tu empresa con tu usuario.', label: 'allow' },
  { id: '4',  text: 'Dar clic en un anuncio que promete un premio.', label: 'block' },
  { id: '5',  text: 'Conectarse al Wi-Fi oficial de la oficina.', label: 'allow' },
  { id: '6',  text: 'Compartir tu contraseña con un compañero por chat.', label: 'block' },
  { id: '7',  text: 'Actualizar tu antivirus desde la app oficial.', label: 'allow' },
  { id: '8',  text: 'Usar una memoria USB que encontraste en la calle.', label: 'block' },
  { id: '9',  text: 'Abrir el sitio web del banco desde el enlace guardado en favoritos.', label: 'allow' },
  { id: '10', text: 'Abrir un enlace que llega por WhatsApp sin saber quién lo envió.', label: 'block' },
];

function hashStringToSeed(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle<T>(arr: T[], seed: number) {
  const a = arr.slice(); const rand = mulberry32(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ITEMS_PER_RUN = 10;
const MAX_SCORE = 200;
const HARD_LIMIT_SEC = 240;

export default function FirewallPage() {
  const router = useRouter();
  const { runId } = getSession();
  useEffect(() => { if (!runId) router.push('/'); }, [runId, router]);

  const rules = useMemo(() => {
    const seed = runId ? hashStringToSeed(runId) : Math.floor(Math.random() * 2 ** 31);
    return seededShuffle(RULES_POOL, seed).slice(0, ITEMS_PER_RUN);
  }, [runId]);

  const [answers, setAnswers] = useState<Record<string, 'allow' | 'block' | null>>(
    () => Object.fromEntries(rules.map(r => [r.id, null]))
  );
  const [saving, setSaving] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [missionMessage, setMissionMessage] = useState('');
  const [keyPart, setKeyPart] = useState<string | null>(null);

  const startTs = useRef<number>(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    startTs.current = Date.now();
    const t = setInterval(() => {
      const e = Math.floor((Date.now() - startTs.current) / 1000);
      setElapsed(e);
      if (e >= HARD_LIMIT_SEC) void finish();
    }, 250);
    return () => clearInterval(t);
  }, []);

  const { correct, mistakes } = useMemo(() => {
    let c = 0, m = 0;
    for (const r of rules) {
      const a = answers[r.id];
      if (a == null) continue;
      (a === r.label) ? c++ : m++;
    }
    return { correct: c, mistakes: m };
  }, [rules, answers]);

  // cálculo manual del puntaje
  const base = (correct / rules.length) * MAX_SCORE;
  let penalty = mistakes * 5;

  // penalización de tiempo: después de 120s quita 2 puntos cada 10s
  if (elapsed > 120) {
    const extraSec = elapsed - 120;
    penalty += Math.floor(extraSec / 10) * 2;
  }

  const finalScore = Math.max(0, Math.round(base - penalty));

  const allAnswered = Object.values(answers).every(v => v !== null);

  // bloquear respuesta una vez elegida
  const setAnswer = (id: string, val: 'allow' | 'block') =>
    setAnswers(prev => (prev[id] === null ? { ...prev, [id]: val } : prev));

  async function finish() {
    if (!runId || saving) return;
    setSaving(true);

    const part = generateKeyPart(4);

    try {
      await saveStationResult({
        runId,
        stationKey: 'firewall',
        mode: 'web',
        score: finalScore,
        meta: { elapsed_sec: elapsed, answers, rules, key_part: part }
      });

      setKeyPart(part);
      setMissionMessage(
        `🔥 Firewall restablecido correctamente.\n\n` +
        `🔐 Parte de la LLAVE MAESTRA: ${part}\n\n` +
        `Cópiala y guárdala para la fase final.`
      );
      setOpenDialog(true);
    } catch (e: any) {
      alert(e.message ?? 'Error guardando resultado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Firewall — ¿Permitir o Bloquear?</h1>
          <p className="text-xs opacity-70">
            Decide correctamente. Después de 2 minutos se descontarán 2 puntos cada 10 segundos.
          </p>
        </div>
        <div className="text-sm px-3 py-1 rounded bg-amber-700">
          ⏱ {elapsed}s
        </div>
      </header>

      <section className="space-y-3">
        {rules.map((r, idx) => (
          <div key={r.id} className="border rounded p-3 flex items-center gap-3">
            <span className="text-xs opacity-70 w-6">#{idx + 1}</span>
            <div className="flex-1">{r.text}</div>
            <div className="flex gap-2">
              <button
                disabled={answers[r.id] !== null}
                className={`px-3 py-1 rounded border ${answers[r.id] === 'allow' ? 'bg-green-700 text-white' : 'bg-white/5'}`}
                onClick={() => setAnswer(r.id, 'allow')}
              >
                Permitir
              </button>
              <button
                disabled={answers[r.id] !== null}
                className={`px-3 py-1 rounded border ${answers[r.id] === 'block' ? 'bg-red-700 text-white' : 'bg-white/5'}`}
                onClick={() => setAnswer(r.id, 'block')}
              >
                Bloquear
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="border rounded p-4 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-sm opacity-70">Progreso</div>
          <div>{Object.values(answers).filter(v => v !== null).length}/{rules.length}</div>
        </div>
        <div>
          <div className="text-sm opacity-70">Aciertos / Errores</div>
          <div>{correct} ✅ / {mistakes} ❌</div>
        </div>
        <div>
          <div className="text-sm opacity-70">Puntaje</div>
          <div className="text-2xl font-bold">{finalScore} pts</div>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="underline" onClick={() => router.push('/play')}>Salir</button>
          <button
            onClick={finish}
            disabled={saving || !allAnswered}
            className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Finalizar'}
          </button>
        </div>
      </section>

      <MissionDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        title="🛡️ Misión completada: Firewall"
        message={missionMessage}
        copyText={keyPart ?? undefined}
      />
    </main>
  );
}
