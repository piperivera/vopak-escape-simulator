'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

type MissionDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  message: string;
  nextPath?: string;
  buttonLabel?: string;
  copyText?: string; // <- NUEVO (opcional)
};

export default function MissionDialog({
  open,
  onOpenChange,
  title,
  message,
  nextPath = '/play',
  buttonLabel = 'Continuar misión',
  copyText
}: MissionDialogProps) {
  const router = useRouter();

  async function copy() {
    try {
      if (!copyText) return;
      await navigator.clipboard.writeText(copyText);
      // hint pequeña
      alert(`Copiado: ${copyText}`);
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-gray-900 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed opacity-90 whitespace-pre-line mt-2">
          {message}
        </p>

        <DialogFooter className="pt-4 flex gap-2">
          {copyText && (
            <button
              onClick={copy}
              className="bg-zinc-700 hover:bg-zinc-600 transition text-white rounded px-3 py-2"
              title="Copiar al portapapeles"
            >
              Copiar parte
            </button>
          )}
          <button
            onClick={() => {
              onOpenChange(false);
              router.push(nextPath);
            }}
            className="bg-blue-600 hover:bg-blue-700 transition text-white rounded px-4 py-2"
          >
            {buttonLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
