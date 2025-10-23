import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },     // 🚫 no frena el build por ESLint
  typescript: { ignoreBuildErrors: true },  // (opcional) ignora TS en build
  images: { unoptimized: true },            // evita optimizador si usas <img>
};
export default nextConfig;



