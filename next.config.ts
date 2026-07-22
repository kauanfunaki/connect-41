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
  // Service worker de push (public/sw.js) — sem isto cairia no fallback de
  // script-src, que funciona mas fica implícito; explícito documenta a intenção.
  "worker-src 'self'",
  "font-src 'self' data:",
  // brasilapi.com.br: autocompletar dados da empresa a partir do CNPJ
  // (EmpresaForm.tsx) — sem essa origem liberada, o fetch falha silenciosamente
  // bloqueado pela CSP (a falha de rede já é tratada como best-effort no form).
  "connect-src 'self' https://brasilapi.com.br",
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
    return [
      { source: "/:path*", headers: securityHeaders },
      // Sem isto, qualquer cache intermediário (CDN/proxy na frente do domínio,
      // fora do controle deste app) pode servir HTML de um deploy anterior —
      // e como a referência de Server Action embutida no HTML é específica de
      // cada build, isso causa "Failed to find Server Action" (404 na Server
      // Action) mesmo depois de hard refresh no navegador, porque o HTML nunca
      // chega a ser revalidado na origem. Exclui os assets estáticos do Next
      // (hash no nome do arquivo, já são cacheáveis por design) e os arquivos
      // de PWA/push, que precisam do próprio cache do navegador.
      {
        source: "/((?!_next/static|_next/image|favicon.ico|icons|brand|manifest.webmanifest|sw.js).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
