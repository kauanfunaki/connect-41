// Gera as miniaturas dos vídeos da ajuda no desenho A ("Título e tela"),
// escolhido pelo Kauan em 08/10/2026. Rodar com o cwd na raiz do repo:
//   node scripts/videos/miniaturas/escolher-quadros.mjs videos/miniaturas/quadros.json scripts/videos/miniaturas/ajustes.json
//   node scripts/videos/miniaturas/gerar.mjs videos/miniaturas public/miniaturas videos/miniaturas/quadros.json
// - lê os vídeos de scripts/videos/{equipe,portal}.ts (arquivo, chave e o cartaz
//   de abertura: título curto e subtítulo) e a duração de videos/LISTA.md;
// - recorta a tela do quadro escolhido em videos/*/_conferencia (sem a legenda);
// - renderiza 1280×720 no Chromium do Playwright e grava:
//   · YouTube: "<NN> - <título>.jpg" em 1280×720 (q90);
//   · Connect: "<slug>.jpg" em 960×540 (q82), com slug igual ao de lib/ajuda.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
const req = createRequire(path.join(process.cwd(), "package.json"));
const sharp = req("sharp");
const { chromium } = req("playwright");

const [saidaYT, saidaConnect, framesJson] = process.argv.slice(2);
const QUADROS = framesJson ? JSON.parse(fs.readFileSync(framesJson, "utf8")) : {};

// Área de cada vídeo da equipe pelo número do arquivo (o menu do Connect).
const SETOR = {
  bpo: ["BPO", "#B7791F"], geral: ["Geral", "#3B73ED"], passos: ["Primeiros passos", "#3B73ED"],
  tech: ["Tech", "#2E6FB8"], comercial: ["Comercial", "#E15A2B"], societario: ["Societário", "#C8860D"],
  dp: ["DP", "#7C5CBF"], recrutamento: ["Recrutamento", "#1E8E5A"], fiscal: ["Fiscal", "#C5374B"],
  gestao: ["Gestão", "#8A97A8"], portal: ["Portal do cliente", "#5C8BF0"],
};
function setorDaEquipe(n) {
  if (n <= 16) return SETOR.bpo;
  if (n >= 19 && n <= 21) return SETOR.passos;
  if (n <= 27) return SETOR.geral;
  if (n === 28) return SETOR.tech;
  if (n === 29) return SETOR.comercial;
  if (n <= 34) return SETOR.societario;
  if (n <= 40) return SETOR.dp;
  if (n <= 44) return SETOR.recrutamento;
  if (n === 45) return SETOR.fiscal;
  return SETOR.gestao;
}

function lerVideos(arquivoTs, grupo) {
  const t = fs.readFileSync(arquivoTs, "utf8");
  const blocos = t.split(/\n\s*arquivo: "/).slice(1);
  return blocos.map((b) => {
    const arquivo = b.slice(0, b.indexOf('"'));
    const chave = (b.match(/chave: "([^"]+)"/) || [])[1];
    const cartaz = b.match(/r\.cartaz\(SELO, "([^"]+)", "([^"]+)"/);
    if (!chave || !cartaz) throw new Error(`${grupo}/${arquivo}: sem chave ou cartaz`);
    return { grupo, arquivo, chave, titulo: cartaz[1], sub: cartaz[2] };
  });
}

function duracoes() {
  const t = fs.readFileSync("videos/LISTA.md", "utf8");
  const mapa = {};
  for (const m of t.matchAll(/`([0-9]{2}-[a-z0-9-]+)\.webm`[^\n]*\|\s*([0-9]+:[0-9]{2})\s*\|/g)) mapa[m[1]] = m[2];
  return mapa;
}

/** O nome do arquivo no Connect — o mesmo que `miniaturaDoVideo` monta em lib/ajuda/videos.ts. */
function slug(v) {
  return v.grupo === "portal" ? `portal-${v.chave}` : v.chave.replace(/:/g, "-");
}

const LOGO = fs.readFileSync("public/brand/logo-horizontal-dark.svg", "utf8").replace(/^<svg[^>]*>/, (s) =>
  s.replace(/width="[^"]*"/, "").replace(/height="[^"]*"/, "").replace("<svg", '<svg class="logo"'));

function html(v, telaDataUri) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@600&display=block">
<style>
* { box-sizing: border-box; margin: 0; }
html, body { width: 1280px; height: 720px; overflow: hidden; }
.mini { position: relative; width: 1280px; height: 720px; overflow: hidden; color: #fff;
  background: radial-gradient(130% 120% at 0% 0%, #1241A5 0%, #12347D 42%, #0B1F42 100%); }
.logo { position: absolute; left: 70px; top: 64px; width: 192px; height: auto; }
.texto { position: absolute; left: 70px; top: 192px; width: 525px; display: grid; gap: 26px; }
.chip { justify-self: start; display: inline-flex; align-items: center; gap: 12px; font: 600 22px/1 "IBM Plex Sans", sans-serif;
  letter-spacing: .1em; text-transform: uppercase; padding: 9px 19px; border-radius: 999px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.92); white-space: nowrap; }
.chip i { width: 15px; height: 15px; border-radius: 50%; background: ${v.cor}; box-shadow: 0 0 0 2px rgba(255,255,255,.28); }
.titulo { font: 600 ${v.titulo.length > 26 ? 66 : 82}px/1.02 "Space Grotesk", sans-serif; letter-spacing: -.015em; text-wrap: balance; }
.sub { font: 400 27px/1.3 "IBM Plex Sans", sans-serif; color: rgba(255,255,255,.74); text-wrap: balance; }
.pe { position: absolute; left: 70px; bottom: 59px; display: inline-flex; align-items: center; gap: 12px; font: 500 22px/1 "IBM Plex Sans", sans-serif; color: rgba(255,255,255,.62); }
.pe svg { width: 24px; height: 24px; }
.janela { position: absolute; left: 640px; top: 141px; width: 819px; height: 640px; overflow: hidden; border-radius: 18px; background: #fff;
  box-shadow: 0 38px 90px rgba(0,0,0,.45); outline: 3px solid rgba(255,255,255,.16); }
.janela img { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }
</style></head><body><div class="mini">${LOGO}
<div class="texto"><span class="chip"><i></i>${esc(v.area)}</span><p class="titulo">${esc(v.titulo)}</p><p class="sub">${esc(v.sub)}</p></div>
<span class="pe"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 8.2v7.6l6-3.8z" fill="currentColor"/></svg>Passo a passo${v.duracao ? " · " + v.duracao : ""}</span>
<div class="janela"><img src="${telaDataUri}"></div></div></body></html>`;
}

(async () => {
  const dur = duracoes();
  const videos = [
    ...lerVideos("scripts/videos/equipe.ts", "equipe").map((v) => {
      const [area, cor] = setorDaEquipe(Number(v.arquivo.slice(0, 2)));
      return { ...v, area, cor };
    }),
    ...lerVideos("scripts/videos/portal.ts", "portal").map((v) => ({ ...v, area: SETOR.portal[0], cor: SETOR.portal[1] })),
  ].map((v) => ({ ...v, duracao: dur[v.arquivo] }));

  fs.mkdirSync(saidaYT, { recursive: true });
  fs.mkdirSync(saidaConnect, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const lista = [];
  for (const v of videos) {
    const quadro = QUADROS[`${v.grupo}/${v.arquivo}`] || { arquivo: "02.png", topo: 0 };
    const origem = path.join("videos", v.grupo, "_conferencia", v.arquivo, quadro.arquivo);
    // A tela de cima (a legenda da gravação fica embaixo, a partir de ~690 de 900 px).
    // Sem o menu lateral (240 px de 1600): a miniatura já tem o logo, e a janela mostra a tela.
    const esquerda = quadro.esquerda ?? (v.arquivo === "01-entrar-no-portal" ? 0 : 240);
    const recorte = await sharp(origem).extract({ left: esquerda, top: quadro.topo || 0, width: 1600 - esquerda, height: 660 })
      .resize({ width: 1300 }).jpeg({ quality: 88 }).toBuffer();
    await page.setContent(html(v, "data:image/jpeg;base64," + recorte.toString("base64")), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    // Título que não cabe na coluna (palavra longa como "Transferências", ou mais
    // de três linhas) encolhe de 2 em 2 px até caber, sem invadir a janela.
    await page.evaluate(() => {
      const t = document.querySelector(".titulo");
      let tamanho = parseFloat(getComputedStyle(t).fontSize);
      const linha = () => parseFloat(getComputedStyle(t).fontSize) * 1.02;
      while (tamanho > 48 && (t.scrollWidth > t.clientWidth + 1 || t.offsetHeight > linha() * 3 + 2)) {
        tamanho -= 2;
        t.style.fontSize = `${tamanho}px`;
      }
    });
    const png = await page.screenshot({ type: "png" });
    const nomeYT = `${v.grupo === "portal" ? "Portal " : ""}${v.arquivo.slice(0, 2)} - ${v.titulo.replace(/[\\/:*?"<>|]/g, "")}.jpg`;
    await sharp(png).jpeg({ quality: 90, mozjpeg: true }).toFile(path.join(saidaYT, nomeYT));
    await sharp(png).resize({ width: 960 }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(saidaConnect, `${slug(v)}.jpg`));
    lista.push({ grupo: v.grupo, arquivo: v.arquivo, chave: v.chave, slug: slug(v), titulo: v.titulo, area: v.area, duracao: v.duracao || null, youtube: nomeYT });
    process.stdout.write(".");
  }
  await browser.close();
  fs.writeFileSync(path.join(saidaYT, "lista.json"), JSON.stringify(lista, null, 2));
  console.log(`\n${lista.length} miniaturas; sem duração: ${lista.filter((l) => !l.duracao).map((l) => l.arquivo).join(", ") || "nenhuma"}`);
})();
