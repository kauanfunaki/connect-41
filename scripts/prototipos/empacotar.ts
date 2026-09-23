// Monta o texto que se cola no Console do EasyPanel de um protótipo: embute os
// dados no script de carga (no lugar do marcador `/*__DADOS__*/ null`),
// compacta, e confere o sha256 lá dentro antes de rodar — colagem cortada pelo
// terminal web falha na conferência, e não no meio da carga.
//
// Os scripts de carga resolvem o @prisma/client a partir do diretório atual,
// por isso o `cd /app` antes do node.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const MARCADOR = "/*__DADOS__*/ null";

export function empacotar(opcoes: { script: string; dados: unknown; pasta: string; arquivos?: Record<string, string> }) {
  const modelo = readFileSync(opcoes.script, "utf8");
  if (!modelo.includes(MARCADOR)) throw new Error(`Marcador __DADOS__ não encontrado em ${opcoes.script}`);
  const script = modelo.replace(MARCADOR, JSON.stringify(opcoes.dados));

  const sha = createHash("sha256").update(script).digest("hex");
  const b64 = gzipSync(script, { level: 9 }).toString("base64").replace(/(.{76})/g, "$1\n");

  const colar = [
    "cat > /tmp/carga.b64 <<'FIM_DA_CARGA'",
    b64,
    "FIM_DA_CARGA",
    "base64 -d /tmp/carga.b64 | gunzip > /tmp/carga.cjs",
    `echo "${sha}  /tmp/carga.cjs" | sha256sum -c && cd /app && node /tmp/carga.cjs`,
    "",
  ].join("\n");

  const pasta = join(tmpdir(), opcoes.pasta);
  mkdirSync(pasta, { recursive: true });
  for (const [nome, conteudo] of Object.entries(opcoes.arquivos ?? {})) writeFileSync(join(pasta, nome), conteudo);
  writeFileSync(join(pasta, "colar-no-console.sh"), colar);

  return { pasta, kb: Math.round(colar.length / 1024), linhas: colar.split("\n").length };
}
