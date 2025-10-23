'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/session';
import { saveStationResult } from '@/lib/game';
import { generateKeyPart } from '@/lib/keys';
import MissionDialog from '@/components/MissionDialog';

/**
 * Drones — Starmap con selección (5 por dron) y puntaje tope 200
 * - Imagen base: /2.png en /public
 * - Cada hotspot muestra 5 señales a clasificar
 * - Acierto suma, error resta. Máximo 200. Respuesta queda fijada (no se puede corregir)
 * - Zoom-out al cerrar / salir / finalizar
 */

/* ====== Puntaje ====== */
// Para 25 señales totales (5 drones x 5 señales) y tope 200:
const PTS_CORRECT = 8;   // 25 * 8 = 200 si acierta todo
const PTS_WRONG   = -8;  // resta por error
const MAX_SCORE   = 200;

/* ====== Datos (redactado más simple) ====== */
type Choice = 'normal' | 'sus';
type Signal = { id: string; text: string; correct: Choice; hint?: string };
type Scene  = { id: string; title: string; signals: Signal[] };

const SCENES_POOL: Scene[] = [
  {
    id: 'scene_update',
    title: 'Mensajes y páginas',
    signals: [
      { id: 's1', text: 'Correo desconocido pidiendo actualizar con un enlace.', correct: 'sus',    hint: 'Las actualizaciones reales no llegan por correos raros.' },
      { id: 's2', text: 'Aviso de actualización dentro del sistema de la empresa.', correct: 'normal' },
      { id: 's3', text: 'Dirección web parecida a la oficial pero no igual.',        correct: 'sus',    hint: 'Dominio “casi igual” suele ser trampa.' },
      { id: 's4', text: 'Actualización programada por soporte.',                     correct: 'normal' },
      { id: 's5', text: 'Página que pide datos de tarjeta para “verificar seguridad”.', correct: 'sus' },
    ],
  },
  {
    id: 'scene_remote',
    title: 'Accesos y logins',
    signals: [
      { id: 's1', text: 'Piden segundo paso para entrar (código al celular).', correct: 'normal' },
      { id: 's2', text: 'Clave simple o por defecto (admin/admin).',           correct: 'sus' },
      { id: 's3', text: 'Alerta de inicio de sesión desde un lugar inusual.',  correct: 'sus' },
      { id: 's4', text: 'Ingreso por portal oficial con candado (https).',     correct: 'normal' },
      { id: 's5', text: 'Te piden tu clave por chat o correo.',                correct: 'sus' },
    ],
  },
  {
    id: 'scene_data',
    title: 'Movimiento de información',
    signals: [
      { id: 's1', text: 'Copia de seguridad semanal anunciada.',                correct: 'normal' },
      { id: 's2', text: 'Envío de datos sensibles a las 3 a. m. sin aviso.',   correct: 'sus' },
      { id: 's3', text: 'Archivo compartido con el equipo por canal oficial.',  correct: 'normal' },
      { id: 's4', text: 'Conexiones a un servicio que nadie pidió.',            correct: 'sus' },
      { id: 's5', text: 'Transferencia interna por conexión segura.',           correct: 'normal' },
    ],
  },
  {
    id: 'scene_config',
    title: 'Configuración del equipo',
    signals: [
      { id: 's1', text: 'Actualizaciones automáticas apagadas sin motivo.', correct: 'sus' },
      { id: 's2', text: 'Contraseñas con reglas claras (largas y cambio periódico).', correct: 'normal' },
      { id: 's3', text: 'Puertos abiertos a internet sin necesidad.',        correct: 'sus' },
      { id: 's4', text: 'Solo personal autorizado puede entrar.',            correct: 'normal' },
      { id: 's5', text: 'Equipo sin antivirus/EDR activo.',                  correct: 'sus' },
    ],
  },
  {
    id: 'scene_phys',
    title: 'Revisión en sitio',
    signals: [
      { id: 's1', text: 'Memoria USB conectada que nadie reconoce.',  correct: 'sus' },
      { id: 's2', text: 'Carcasa cerrada y sin daños.',               correct: 'normal' },
      { id: 's3', text: 'Puerto de servicio abierto durante operación.', correct: 'sus' },
      { id: 's4', text: 'Mantenimiento por personal identificado.',   correct: 'normal' },
      { id: 's5', text: 'Pegatina con la clave pegada al equipo.',    correct: 'sus' },
    ],
  },
  {
    id: 'scene_c2',
    title: 'Patrones de red',
    signals: [
      { id: 's1', text: 'Señales periódicas a un sitio desconocido.', correct: 'sus' },
      { id: 's2', text: 'Pequeña señal de “todo ok” cada cierto tiempo.', correct: 'normal' },
      { id: 's3', text: 'Tráfico constante hacia afuera sin razón clara.', correct: 'sus' },
      { id: 's4', text: 'Conexión verificada con el servidor de la empresa.', correct: 'normal' },
      { id: 's5', text: 'Muchos intentos de conexión fallidos seguidos.', correct: 'sus' },
    ],
  },
];

/* ====== Hotspots ====== */
type Hotspot = { id: string; name: string; x: number; y: number; targetScale: number; sceneIds: string[] };

const HOTSPOTS: Hotspot[] = [
  { id: 'cassiopeia', name: 'CASSIOPEIA', x: 12, y: 18, targetScale: 2.2, sceneIds: ['scene_update'] },
  { id: 'virgo',      name: 'VIRGO',      x: 10, y: 76, targetScale: 2.0, sceneIds: ['scene_data'] },
  { id: 'perseus',    name: 'PERSEUS',    x: 53, y: 64, targetScale: 2.0, sceneIds: ['scene_config'] },
  { id: 'orion',      name: 'ORION',      x: 88, y: 27, targetScale: 2.2, sceneIds: ['scene_remote','scene_c2'] },
  { id: 'saturn',     name: 'PLANETA',    x: 35, y: 50, targetScale: 1.7, sceneIds: ['scene_phys'] },
];

/* ====== Helpers ====== */
type ViewSignal = { key: string; scene: string; text: string; correct: Choice };

// hash simple determinístico (para ordenar distinto por dron/run)
function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

// toma señales de las escenas y devuelve EXACTAMENTE 5, orden fijo por hotspot+run
function get5SignalsFor(sceneIds: string[], seed: string): ViewSignal[] {
  const sceneMap = new Map(SCENES_POOL.map(s => [s.id, s]));
  const all: ViewSignal[] = [];
  for (const id of sceneIds) {
    const sc = sceneMap.get(id); if (!sc) continue;
    for (const s of sc.signals) {
      all.push({ key: `${id}:${s.id}`, scene: sc.title, text: s.text, correct: s.correct });
    }
  }
  // barajar de forma determinística según seed
  const rnd = hashStr(seed);
  const arr = [...all].sort((a, b) => {
    const ha = (hashStr(a.key + seed) ^ rnd) % 9973;
    const hb = (hashStr(b.key + seed) ^ rnd) % 9973;
    return ha - hb;
  });
  return arr.slice(0, 5);
}

/* ====== Página ====== */
export default function DronesStarmapPage() {
  const router = useRouter();
  const { runId } = getSession();

  // cámara
  const [scale, setScale] = React.useState(1);
  const [tx, setTx] = React.useState(0);
  const [ty, setTy] = React.useState(0);

  const [active, setActive] = React.useState<Hotspot | null>(null);
  const [openCard, setOpenCard] = React.useState(false);

  // visitas y selecciones
  const [visitedHotspots, setVisitedHotspots] = React.useState<Set<string>>(new Set());
  const [selections, setSelections] = React.useState<Record<string, Choice | undefined>>({}); // key -> elegido

  // puntaje en vivo
  const [score, setScore] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);

  React.useEffect(() => {
    let s = 0, ok = 0;
    for (const h of HOTSPOTS) {
      const signals = get5SignalsFor(h.sceneIds, `${runId}-${h.id}`);
      for (const sig of signals) {
        const chosen = selections[sig.key];
        if (!chosen) continue;
        if (chosen === sig.correct) { s += PTS_CORRECT; ok += 1; }
        else { s += PTS_WRONG; }
      }
    }
    s = Math.min(MAX_SCORE, Math.max(0, s)); // 0..200
    setScore(s);
    setCorrectCount(ok);
  }, [selections, runId]);

  function focusHotspot(h: Hotspot) {
    setActive(h);
    setOpenCard(true);
    setVisitedHotspots(prev => new Set(prev).add(h.id));
    const dx = 50 - h.x, dy = 50 - h.y;
    setScale(h.targetScale);
    setTx(dx / h.targetScale);
    setTy(dy / h.targetScale);
  }

  function resetCam() {
    setScale(1); setTx(0); setTy(0); setActive(null);
  }

  // fijar respuesta (si ya existe, NO cambia)
  function choose(sig: ViewSignal, choice: Choice) {
    setSelections(prev => {
      if (prev[sig.key] !== undefined) return prev; // bloqueo cambio
      return { ...prev, [sig.key]: choice };
    });
  }

  // finalizar y guardar
  const [saving, setSaving] = React.useState(false);
  const [openDialog, setOpenDialog] = React.useState(false);
  const [missionMessage, setMissionMessage] = React.useState('');
  const [keyPart, setKeyPart] = React.useState<string | null>(null);

  async function finishAndSave() {
    if (!runId) return alert('Sin sesión de juego');

    const visited = visitedHotspots.size;
    const bounded = Math.min(MAX_SCORE, Math.max(0, score));
    const part = generateKeyPart(4);

    try {
      setSaving(true);
      await saveStationResult({
        runId,
        stationKey: 'drones',
        mode: 'web',
        score: bounded,
        meta: {
          style: 'starmap',
          visited_hotspots: Array.from(visitedHotspots),
          picks: selections,
          correctCount,
          key_part: part
        }
      });
      setKeyPart(part);
      setMissionMessage(
        `Mapa completado. Sectores visitados: ${visited}/5.\n` +
        `Respuestas correctas: ${correctCount}.\n` +
        `Puntaje final: ${bounded}/${MAX_SCORE}.\n\n` +
        `🔐 Parte de la LLAVE MAESTRA: ${part}`
      );
      resetCam();
      setOpenDialog(true);
    } catch (e: any) {
      alert(e?.message ?? 'Error guardando resultado');
    } finally {
      setSaving(false);
    }
  }

  const signals = active ? get5SignalsFor(active.sceneIds, `${runId}-${active.id}`) : [];

  return (
    <main className="relative min-h-screen bg-black text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">🛰️ Drones — Mapa de estrellas</h1>
          <p className="text-xs sm:text-sm opacity-70">
            En cada parada clasifica 5 señales: marca si “se ve bien” o “es sospechoso”.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs sm:text-sm">Puntaje: <b>{score}</b> / {MAX_SCORE}</div>
          <button onClick={resetCam} className="text-xs sm:text-sm underline opacity-80 hover:opacity-100">Reset vista</button>
          <button
            onClick={() => { resetCam(); router.push('/play'); }}
            className="text-xs sm:text-sm underline opacity-80 hover:opacity-100"
          >
            Salir
          </button>
        </div>
      </header>

      {/* STARMAP */}
      <div className="relative w-full h-[70vh] sm:h-[72vh] md:h-[76vh] overflow-hidden">
        <div
          className="absolute inset-0 will-change-transform transition-transform duration-700 ease-out"
          style={{ transform: `translate(${tx}%, ${ty}%) scale(${scale})`, transformOrigin: '50% 50%' }}
        >
          <img
            src="/2.png"
            alt="Starmap"
            className="w-full h-full object-cover select-none pointer-events-none"
            draggable={false}
          />
          {HOTSPOTS.map(h => (
            <button
              key={h.id}
              onClick={() => focusHotspot(h)}
              style={{ left: `${h.x}%`, top: `${h.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-xs
                          border backdrop-blur-sm
                          ${active?.id === h.id ? 'bg-white/20 border-white' : 'bg-white/10 border-white/30'}
                          hover:bg-white/20 hover:border-white/60`}
              aria-label={`Ir a ${h.name}`}
            >
              {h.name}
            </button>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="px-4 sm:px-6 py-4 flex items-center gap-3">
        <div className="text-xs opacity-70">Sectores visitados: {visitedHotspots.size}/5</div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={finishAndSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded px-3 py-2 text-sm"
          >
            {saving ? 'Guardando…' : 'Finalizar y guardar'}
          </button>
        </div>
      </footer>

      {/* Tarjeta con 5 señales (respuesta se fija al elegir) */}
      {openCard && active && (
        <div
          className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center p-4 z-50"
          onClick={() => { setOpenCard(false); setTimeout(resetCam, 600); }}
        >
          <div
            className="w-full sm:max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl">🛰️</div>
              <div>
                <div className="font-semibold">
                  {active.name}: Marca lo bueno y lo sospechoso (5 señales)
                </div>
                <div className="text-xs opacity-70 -mt-0.5">
                  Acierto +{PTS_CORRECT} / Error {PTS_WRONG} · La respuesta queda fijada
                </div>
              </div>
              <button
                onClick={() => { setOpenCard(false); setTimeout(resetCam, 600); }}
                className="ml-auto text-xs underline opacity-70 hover:opacity-100"
              >
                Cerrar
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {signals.map(sig => {
                const chosen = selections[sig.key];
                const isCorrect = chosen && chosen === sig.correct;
                const isWrong = chosen && chosen !== sig.correct;
                return (
                  <li key={sig.key}
                      className={`rounded border p-3 ${isCorrect ? 'border-emerald-500/60 bg-emerald-900/20' : isWrong ? 'border-red-500/60 bg-red-900/20' : 'border-white/10 bg-white/5'}`}>
                    <div className="text-[11px] uppercase tracking-wide opacity-70">{sig.scene}</div>
                    <div className="mt-1 text-sm">{sig.text}</div>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => choose(sig, 'normal')}
                        disabled={chosen !== undefined}
                        className={`px-2 py-1 rounded text-xs border disabled:opacity-50 ${
                          chosen === 'normal' ? 'bg-white text-black' : 'bg-transparent'
                        }`}
                        aria-pressed={chosen === 'normal'}
                      >
                        Se ve bien
                      </button>
                      <button
                        onClick={() => choose(sig, 'sus')}
                        disabled={chosen !== undefined}
                        className={`px-2 py-1 rounded text-xs border disabled:opacity-50 ${
                          chosen === 'sus' ? 'bg-white text-black' : 'bg-transparent'
                        }`}
                        aria-pressed={chosen === 'sus'}
                      >
                        Sospechoso
                      </button>

                      {chosen && (
                        <span className={`ml-auto text-xs ${isCorrect ? 'text-emerald-400' : 'text-red-300'}`}>
                          {isCorrect ? `+${PTS_CORRECT}` : `${PTS_WRONG}`} · respuesta fijada
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs opacity-80">
                Correctas: {correctCount} · Puntaje parcial: <b>{score}</b> / {MAX_SCORE}
              </div>
              <button
                onClick={() => { setOpenCard(false); setTimeout(resetCam, 600); }}
                className="rounded px-3 py-2 text-sm bg-white/10 hover:bg-white/20 border border-white/15"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MissionDialog */}
      <MissionDialog
        open={openDialog}
        onOpenChange={(open) => {
          setOpenDialog(open);
          if (!open) { resetCam(); router.replace('/play'); }
        }}
        title="🛰️ Starmap completado"
        message={missionMessage}
        copyText={keyPart ?? undefined}
      />
    </main>
  );
}
