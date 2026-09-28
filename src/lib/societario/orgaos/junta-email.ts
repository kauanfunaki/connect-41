// Leitura dos avisos que a Junta Comercial manda por e-mail (Empresa Fácil).
//
// Por que e-mail: o painel da Junta pede "não sou robô" a cada acesso, até ao
// voltar para o mesmo processo (Ruli, 24/09) — nem com uma pessoa ajudando
// compensa. Mas a Junta avisa por e-mail cada mudança, e tudo chega no
// societario@41contabil.com.br. O n8n lê essa caixa e entrega aqui.
//
// ─── Modo sugestão ───────────────────────────────────────────────────────────
//
// Esta leitura foi escrita em 28/09 **sem nenhum e-mail real de exemplo** (a
// Ruli ia encaminhar três: exigência, deferimento e cancelamento). Por isso
// ela só SUGERE, e o critério é o de `classificarPainel` (`junta.ts`): o que
// não for claro vai para a pessoa em vez de virar palpite.
//
// - Mais de um desfecho no mesmo texto ("exigência" e "deferido") → REVISAR.
// - Nenhum → REVISAR.
// - "INDEFERIDO" contém "DEFERIDO": a ordem de checagem existe por isso.
//
// Quando os exemplos chegarem, o que muda é a lista de palavras e, se o
// remetente for fixo, um filtro por ele — não a regra de não aplicar sozinho.

import { normalizarStatus, protocoloDoReaproveitamento } from "./junta";

export type SugestaoDoAviso = "EXIGENCIA" | "DEFERIDO" | "CANCELADO" | "REVISAR";

export type EmailRecebido = {
  remetente: string | null;
  assunto: string | null;
  texto: string;
};

export type LeituraDoAviso = {
  /** O e-mail parece ser da Junta/Empresa Fácil, ou cita um protocolo que acompanhamos. */
  ehDaJunta: boolean;
  /** Protocolos pendentes (dos que acompanhamos) citados no texto. */
  protocolos: string[];
  sugestao: SugestaoDoAviso;
  /** Trecho que parece descrever a exigência, para a pessoa revisar. */
  detalhe: string | null;
  /** Protocolo novo quando o anterior foi reaproveitado (a Junta troca o número). */
  protocoloNovo: string | null;
};

/** Marcas de que o e-mail vem da Junta — no remetente, no assunto ou no corpo. */
const MARCAS_DA_JUNTA = ["JUCEPAR", "JUNTA COMERCIAL", "EMPRESA FACIL", "EMPRESAFACIL", "REDESIM"];

// Ordem importa: INDEFERID antes de DEFERID. Raiz sem a última letra pega
// feminino e plural (deferida, deferidos).
const PALAVRAS: { sugestao: Exclude<SugestaoDoAviso, "REVISAR">; raizes: string[] }[] = [
  { sugestao: "CANCELADO", raizes: ["INDEFERID", "CANCELAD", "REAPROVEITAD", "ARQUIVAMENTO NEGAD"] },
  { sugestao: "EXIGENCIA", raizes: ["EXIGENCIA", "EM EXIGENCIA", "COM EXIGENCIA"] },
  // "EMITID" ficou de fora: "guia emitida" aparece em aviso de taxa e viraria
  // deferido falso.
  { sugestao: "DEFERIDO", raizes: ["DEFERID", "REGISTRAD", "ARQUIVAD"] },
];

/** Tira acento, junta espaço e deixa em caixa alta — o mesmo de `normalizarStatus`. */
function normalizar(texto: string): string {
  return normalizarStatus(texto);
}

/** Só letras e números, para achar "PRP 2523-827360" como "PRP2523827360". */
function compacto(texto: string): string {
  return normalizar(texto).replace(/[^A-Z0-9]/g, "");
}

function desfechosCitados(textoNormalizado: string): Set<Exclude<SugestaoDoAviso, "REVISAR">> {
  let resto = ` ${textoNormalizado} `;
  const achados = new Set<Exclude<SugestaoDoAviso, "REVISAR">>();
  for (const { sugestao, raizes } of PALAVRAS) {
    for (const raiz of raizes) {
      if (resto.includes(raiz)) {
        achados.add(sugestao);
        // Apaga o que já contou, para "INDEFERIDO" não contar também como DEFERIDO.
        resto = resto.split(raiz).join(" ");
      }
    }
  }
  return achados;
}

/**
 * O trecho a partir da primeira menção a exigência — é onde a Junta costuma
 * listar o que falta. Até 1.500 caracteres; a pessoa ajusta antes de aplicar.
 */
function trechoDaExigencia(texto: string): string | null {
  const limpo = texto.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const semAcento = limpo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const i = semAcento.indexOf("EXIGENCIA");
  if (i < 0) return null;
  const inicio = Math.max(0, limpo.lastIndexOf("\n", i) + 1);
  const trecho = limpo.slice(inicio, inicio + 1500).trim();
  return trecho || null;
}

/**
 * Lê um e-mail e diz o que ele parece significar para os protocolos que
 * acompanhamos.
 *
 * `protocolosPendentes` são os números dos protocolos da Junta ainda em aberto
 * no tenant. Procurar **esses** números no texto, em vez de adivinhar o
 * formato do número da Junta, funciona mesmo sem ter visto um e-mail real — e
 * não casa número de outra coisa por engano.
 */
export function lerAvisoDaJunta(email: EmailRecebido, protocolosPendentes: string[]): LeituraDoAviso {
  const inteiro = [email.remetente ?? "", email.assunto ?? "", email.texto].join("\n");
  const norm = normalizar(inteiro);
  const comp = compacto(inteiro);

  const protocolos = [
    ...new Set(protocolosPendentes.filter((n) => n && compacto(n).length >= 6 && comp.includes(compacto(n)))),
  ];
  const ehDaJunta = protocolos.length > 0 || MARCAS_DA_JUNTA.some((m) => compacto(norm).includes(m.replace(/ /g, "")));

  const desfechos = desfechosCitados(norm);
  const sugestao: SugestaoDoAviso = desfechos.size === 1 ? [...desfechos][0] : "REVISAR";

  return {
    ehDaJunta,
    protocolos,
    sugestao,
    detalhe: sugestao === "EXIGENCIA" ? trechoDaExigencia(email.texto) : null,
    protocoloNovo: protocoloDoReaproveitamento(email.texto),
  };
}

/** Texto do e-mail sem HTML, para guardar e mostrar. Corta em 20 mil caracteres. */
export function textoDoEmail(texto: string | null | undefined, html: string | null | undefined): string {
  const base =
    texto && texto.trim()
      ? texto
      : (html ?? "")
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
  return base
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20_000);
}
