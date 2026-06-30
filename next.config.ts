import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera .next/standalone (server.js minimal) para imagem Docker enxuta no EasyPanel
  output: "standalone",
  // Fixa a raiz no diretório do projeto (há outros lockfiles em Documents/);
  // sem isto o Next infere a raiz errada e o standalone sai aninhado/quebrado.
  outputFileTracingRoot: __dirname,
  turbopack: { root: __dirname },
};

export default nextConfig;
