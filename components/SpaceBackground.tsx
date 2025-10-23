// components/SpaceBackground.tsx
'use client';
import { useEffect, useState } from 'react';

export default function SpaceBackground() {
  const [phase, setPhase] = useState<'idle' | 'rocket' | 'astro'>('idle');
  const [stars] = useState(() =>
    Array.from({ length: 160 }).map(() => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 3}s`,
      opacity: 0.55 + Math.random() * 0.4,
      size: Math.random() < 0.18 ? 2 : 1,
    }))
  );

  useEffect(() => {
    let cancelled = false;
    const ROCKET_DURATION = 7000;
    const ASTRO_DURATION  = 7000;
    const GAP_BETWEEN     = 3000;
    const GAP_LOOP        = 6000;

    async function loop() {
      while (!cancelled) {
        setPhase('rocket'); await wait(ROCKET_DURATION);
        setPhase('idle');   await wait(GAP_BETWEEN);
        setPhase('astro');  await wait(ASTRO_DURATION);
        setPhase('idle');   await wait(GAP_LOOP);
      }
    }
    loop();
    return () => { cancelled = true; };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-50 overflow-hidden">
      {/* Gradiente base (cubre todo) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B1F5C] to-[#0E2A73]" />

      {/* Estrellas mosaico 1 (muchas y visibles) */}
      <div
        className="absolute inset-0 opacity-[0.85] will-change-transform"
        style={{
          backgroundImage: "url('/space/stars.png')",
          backgroundRepeat: 'repeat',
          backgroundSize: '700px auto',      // más chico = más densidad
          backgroundPosition: '0 0',
          animation: 'starsScroll 120s linear infinite',
        }}
      />
      {/* Estrellas mosaico 2 (parallax más lento) */}
      <div
        className="absolute inset-0 opacity-[0.45] will-change-transform"
        style={{
          backgroundImage: "url('/space/stars.png')",
          backgroundRepeat: 'repeat',
          backgroundSize: '1100px auto',
          backgroundPosition: '0 0',
          animation: 'starsScrollAlt 220s linear infinite',
        }}
      />

      {/* Vignette / halo */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(1300px 700px at 50% 30%, rgba(255,255,255,0.06), rgba(0,0,0,0))',
        }}
      />

      {/* Estrellitas twinkle */}
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              opacity: s.opacity,
              animation: 'twinkle 2.6s ease-in-out infinite',
              animationDelay: s.delay,
            }}
          />
        ))}
      </div>

      {/* Nave y astronauta (nunca a la vez) */}
      {phase === 'rocket' && (
        <img
          src="/space/cohete.png"
          alt=""
          className="absolute h-24 sm:h-28 md:h-32"
          style={{
            left: '-25vw',
            top: '16vh',
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.35))',
            animation: 'rocketL2R 7s linear forwards',
          }}
        />
      )}

      {phase === 'astro' && (
        <img
          src="/space/astronauta.png"
          alt=""
          className="absolute h-28 sm:h-32 md:h-36"
          style={{
            right: '-25vw',
            bottom: '12vh',
            filter: 'drop-shadow(0 8px 16px rgba(0,0,0,.35))',
            animation: 'astroR2L 7s linear forwards',
          }}
        />
      )}
    </div>
  );
}

function wait(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}
