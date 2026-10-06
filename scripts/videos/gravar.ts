// Grava os vídeos de passo a passo da ajuda contra o Connect LOCAL.
//
//   node scripts/local/recriar-banco.mjs                      (dados do zero)
//   node scripts/local/com-banco-local.mjs npx next start -p 3100   (em outro terminal)
//   node scripts/local/com-banco-local.mjs npx tsx scripts/videos/gravar.ts portal
//   node scripts/local/com-banco-local.mjs npx tsx scripts/videos/gravar.ts portal 02 04
//   node scripts/local/com-banco-local.mjs npx tsx scripts/videos/gravar.ts equipe 01 05
//
// Dois grupos: `portal` (o cliente, `cliente.demo@exemplo.invalido`) e `equipe`
// (as telas internas, com a administradora local Camila Duarte — 06/10/2026).
// Os números escolhem vídeos pelo prefixo. Saída em `videos/{grupo}/` (fora do
// git): um .webm por vídeo; em `_conferencia/`, uma foto por legenda, para
// revisar o texto sem assistir tudo, e um `avisos.txt` quando a tela acusou
// erro durante a gravação; e o `_lista.json`, com título, chave da ajuda e
// duração de cada vídeo — a base da `videos/LISTA.md`.
//
// Alguns roteiros mudam os dados (aprovar uma conta, responder uma pendência).
// Para regravar um deles, recrie o banco antes.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { abrirNavegador, gravar, sessaoLogada, type DefinicaoDeVideo } from "./gravador";
import { videosDoPortal } from "./portal";
import { videosDaEquipe } from "./equipe";
import { abrirCaixaDeEmailLocal } from "../local/caixa-de-email";

const PASTA = path.resolve("videos");

type Grupo = {
  videos: (apoio: string) => DefinicaoDeVideo[];
  login: { url: string; email: string; senha: string; destino: RegExp; campoSenha?: string };
};

function grupos(): Record<string, () => Grupo> {
  return {
    portal: () => {
      const senha = process.env.LOCAL_PORTAL_PASSWORD;
      if (!senha) throw new Error("Falta LOCAL_PORTAL_PASSWORD (rode pelo scripts/local/com-banco-local.mjs).");
      const email = "cliente.demo@exemplo.invalido";
      return {
        videos: (apoio) => videosDoPortal({ email, senha, pastaDeApoio: apoio }),
        login: { url: "/portal/login", email, senha, destino: /\/portal(\/|$)(?!login)/ },
      };
    },
    equipe: () => {
      const senha = process.env.SEED_ADMIN_PASSWORD;
      if (!senha) throw new Error("Falta SEED_ADMIN_PASSWORD (rode pelo scripts/local/com-banco-local.mjs).");
      return {
        videos: (apoio) => videosDaEquipe({ pastaDeApoio: apoio }),
        login: {
          url: "/login",
          email: "adm6@41bpo.com.br",
          senha,
          destino: /^(?!.*\/login).*$/,
          campoSenha: "#password",
        },
      };
    },
  };
}

type ItemDaLista = { arquivo: string; titulo: string; chave: string; segundos: number };

/** Junta o que foi gravado agora ao `_lista.json` da pasta, pelo nome do arquivo. */
function atualizarLista(saida: string, novos: ItemDaLista[]) {
  const arquivo = path.join(saida, "_lista.json");
  const antes: ItemDaLista[] = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : [];
  const porArquivo = new Map(antes.map((i) => [i.arquivo, i]));
  for (const n of novos) porArquivo.set(n.arquivo, n);
  const lista = [...porArquivo.values()].sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  writeFileSync(arquivo, JSON.stringify(lista, null, 2) + "\n");
}

async function main() {
  const [nomeDoGrupo, ...filtro] = process.argv.slice(2);
  const fabrica = grupos()[nomeDoGrupo ?? ""];
  if (!fabrica) {
    console.error(`Uso: gravar.ts <${Object.keys(grupos()).join("|")}> [números…]`);
    process.exit(1);
  }
  const grupo = fabrica();

  const saida = path.join(PASTA, nomeDoGrupo);
  const apoio = path.join(saida, ".apoio");
  mkdirSync(saida, { recursive: true });
  const todos = grupo.videos(apoio);
  const escolhidos = filtro.length ? todos.filter((v) => filtro.some((f) => v.arquivo.startsWith(f))) : todos;

  // O SMTP do escritório local aponta para esta caixa (ver preparar-ambiente):
  // aberta, os avisos por e-mail "saem" e a tela não acusa SMTP faltando.
  const caixa = await abrirCaixaDeEmailLocal();
  const browser = await abrirNavegador();
  const gravados: ItemDaLista[] = [];
  try {
    // O token de acesso vale 15 minutos, e a sessão salva não acompanha o
    // refresh que cada vídeo faz por conta própria: passado esse tempo, o vídeo
    // seguinte caía na tela de entrada no meio do roteiro (06/10/2026). Entra de
    // novo a cada 10 minutos — e não a cada vídeo, que estouraria o limite de
    // 20 entradas por IP em 15 minutos no RASCUNHO.
    const arquivoDaSessao = path.join(apoio, "sessao.json");
    let estado = "";
    let entrouEm = 0;
    for (const video of escolhidos) {
      if (video.logado && Date.now() - entrouEm > 10 * 60_000) {
        estado = await sessaoLogada(browser, grupo.login, arquivoDaSessao);
        entrouEm = Date.now();
      }
      process.stdout.write(`• ${video.arquivo}… `);
      try {
        const { destino, segundos, avisos } = await gravar(browser, video, { pastaDeSaida: saida, estadoLogado: estado });
        gravados.push({ arquivo: path.basename(destino), titulo: video.titulo, chave: video.chave, segundos });
        const nota = avisos.length ? ` — ${avisos.length} aviso(s), ver avisos.txt` : "";
        console.log(`ok (${segundos} s) → ${path.relative(process.cwd(), destino)}${nota}`);
      } catch (e) {
        console.log("falhou");
        console.error(`  ${String(e).split("\n").slice(0, 6).join("\n  ")}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await browser.close();
    await caixa.fechar();
    // A sessão salva é um cookie válido do Connect local: não fica largada.
    rmSync(path.join(apoio, "sessao.json"), { force: true });
    if (gravados.length) atualizarLista(saida, gravados);
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
