// app/page.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, setSession } from '@/lib/session';
import { ensureRun } from '@/lib/game';

export default function Home() {
  const router = useRouter();
  const s = getSession();
  const [team, setTeam] = useState(s.teamName ?? '');
  const [starting, setStarting] = useState(false);
  const astroRef = useRef<HTMLImageElement | null>(null);

  // Parallax del astronauta
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 14;
      const y = (e.clientY / window.innerHeight - 0.5) * 14;
      if (astroRef.current) {
        astroRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Iniciar misión
  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const name = team.trim() || 'Equipo sin nombre';
      const { runId } = setSession({ teamName: name });
      await ensureRun(runId!, name);
      router.push('/play');
    } catch (e: any) {
      alert(e?.message ?? 'No se pudo iniciar la misión');
      setStarting(false);
    }
  };

  return (
    <main className="relative mx-auto max-w-7xl px-6 md:px-10 py-12 md:py-20 min-h-[88vh] grid grid-cols-1 lg:grid-cols-2 items-center gap-10">
      {/* Columna izquierda: título + formulario */}
      <section className="max-w-3xl">
        <h1 className="text-5xl md:text-6xl font-black leading-tight drop-shadow-lg">
          <span className="text-white block">Vopak Escape</span>
          <span className="text-[#F6C10E] block">Inicia tu misión</span>
        </h1>

        <div className="mt-10 rounded-2xl bg-white/10 backdrop-blur-md p-6 md:p-7 border border-white/20 max-w-2xl">
          <label className="block text-sm opacity-80 mb-2">Nombre del equipo</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 rounded-lg px-4 py-3 text-black outline-none"
              placeholder="Ej: Halcones Cibernéticos"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void start(); }}
            />
            <button
              type="button"
              onClick={() => void start()}
              disabled={starting}
              className="rounded-lg bg-[#F6C10E] text-black font-semibold px-6 py-3 hover:brightness-110 transition disabled:opacity-60"
            >
              {starting ? 'Iniciando…' : 'Empezar'}
            </button>
          </div>

          {s.runId && (
            <p className="mt-3 text-xs opacity-80">
              Sesión detectada para <b>{s.teamName ?? 'Equipo sin nombre'}</b>. Puedes continuar o cambiar el nombre arriba.
            </p>
          )}
        </div>
      </section>

      {/* Columna derecha: astronauta centrado */}
      <section className="relative h-[320px] sm:h-[380px] md:h-[420px] lg:h-[460px] flex items-center justify-center">
        <img
          ref={astroRef}
          src="/space/astronauta.png"
          alt="Astronauta Vopak"
          className="w-48 sm:w-56 md:w-64 lg:w-72 select-none pointer-events-none"
          style={{
            animation: 'drift 6s ease-in-out infinite',
            filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.35))',
          }}
        />
      </section>
    </main>
  );
}
