import { cpSync, existsSync } from "node:fs";
const pastaNext = process.env.CONNECT_QA_DIST_DIR === ".local/sped-fiscal/next" ? ".local/sped-fiscal/next" : ".next";

// O Next não inclui os assets no standalone; o servidor precisa deles para
// servir os estilos, JavaScript e arquivos públicos do mesmo build.
if (!existsSync(`${pastaNext}/standalone/server.js`)) {
  throw new Error("Servidor standalone ausente. Execute next build primeiro.");
}

for (const [origem, destino] of [
  ["public", `${pastaNext}/standalone/public`],
  [`${pastaNext}/static`, `${pastaNext}/standalone/${pastaNext}/static`],
]) {
  if (existsSync(origem)) cpSync(origem, destino, { recursive: true });
}

console.log("Assets públicos e estáticos preparados no standalone.");
