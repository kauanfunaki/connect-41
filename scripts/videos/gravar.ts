// Grava os vídeos de passo a passo da ajuda contra o Connect LOCAL.
//
//   node scripts/local/recriar-banco.mjs                      (dados do zero)
//   node scripts/local/com-banco-local.mjs npx next start -p 3100   (em outro terminal)
//   node scripts/local/com-banco-local.mjs npx tsx scripts/videos/gravar.ts portal
//   node scripts/local/com-banco-local.mjs npx tsx scripts/videos/gravar.ts portal 02 04
//
// Os números escolhem vídeos pelo prefixo. Saída em `videos/{grupo}/` (fora do
// git): um .webm por vídeo e, em `_conferencia/`, uma foto por legenda, para
// revisar o texto sem assistir tudo.
//
// Alguns roteiros mudam os dados (aprovar uma conta, responder uma pendência).
// Para regravar um deles, recrie o banco antes.

import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { abrirNavegador, gravar, sessaoLogada, type DefinicaoDeVideo } from "./gravador";
import { videosDoPortal } from "./portal";

const PASTA = path.resolve("videos");

async function main() {
  const [grupo, ...filtro] = process.argv.slice(2);
  if (grupo !== "portal") {
    console.error("Uso: gravar.ts portal [números…]");
    process.exit(1);
  }
  const senha = process.env.LOCAL_PORTAL_PASSWORD;
  if (!senha) throw new Error("Falta LOCAL_PORTAL_PASSWORD (rode pelo scripts/local/com-banco-local.mjs).");

  const saida = path.join(PASTA, grupo);
  const apoio = path.join(saida, ".apoio");
  mkdirSync(saida, { recursive: true });
  const email = "cliente.demo@exemplo.invalido";
  const todos: DefinicaoDeVideo[] = videosDoPortal({ email, senha, pastaDeApoio: apoio });
  const escolhidos = filtro.length ? todos.filter((v) => filtro.some((f) => v.arquivo.startsWith(f))) : todos;

  const browser = await abrirNavegador();
  try {
    const estado = await sessaoLogada(
      browser,
      { url: "/portal/login", email, senha, destino: /\/portal(\/|$)(?!login)/ },
      path.join(apoio, "sessao.json")
    );
    for (const video of escolhidos) {
      const inicio = Date.now();
      process.stdout.write(`• ${video.arquivo}… `);
      try {
        const arquivo = await gravar(browser, video, { pastaDeSaida: saida, estadoLogado: estado });
        console.log(`ok (${Math.round((Date.now() - inicio) / 1000)} s) → ${path.relative(process.cwd(), arquivo)}`);
      } catch (e) {
        console.log("falhou");
        console.error(`  ${String(e).split("\n").slice(0, 6).join("\n  ")}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
    // A sessão salva é um cookie válido do portal local: não fica largada.
    rmSync(path.join(apoio, "sessao.json"), { force: true });
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
