// components/PosterDialog.tsx
'use client';
import * as React from 'react';

type Props = {
  open: boolean;
  title: string;
  posterSrc: string;         // ej: "/posters/estacion-1.png"
  subtitle?: string;
  onClose: () => void;
  onPlayWeb?: () => void;
  onRegisterPresencial?: () => void;
};

export default function PosterDialog({
  open, title, subtitle, posterSrc, onClose, onPlayWeb, onRegisterPresencial,
}: Props) {
  const imgRef = React.useRef<HTMLImageElement|null>(null);
  const [scale, setScale] = React.useState(1);

  // Auto-ajuste al cargar imagen y al cambiar tamaño de la ventana
  const fitToViewport = React.useCallback(() => {
    const img = imgRef.current;
    if (!img) return;

    const vw = Math.max(320, window.innerWidth);
    const vh = Math.max(320, window.innerHeight);

    // padding del cuadro + alto del footer con botones
    const PAD_X = 32; // px
    const PAD_Y = 32 + 72; // padding + footer
    const maxW = vw * 0.92 - PAD_X;
    const maxH = vh * 0.92 - PAD_Y;

    const iw = img.naturalWidth || 1080;
    const ih = img.naturalHeight || 1920;

    const s = Math.min(maxW / iw, maxH / ih, 1);
    setScale(Number.isFinite(s) ? Math.max(0.2, s) : 1);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onResize = () => fitToViewport();
    window.addEventListener('resize', onResize);
    // pequeño defer para esperar al layout
    const t = setTimeout(fitToViewport, 0);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(t); };
  }, [open, fitToViewport]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="w-[92vw] max-w-[980px] max-h-[92vh] bg-zinc-900 border border-white/15 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <div className="min-w-0">
            <div className="text-sm opacity-70 truncate">{subtitle}</div>
            <h2 className="font-semibold truncate">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm rounded bg-white/10 hover:bg-white/20"
            aria-label="Cerrar"
          >
            Cerrar
          </button>
        </div>

        {/* Poster (contenedor flexible + scroll si hiciera falta) */}
        <div className="flex-1 overflow-auto grid place-items-center p-4">
          <img
            ref={imgRef}
            src={posterSrc}
            alt={title}
            onLoad={fitToViewport}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
            className="select-none pointer-events-none max-w-none"
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10 flex items-center gap-2 flex-wrap">
          {onPlayWeb && (
            <button
              className="bg-violet-600 hover:bg-violet-500 text-white rounded px-3 py-2 text-sm"
              onClick={onPlayWeb}
            >
              Jugar (Web)
            </button>
          )}
          {onRegisterPresencial && (
            <button
              className="bg-amber-600 hover:bg-amber-500 text-white rounded px-3 py-2 text-sm"
              onClick={onRegisterPresencial}
            >
              Registrar presencial
            </button>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs opacity-70">
            <span>Zoom:</span>
            <button
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={() => setScale(s => Math.max(0.25, +(s - 0.1).toFixed(2)))}
            >−</button>
            <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
            <button
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={() => setScale(s => Math.min(2, +(s + 0.1).toFixed(2)))}
            >＋</button>
            <button
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={fitToViewport}
            >Ajustar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
