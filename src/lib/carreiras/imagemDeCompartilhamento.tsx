import { readFile } from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import { MARCA_41_CARREIRAS } from "./enderecoDeCarreiras";
import { TAMANHO_DA_IMAGEM } from "./metadados41";

// A imagem que aparece na prévia do link do 41 Carreiras (LinkedIn, WhatsApp,
// Pandapé) — 1200 × 630, nas cores da 41 Tallent, com o logo dela como veio
// (public/41-tallent/logo.png), o título e os dados da vaga.
//
// As letras do portal (Unbounded e Hanken Grotesk) vêm do Google Fonts na
// primeira imagem e ficam guardadas na memória; se o Google não responder a
// tempo, a imagem sai com a letra padrão do gerador — nunca deixa de sair.

const ROXO = "#3b0670";
const NOITE = "#22033f";
const LILAS = "#d090ff";
const LILAS_CLARO = "#ebd3ff";

type Fonte = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };

const fontes = new Map<string, Promise<ArrayBuffer | null>>();

async function baixarFonte(familia: string, peso: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${familia.replace(/ /g, "+")}:wght@${peso}`, {
      signal: AbortSignal.timeout(2500),
    }).then((r) => (r.ok ? r.text() : null));
    const url = css?.match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function fonte(familia: string, peso: number): Promise<ArrayBuffer | null> {
  const chave = `${familia}:${peso}`;
  let p = fontes.get(chave);
  if (!p) {
    p = baixarFonte(familia, peso).then((dados) => {
      // Falhou: esquece, para a próxima imagem tentar de novo.
      if (!dados) fontes.delete(chave);
      return dados;
    });
    fontes.set(chave, p);
  }
  return p;
}

async function fontesDoPortal(): Promise<Fonte[]> {
  const [titulo, tituloForte, texto] = await Promise.all([fonte("Unbounded", 400), fonte("Unbounded", 500), fonte("Hanken Grotesk", 600)]);
  const lista: Fonte[] = [];
  if (titulo) lista.push({ name: "Unbounded", data: titulo, weight: 400, style: "normal" });
  if (tituloForte) lista.push({ name: "Unbounded", data: tituloForte, weight: 500, style: "normal" });
  if (texto) lista.push({ name: "Hanken Grotesk", data: texto, weight: 600, style: "normal" });
  return lista;
}

let logo: Promise<string | null> | null = null;
let marca: Promise<string | null> | null = null;
const imagemComoDataUri = (arquivo: string) =>
  readFile(path.join(process.cwd(), "public", "41-tallent", arquivo))
    .then((b) => `data:image/png;base64,${b.toString("base64")}`)
    .catch(() => null);

/** A trama de triângulos de 60° e os contornos, desenhados atrás do texto. */
const FUNDO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><pattern id="t" width="56" height="97" patternUnits="userSpaceOnUse"><path d="M0 .5h56M0 49h56M0 0l56 97M56 0L0 97" fill="none" stroke="${LILAS}" stroke-width="1"/></pattern>
  <linearGradient id="m" x1="0" x2="1"><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.85" stop-color="#fff" stop-opacity="1"/></linearGradient>
  <mask id="k"><rect width="1200" height="630" fill="url(#m)"/></mask></defs>
  <rect width="1200" height="630" fill="url(#t)" opacity="0.16" mask="url(#k)"/>
  <polygon points="690,120 1010,674 370,674" fill="none" stroke="${LILAS}" stroke-width="2" opacity="0.45"/>
  <polygon points="690,250 935,674 445,674" fill="none" stroke="${LILAS}" stroke-width="2" opacity="0.3"/>
  <rect x="860" y="0" width="340" height="630" fill="${LILAS}"/>
  <polygon points="860,0 860,630 824,630" fill="${LILAS}"/>
</svg>`,
).toString("base64")}`;

/** "Analista fiscal sênior com experiência em…" → até `max` caracteres, sem cortar palavra. */
function curto(texto: string, max: number): string {
  const t = texto.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), max - 12)).trimEnd()}…`;
}

export type ConteudoDaImagem = {
  /** O rótulo pequeno de cima: "Vaga aberta", "Vagas abertas". */
  selo: string;
  titulo: string;
  /** A linha de baixo do título: empresa e cidade, ou a frase da capa. */
  linha: string | null;
  /** Modelo, contrato… */
  etiquetas: string[];
  /** O endereço do portal, no rodapé da imagem. */
  endereco: string;
};

export async function imagemDeCompartilhamento41(c: ConteudoDaImagem): Promise<ImageResponse> {
  logo ??= imagemComoDataUri("logo.png");
  marca ??= imagemComoDataUri("marca.png");
  const [fontesCarregadas, logoUri, marcaUri] = await Promise.all([fontesDoPortal(), logo, marca]);
  const temUnbounded = fontesCarregadas.some((f) => f.name === "Unbounded");
  const familiaTitulo = temUnbounded ? "Unbounded" : undefined;
  const familiaTexto = fontesCarregadas.some((f) => f.name === "Hanken Grotesk") ? "Hanken Grotesk" : undefined;

  const titulo = curto(c.titulo, 80);
  const tamanhoDoTitulo = titulo.length <= 34 ? 64 : titulo.length <= 56 ? 52 : 42;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: ROXO, color: "#fff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem do gerador (Satori), não da página */}
        <img src={FUNDO} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 800, height: "100%", padding: "56px 0 52px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {marcaUri && (
              // eslint-disable-next-line @next/next/no-img-element -- imagem do gerador (Satori)
              <img src={marcaUri} width={64} height={64} alt="" style={{ borderRadius: 14 }} />
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontFamily: familiaTitulo, fontWeight: 500, fontSize: 30, letterSpacing: 0.5 }}>{MARCA_41_CARREIRAS.nome}</span>
              <span style={{ fontFamily: familiaTitulo, fontWeight: 400, fontSize: 14, letterSpacing: 4, color: LILAS, marginTop: 4 }}>
                {`POR ${MARCA_41_CARREIRAS.recrutamento.toUpperCase()}`}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontFamily: familiaTitulo, fontWeight: 400, fontSize: 18, letterSpacing: 5, color: LILAS }}>{c.selo.toUpperCase()}</span>
            <span style={{ fontFamily: familiaTitulo, fontWeight: 400, fontSize: tamanhoDoTitulo, lineHeight: 1.08, letterSpacing: -1.5, marginTop: 16 }}>{titulo}</span>
            {c.linha && (
              <span style={{ fontFamily: familiaTexto, fontWeight: 600, fontSize: 28, color: LILAS_CLARO, marginTop: 20 }}>{curto(c.linha, 70)}</span>
            )}
            {c.etiquetas.length > 0 && (
              <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                {c.etiquetas.slice(0, 3).map((e) => (
                  <span
                    key={e}
                    style={{ fontFamily: familiaTexto, fontWeight: 600, fontSize: 22, padding: "8px 18px", borderRadius: 999, border: `2px solid ${LILAS}`, color: "#fff" }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}
          </div>

          <span style={{ fontFamily: familiaTexto, fontWeight: 600, fontSize: 20, color: LILAS }}>
            {`Processos seletivos conduzidos pela ${MARCA_41_CARREIRAS.recrutamento} · ${c.endereco}`}
          </span>
        </div>

        <div style={{ position: "absolute", right: 0, top: 0, width: 340, height: 630, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {logoUri && (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do gerador (Satori)
            <img src={logoUri} width={300} height={300} alt="" />
          )}
        </div>
        <div style={{ position: "absolute", left: 0, bottom: 0, width: 824, height: 8, background: NOITE }} />
      </div>
    ),
    {
      ...TAMANHO_DA_IMAGEM,
      fonts: fontesCarregadas.length ? fontesCarregadas : undefined,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    },
  );
}
