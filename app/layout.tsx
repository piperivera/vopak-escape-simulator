import type { Metadata } from 'next';
import './globals.css';
import SpaceBackground from '@/components/SpaceBackground';

export const metadata: Metadata = {
  title: 'VOPAK Escape Simulator',
  description: 'Cyber Escape Room',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen text-white">
        <SpaceBackground /> {/* z negativo */}
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
