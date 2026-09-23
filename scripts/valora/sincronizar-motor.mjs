// Copia o motor do Valora do Connect (fonte única) para o 41-gestao.
//
//   node scripts/valora/sincronizar-motor.mjs [caminho-do-41-gestao]
//   node scripts/valora/sincronizar-motor.mjs --verificar [caminho]   → sai com 1 se a cópia divergiu
//
// Por que cópia e não pacote: os dois apps constroem por Docker no EasyPanel, e um
// pacote privado exigiria token do GitHub no build dos dois. A cópia leva um
// cabeçalho que proíbe editar lá; o --verificar pega quem editou mesmo assim.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEM = resolve(AQUI, "../../src/lib/valora/motor");
const args = process.argv.slice(2);
const verificar = args.includes("--verificar");
const alvo = resolve(args.find((a) => !a.startsWith("--")) ?? resolve(AQUI, "../../../41-gestao"));
const DESTINO = join(alvo, "src/lib/valora/motor");

const CABECALHO =
  "// CÓPIA do motor do Valora — a fonte é connect-41/src/lib/valora/motor.\n" +
  "// NÃO EDITAR AQUI: mude no Connect e rode `node scripts/valora/sincronizar-motor.mjs` de lá.\n\n";

if (!existsSync(join(alvo, "package.json"))) {
  console.error(`41-gestao não encontrado em ${alvo}`);
  process.exit(2);
}

const arquivos = readdirSync(ORIGEM).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
// Compara sem olhar a quebra de linha: o Git no Windows troca LF por CRLF no checkout, e isso
// não é edição da cópia.
const semCr = (s) => s.replace(/
/g, "
");
const esperado = new Map(arquivos.map((f) => [f, CABECALHO + semCr(readFileSync(join(ORIGEM, f), "utf8"))]));

if (verificar) {
  const presentes = existsSync(DESTINO) ? readdirSync(DESTINO) : [];
  const divergentes = [
    ...[...esperado].filter(([f, c]) => !presentes.includes(f) || semCr(readFileSync(join(DESTINO, f), "utf8")) !== c).map(([f]) => f),
    ...presentes.filter((f) => !esperado.has(f)),
  ];
  if (divergentes.length) {
    console.error(`Motor do 41-gestao diverge do Connect: ${divergentes.join(", ")}`);
    process.exit(1);
  }
  console.log("Motor do 41-gestao igual ao do Connect.");
  process.exit(0);
}

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });
for (const [f, conteudo] of esperado) writeFileSync(join(DESTINO, f), conteudo);
console.log(`${esperado.size} arquivos copiados para ${DESTINO}`);
