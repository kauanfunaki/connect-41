import { cpSync, existsSync } from "node:fs";

// O Next não inclui os assets no standalone; o servidor precisa deles para
// servir os estilos, JavaScript e arquivos públicos do mesmo build.
if (!existsSync(".next/standalone/server.js")) {
  throw new Error("Servidor standalone ausente. Execute next build primeiro.");
}

for (const [origem, destino] of [
  ["public", ".next/standalone/public"],
  [".next/static", ".next/standalone/.next/static"],
]) {
  if (existsSync(origem)) cpSync(origem, destino, { recursive: true });
}

console.log("Assets públicos e estáticos preparados no standalone.");
