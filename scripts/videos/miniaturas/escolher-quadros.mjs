// Escolhe, para cada vídeo, o quadro da gravação que vira a "tela" da miniatura:
// o mais cheio de conteúdo na área do recorte (sem o menu, de cima até 660 px),
// sem legenda escura dentro dela, entre 30% e 85% do vídeo (depois da navegação
// de abertura, antes do "Pronto!"). Rodar com o cwd na raiz do repo.
//   node scripts/videos/miniaturas/escolher-quadros.mjs <saida.json> [ajustes.json]
// ajustes.json: os quadros escolhidos a dedo onde a escolha automática errou
// (tela vazia, Home no lugar da tela do vídeo, legenda no canto) — 08/10/2026.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
const sharp = createRequire(path.join(process.cwd(), "package.json"))("sharp");
const [saida, ajustesJson] = process.argv.slice(2);
const AJUSTES = ajustesJson && fs.existsSync(ajustesJson) ? JSON.parse(fs.readFileSync(ajustesJson, "utf8")) : {};

async function pontos(arquivo, esquerda) {
  const { data, info } = await sharp(arquivo)
    .extract({ left: esquerda, top: 0, width: 1600 - esquerda, height: 660 })
    .resize({ width: 240 }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let soma = 0, soma2 = 0, escuros = 0;
  // Legenda da gravação: caixa sólida quase preta (~30); texto da tela, encolhido, não chega lá.
  for (const v of data) { soma += v; soma2 += v * v; if (v < 40) escuros++; }
  const n = info.width * info.height;
  const media = soma / n;
  const desvio = Math.sqrt(soma2 / n - media * media);
  const escuro = escuros / n;
  // Com legenda no recorte, ou com janela aberta (o fundo escurecido baixa a média), o quadro perde.
  const limpo = escuro < 0.004 && media > 205;
  return { desvio, escuro, media, limpo, nota: desvio + (limpo ? 1000 : 0) - escuro * 2000 };
}

(async () => {
  const resultado = {};
  for (const grupo of ["equipe", "portal"]) {
    const base = path.join("videos", grupo, "_conferencia");
    for (const video of fs.readdirSync(base).sort()) {
      const chave = `${grupo}/${video}`;
      if (AJUSTES[chave]) { resultado[chave] = AJUSTES[chave]; continue; }
      const quadros = fs.readdirSync(path.join(base, video)).filter((f) => f.endsWith(".png")).sort();
      const esquerda = video === "01-entrar-no-portal" ? 0 : 240;
      // Do 2º ao penúltimo (o 1º é o cartaz de abertura e o último, o "Pronto!"); limpo vence.
      const de = 1;
      const ate = quadros.length - 1;
      let melhor = null;
      for (const q of quadros.slice(de, ate)) {
        const p = await pontos(path.join(base, video, q), esquerda);
        if (!melhor || p.nota > melhor.nota) melhor = { arquivo: q, ...p };
      }
      resultado[chave] = { arquivo: melhor.arquivo, esquerda };
      console.log(chave, melhor.arquivo, melhor.limpo ? "limpo" : "SUJO", `média ${melhor.media.toFixed(0)} escuro ${(melhor.escuro * 100).toFixed(2)}%`);
    }
  }
  fs.writeFileSync(saida, JSON.stringify(resultado, null, 2));
})();
