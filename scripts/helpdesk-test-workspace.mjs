// Cópia do pacote local para testar a distribuição sem disputar o servidor
// do desenvolvedor. Credenciais e arquivos operacionais nunca são copiados.
import { access, cp, mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";

export async function prepararWorkspaceDeTeste(raiz, finalidade) {
  const origem = path.join(raiz, ".next", "standalone");
  try { await access(path.join(origem, "server.js")); }
  catch { throw new Error("Execute npm run build:local com o banco de testes antes da verificação de interface."); }
  const base = path.join(raiz, ".local", "helpdesk");
  await mkdir(base, { recursive: true });
  const workspace = await mkdtemp(path.join(base, finalidade + "-"));
  await cp(origem, workspace, { recursive: true, dereference: true, filter: p => !path.basename(p).startsWith(".env") && p !== path.join(origem, "storage") });
  console.log("Pacote de teste isolado em " + workspace);
  return workspace;
}
