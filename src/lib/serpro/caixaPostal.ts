// Caixa Postal da Receita pelo Serpro — regras puras (Fase 1, 20/10/2026).
//
// Três serviços, três custos:
// - o indicador (INNOVAMSG63, Monitorar) diz de graça se há mensagem nova;
// - a lista (MSGCONTRIBUINTE61, Consultar, R$ 0,24) traz até 50 mensagens com
//   assunto, data e relevância, e não dá ciência;
// - o detalhe (MSGDETALHAMENTO62, Consultar) traz o corpo e DÁ CIÊNCIA da
//   intimação (Decreto 70.235/1972, art. 23, § 2º, III): o prazo começa a
//   contar no ato. Decisão do Kauan em 20/10/2026: só a coordenação do Fiscal
//   abre, com confirmação e registro; o agendador nunca.
//
// Uma mensagem é "nova" enquanto ninguém a abre — no e-CAC ou aqui. Desde
// 05/09/2026 os ponteiros de página têm 24 dígitos: tratados como texto.

import sanitizeHtml from "sanitize-html";
import { explicarErro, temMensagemDeErro, type PedidoAoSerpro, type RespostaLida } from "./regras";
import { pedidoDoServico, servicoDoCatalogo, type Leitura } from "./servicos";

const servico = (idServico: string) => servicoDoCatalogo("CAIXAPOSTAL", idServico)!;
export const INDICADOR = servico("INNOVAMSG63");
export const LISTA = servico("MSGCONTRIBUINTE61");
export const DETALHE = servico("MSGDETALHAMENTO62");

export const pedidoDoIndicador = (documento: string): PedidoAoSerpro => pedidoDoServico(INDICADOR, documento, null);
/** A primeira página das não lidas (statusLeitura 2): as mais recentes primeiro. */
export const pedidoDaLista = (documento: string): PedidoAoSerpro => pedidoDoServico(LISTA, documento, { statusLeitura: "2", indicadorPagina: "0" });
export const pedidoDoDetalhe = (documento: string, isn: string): PedidoAoSerpro => pedidoDoServico(DETALHE, documento, { isn });

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

function recusada(r: RespostaLida): string | null {
  if (r.status < 200 || r.status >= 300 || temMensagemDeErro(r.mensagens)) return explicarErro(r.status, r.mensagens);
  return null;
}

/** O primeiro item de `conteudo`, onde os três serviços põem o que importa. */
function conteudo(r: RespostaLida): Objeto | null {
  const d = objeto(r.dados);
  return Array.isArray(d?.conteudo) ? objeto(d.conteudo[0]) : null;
}

/** 0 = nenhuma; 1 = uma nova; 2 = várias. */
export function lerIndicador(r: RespostaLida): Leitura<{ novas: 0 | 1 | 2 }> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const n = Number(conteudo(r)?.indicadorMensagensNovas);
  if (n !== 0 && n !== 1 && n !== 2) return { ok: false, erro: "O Serpro não disse se há mensagem nova." };
  return { ok: true, dados: { novas: n } };
}

/** "AAAAMMDD" (+ "HHMMSS") no horário de Brasília → instante. Só a data = meio-dia. Vazio = null. */
export function instanteDaReceita(data: unknown, hora?: unknown): Date | null {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(texto(data));
  if (!d) return null;
  const h = (texto(hora) && /^(\d{2})(\d{2})(\d{2})$/.exec(texto(hora).padStart(6, "0"))) || ["", "12", "00", "00"];
  return new Date(`${d[1]}-${d[2]}-${d[3]}T${h[1]}:${h[2]}:${h[3]}-03:00`);
}

/** O assunto como a Receita mostra: "++VARIAVEL++" trocado pelo parâmetro. */
export function montarAssunto(modelo: string, parametro: string): string {
  return modelo.replace(/\+\+VARIAVEL\+\+/g, parametro).replace(/\s+/g, " ").trim();
}

export type MensagemDaLista = {
  isn: string;
  assunto: string;
  enviadaEm: Date;
  relevante: boolean;
  origem: string | null;
  numeroControle: string | null;
  validaAte: Date | null;
  cienciaEm: Date | null;
  lida: boolean;
};

export function lerLista(r: RespostaLida): Leitura<{ mensagens: MensagemDaLista[]; ultimaPagina: boolean }> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const c = conteudo(r);
  if (!c) return { ok: false, erro: "O Serpro não devolveu a lista de mensagens." };
  const mensagens: MensagemDaLista[] = [];
  for (const bruta of Array.isArray(c.listaMensagens) ? c.listaMensagens : []) {
    const m = objeto(bruta);
    const isn = texto(m?.isn);
    const enviadaEm = instanteDaReceita(m?.dataEnvio, m?.horaEnvio);
    if (!m || !isn || !enviadaEm) continue;
    mensagens.push({
      isn,
      assunto: montarAssunto(texto(m.assuntoModelo), texto(m.valorParametroAssunto)).slice(0, 400) || "(sem assunto)",
      enviadaEm,
      relevante: texto(m.relevancia) === "2",
      origem: texto(m.descricaoOrigem).slice(0, 120) || null,
      numeroControle: texto(m.numeroControle).slice(0, 30) || null,
      validaAte: instanteDaReceita(m.dataValidade),
      cienciaEm: instanteDaReceita(m.dataCiencia),
      lida: texto(m.indicadorLeitura) === "1",
    });
  }
  return { ok: true, dados: { mensagens, ultimaPagina: texto(c.indicadorUltimaPagina).toUpperCase() !== "N" } };
}

const escaparHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const HTML_PERMITIDO: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "table", "thead", "tbody", "tr", "td", "th", "span", "div"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
};

/**
 * O corpo como a Receita mostra: "++1++", "++2++"… trocados pelas variáveis,
 * na ordem. O corpo vem em HTML; as variáveis entram escapadas e o resultado
 * passa pelo sanitize — o texto é de fora e vai para a tela.
 */
export function montarCorpo(modelo: string, variaveis: unknown[]): string {
  return limparCorpo(modelo.replace(/\+\+(\d{1,2})\+\+/g, (_, n: string) => escaparHtml(texto(variaveis[Number(n) - 1]))));
}

/** O sanitize do corpo — na gravação e de novo na leitura, antes de ir para a tela. */
export function limparCorpo(html: string): string {
  return sanitizeHtml(html, HTML_PERMITIDO).trim();
}

export function lerDetalhe(r: RespostaLida): Leitura<{ assunto: string; corpo: string; cienciaEm: Date | null }> {
  const erro = recusada(r);
  if (erro) return { ok: false, erro };
  const m = conteudo(r);
  if (!m) return { ok: false, erro: "O Serpro não devolveu a mensagem." };
  return {
    ok: true,
    dados: {
      assunto: montarAssunto(texto(m.assuntoModelo), texto(m.valorParametroAssunto)),
      corpo: montarCorpo(texto(m.corpoModelo), Array.isArray(m.variaveis) ? m.variaveis : []),
      cienciaEm: instanteDaReceita(m.dataCiencia),
    },
  };
}
