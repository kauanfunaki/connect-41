// Importação do quadro "PROCESSOS SOCIETÁRIOS" do Trello — as regras, como
// funções puras. Quem lê o banco e grava é `scripts/importar-trello-societario.ts`;
// o mapeamento inteiro, com o porquê de cada escolha, está no topo dele.
//
// Separadas da escrita pelo mesmo motivo de `importAcessorias.ts`: é aqui que
// mora o que pode dar errado em silêncio — casar o cartão com a empresa errada,
// pôr o processo na etapa errada, deixar texto interno num campo que o cliente
// vê — e tudo isso se testa sem subir Prisma.

import { saoPauloParts } from "@/lib/agenda";
import { lerDataDoCampo } from "./datas";
import type { StatusDaEtapa, StatusDoProcesso } from "./processo";

// ─── O export do Trello, no mínimo que o importador lê ──────────────────────

export type ListaDoTrello = { id: string; name: string; closed: boolean };
export type MembroDoTrello = { id: string; fullName: string; username: string };

export type CartaoDoTrello = {
  id: string;
  shortLink: string;
  name: string;
  desc: string;
  closed: boolean;
  idList: string;
  idMembers: string[];
  due: string | null;
  dateLastActivity: string;
  dateCompleted: string | null;
  attachments: number;
};

export type ChecklistDoTrello = {
  idCard: string;
  name: string;
  pos: number;
  itens: { nome: string; feito: boolean; pos: number }[];
};

export type ComentarioDoTrello = { idCard: string; data: string; autor: string; texto: string };

/** Mudança de lista de um cartão — só as que estão no export (as 1000 últimas ações). */
export type MovimentoDoTrello = { idCard: string; data: string; paraLista: string };

export type QuadroDoTrello = {
  nome: string;
  listas: ListaDoTrello[];
  cartoes: CartaoDoTrello[];
  membros: MembroDoTrello[];
  checklists: ChecklistDoTrello[];
  comentarios: ComentarioDoTrello[];
  movimentos: MovimentoDoTrello[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOuNulo = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Lê o JSON exportado ("Imprimir, exportar e compartilhar → Exportar como
 * JSON") e devolve só o que o importador usa. Recusa o que não parece um
 * quadro: rodar contra o arquivo errado não pode virar "0 cartões" calado.
 */
export function lerQuadro(json: unknown): QuadroDoTrello {
  const q = obj(json);
  if (!Array.isArray(q.cards) || !Array.isArray(q.lists)) {
    throw new Error("O arquivo não parece um export de quadro do Trello (faltam cards/lists).");
  }
  const cartoes = arr(q.cards).map((c): CartaoDoTrello => {
    const o = obj(c);
    return {
      id: str(o.id),
      shortLink: str(o.shortLink),
      name: str(o.name),
      desc: str(o.desc),
      closed: o.closed === true,
      idList: str(o.idList),
      idMembers: arr(o.idMembers).map(str).filter(Boolean),
      due: strOuNulo(o.due),
      dateLastActivity: str(o.dateLastActivity),
      dateCompleted: strOuNulo(o.dateCompleted),
      attachments: arr(o.attachments).length,
    };
  });
  const acoes = arr(q.actions).map(obj);
  return {
    nome: str(q.name),
    listas: arr(q.lists).map((l) => {
      const o = obj(l);
      return { id: str(o.id), name: str(o.name), closed: o.closed === true };
    }),
    cartoes,
    membros: arr(q.members).map((m) => {
      const o = obj(m);
      return { id: str(o.id), fullName: str(o.fullName), username: str(o.username) };
    }),
    checklists: arr(q.checklists).map((c) => {
      const o = obj(c);
      return {
        idCard: str(o.idCard),
        name: str(o.name),
        pos: Number(o.pos) || 0,
        itens: arr(o.checkItems).map((i) => {
          const it = obj(i);
          return { nome: str(it.name), feito: it.state === "complete", pos: Number(it.pos) || 0 };
        }),
      };
    }),
    comentarios: acoes
      .filter((a) => a.type === "commentCard")
      .map((a) => ({
        idCard: str(obj(obj(a.data).card).id),
        data: str(a.date),
        autor: str(obj(a.memberCreator).fullName),
        texto: str(obj(a.data).text),
      }))
      .filter((c) => c.idCard && c.texto.trim()),
    movimentos: acoes
      .filter((a) => a.type === "updateCard" && obj(a.data).listAfter)
      .map((a) => ({
        idCard: str(obj(obj(a.data).card).id),
        data: str(a.date),
        paraLista: str(obj(obj(a.data).listAfter).id),
      }))
      .filter((m) => m.idCard && m.paraLista),
  };
}

// ─── Nomes ───────────────────────────────────────────────────────────────────

export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Maiúsculo, sem acento, só letras, números e espaço simples. */
function plano(texto: string): string {
  return semAcento(texto)
    .toUpperCase()
    .replace(/['’`´]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Tipo societário no fim do nome — não distingue uma empresa da outra. */
const SUFIXOS = new Set(["LTDA", "LIMITADA", "ME", "EPP", "EIRELI", "MEI", "SA", "SS", "SLU", "EI", "MATRIZ", "FILIAL"]);

/**
 * O nome reduzido ao que identifica a empresa: sem acento, sem pontuação, sem
 * "LTDA/ME/EPP/EIRELI/S.A." no fim, sem "MATRIZ" ou "FILIAL 02" no fim, sem o
 * número solto que a Receita põe no nome do MEI ("12.345.678 FULANO"). "&" vira
 * "E", para "C&C" e "C & C" darem o mesmo.
 *
 * Só no FIM: "ME" no meio de um nome é palavra, e tirá-la juntaria empresas
 * diferentes.
 */
export function normalizarNome(texto: string): string {
  const base = semAcento(texto)
    .toUpperCase()
    .replace(/['’`´]/g, "")
    .replace(/&/g, " E ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const tokens = base ? base.split(" ") : [];
  while (tokens.length > 0 && /^\d+$/.test(tokens[0])) tokens.shift();
  while (tokens.length > 1) {
    const ultimo = tokens[tokens.length - 1];
    if (ultimo === "A" && tokens[tokens.length - 2] === "S" && tokens.length > 2) {
      tokens.splice(-2, 2); // S.A. e S/A viram "S A"
      continue;
    }
    if (SUFIXOS.has(ultimo) || /^\d+$/.test(ultimo)) {
      tokens.pop();
      continue;
    }
    break;
  }
  return tokens.join(" ");
}

export function digitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** CNPJs (14 dígitos) escritos no texto, com ou sem máscara, sem repetir. */
export function cnpjsNoTexto(texto: string): string[] {
  const achados = texto.match(/\b\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}\b/g) ?? [];
  return [...new Set(achados.map(digitos).filter((d) => d.length === 14))];
}

// ─── O título do cartão ──────────────────────────────────────────────────────

export type TituloLido = {
  /** O que vem antes do separador: é como o setor chama a empresa. */
  empresa: string;
  /** O que vem depois: o ato ("Alteração QSA", "Constituição"). */
  assunto: string;
  /** O número entre parênteses — "(2329)" —, que o setor usa como referência interna. */
  numeroInterno: string | null;
  cnpjs: string[];
  /** "FILIAL 04" no nome da empresa. */
  filial: number | null;
};

/**
 * O padrão do quadro é "EMPRESA | Assunto (número)" — 346 dos 358 cartões em
 * 06/10. Os outros usam " - " ou não têm separador; aí a empresa é o título
 * inteiro e quase sempre não casa, o que é o resultado certo.
 */
export function lerTitulo(titulo: string): TituloLido {
  const limpo = titulo.replace(/\s+/g, " ").trim();
  let empresa = limpo;
  let assunto = limpo;
  const barra = limpo.indexOf("|");
  const traco = limpo.indexOf(" - ");
  if (barra >= 0) {
    empresa = limpo.slice(0, barra);
    assunto = limpo.slice(barra + 1);
  } else if (traco >= 0) {
    empresa = limpo.slice(0, traco);
    assunto = limpo.slice(traco + 3);
  }
  const numero = /\((\d{3,5})(?:\s*e\s*(\d{3,5}))?\)/i.exec(assunto);
  const filial = /\bFILIAL\s*(\d{1,3})\b/.exec(plano(empresa));
  return {
    empresa: empresa
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\s*\/?\s*\d{4}\s*-?\s*\d{2}\b/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s\-–]+$/, "")
      .trim(),
    assunto: assunto.trim(),
    numeroInterno: numero ? [numero[1], numero[2]].filter(Boolean).join(" e ") : null,
    cnpjs: cnpjsNoTexto(limpo),
    filial: filial ? Number(filial[1]) : null,
  };
}

/** Cartão que não é processo: o modelo de checklist e o de teste. */
export function cartaoQueNaoEProcesso(titulo: string): "modelo" | "teste" | null {
  const t = plano(titulo);
  if (/^MODELO\b/.test(t)) return "modelo";
  if (t === "" || t === "TESTE" || /\bTAREFA ERRO\b/.test(t)) return "teste";
  return null;
}

// ─── Tipo de processo ────────────────────────────────────────────────────────

export const CODIGOS_DOS_TIPOS = [
  "constituicao",
  "alteracao_contratual",
  "baixa",
  "alvara",
  "distrato_sucessao",
  "reorganizacao_societaria",
  "regularizacao",
] as const;

export type CodigoDoTipo = (typeof CODIGOS_DOS_TIPOS)[number];

export type TipoLido = {
  codigo: CodigoDoTipo;
  /**
   * Demanda que não é ato societário — senha, acesso, procuração, cadastro.
   * Não há tipo para ela no Connect; entra como Regularização e a prévia
   * mostra quantas são, para a decisão de criar um tipo próprio.
   */
  avulsa: boolean;
};

/**
 * Os atos. Ganha o que aparece PRIMEIRO no assunto: o setor escreve o ato
 * principal antes ("Alteração QSA e Baixa Filial" é alteração; "Baixa Filial MS
 * e Alteração QSA" é baixa).
 */
const ATOS: { codigo: CodigoDoTipo; re: RegExp }[] = [
  { codigo: "reorganizacao_societaria", re: /\b(FUSAO|CISAO|INCORPORACAO)\b/ },
  { codigo: "distrato_sucessao", re: /\bSUCESSAO\b|\bSAIDA DE SOCIO|\bHAVERES\b/ },
  // Filial nova é alteração do contrato da matriz, não constituição.
  { codigo: "alteracao_contratual", re: /\b(ABERTURA|CONSTITUICAO)( DE)?( NOVA)? FILIA/ },
  { codigo: "constituicao", re: /\bCONSTITUICAO\b|\bABERTURA\b/ },
  // "Baixa da inscrição estadual" é cadastro, não baixa da empresa.
  { codigo: "baixa", re: /\bBAIXA\b(?! (DE |DA |DO )?(INSCRICAO|IE|IM)\b)|\bDISTRATO SOCIAL\b/ },
  {
    codigo: "alteracao_contratual",
    re: /\bALTERAC(AO|OES)\b|\bINCLUSAO (DE )?CNAE|\bINCLUIR COMPLEMENTO|\bTRANS\w*FORMACAO\b|\bINTEGRALIZACAO\b|\bRETIFICACAO\b|\bATA DE ELEICAO\b|\bQSA\b/,
  },
  {
    codigo: "alvara",
    re: /\bALVARA|\bLICEN[CS]|\bBOMBEIRO|\bVISA\b|\bVIGILANCIA\b|\bSANITARI|\bAMBIENTA|\bIBAMA\b|\bANTT\b|\bAVCB\b|\bCLF\b|\bFRETAMENTO\b/,
  },
];

/** Regularização de verdade: algo irregular a acertar no órgão. */
const REGULARIZACAO =
  /\bREGULARIZ|\bREATIVA|\bLEVANTAMENTO|\bCERTID|\bENQUADRAMENTO|\bDESENQUADRA|\bDECLARA|\bDASN\b|\bPARALISA|\bINSCRICAO\b|\bIE\b|\bCANCELAMENTO\b|\bDEBITO|\bPENDENCIA|\bREQUERIMENTO\b|\bMEI\b|\bVERIFICA/;

/** As demandas avulsas do quadro. */
const AVULSA =
  /\bSENHA|\bACESSO|\bPROCURAC|\bCADASTR|\bVINCULO|\bCREDENCI|\bDESCREDENCI|\bSISCOMEX\b|\bSICAF\b|\bDOSSIE\b|\bENVIO\b|\bEMISSAO\b|\bCRC\b|\bCRT\b|\bCONSELHO|\bPORTAL\b|\bRADAR\b|\bNF ?E\b|\bDOMINIO\b|\bRELACAO\b|\bESTUDO\b|\bVIABILIDADE\b|\bTERMOS?\b|\bDFRV\b|\bCAR\b|\bPLACAS\b|\bCOMUNICACAO\b/;

export function tipoDoAssunto(assunto: string): TipoLido | null {
  const t = plano(assunto);
  // Cadastros que começam com "Alteração" mas não mexem no contrato.
  if (/\bUSUARIO PRINCIPAL\b|\bRESPONSABILIDADE TECNICA\b|\bRESPONSAVEL (LEGAL|PERANTE)\b/.test(t)) {
    return { codigo: "regularizacao", avulsa: true };
  }
  let melhor: { codigo: CodigoDoTipo; i: number } | null = null;
  for (const ato of ATOS) {
    const m = ato.re.exec(t);
    if (m && (!melhor || m.index < melhor.i)) melhor = { codigo: ato.codigo, i: m.index };
  }
  if (melhor) return { codigo: melhor.codigo, avulsa: false };
  if (REGULARIZACAO.test(t)) return { codigo: "regularizacao", avulsa: false };
  if (AVULSA.test(t)) return { codigo: "regularizacao", avulsa: true };
  return null;
}

// ─── Lista → fase → etapa e situação ─────────────────────────────────────────

export type Fase =
  | "INICIO"
  | "VERIFICACAO"
  | "VIABILIDADE"
  | "MINUTA"
  | "VALIDACAO_CLIENTE"
  | "ASSINATURA"
  | "ORGAO"
  | "POS_REGISTRO"
  | "LICENCIAMENTO"
  | "CONCLUIDO"
  | "ARQUIVADO";

/**
 * A fase pelo nome da lista, por palavra e não pelo nome exato: renomear
 * "MINUTA EM VALIDAÇÃO INTERNA" para "MINUTA — VALIDAÇÃO" não pode jogar os
 * cartões fora. A ordem importa — "VALIDAÇÃO DO CLIENTE" antes de "MINUTA".
 */
export function faseDaLista(nome: string): Fase | null {
  const t = plano(nome);
  if (/CONCLU/.test(t)) return "CONCLUIDO";
  if (/ARQUIV/.test(t)) return "ARQUIVADO";
  if (/LICENCIA/.test(t)) return "LICENCIAMENTO";
  if (/APOS REGISTRO|DEMANDAS INTERNAS/.test(t)) return "POS_REGISTRO";
  if (/ORGAO/.test(t)) return "ORGAO";
  if (/ASSINATURA/.test(t)) return "ASSINATURA";
  if (/VALIDACAO DO CLIENTE|VALIDACAO CLIENTE/.test(t)) return "VALIDACAO_CLIENTE";
  if (/MINUTA/.test(t)) return "MINUTA";
  if (/VIABILIDADE/.test(t)) return "VIABILIDADE";
  if (/VERIFICA/.test(t)) return "VERIFICACAO";
  if (/INICIAR|A FAZER|ENTRADA/.test(t)) return "INICIO";
  return null;
}

/** Como a prévia descreve cada fase. */
export const DESCRICAO_DA_FASE: Record<Fase, string> = {
  INICIO: "nenhuma etapa começada",
  VERIFICACAO: "na 1ª etapa (reunir documentação)",
  VIABILIDADE: "na etapa de viabilidade",
  MINUTA: "na etapa da minuta",
  VALIDACAO_CLIENTE: "na etapa da minuta",
  ASSINATURA: "na etapa depois da minuta",
  ORGAO: "na etapa de acompanhamento do órgão",
  POS_REGISTRO: "em cadastro e comunicação interna",
  LICENCIAMENTO: "na etapa de licenciamentos",
  CONCLUIDO: "todas as etapas feitas",
  ARQUIVADO: "etapas de onde parou",
};

/**
 * O motivo é **texto nosso**, não do Trello: `statusReason` aparece no portal
 * do cliente ("Motivo: …").
 */
export const MOTIVO_DA_ESPERA: Partial<Record<Fase, string>> = {
  VALIDACAO_CLIENTE: "Validação da minuta pelo cliente",
  ASSINATURA: "Assinatura do cliente",
};
export const MOTIVO_DO_ARQUIVADO = "Encerrado antes do acompanhamento pelo portal";

export function situacaoDaFase(
  fase: Fase,
  marcadoComoFeito: boolean
): { status: StatusDoProcesso; motivo: string | null } {
  if (fase === "CONCLUIDO") return { status: "CONCLUIDO", motivo: null };
  if (fase === "ARQUIVADO") {
    return marcadoComoFeito ? { status: "CONCLUIDO", motivo: null } : { status: "CANCELADO", motivo: MOTIVO_DO_ARQUIVADO };
  }
  const motivo = MOTIVO_DA_ESPERA[fase];
  return motivo ? { status: "AGUARDANDO_CLIENTE", motivo } : { status: "EM_ANDAMENTO", motivo: null };
}

export type EtapaDoModelo = { id: string; position: number; label: string; organId: string | null };

export type PlanoDasEtapas = {
  /** Status de cada etapa do roteiro, pelo id da etapa do modelo. */
  status: Map<string, StatusDaEtapa>;
  /** Etapa de órgão onde nasce o protocolo aguardando — só na fase ORGAO. */
  protocolo: { templateStepId: string; organId: string } | null;
  /** Nenhuma etapa do roteiro bateu com a fase: ficou na primeira. */
  aproximada: boolean;
};

/**
 * Onde cada fase cai no roteiro, por palavra no rótulo da etapa — o roteiro é
 * dado do escritório, não código, e cada tipo tem o seu. A primeira expressão
 * que acha etapa ganha; as seguintes cobrem os roteiros que não têm a etapa da
 * primeira (a Baixa não tem viabilidade, o Alvará não tem minuta).
 */
const ALVO_DA_FASE: Partial<Record<Fase, RegExp[]>> = {
  VERIFICACAO: [/REUNIR|CONFIRMAR A PENDENCIA|NOTIFICACAO/],
  VIABILIDADE: [/VIABILIDADE/, /LEVANTAMENTO|LEVANTAR/],
  MINUTA: [/MINUTA/, /ELABORACAO/, /LEVANTAR/],
  VALIDACAO_CLIENTE: [/MINUTA/, /ELABORACAO/, /LEVANTAR/],
  ORGAO: [/ACOMPANHAMENTO/, /PROTOCOLO/],
  LICENCIAMENTO: [/LICENCIAMENTO/, /BOMBEIROS|MEIO AMBIENTE|VIGILANCIA/, /BAIXA MUNICIPAL/, /CONFIRMACAO/, /COMUNICACAO/],
  POS_REGISTRO: [/CADASTRO.*COMUNICACAO|COMUNICACAO INTERNA/, /COMUNICACAO/],
};

function posicaoAlvo(roteiro: EtapaDoModelo[], regras: RegExp[]): number | null {
  const ordenado = [...roteiro].sort((a, b) => a.position - b.position);
  for (const re of regras) {
    const etapa = ordenado.find((e) => re.test(plano(e.label)));
    if (etapa) return etapa.position;
  }
  return null;
}

/**
 * O status de cada etapa para um processo que está na fase dada.
 *
 * Tudo antes da etapa atual conta como feito — é o que o cartão estar naquela
 * lista diz. A etapa atual fica em andamento, e as que dividem a posição com ela
 * também (é a ramificação do alvará, que o motor libera junta). Depois dela,
 * tudo a fazer.
 *
 * Etapa de órgão antes da atual fica concluída sem protocolo: é histórico de
 * antes do Connect, e inventar protocolo para ela poria número de volta onde
 * ninguém contou volta.
 */
export function etapasDaFase(roteiro: EtapaDoModelo[], fase: Fase): PlanoDasEtapas {
  const status = new Map<string, StatusDaEtapa>();
  const todas = (s: StatusDaEtapa) => {
    for (const e of roteiro) status.set(e.id, s);
    return { status, protocolo: null, aproximada: false };
  };
  if (roteiro.length === 0) return { status, protocolo: null, aproximada: false };
  if (fase === "CONCLUIDO") return todas("CONCLUIDA");
  if (fase === "INICIO" || fase === "ARQUIVADO") return todas("PENDENTE");

  const primeira = Math.min(...roteiro.map((e) => e.position));
  let alvo: number | null;
  if (fase === "ASSINATURA") {
    const minuta = posicaoAlvo(roteiro, ALVO_DA_FASE.MINUTA!);
    const depois = roteiro.map((e) => e.position).filter((p) => minuta !== null && p > minuta);
    alvo = depois.length > 0 ? Math.min(...depois) : null;
  } else {
    alvo = posicaoAlvo(roteiro, ALVO_DA_FASE[fase] ?? []);
  }
  const aproximada = alvo === null;
  const atual = alvo ?? primeira;

  for (const e of roteiro) {
    status.set(e.id, e.position < atual ? "CONCLUIDA" : e.position === atual ? "EM_ANDAMENTO" : "PENDENTE");
  }

  let protocolo: PlanoDasEtapas["protocolo"] = null;
  if (fase === "ORGAO" && !aproximada) {
    const comOrgao = roteiro.find((e) => e.position === atual && e.organId);
    if (comOrgao?.organId) protocolo = { templateStepId: comOrgao.id, organId: comOrgao.organId };
  }
  return { status, protocolo, aproximada };
}

// ─── Empresa ─────────────────────────────────────────────────────────────────

export type EmpresaParaCasar = {
  id: string;
  name: string;
  displayName: string | null;
  tradeName: string | null;
  cnpj: string | null;
  parentCompanyId: string | null;
};

export type Casamento =
  | { empresaId: string; como: "cnpj" | "nome" | "prefixo" | "cnpj_da_descricao" }
  | { empresaId: null; motivo: string };

export type IndiceDeEmpresas = {
  empresas: EmpresaParaCasar[];
  porCnpj: Map<string, EmpresaParaCasar>;
  /** Os nomes normalizados de cada empresa (razão social, apelido, fantasia). */
  nomes: Map<string, string[]>;
  /** A raiz do CNPJ de cada empresa — a da matriz, para a filial sem CNPJ próprio. */
  raizes: Map<string, string>;
};

export function indexarEmpresas(empresas: EmpresaParaCasar[]): IndiceDeEmpresas {
  const porCnpj = new Map<string, EmpresaParaCasar>();
  const nomes = new Map<string, string[]>();
  for (const e of empresas) {
    const d = digitos(e.cnpj);
    if (d.length === 14) porCnpj.set(d, e);
    const ns = [e.name, e.displayName, e.tradeName].filter((n): n is string => !!n?.trim()).map(normalizarNome);
    nomes.set(e.id, [...new Set(ns.filter(Boolean))]);
  }
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const raizDe = (e: EmpresaParaCasar): string => {
    const d = digitos(e.cnpj);
    if (d.length === 14) return d.slice(0, 8);
    // Filial ainda em abertura, sem CNPJ: é do mesmo cliente que a matriz.
    const matriz = e.parentCompanyId ? porId.get(e.parentCompanyId) : undefined;
    const dm = digitos(matriz?.cnpj);
    return dm.length === 14 ? dm.slice(0, 8) : `id:${e.parentCompanyId ?? e.id}`;
  };
  const raizes = new Map(empresas.map((e) => [e.id, raizDe(e)]));
  return { empresas, porCnpj, nomes, raizes };
}
const ordemDoEstabelecimento = (e: EmpresaParaCasar) => {
  const d = digitos(e.cnpj);
  return d.length === 14 ? Number(d.slice(8, 12)) : null;
};

/**
 * Entre candidatas, decide uma só — ou nenhuma.
 *
 * Candidatas de raízes de CNPJ diferentes são empresas diferentes com o mesmo
 * nome: não há como escolher, e escolher errado é processo de um cliente no
 * portal de outro. Na mesma raiz, é matriz e filiais: vai a filial do número que
 * o título disse ("FILIAL 04" → ordem 0004), senão a matriz.
 */
function escolherNaRaiz(
  candidatas: EmpresaParaCasar[],
  filial: number | null,
  indice: IndiceDeEmpresas
): EmpresaParaCasar | string {
  const raizes = new Set(candidatas.map((e) => indice.raizes.get(e.id)));
  if (raizes.size > 1) return `${candidatas.length} empresas em ${raizes.size} CNPJs diferentes com esse nome`;
  if (candidatas.length === 1) return candidatas[0];
  if (filial !== null) {
    const daFilial = candidatas.filter((e) => ordemDoEstabelecimento(e) === filial);
    if (daFilial.length === 1) return daFilial[0];
  }
  const matrizes = candidatas.filter((e) => ordemDoEstabelecimento(e) === 1 || (!e.parentCompanyId && ordemDoEstabelecimento(e) === null));
  if (matrizes.length === 1) return matrizes[0];
  return `${candidatas.length} estabelecimentos com esse nome, sem matriz clara`;
}

/**
 * Prefixo de palavra inteira, e com pelo menos duas palavras de verdade. Uma
 * palavra só é dúvida mesmo quando bate com uma empresa só: "LIBER" casaria com
 * a Liber que está cadastrada, e o cartão podia ser da outra Liber, que não está.
 */
function ehPrefixo(curto: string, longo: string): boolean {
  if (!curto || curto === longo) return false;
  const c = curto.split(" ");
  if (c.filter((p) => p.length >= 2).length < 2) return false;
  const l = longo.split(" ");
  if (c.length >= l.length) return false;
  return c.every((p, i) => l[i] === p);
}

/**
 * Casa o cartão com uma empresa do escritório, do mais seguro ao menos:
 *
 * 1. CNPJ escrito no título;
 * 2. nome igual, depois de normalizado (razão social, apelido ou fantasia);
 * 3. o nome do título é o começo do nome da empresa ("MULTI COMÉRCIO" →
 *    "MULTI COMÉRCIO DE PEÇAS LTDA") — só se todas as que começam assim forem
 *    da mesma raiz de CNPJ, e a prévia lista estes para conferir;
 * 4. CNPJ na descrição — só se todos os que estão no Connect forem da mesma
 *    raiz e a primeira palavra do nome bater com a do título (a descrição traz
 *    também CNPJ de sócio pessoa jurídica).
 *
 * O nome entre parênteses ("FERTHUB (Maxilog)") não entra: às vezes é o nome
 * fantasia, às vezes o grupo, às vezes "cliente externo" — dúvida, e na dúvida
 * fica sem empresa.
 *
 * Na Constituição, só CNPJ e nome igual (`soExato`): o título é o nome da
 * empresa NOVA, e o começo dele bate com a empresa do cliente que já existe —
 * "JANDEL | Constituição" é uma empresa nova da Jandel, não a Jandel.
 */
export function casarEmpresa(
  titulo: TituloLido,
  descricao: string,
  indice: IndiceDeEmpresas,
  soExato = false
): Casamento {
  for (const c of titulo.cnpjs) {
    const e = indice.porCnpj.get(c);
    if (e) return { empresaId: e.id, como: "cnpj" };
  }

  const alvo = normalizarNome(titulo.empresa);
  if (!alvo) return { empresaId: null, motivo: "título sem nome de empresa" };

  const iguais = indice.empresas.filter((e) => indice.nomes.get(e.id)!.includes(alvo));
  if (iguais.length > 0) {
    const escolha = escolherNaRaiz(iguais, titulo.filial, indice);
    return typeof escolha === "string" ? { empresaId: null, motivo: escolha } : { empresaId: escolha.id, como: "nome" };
  }

  if (soExato) return { empresaId: null, motivo: "nenhuma empresa do escritório com esse nome exato (constituição)" };

  const comPrefixo = indice.empresas.filter((e) => indice.nomes.get(e.id)!.some((n) => ehPrefixo(alvo, n)));
  if (comPrefixo.length > 0) {
    const escolha = escolherNaRaiz(comPrefixo, titulo.filial, indice);
    if (typeof escolha === "string") return { empresaId: null, motivo: `começo de nome ambíguo: ${escolha}` };
    return { empresaId: escolha.id, como: "prefixo" };
  }

  const primeira = alvo.split(" ")[0];
  const pelaDescricao = cnpjsNoTexto(descricao)
    .map((c) => indice.porCnpj.get(c))
    .filter((e): e is EmpresaParaCasar => !!e);
  if (pelaDescricao.length > 0 && new Set(pelaDescricao.map((e) => indice.raizes.get(e.id))).size === 1) {
    const e = pelaDescricao[0];
    if (indice.nomes.get(e.id)!.some((n) => n.split(" ")[0] === primeira)) {
      return { empresaId: e.id, como: "cnpj_da_descricao" };
    }
  }
  return { empresaId: null, motivo: "nenhuma empresa do escritório com esse nome" };
}

/** Primeira palavra que não identifica ninguém ("GRUPO BLD", "EMPRESAS DE BH"). */
const PRIMEIRAS_GENERICAS = new Set(["GRUPO", "EMPRESA", "EMPRESAS", "CARTEIRA", "ATAS", "ALVARA", "RELACAO", "MODELO"]);

/**
 * Empresas com a mesma primeira palavra — só para a prévia SUGERIR, nunca para
 * casar. Uma por raiz de CNPJ, a matriz primeiro. É o que torna o arquivo de
 * vínculos rápido de escrever: o CNPJ já aparece ao lado do cartão.
 */
export function empresasParecidas(titulo: TituloLido, indice: IndiceDeEmpresas, max = 3): EmpresaParaCasar[] {
  const primeira = normalizarNome(titulo.empresa).split(" ")[0] ?? "";
  if (primeira.length < 3 || PRIMEIRAS_GENERICAS.has(primeira)) return [];
  const achadas = indice.empresas
    .filter((e) => indice.nomes.get(e.id)!.some((n) => n.split(" ")[0] === primeira))
    .sort((a, b) => (ordemDoEstabelecimento(a) ?? 0) - (ordemDoEstabelecimento(b) ?? 0));
  const porRaiz = new Map<string, EmpresaParaCasar>();
  for (const e of achadas) if (!porRaiz.has(indice.raizes.get(e.id)!)) porRaiz.set(indice.raizes.get(e.id)!, e);
  return [...porRaiz.values()].slice(0, max);
}

// ─── Pessoas ─────────────────────────────────────────────────────────────────

export type UsuarioParaCasar = {
  id: string;
  name: string;
  email: string;
  /** Está no setor que opera o Societário neste escritório. */
  doSetor: boolean;
  /** Coordena o setor (SECTOR_ADMIN). */
  coordenador: boolean;
};

const PALAVRAS_SOLTAS = new Set(["DA", "DE", "DO", "DAS", "DOS", "E"]);
const palavras = (nome: string) => plano(nome).split(" ").filter((p) => p.length > 1 && !PALAVRAS_SOLTAS.has(p));

/**
 * O membro do Trello no usuário do Connect, pelo nome: igual, ou todas as
 * palavras de um dentro do outro ("Ana Cecilia Alves Calado" ↔ "Ana
 * Cecilia"), com pelo menos nome e sobrenome. Só um usuário pode bater — dois
 * "Ana" e nenhum vira responsável.
 *
 * Usuário cadastrado só pelo apelido ("Ruli") casa quando o apelido é o
 * começo do usuário do Trello ("ruli_machado") **e** do primeiro nome
 * ("Ruliane") — as duas pistas juntas, nunca só o primeiro nome.
 */
export function casarMembro(membro: MembroDoTrello, usuarios: UsuarioParaCasar[]): UsuarioParaCasar | null {
  const m = palavras(membro.fullName);
  if (m.length < 2) return null;
  const iguais = usuarios.filter((u) => palavras(u.name).join(" ") === m.join(" "));
  if (iguais.length === 1) return iguais[0];
  if (iguais.length > 1) return null;
  const contidos = usuarios.filter((u) => {
    const p = palavras(u.name);
    if (p.length < 2 || p[0] !== m[0]) return false;
    return p.every((x) => m.includes(x)) || m.every((x) => p.includes(x));
  });
  if (contidos.length > 0) return contidos.length === 1 ? contidos[0] : null;
  const apelido = plano(membro.username.split(/[^A-Za-z]/)[0] ?? "");
  if (apelido.length < 3) return null;
  const peloApelido = usuarios.filter((u) => {
    const p = palavras(u.name);
    return p.length === 1 && p[0] === apelido && m[0].startsWith(apelido);
  });
  return peloApelido.length === 1 ? peloApelido[0] : null;
}

/**
 * Quem responde pelo processo. Só gente do setor: membro do cartão de outro
 * setor é quem pediu (o comercial, o BPO), não quem executa. Com duas do setor
 * no cartão, a que executa — a coordenação está lá para conferir.
 */
export function escolherResponsavel(casados: (UsuarioParaCasar | null)[]): string | null {
  const doSetor = casados.filter((u): u is UsuarioParaCasar => !!u && u.doSetor);
  if (doSetor.length === 0) return null;
  return (doSetor.find((u) => !u.coordenador) ?? doSetor[0]).id;
}

// ─── Datas ───────────────────────────────────────────────────────────────────

/** O id do Trello começa pelo instante de criação (ObjectId do MongoDB). */
export function criadoEm(idDoCartao: string): Date | null {
  const s = Number.parseInt(idDoCartao.slice(0, 8), 16);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : null;
}

/** Data civil em São Paulo, gravada ao meio-dia UTC como todo prazo do Societário. */
export function dataCivil(instante: Date): Date {
  const r = lerDataDoCampo(saoPauloParts(instante).dateKey);
  return r.ok && r.data ? r.data : instante;
}

export function formatarData(d: Date): string {
  const k = saoPauloParts(d).dateKey;
  return `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}`;
}

// ─── Observações ─────────────────────────────────────────────────────────────

/** `notes` é TEXT no MySQL: 65.535 bytes. Folga para não estourar com UTF-8. */
export const LIMITE_DAS_OBSERVACOES = 60_000;

/** Onde o importador reconhece o que já trouxe — ver `cartoesJaImportados`. */
export const URL_DO_CARTAO = (shortLink: string) => `https://trello.com/c/${shortLink}`;

/**
 * Os cartões que já viraram processo: a primeira linha das observações de todo
 * processo importado tem o link do cartão. É isso que faz rodar duas vezes não
 * duplicar.
 */
export function cartoesJaImportados(observacoes: (string | null)[]): Set<string> {
  const vistos = new Set<string>();
  for (const o of observacoes) {
    for (const m of (o ?? "").matchAll(/trello\.com\/c\/([A-Za-z0-9]{6,12})/g)) vistos.add(m[1]);
  }
  return vistos;
}

const FALA_DE_ACESSO = /\b(senhas?|password|login|c[oó]digo de acesso)\b/i;
/** "Senha: x", "Senha Prefeitura: x", "Login: 000.000.000-00". */
const VALOR_DEPOIS = /\b(senhas?|password|login|c[oó]digo de acesso)\b[^:=\n]{0,40}[:=]\s*\S/i;
/** Palavra com número e letra/símbolo ("Ab@123"), ou número comprido (código de acesso). */
const PARECE_SEGREDO = /(?=\S*\d)(?=\S*[A-Za-z@#$%&*!?])\S{6,}|\d{8,}/;

/**
 * Senha escrita no cartão não vem para o Connect. A linha inteira sai quando
 * fala de senha, login ou código de acesso **e** traz um valor — depois de
 * dois-pontos ou com cara de segredo, que no quadro aparece até antes da
 * palavra ("Ab@123 – SENHA GOV"). "Conferir senha ISS" é tarefa e fica.
 */
export function mascararSenhas(texto: string): string {
  return texto
    .split("\n")
    .map((linha) =>
      FALA_DE_ACESSO.test(linha) && (VALOR_DEPOIS.test(linha) || PARECE_SEGREDO.test(linha))
        ? "(linha com senha ou acesso omitida — ver no cartão do Trello)"
        : linha
    )
    .join("\n");
}

/** O markdown do Trello em texto corrido: sem negrito, sem escape, sem caractere invisível. */
export function textoDoTrello(texto: string): string {
  return mascararSenhas(
    texto
      .replace(/[​-‍﻿]/g, "")
      .replace(/\\([-*_#>.!\[\]()`])/g, "$1")
      .replace(/\*\*/g, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function cortarEmBytes(texto: string, limite: number): string {
  if (Buffer.byteLength(texto, "utf8") <= limite) return texto;
  const aviso = "\n\n… (cortado aqui — o resto está no cartão do Trello)";
  let fim = Math.min(texto.length, limite);
  while (fim > 0 && Buffer.byteLength(texto.slice(0, fim), "utf8") + Buffer.byteLength(aviso, "utf8") > limite) {
    fim -= 500;
  }
  return texto.slice(0, Math.max(fim, 0)) + aviso;
}

export type DadosDasObservacoes = {
  cartao: CartaoDoTrello;
  lista: string;
  titulo: TituloLido;
  membros: string[];
  checklists: ChecklistDoTrello[];
  comentarios: ComentarioDoTrello[];
  prazoVencido: Date | null;
  importadoEm: Date;
};

/**
 * Tudo o que o cartão tinha, em texto, para a equipe. Vai para `Process.notes`,
 * que **o portal não lê** (`portal-data.ts` não seleciona a coluna) — e é o
 * único lugar onde texto do Trello entra.
 */
export function montarObservacoes(d: DadosDasObservacoes): string {
  const linhas: string[] = [
    `Importado do Trello em ${formatarData(d.importadoEm)} — ${URL_DO_CARTAO(d.cartao.shortLink)}`,
    `Cartão: ${d.cartao.name.trim()}`,
    `Lista no Trello: ${d.lista}${d.titulo.numeroInterno ? ` · nº interno ${d.titulo.numeroInterno}` : ""}`,
  ];
  if (d.membros.length > 0) linhas.push(`Membros do cartão: ${d.membros.join(", ")}`);
  if (d.prazoVencido) {
    linhas.push(`Prazo no Trello: ${formatarData(d.prazoVencido)} (já vencido — não virou prazo combinado)`);
  }
  if (d.cartao.attachments > 0) {
    linhas.push(`Anexos no Trello: ${d.cartao.attachments} (abra o cartão para baixar)`);
  }

  const desc = textoDoTrello(d.cartao.desc);
  if (desc) linhas.push("", "— Descrição —", desc);

  for (const cl of [...d.checklists].sort((a, b) => a.pos - b.pos)) {
    linhas.push("", `— Checklist: ${cl.name.trim() || "sem nome"} —`);
    for (const i of [...cl.itens].sort((a, b) => a.pos - b.pos)) {
      linhas.push(`${i.feito ? "[x]" : "[ ]"} ${textoDoTrello(i.nome)}`);
    }
  }

  if (d.comentarios.length > 0) {
    linhas.push("", "— Comentários (o export traz só os mais recentes) —");
    for (const c of [...d.comentarios].sort((a, b) => a.data.localeCompare(b.data))) {
      linhas.push(`${formatarData(new Date(c.data))} ${c.autor}: ${textoDoTrello(c.texto)}`);
    }
  }
  return cortarEmBytes(linhas.join("\n"), LIMITE_DAS_OBSERVACOES);
}

// ─── Arquivo de vínculos ─────────────────────────────────────────────────────

export type Vinculo = { ignorar: true } | { ignorar: false; cnpj: string | null; tipo: CodigoDoTipo | null };

/**
 * O arquivo que resolve à mão o que a prévia não casou. Uma linha por cartão:
 *
 *   <shortLink>;<cnpj>              — esta empresa
 *   <shortLink>;ignorar             — não importar
 *   <shortLink>;;<tipo>             — tipo forçado, empresa automática
 *   <shortLink>;<cnpj>;<tipo>       — os dois
 *
 * `#` começa comentário. O shortLink é o código do link do cartão
 * (trello.com/c/<shortLink>), que a prévia imprime.
 */
export function lerVinculos(texto: string): { vinculos: Map<string, Vinculo>; erros: string[] } {
  const vinculos = new Map<string, Vinculo>();
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.replace(/#.*/, "").trim();
    if (!linha) return;
    const [link, cnpjOuAcao = "", tipoBruto = ""] = linha.split(";").map((p) => p.trim());
    if (!/^[A-Za-z0-9]{6,12}$/.test(link)) {
      erros.push(`linha ${i + 1}: "${link}" não é um shortLink do Trello`);
      return;
    }
    if (cnpjOuAcao.toLowerCase() === "ignorar") {
      vinculos.set(link, { ignorar: true });
      return;
    }
    const cnpj = cnpjOuAcao ? digitos(cnpjOuAcao) : null;
    if (cnpj !== null && cnpj.length !== 14) {
      erros.push(`linha ${i + 1}: "${cnpjOuAcao}" não é um CNPJ`);
      return;
    }
    const tipo = tipoBruto ? (CODIGOS_DOS_TIPOS as readonly string[]).find((c) => c === tipoBruto) ?? null : null;
    if (tipoBruto && !tipo) {
      erros.push(`linha ${i + 1}: tipo "${tipoBruto}" não existe (use ${CODIGOS_DOS_TIPOS.join(", ")})`);
      return;
    }
    vinculos.set(link, { ignorar: false, cnpj, tipo: tipo as CodigoDoTipo | null });
  });
  return { vinculos, erros };
}

// ─── O plano ─────────────────────────────────────────────────────────────────

export type ModeloDoTipo = { typeId: string; templateId: string; nome: string; roteiro: EtapaDoModelo[] };

export type ContextoDoEscritorio = {
  empresas: IndiceDeEmpresas;
  usuarios: UsuarioParaCasar[];
  modelos: Map<CodigoDoTipo, ModeloDoTipo>;
  jaImportados: Set<string>;
  vinculos: Map<string, Vinculo>;
};

export type OpcoesDaImportacao = {
  concluidos: boolean;
  arquivados: boolean;
  prazosVencidos: boolean;
  tituloDoCartao: boolean;
  agora: Date;
};

/** Em que grupo do quadro o cartão está — é o recorte das opções e da prévia. */
export type Grupo = "aberto" | "concluido" | "arquivado";

export type ProcessoPlanejado = {
  cartao: CartaoDoTrello;
  lista: string;
  grupo: Grupo;
  fase: Fase;
  tipo: TipoLido;
  modelo: ModeloDoTipo;
  empresaId: string;
  casamento: "cnpj" | "nome" | "prefixo" | "cnpj_da_descricao" | "vinculo";
  responsavelId: string | null;
  status: StatusDoProcesso;
  motivo: string | null;
  startedAt: Date;
  concludedAt: Date | null;
  statusChangedAt: Date | null;
  dueAt: Date | null;
  prazoVencido: boolean;
  prioridade: "NORMAL" | "ALTA";
  titulo: string | null;
  notas: string;
  etapas: PlanoDasEtapas;
  /** Quando o cartão entrou na lista atual, se o export tem o movimento; senão a última atividade. */
  desde: Date;
};

export type MotivoDeFora =
  | "modelo"
  | "teste"
  | "vinculo_ignorar"
  | "ja_importado"
  | "lista_desconhecida"
  | "arquivado"
  | "concluido"
  | "sem_tipo"
  | "tipo_sem_roteiro"
  | "sem_empresa";

export type CartaoDeFora = {
  cartao: CartaoDoTrello;
  lista: string;
  grupo: Grupo | null;
  motivo: MotivoDeFora;
  detalhe: string | null;
  /** O que a leitura achou, mesmo ficando de fora — para a prévia dizer quantos entrariam. */
  tipo: TipoLido | null;
  empresaId: string | null;
  /** Sem empresa: as parecidas, para a prévia sugerir (ver `empresasParecidas`). */
  sugestoes: string[];
};

export type PlanoDaImportacao = {
  processos: ProcessoPlanejado[];
  fora: CartaoDeFora[];
  membros: { membro: MembroDoTrello; usuario: UsuarioParaCasar | null; cartoes: number }[];
};

/** Assunto do cartão sem o número interno nem o "| Processo Urgente" — só com `--titulo-do-cartao`. */
export function tituloDoAssunto(assunto: string): string | null {
  const t = assunto
    .split("|")[0]
    .replace(/\(\s*\d{3,5}(\s*e\s*\d{3,5})?\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–]+$/, "")
    .trim();
  return t ? t.slice(0, 160) : null;
}

export function planejarImportacao(
  quadro: QuadroDoTrello,
  ctx: ContextoDoEscritorio,
  opcoes: OpcoesDaImportacao
): PlanoDaImportacao {
  const listas = new Map(quadro.listas.map((l) => [l.id, l]));
  const membrosDoQuadro = new Map(quadro.membros.map((m) => [m.id, m]));
  const usuarioDoMembro = new Map(quadro.membros.map((m) => [m.id, casarMembro(m, ctx.usuarios)]));
  const hoje = saoPauloParts(opcoes.agora).dateKey;

  const processos: ProcessoPlanejado[] = [];
  const fora: CartaoDeFora[] = [];

  for (const cartao of quadro.cartoes) {
    const lista = listas.get(cartao.idList);
    const nomeDaLista = lista?.name ?? "(lista desconhecida)";
    const deFora = (motivo: MotivoDeFora, extra: Partial<CartaoDeFora> = {}) =>
      fora.push({ cartao, lista: nomeDaLista, grupo: null, detalhe: null, tipo: null, empresaId: null, sugestoes: [], motivo, ...extra });

    const naoEProcesso = cartaoQueNaoEProcesso(cartao.name);
    if (naoEProcesso) {
      deFora(naoEProcesso);
      continue;
    }
    const vinculo = ctx.vinculos.get(cartao.shortLink);
    if (vinculo?.ignorar) {
      deFora("vinculo_ignorar");
      continue;
    }
    if (ctx.jaImportados.has(cartao.shortLink)) {
      deFora("ja_importado");
      continue;
    }
    // Lista arquivada no Trello ("DEMAIS CADASTROS") conta como a lista ARQUIVADO.
    const faseDaListaAtual: Fase | null = lista ? (lista.closed ? "ARQUIVADO" : faseDaLista(lista.name)) : null;
    if (!faseDaListaAtual) {
      deFora("lista_desconhecida");
      continue;
    }

    // Cartão arquivado no Trello é arquivado, esteja na lista que estiver.
    const arquivado = cartao.closed || faseDaListaAtual === "ARQUIVADO";
    const grupo: Grupo = arquivado ? "arquivado" : faseDaListaAtual === "CONCLUIDO" ? "concluido" : "aberto";
    const fase: Fase = arquivado ? "ARQUIVADO" : faseDaListaAtual;

    const titulo = lerTitulo(cartao.name);
    const tipo: TipoLido | null = vinculo?.tipo ? { codigo: vinculo.tipo, avulsa: false } : tipoDoAssunto(titulo.assunto);

    let empresaId: string | null = null;
    let casamento: ProcessoPlanejado["casamento"] | null = null;
    let semEmpresa = "";
    if (vinculo?.cnpj) {
      const e = ctx.empresas.porCnpj.get(vinculo.cnpj);
      if (e) {
        empresaId = e.id;
        casamento = "vinculo";
      } else {
        semEmpresa = "o CNPJ do arquivo de vínculos não está no escritório";
      }
    } else {
      const c = casarEmpresa(titulo, cartao.desc, ctx.empresas, tipo?.codigo === "constituicao");
      if (c.empresaId === null) {
        semEmpresa = c.motivo;
      } else {
        empresaId = c.empresaId;
        casamento = c.como;
      }
    }

    const leitura = { grupo, tipo, empresaId };
    if (grupo === "arquivado" && !opcoes.arquivados) {
      deFora("arquivado", leitura);
      continue;
    }
    if (grupo === "concluido" && !opcoes.concluidos) {
      deFora("concluido", leitura);
      continue;
    }
    if (!tipo) {
      deFora("sem_tipo", { ...leitura, detalhe: titulo.assunto });
      continue;
    }
    const modelo = ctx.modelos.get(tipo.codigo);
    if (!modelo) {
      deFora("tipo_sem_roteiro", { ...leitura, detalhe: tipo.codigo });
      continue;
    }
    if (!empresaId || !casamento) {
      deFora("sem_empresa", {
        ...leitura,
        detalhe: semEmpresa,
        sugestoes: empresasParecidas(titulo, ctx.empresas).map((e) => e.id),
      });
      continue;
    }

    const ultimaAtividade = new Date(cartao.dateLastActivity);
    const inicio = criadoEm(cartao.id) ?? ultimaAtividade;
    const entrouNaLista = quadro.movimentos
      .filter((m) => m.idCard === cartao.id && m.paraLista === cartao.idList)
      .map((m) => new Date(m.data))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const desde = entrouNaLista ?? ultimaAtividade;

    // Arquivado que estava marcado como feito (ou arquivado já em "Concluídos")
    // terminou: é concluído, não cancelado.
    const marcadoComoFeito = !!cartao.dateCompleted || faseDaListaAtual === "CONCLUIDO";
    const { status, motivo } = situacaoDaFase(fase, marcadoComoFeito);

    let concludedAt: Date | null = null;
    if (status === "CONCLUIDO") {
      // A data da conclusão: quando foi para "Concluídos" (se o export tem),
      // senão quando foi marcado como feito, senão a última atividade.
      const quando = faseDaListaAtual === "CONCLUIDO" ? entrouNaLista : undefined;
      concludedAt = quando ?? (cartao.dateCompleted ? new Date(cartao.dateCompleted) : ultimaAtividade);
      if (concludedAt < inicio) concludedAt = inicio;
    }

    let dueAt: Date | null = null;
    let prazoVencido: Date | null = null;
    if (cartao.due && status !== "CONCLUIDO" && status !== "CANCELADO") {
      const prazo = dataCivil(new Date(cartao.due));
      if (saoPauloParts(prazo).dateKey >= hoje || opcoes.prazosVencidos) dueAt = prazo;
      else prazoVencido = prazo;
    }

    const membros = cartao.idMembers.map((id) => membrosDoQuadro.get(id)).filter((m): m is MembroDoTrello => !!m);
    const responsavelId = escolherResponsavel(cartao.idMembers.map((id) => usuarioDoMembro.get(id) ?? null));

    // Cancelado guarda as etapas de onde parou: o cartão arquivado em
    // "Viabilidade" tinha passado da documentação; o da lista ARQUIVADO, não se sabe.
    // Protocolo aguardando só em processo aberto: cancelado com protocolo
    // pendente entraria na ronda do observador e no casamento dos avisos da Junta.
    const lidas = etapasDaFase(modelo.roteiro, status === "CONCLUIDO" ? "CONCLUIDO" : faseDaListaAtual);
    const etapas = status === "CANCELADO" ? { ...lidas, protocolo: null } : lidas;

    processos.push({
      cartao,
      lista: nomeDaLista,
      grupo,
      fase,
      tipo,
      modelo,
      empresaId,
      casamento,
      responsavelId,
      status,
      motivo,
      startedAt: inicio,
      concludedAt,
      statusChangedAt: motivo ? desde : null,
      dueAt,
      prazoVencido: !!prazoVencido,
      prioridade: /URGEN/.test(plano(cartao.name)) ? "ALTA" : "NORMAL",
      titulo: opcoes.tituloDoCartao ? tituloDoAssunto(titulo.assunto) : null,
      notas: montarObservacoes({
        cartao,
        lista: nomeDaLista + (cartao.closed ? " (cartão arquivado)" : ""),
        titulo,
        membros: membros.map((m) => m.fullName),
        checklists: quadro.checklists.filter((c) => c.idCard === cartao.id),
        comentarios: quadro.comentarios.filter((c) => c.idCard === cartao.id),
        prazoVencido,
        importadoEm: opcoes.agora,
      }),
      etapas,
      desde,
    });
  }

  const contagem = new Map<string, number>();
  for (const c of quadro.cartoes) for (const id of c.idMembers) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  const membros = quadro.membros.map((membro) => ({
    membro,
    usuario: usuarioDoMembro.get(membro.id) ?? null,
    cartoes: contagem.get(membro.id) ?? 0,
  }));

  return { processos, fora, membros };
}
