import type { NextConfig } from "next";

// Content-Security-Policy pragmática: bloqueia origens externas de script/estilo
// (contém XSS a self), clickjacking (frame-ancestors none) e injeção de <base>.
// 'unsafe-inline'/'unsafe-eval' seguem permitidos porque o Next injeta scripts e
// estilos inline na hidratação — apertar isso com nonce é um follow-up separado.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Gera .next/standalone (server.js minimal) para imagem Docker enxuta no EasyPanel
  output: "standalone",
  // Fixa a raiz no diretório do projeto (há outros lockfiles em Documents/);
  // sem isto o Next infere a raiz errada e o standalone sai aninhado/quebrado.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
