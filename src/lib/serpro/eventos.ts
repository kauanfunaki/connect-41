// Eventos de Atualização do Serpro — regras puras (Fase 1, 20/10/2026).
//
// Um serviço de graça (Monitorar) que diz, para até 1.000 contribuintes por
// pedido, o dia do último evento de cada tipo nos últimos 60 dias. Funciona em
// dois tempos: pedir (devolve um protocolo e o tempo de espera) e, depois do
// tempo, obter a matriz [documento, dia]. O resultado fica guardado 20 minutos
// e sai na primeira leitura. Limites: 1.000 pedidos por dia, por evento.
//
// Na matriz, o dia vem como AAMMDD; vazio = nenhum evento; "x" = o Serpro negou
// o acesso (falta a Autorização de Acesso, conferida em D-1) — de graça, é o
// melhor sinal de quem precisa de autorização antes de uma chamada paga.
//
// Fontes (lidas em 20/10/2026): "Eventos de Atualização", "Limites" e "Mapa
// dos Eventos" na documentação do Integra Contador.

import { pessoa, type PedidoAoSerpro, type RespostaLida } from "./regras";
import { pedidoDoServico, servicoDoCatalogo, type Leitura } from "./servicos";

export const EVENTOS = ["E0301", "E0601", "E0701"] as const;
export type Evento = (typeof EVENTOS)[number];

export const ROTULO_DO_EVENTO: Record<Evento, string> = {
  E0301: "DCTFWeb recebeu apuração ou declaração",
  E0601: "Mensagem nova na Caixa Postal",
  E0701: "Pagamento novo, alterado ou cancelado",
};

/** Até quantos contribuintes por pedido. */
export const LOTE_MAXIMO = 1000;
/** O mínimo que o Serpro diz para esperar, mais a folga que a documentação recomenda. */
const ESPERA_MINIMA_MS = 3000;
const FOLGA_MS = 2000;

export type Grupo = { tipo: "PF" | "PJ"; documentos: string[] };

/** CPF e CNPJ vão em pedidos separados, de até 1.000 cada. */
export function gruposDeEventos(documentos: string[]): Grupo[] {
  const limpos = [...new Set(documentos.map((d) => pessoa(d).numero).filter((n) => n.length === 11 || n.length === 14))];
  const grupos: Grupo[] = [];
  for (const tipo of ["PJ", "PF"] as const) {
    const deste = limpos.filter((n) => (tipo === "PF" ? n.length === 11 : n.length === 14));
    for (let i = 0; i < deste.length; i += LOTE_MAXIMO) grupos.push({ tipo, documentos: deste.slice(i, i + LOTE_MAXIMO) });
  }
  return grupos;
}

const SERVICO = {
  PF: { pedir: "SOLICEVENTOSPF131", obter: "OBTEREVENTOSPF133" },
  PJ: { pedir: "SOLICEVENTOSPJ132", obter: "OBTEREVENTOSPJ134" },
} as const;

const servicoDeEventos = (idServico: string) => servicoDoCatalogo("EVENTOSATUALIZACAO", idServico)!;
const tipoDaLista = (tipo: Grupo["tipo"]) => (tipo === "PF" ? 3 : 4);

export function pedidoDeSolicitacao(evento: Evento, grupo: Grupo): PedidoAoSerpro {
  return {
    ...pedidoDoServico(servicoDeEventos(SERVICO[grupo.tipo].pedir), `lote:${grupo.documentos.length}`, { evento }),
    lote: { tipo: tipoDaLista(grupo.tipo), documentos: grupo.documentos },
  };
}

export function pedidoDeObtencao(evento: Evento, tipo: Grupo["tipo"], protocolo: string): PedidoAoSerpro {
  return {
    ...pedidoDoServico(servicoDeEventos(SERVICO[tipo].obter), "lote:0", { protocolo, evento }),
    lote: { tipo: tipoDaLista(tipo), documentos: [] },
  };
}

/** O tipo do pedido em `serpro_pedidos`: EVENTOS:E0601:PJ. */
export const tipoDoPedido = (evento: Evento, tipo: Grupo["tipo"]) => `EVENTOS:${evento}:${tipo}`;

export function lerTipoDoPedido(t: string): { evento: Evento; tipo: Grupo["tipo"] } | null {
  const m = /^EVENTOS:(E\d{4}):(PF|PJ)$/.exec(t);
  return m && (EVENTOS as readonly string[]).includes(m[1]) ? { evento: m[1] as Evento, tipo: m[2] as Grupo["tipo"] } : null;
}

/**
 * O protocolo e quanto esperar. A demonstração devolve o `dados` cortado no
 * meio ("…\"TempoLimiteEmMin\":5", sem fechar a chave): sem conseguir ler o
 * JSON, os dois campos saem do texto.
 *
 * bug-624 (11/11/2026): na produção o pedido voltava 200, com "[Sucesso]" e
 * "[Aviso-EVENTOSATUALIZACAO-005]" (só o aviso das requisições restantes), e
 * esta leitura não achava o protocolo — de 30/10 a 11/11, nenhum resultado foi
 * buscado. O formato real não ficou guardado; por isso a busca agora aceita o
 * `dados` em qualquer das formas plausíveis: objeto, texto com JSON (uma ou
 * duas vezes, com aspas escapadas), lista, campo aninhado e a chave com outra
 * caixa. Sem protocolo, o erro leva um trecho do `dados` (sem os números de
 * CPF/CNPJ) para o próximo diagnóstico.
 */
export function lerSolicitacao(r: RespostaLida): Leitura<{ protocolo: string; esperaMs: number }> {
  if (r.status !== 200) return { ok: false, erro: `O Serpro respondeu ${r.status} ao pedido de eventos.` };
  const { protocolo, espera } = acharProtocolo(r.dados);
  if (!protocolo) return { ok: false, erro: `O Serpro não devolveu o protocolo dos eventos. dados: ${amostraDosDados(r.dados)}` };
  return { ok: true, dados: { protocolo, esperaMs: Math.max(espera ?? 0, ESPERA_MINIMA_MS) + FOLGA_MS } };
}

const PROTOCOLO_NO_TEXTO = /\\*"protocolo\\*"\s*:\s*\\*"([^"\\]{6,})/i;
const ESPERA_NO_TEXTO = /\\*"TempoEsperaMedioEmMs\\*"\s*:\s*(\d+)/i;

/** O protocolo e o tempo de espera, onde quer que venham no `dados` — ver `lerSolicitacao`. */
function acharProtocolo(d: unknown, nivel = 0): { protocolo: string | null; espera: number | null } {
  const nada = { protocolo: null, espera: null };
  if (d === null || d === undefined || nivel > 4) return nada;
  if (typeof d === "string") {
    const texto = d.trim();
    if (texto.startsWith("{") || texto.startsWith("[") || texto.startsWith("\"")) {
      try {
        const dentro = acharProtocolo(JSON.parse(texto), nivel + 1);
        if (dentro.protocolo) return dentro;
      } catch {
        // Cortado ou escapado: segue pelo texto.
      }
    }
    return { protocolo: PROTOCOLO_NO_TEXTO.exec(texto)?.[1] ?? null, espera: Number(ESPERA_NO_TEXTO.exec(texto)?.[1]) || null };
  }
  if (Array.isArray(d)) {
    for (const item of d) {
      const achado = acharProtocolo(item, nivel + 1);
      if (achado.protocolo) return achado;
    }
    return nada;
  }
  if (typeof d === "object") {
    const o = d as Record<string, unknown>;
    const chave = (nome: string) => Object.keys(o).find((k) => k.toLowerCase() === nome.toLowerCase());
    const p = chave("protocolo");
    const e = chave("TempoEsperaMedioEmMs");
    if (p && typeof o[p] === "string" && (o[p] as string).trim()) return { protocolo: (o[p] as string).trim(), espera: e ? Number(o[e]) || null : null };
    for (const valor of Object.values(o)) {
      const achado = acharProtocolo(valor, nivel + 1);
      if (achado.protocolo) return achado;
    }
  }
  return nada;
}

/** Um trecho do `dados` para o erro, com os números de CPF/CNPJ trocados por "#". */
export function amostraDosDados(d: unknown): string {
  let texto: string;
  try {
    texto = typeof d === "string" ? d : JSON.stringify(d) ?? String(d);
  } catch {
    texto = String(d);
  }
  return texto.replace(/\d{11,14}/g, "#").slice(0, 300) || "(vazio)";
}

export type LinhaDaMatriz = { documento: string; ultimoEm: string | null; semAcesso: boolean };

export type Obtencao = { tipo: "pronto"; linhas: LinhaDaMatriz[] } | { tipo: "processando" } | { tipo: "erro"; erro: string };

/** A matriz [documento, dia]. 202 = o Serpro ainda está montando: pergunta de novo depois. */
export function lerMatriz(r: RespostaLida): Obtencao {
  if (r.status === 202) return { tipo: "processando" };
  if (r.status !== 200 || !Array.isArray(r.dados)) return { tipo: "erro", erro: `O Serpro respondeu ${r.status} ao obter os eventos.` };
  const linhas: LinhaDaMatriz[] = [];
  for (const linha of r.dados) {
    if (!Array.isArray(linha) || typeof linha[0] !== "string") continue;
    const valor = String(linha[1] ?? "").trim();
    const dia = /^(\d{2})(\d{2})(\d{2})$/.exec(valor);
    linhas.push({
      documento: pessoa(linha[0]).numero,
      ultimoEm: dia ? `20${dia[1]}-${dia[2]}-${dia[3]}` : null,
      semAcesso: valor.toLowerCase() === "x",
    });
  }
  return { tipo: "pronto", linhas };
}

/** É evento novo? Um dia mais recente que o guardado — ou o primeiro dia que aparece. */
export function eventoNovo(anterior: string | null | undefined, lido: string | null): boolean {
  return !!lido && (!anterior || lido > anterior);
}
