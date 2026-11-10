// As certidões da carteira pela InfoSimples (Certidões pelo Connect,
// 28/10/2026) — regras puras: quais certidões cada empresa precisa, em que mês
// do trimestre ela entra na rotina e como ler a resposta de cada consulta.
//
// As cinco consultas e os campos que cada uma devolve foram lidos nas páginas
// públicas da InfoSimples em 28/10/2026. O envelope (code, code_message, data,
// site_receipts) e os códigos de erro vêm da documentação, que fica atrás do
// login: conferir com o primeiro token, antes de ligar a rotina.

export const TIPOS_DE_CERTIDAO = ["FEDERAL", "FGTS", "TRABALHISTA", "ESTADUAL_PR", "CURITIBA"] as const;
export type TipoDeCertidao = (typeof TIPOS_DE_CERTIDAO)[number];

export const ROTULO_DA_CERTIDAO: Record<TipoDeCertidao, string> = {
  FEDERAL: "Federal",
  FGTS: "FGTS",
  TRABALHISTA: "Trabalhista",
  ESTADUAL_PR: "Estadual (PR)",
  CURITIBA: "Municipal (Curitiba)",
};

/** O nome do arquivo nos Arquivos: "CND Federal - Empresa - 2026-10-28.pdf". */
const NOME_DO_ARQUIVO: Record<TipoDeCertidao, string> = {
  FEDERAL: "CND Federal",
  FGTS: "CRF do FGTS",
  TRABALHISTA: "CNDT",
  ESTADUAL_PR: "CND Estadual PR",
  CURITIBA: "CND Curitiba",
};

/** O caminho da consulta na API (api.infosimples.com/api/v2/consultas/…) e os parâmetros fixos. */
export const CONSULTA: Record<TipoDeCertidao, { caminho: string; fixos?: Record<string, string> }> = {
  // `2via`: com uma positiva com efeito de negativa vigente, a PGFN não emite
  // outra; a consulta devolve a que vale.
  FEDERAL: { caminho: "receita-federal/pgfn", fixos: { preferencia_emissao: "2via" } },
  FGTS: { caminho: "caixa/regularidade" },
  TRABALHISTA: { caminho: "tribunal/tst/cndt" },
  ESTADUAL_PR: { caminho: "sefaz/pr/certidao-debitos" },
  CURITIBA: { caminho: "pref/pr/curitiba/cnd" },
};

/** Quem é avisado da positiva, além do Societário (decisão pedida no documento de 28/10). */
export const SETORES_DO_AVISO: Record<TipoDeCertidao, string[]> = {
  FEDERAL: ["societario", "fiscal"],
  FGTS: ["societario", "dp"],
  TRABALHISTA: ["societario", "dp"],
  ESTADUAL_PR: ["societario", "fiscal"],
  CURITIBA: ["societario", "fiscal"],
};

export type SituacaoDaCertidao = "NEGATIVA" | "POSITIVA_COM_EFEITO" | "POSITIVA" | "NAO_SAIU";

export const ROTULO_DA_SITUACAO: Record<SituacaoDaCertidao, string> = {
  NEGATIVA: "Negativa",
  POSITIVA_COM_EFEITO: "Positiva com efeito de negativa",
  POSITIVA: "Positiva",
  NAO_SAIU: "Não saiu",
};

/** Negativa ou positiva com efeito de negativa: vale como regular, e o cliente pode ver. */
export const ehRegular = (s: SituacaoDaCertidao) => s === "NEGATIVA" || s === "POSITIVA_COM_EFEITO";

// ─── A carteira ──────────────────────────────────────────────────────────────

export type EmpresaDaCarteira = { id: string; cnpj: string | null; stateCode: string | null; city: string | null };
export type CertidaoDaCarteira = { companyId: string; tipo: TipoDeCertidao };

const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "");
const semAcento = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
const ehMatriz = (cnpj: string) => cnpj.slice(8, 12) === "0001";

/** A empresa que responde pela raiz: a matriz, senão o menor CNPJ. */
function representante(empresas: { id: string; cnpj: string }[]): string {
  return [...empresas].sort((a, b) => Number(ehMatriz(b.cnpj)) - Number(ehMatriz(a.cnpj)) || a.cnpj.localeCompare(b.cnpj))[0].id;
}

/**
 * Quais certidões a carteira precisa. Federal, FGTS e trabalhista valem para a
 * raiz do CNPJ (matriz e filiais): uma por raiz. A estadual do PR também cobre
 * todos os estabelecimentos do estado: uma por raiz, entre os do PR. A de
 * Curitiba é do estabelecimento: uma por empresa da cidade. Sem CNPJ, nenhuma.
 */
export function certidoesDaCarteira(empresas: EmpresaDaCarteira[]): CertidaoDaCarteira[] {
  const comCnpj = empresas.map((e) => ({ ...e, cnpj: digitos(e.cnpj) })).filter((e) => e.cnpj.length === 14);
  const porRaiz = new Map<string, typeof comCnpj>();
  for (const e of comCnpj) porRaiz.set(e.cnpj.slice(0, 8), [...(porRaiz.get(e.cnpj.slice(0, 8)) ?? []), e]);

  const lista: CertidaoDaCarteira[] = [];
  for (const daRaiz of porRaiz.values()) {
    const rep = representante(daRaiz);
    for (const tipo of ["FEDERAL", "FGTS", "TRABALHISTA"] as const) lista.push({ companyId: rep, tipo });
    const doPr = daRaiz.filter((e) => (e.stateCode ?? "").toUpperCase() === "PR");
    if (doPr.length) lista.push({ companyId: representante(doPr), tipo: "ESTADUAL_PR" });
  }
  for (const e of comCnpj) {
    if ((e.stateCode ?? "").toUpperCase() === "PR" && semAcento(e.city ?? "") === "CURITIBA") lista.push({ companyId: e.id, tipo: "CURITIBA" });
  }
  return lista;
}

// ─── O trimestre ─────────────────────────────────────────────────────────────

/** "2026-10-28" → "2026-T4". */
export function trimestreDe(hoje: string): string {
  return `${hoje.slice(0, 4)}-T${Math.floor((Number(hoje.slice(5, 7)) - 1) / 3) + 1}`;
}

/** 0, 1 ou 2: o mês dentro do trimestre. */
export const mesDoTrimestre = (hoje: string): number => (Number(hoje.slice(5, 7)) - 1) % 3;

/**
 * O mês do trimestre em que a empresa entra na rotina: um terço da carteira
 * por mês, para o custo ficar no mínimo da InfoSimples. Estável: sai do id.
 */
export function grupoDaEmpresa(companyId: string): number {
  let soma = 0;
  for (const c of companyId) soma = (soma * 31 + c.charCodeAt(0)) % 9973;
  return soma % 3;
}

// ─── A resposta ──────────────────────────────────────────────────────────────

export type RespostaDaInfoSimples = { code?: unknown; code_message?: unknown; data?: unknown; site_receipts?: unknown; errors?: unknown };

export type Leitura =
  | {
      tipo: "lida";
      situacao: Exclude<SituacaoDaCertidao, "NAO_SAIU">;
      codigo: string | null;
      emitidaEm: string | null;
      validaAte: string | null;
      mensagem: string | null;
      comprovante: string | null;
    }
  /** `configuracao`: o token foi recusado — a rotina para até alguém arrumar. */
  | { tipo: "nao_saiu"; mensagem: string; tentarDeNovo: boolean; configuracao: boolean };

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null);
const texto = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : typeof v === "number" ? String(v) : null);

/** "28/10/2026", "2026-10-28" ou "2026-10-28T…" → "2026-10-28". */
export function dataDaInfoSimples(v: unknown): string | null {
  const t = texto(v);
  if (!t) return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  return iso ? iso[1] : null;
}

/** O primeiro texto que houver, dos campos na ordem. */
const primeiro = (d: Objeto, ...campos: string[]) => campos.map((c) => texto(d[c])).find((v) => v !== null) ?? null;
const primeiraData = (d: Objeto, ...campos: string[]) => campos.map((c) => dataDaInfoSimples(d[c])).find((v) => v !== null) ?? null;

/**
 * Token recusado para o serviço — 601, não autenticou; 603, sem acesso ao
 * serviço, inativo ou no limite de uso do token. Não adianta tentar a carteira
 * inteira: a rotina para aquele serviço até a próxima tentativa.
 */
const DE_CONFIGURACAO = new Set([601, 603]);
/** Do lado de lá (site fora, captcha, limite): tenta de novo mais tarde. */
const PASSAGEIROS = new Set([600, 605, 609, 610, 613, 614, 615, 617, 618, 619, 620]);
/**
 * Os códigos que a InfoSimples não cobra: a coluna "Há cobrança?" da tabela de
 * códigos de resposta da documentação da API (v2.2.40, 01/10/2026). Cobra
 * 200, 606, 607, 608, 611, 612, 619 e 620; um código fora da tabela conta,
 * por cautela com o teto.
 */
const NAO_COBRADOS = new Set([600, 601, 602, 603, 604, 605, 609, 610, 613, 614, 615, 617, 618, 621, 622]);

export function lerCertidao(tipo: TipoDeCertidao, r: RespostaDaInfoSimples): Leitura {
  const code = Number(r.code);
  const aviso = texto(r.code_message) ?? (Array.isArray(r.errors) ? r.errors.map(texto).filter(Boolean).join(" ") : null);
  if (code !== 200) {
    // O código fica sempre no fim, mesmo com aviso longo: é por ele que o gasto
    // do mês sabe se a consulta foi cobrada.
    const sufixo = Number.isFinite(code) ? ` (código ${code})` : "";
    return {
      tipo: "nao_saiu",
      mensagem: `${(aviso ?? "A InfoSimples não respondeu.").slice(0, 500 - sufixo.length)}${sufixo}`,
      tentarDeNovo: PASSAGEIROS.has(code) || !Number.isFinite(code),
      configuracao: DE_CONFIGURACAO.has(code),
    };
  }
  const d = objeto(Array.isArray(r.data) ? r.data[0] : null);
  if (!d) return { tipo: "nao_saiu", mensagem: "A InfoSimples respondeu sem a certidão. (código 200)", tentarDeNovo: true, configuracao: false };

  const recibos = Array.isArray(r.site_receipts) ? r.site_receipts.map(texto).filter((u): u is string => !!u && u.startsWith("https://")) : [];
  const efeito = ["tipo", "situacao", "titulo", "consta", "certidao", "mensagem"].some((c) => /EFEITO/.test(semAcento(texto(d[c]) ?? "")));

  let situacao: Exclude<SituacaoDaCertidao, "NAO_SAIU">;
  if (tipo === "FGTS") {
    // O CRF não tem "negativa": a situação vem em texto, regular ou irregular.
    const s = semAcento(texto(d.situacao) ?? "");
    situacao = /\bREGULAR\b/.test(s) && !/IRREGULAR/.test(s) ? "NEGATIVA" : "POSITIVA";
  } else {
    situacao = d.conseguiu_emitir_certidao_negativa === true ? (efeito ? "POSITIVA_COM_EFEITO" : "NEGATIVA") : "POSITIVA";
  }

  return {
    tipo: "lida",
    situacao,
    codigo: primeiro(d, "certidao_codigo", "crf", "numero", "codigo")?.slice(0, 80) ?? null,
    emitidaEm: primeiraData(d, "normalizado_emissao_data", "emissao_data", "data_emissao", "normalizado_validade_inicio_data", "validade_inicio_data", "normalizado_expedicao", "expedicao"),
    validaAte: primeiraData(d, "normalizado_validade_data", "validade_data", "data_validade", "normalizado_validade_fim_data", "validade_fim_data", "normalizado_validade", "validade"),
    mensagem: primeiro(d, "mensagem", "situacao", "consta")?.slice(0, 500) ?? null,
    comprovante: recibos[0] ?? null,
  };
}

export function nomeDoComprovante(tipo: TipoDeCertidao, empresa: string, dia: string, extensao: "pdf" | "html"): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return `${NOME_DO_ARQUIVO[tipo]} - ${limpo} - ${dia}.${extensao}`;
}

/**
 * Quanto cada certidão custa de verdade, com o adicional que algumas consultas
 * da InfoSimples somam ao preço da faixa (04/11/2026). Na primeira semana, 18
 * consultas custaram R$ 4,86: R$ 0,27 cada, e não os R$ 0,20 da faixa. O teto
 * contava R$ 0,20 e deixaria passar uns 35% acima do combinado.
 *
 * O preço de cada uma saiu do extrato de uso de 2026/11 da InfoSimples (10/11/2026):
 * 25 PGFN por R$ 7,50, 25 FGTS por R$ 6,50, 25 TST por R$ 6,00 e 5 SEFAZ/PR
 * por R$ 1,35. A de Curitiba ainda não apareceu no extrato e fica na média
 * medida em 04/11.
 */
export const PRECO_EM_CENTAVOS: Record<TipoDeCertidao, number> = {
  FEDERAL: 30,
  FGTS: 26,
  TRABALHISTA: 24,
  ESTADUAL_PR: 27,
  CURITIBA: 27,
};

/** A franquia mínima da InfoSimples: o mês custa pelo menos isto, com ou sem uso. */
export const FRANQUIA_EM_CENTAVOS = 10_000;

/** O código da InfoSimples guardado no fim da mensagem: "… (código 605)". */
const codigoNaMensagem = (mensagem: string | null): number | null => {
  const m = /\(c[oó]digo (\d+)\)\s*$/.exec(mensagem ?? "");
  return m ? Number(m[1]) : null;
};

type RegistroDaConsulta = { tipo: string; situacao: string; mensagem: string | null };

/**
 * A consulta foi cobrada? Pela tabela da InfoSimples (`NAO_COBRADOS`): a
 * certidão que saiu é cobrada, e também os erros que ela cobra, como dados
 * incompletos no órgão (611) e erro que não muda tão cedo (620). Não cobra
 * token recusado (603), tempo esgotado (605) nem órgão fora do ar (615).
 * Sem código nenhum, a InfoSimples não chegou a responder — também não cobra.
 *
 * Antes (04/11) só os passageiros ficavam de fora, e o 603 entrava. Em
 * novembro o token parou de responder às federais com 603; a rotina tentou a
 * cada 5 minutos, e as 292 recusas contaram como cobradas: R$ 99,90 de gasto e
 * 534 consultas na tela, contra R$ 21,35 e 80 consultas no extrato. O teto
 * fechou e a rotina parou em 04/11.
 */
export function consultaCobrada(r: Pick<RegistroDaConsulta, "situacao" | "mensagem">): boolean {
  if (r.situacao !== "NAO_SAIU") return true;
  // Respondeu 200 sem a certidão: cobrada. As gravadas antes de 10/11 não têm o código.
  if (/^A InfoSimples respondeu sem a certidão/.test(r.mensagem ?? "")) return true;
  const codigo = codigoNaMensagem(r.mensagem);
  return codigo !== null && !NAO_COBRADOS.has(codigo);
}

/** As consultas do mês que a InfoSimples cobra — as que o extrato dela lista. */
export function consultasCobradas(registros: RegistroDaConsulta[]): number {
  return registros.filter(consultaCobrada).length;
}

/** O gasto estimado do mês, pelo preço de cada certidão cobrada. */
export function gastoDoMesEmCentavos(registros: RegistroDaConsulta[]): number {
  let total = 0;
  for (const r of registros) {
    if (!consultaCobrada(r)) continue;
    total += PRECO_EM_CENTAVOS[r.tipo as TipoDeCertidao] ?? Math.max(...Object.values(PRECO_EM_CENTAVOS));
  }
  return total;
}

/** A InfoSimples recusou o token para este serviço (601 ou 603)? */
export function recusaDoToken(r: Pick<RegistroDaConsulta, "situacao" | "mensagem">): boolean {
  if (r.situacao !== "NAO_SAIU") return false;
  const codigo = codigoNaMensagem(r.mensagem);
  return codigo !== null && DE_CONFIGURACAO.has(codigo);
}

/**
 * Os serviços cuja última consulta foi uma recusa do token, com a hora dela.
 * A recusa vale para o serviço, não para a empresa: o token não tem acesso ou
 * passou do limite de uso que alguém pôs nele no painel da InfoSimples.
 */
export function servicosRecusados(registros: (RegistroDaConsulta & { createdAt: Date })[]): Map<TipoDeCertidao, Date> {
  const ultima = new Map<string, RegistroDaConsulta & { createdAt: Date }>();
  for (const r of registros) {
    const antes = ultima.get(r.tipo);
    if (!antes || r.createdAt > antes.createdAt) ultima.set(r.tipo, r);
  }
  const recusados = new Map<TipoDeCertidao, Date>();
  for (const [tipo, r] of ultima) if (recusaDoToken(r)) recusados.set(tipo as TipoDeCertidao, r.createdAt);
  return recusados;
}
