// A decisão do motor NEO para uma transação, sem banco (porte de `src/domain/neo/engine.py`).
//
// O servidor (`servidor/neo.ts`) carrega as regras, as contrapartes e as pendências, chama `decidir`
// para cada transação e grava o que sai daqui. A ordem de decisão é a do original:
// 1. valor não confiável → quarentena (`sem_regra` com estratégia `valor_suspeito`);
// 2. regra (exato > substring > todas as palavras; agência antes da global; histórico mais longo);
// 3. sem regra, a contraparte: o CNPJ da nota fiscal candidata, o CPF/CNPJ do comprovante candidato, o
//    CPF/CNPJ impresso no histórico e, por último, o nome — recusando ambiguidade;
// 4. nada disso → `sem_regra`, com o quase-acerto recusado no motivo.
//
// Notas fiscais e comprovantes (Bloco C, Fase C2, 19/11/2026): `_selecionar_nota_candidata` e
// `_selecionar_comprovante_candidato`. A candidata é a ÚNICA nota pendente, sem transação, de valor a até
// R$ 0,01 e emitida a até 7 dias, na direção da transação (emitida pela empresa = crédito; recebida =
// débito); o comprovante, o ÚNICO sem transação, de valor a até R$ 0,01 e pago a até 3 dias, só para
// débito. Dois candidatos, nenhum. Quem classifica (por regra ou pela contraparte) leva os dois junto
// (`vincular`), e o servidor os liga e os tira do conjunto da execução (`DocumentosDoNeo.consumir`).

import { compara, dec, modulo, subtrai, type Dec } from "./decimal";
import { casarPorNome, nucleoDoNome, type CandidataPorNome } from "./contrapartePorNome";
import { documentosNoHistorico } from "./documentoNoHistorico";
import {
  desambiguarTiposPorDocumento,
  encontrarRegra,
  ESTRATEGIA_VALOR_SUSPEITO,
  gerarHistoricoSugerido,
  motivoParaNaoContabilizar,
  type Dc,
  type Estrategia,
  type RegraDoMotor,
} from "./regras";
import { normalizarHistoricoContabil } from "./texto";
import { corta } from "@/lib/revisao-contabil/motor/py";
import { ordenados } from "./unicodePy";

export type TransacaoDoNeo = {
  readonly id: string;
  readonly agenciaId: string;
  readonly historico: string;
  readonly dc: Dc;
  readonly valor: Dec;
  /** O dia do extrato (meia-noite UTC). Sem ele, nenhum documento é candidato. */
  readonly data?: Date;
};

export type RegraDoNeo = RegraDoMotor & {
  readonly contaId: string;
  readonly descricao: string;
  readonly manterHistorico: boolean;
  readonly tipo: string;
};

export type ContraparteDoNeo = {
  readonly id: string;
  readonly documento: string;
  readonly tipo: string;
  readonly origem: string;
  readonly razaoSocial: string;
  readonly nomeFantasia: string | null;
  readonly contaContabilId: string;
};

export type OrigemEvidencia = "nota_fiscal" | "comprovante" | "historico" | "nome";

/** Uma nota fiscal pendente, sem transação e viva (`notas_fiscais`). */
export type NotaDoNeo = {
  readonly id: string;
  readonly numero: string;
  readonly cnpjEmitente: string;
  readonly cnpjDestinatario: string | null;
  readonly valor: Dec;
  readonly dataEmissao: Date;
};

/** Um comprovante sem transação e vivo (`comprovantes`). */
export type ComprovanteDoNeo = {
  readonly id: string;
  readonly cpfCnpj: string | null;
  readonly valorPago: Dec;
  readonly dataPagamento: Date | null;
};

/** Os documentos que a classificação leva junto: o servidor os liga à transação. */
export type Vinculos = { comprovante: ComprovanteDoNeo | null; nota: NotaDoNeo | null };

/** Os documentos que podem ser ligados nesta execução (o original os relia a cada transação, menos os já consumidos). */
export class DocumentosDoNeo {
  readonly notas: Map<string, NotaDoNeo>;
  readonly comprovantes: Map<string, ComprovanteDoNeo>;
  constructor(notas: readonly NotaDoNeo[], comprovantes: readonly ComprovanteDoNeo[]) {
    this.notas = new Map(notas.map((n) => [n.id, n]));
    this.comprovantes = new Map(comprovantes.map((c) => [c.id, c]));
  }
  /** `_comprovantes_consumidos` e `_notas_consumidas`: o documento ligado não volta a ser candidato. */
  consumir(v: Vinculos): void {
    if (v.nota) this.notas.delete(v.nota.id);
    if (v.comprovante) this.comprovantes.delete(v.comprovante.id);
  }
}

/** O que a contraparte sugere quando uma regra já classificou (medição paralela, nunca aplicada). */
export type Sombra = {
  contraparteId: string;
  origemEvidencia: OrigemEvidencia;
  contaContraparteId: string;
  contaDivergente: boolean;
};

/** As partidas de um lançamento: a classificação e a contrapartida bancária. */
export type Partidas = { contaId: string; descricao: string; historico: string; dc: Dc; tipoRegra: string };

export type Decisao =
  | { tipo: "valor_suspeito"; motivo: string }
  | { tipo: "regra"; regra: RegraDoNeo; estrategia: Estrategia; partidas: Partidas; motivo: string; sombra: Sombra | null; vincular: Vinculos }
  | { tipo: "contraparte"; contraparte: ContraparteDoNeo; origemEvidencia: OrigemEvidencia; partidas: Partidas; motivo: string; vincular: Vinculos }
  | { tipo: "sem_regra"; motivo: string; recusa: string | null };

export type ContextoDoNeo = {
  /** Regras automáticas e ativas, já na ordem de `ordenarRegras`. */
  readonly regras: readonly RegraDoNeo[];
  /** Contrapartes ativas e vivas da empresa. */
  readonly contrapartes: readonly ContraparteDoNeo[];
  /** CNPJ da própria empresa: aparece em transferência entre contas próprias e nunca é contraparte. */
  readonly cnpjDaEmpresa: string | null;
  /** Forma canônica do histórico de cada regra, guardada entre transações. */
  readonly formaDeMatch?: (regra: RegraDoNeo) => string;
  /** As notas e os comprovantes ainda livres nesta execução (sem eles, nenhum documento é candidato). */
  readonly documentos?: DocumentosDoNeo;
};

const soDigitos = (t: string | null | undefined) => (t ?? "").replace(/\P{Nd}/gu, "");

function porDocumento(ctx: ContextoDoNeo, documento: string, dc: Dc): ContraparteDoNeo | null {
  const candidatas = desambiguarTiposPorDocumento(
    ctx.contrapartes.filter((c) => c.documento === documento),
    dc,
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}

// ─── Notas fiscais e comprovantes candidatos ──────────────────────────────

const TOLERANCIA_DE_VALOR = dec("0.01");
const DIA_MS = 86_400_000;
const DIAS_DO_COMPROVANTE = 3;
const DIAS_DA_NOTA = 7;

/**
 * A janela de datas como o PostgreSQL a compara: o dia do extrato (`date`) menos e mais N dias vira a
 * meia-noite daqueles dias (sessão em UTC), e as duas pontas entram. O pagamento à meia-noite do último
 * dia entra; às 10h do mesmo dia, não.
 */
function naJanela(instante: Date, dia: Date, dias: number): boolean {
  const t = instante.getTime();
  return t >= dia.getTime() - dias * DIA_MS && t <= dia.getTime() + dias * DIA_MS;
}

const pertoNoValor = (a: Dec, b: Dec) => compara(modulo(subtrai(a, b)), TOLERANCIA_DE_VALOR) <= 0;

/** `_direcao_nota`: emitida pela empresa = crédito; recebida por ela = débito; senão, nenhuma. */
export function direcaoDaNota(n: Pick<NotaDoNeo, "cnpjEmitente" | "cnpjDestinatario">, cnpjDaEmpresa: string | null): Dc | null {
  const empresa = soDigitos(cnpjDaEmpresa);
  const emitente = soDigitos(n.cnpjEmitente);
  const destinatario = soDigitos(n.cnpjDestinatario);
  if (empresa && emitente === empresa && destinatario !== empresa) return "C";
  if (empresa && destinatario === empresa && emitente !== empresa) return "D";
  return null;
}

/** `_selecionar_comprovante_candidato`: o único comprovante livre do débito, pelo valor e pelos 3 dias. */
export function comprovanteCandidato(t: TransacaoDoNeo, ctx: ContextoDoNeo): ComprovanteDoNeo | null {
  const dia = t.data;
  if (t.dc !== "D" || !dia || !ctx.documentos) return null;
  const achados = [...ctx.documentos.comprovantes.values()].filter(
    (c) => c.dataPagamento !== null && naJanela(c.dataPagamento, dia, DIAS_DO_COMPROVANTE) && pertoNoValor(c.valorPago, t.valor),
  );
  // Nenhum: não achou; dois ou mais: ambíguo. Os dois casos são descartados.
  return achados.length === 1 ? achados[0] : null;
}

/** `_selecionar_nota_candidata`: a única nota pendente e livre, pelo valor, pelos 7 dias e pela direção. */
export function notaCandidata(t: TransacaoDoNeo, ctx: ContextoDoNeo): NotaDoNeo | null {
  const dia = t.data;
  if (!dia || !ctx.documentos) return null;
  const achadas = [...ctx.documentos.notas.values()].filter(
    (n) => naJanela(n.dataEmissao, dia, DIAS_DA_NOTA) && pertoNoValor(n.valor, t.valor) && direcaoDaNota(n, ctx.cnpjDaEmpresa) === t.dc,
  );
  return achadas.length === 1 ? achadas[0] : null;
}

type Resolucao = { contraparte: ContraparteDoNeo; origem: OrigemEvidencia; numeroNf: string | null } | { recusa: string } | null;

/**
 * O CPF/CNPJ que o banco imprimiu na linha. O da própria empresa é descartado, e documentos de duas
 * contrapartes diferentes na mesma linha ("LIQUIDACAO BOLETO SICREDI <cnpj do banco> <cnpj do
 * cedente>") recusam: escolher um seria adivinhar.
 */
function noHistorico(ctx: ContextoDoNeo, t: TransacaoDoNeo): Resolucao {
  const documentos = documentosNoHistorico(t.historico);
  if (!documentos.length) return null;
  const proprio = soDigitos(ctx.cnpjDaEmpresa);
  const achadas = new Map<string, ContraparteDoNeo>();
  for (const d of documentos) {
    if (proprio && d === proprio) continue;
    const c = porDocumento(ctx, d, t.dc);
    if (c) achadas.set(c.id, c);
  }
  if (!achadas.size) return null;
  if (achadas.size > 1) {
    const nomes = ordenados([...achadas.values()].map((c) => c.razaoSocial)).slice(0, 3).join(", ");
    return { recusa: `O histórico traz documentos de mais de uma contraparte cadastrada (${nomes}). Classifique manualmente.` };
  }
  return { contraparte: achadas.values().next().value!, origem: "historico", numeroNf: null };
}

/** Razão social ou nome fantasia no histórico, recusando empate entre cadastros. */
function peloNome(ctx: ContextoDoNeo, t: TransacaoDoNeo): Resolucao {
  const contrapartes = desambiguarTiposPorDocumento(ctx.contrapartes, t.dc);
  if (!contrapartes.length) return null;
  const candidatas: CandidataPorNome<string>[] = [];
  const porId = new Map<string, ContraparteDoNeo>();
  for (const c of contrapartes) {
    porId.set(c.id, c);
    for (const nome of [c.razaoSocial, c.nomeFantasia]) {
      const nucleo = nucleoDoNome(nome);
      if (nucleo) candidatas.push({ contraparteId: c.id, nucleo });
    }
  }
  const { achada, motivo } = casarPorNome(t.historico ?? "", candidatas);
  if (!achada) return motivo ? { recusa: motivo } : null;
  return { contraparte: porId.get(achada.contraparteId)!, origem: "nome", numeroNf: null };
}

/**
 * `_resolver_contraparte_candidata`. Documento antes de nome: o CNPJ bate ou não bate; o nome depende de
 * como o banco escreveu. A ordem: a nota candidata (o emitente no débito, o destinatário no crédito), o
 * comprovante candidato, o documento impresso no histórico e o nome.
 *
 * O número da nota vai para o histórico quando a contraparte veio da nota (e, como no original, também
 * quando veio do nome). Pelo documento do histórico, NÃO: chegar até ali com a nota candidata significa
 * que ela é de OUTRO CNPJ, e o número apontaria o lançamento para uma nota que não é dele.
 */
export function resolverContraparte(
  ctx: ContextoDoNeo,
  t: TransacaoDoNeo,
  candidatos: Vinculos,
): { achada: Exclude<Resolucao, { recusa: string } | null> | null; recusa: string | null } {
  let documento: string | null = null;
  let origem: OrigemEvidencia | null = null;
  let numeroNf: string | null = null;
  const nota = candidatos.nota;
  if (nota) {
    const direcao = direcaoDaNota(nota, ctx.cnpjDaEmpresa);
    if (direcao === t.dc) {
      documento = direcao === "D" ? nota.cnpjEmitente : nota.cnpjDestinatario;
      origem = "nota_fiscal";
      numeroNf = nota.numero;
    }
  }
  if (documento === null && candidatos.comprovante?.cpfCnpj) {
    documento = candidatos.comprovante.cpfCnpj;
    origem = "comprovante";
  }
  if (documento !== null && origem !== null) {
    const digitos = soDigitos(documento);
    if (digitos) {
      const c = porDocumento(ctx, digitos, t.dc);
      if (c) return { achada: { contraparte: c, origem, numeroNf }, recusa: null };
    }
  }
  let recusa: string | null = null;
  const historico = noHistorico(ctx, t);
  if (historico && "recusa" in historico) recusa = historico.recusa;
  else if (historico) return { achada: historico, recusa };
  const nome = peloNome(ctx, t);
  // A última recusa é a que fica, como no original (o dicionário é sobrescrito).
  if (nome && "recusa" in nome) return { achada: null, recusa: nome.recusa };
  if (nome) return { achada: { ...nome, numeroNf }, recusa };
  return { achada: null, recusa };
}

/** A decisão do NEO para uma transação pendente. */
export function decidir(t: TransacaoDoNeo, ctx: ContextoDoNeo): Decisao {
  const bloqueio = motivoParaNaoContabilizar({ historico: t.historico, valor: t.valor });
  if (bloqueio !== null) return { tipo: "valor_suspeito", motivo: corta(bloqueio, 500) };

  const casou = encontrarRegra(t, ctx.regras, ctx.formaDeMatch);
  // Os candidatos são escolhidos antes das partidas e ligados depois delas (`_registrar_match`).
  const candidatos: Vinculos = { comprovante: comprovanteCandidato(t, ctx), nota: notaCandidata(t, ctx) };
  if (casou) {
    const { regra, estrategia } = casou;
    const historico = regra.manterHistorico ? t.historico : regra.descricao;
    // Com regra, a contraparte é só medida (`_resolver_contraparte_sombra`), nunca aplicada.
    const r = resolverContraparte(ctx, t, candidatos).achada;
    const sombra: Sombra | null = r
      ? {
          contraparteId: r.contraparte.id,
          origemEvidencia: r.origem,
          contaContraparteId: r.contraparte.contaContabilId,
          contaDivergente: r.contraparte.contaContabilId !== regra.contaId,
        }
      : null;
    return {
      tipo: "regra",
      regra,
      estrategia,
      partidas: { contaId: regra.contaId, descricao: regra.descricao, historico, dc: regra.dc, tipoRegra: regra.tipo },
      motivo: `Regra '${regra.historico}' (${estrategia})`,
      sombra,
      vincular: candidatos,
    };
  }

  const { achada, recusa } = resolverContraparte(ctx, t, candidatos);
  if (achada) {
    const c = achada.contraparte;
    return {
      tipo: "contraparte",
      contraparte: c,
      origemEvidencia: achada.origem,
      partidas: {
        contaId: c.contaContabilId,
        descricao: c.razaoSocial,
        historico: gerarHistoricoSugerido(t.dc, c.razaoSocial, achada.numeroNf),
        dc: t.dc,
        tipoRegra: "contraparte",
      },
      motivo: `Contraparte '${c.razaoSocial}' identificada via ${achada.origem} (documento ${c.documento})`,
      vincular: candidatos,
    };
  }

  let motivo = `Nenhuma regra encontrada para '${t.historico}' (dc=${t.dc})`;
  if (recusa) motivo = `${motivo}. ${recusa}`;
  return { tipo: "sem_regra", motivo: corta(motivo, 500), recusa };
}

export const ESTRATEGIA_QUARENTENA = ESTRATEGIA_VALOR_SUSPEITO;

/** As duas pernas que `_registrar_partidas` grava: a classificação e a contrapartida no banco. */
export function pernas(p: Partidas, contaBancariaId: string, historicoExtrato: string) {
  const comum = { historico: corta(normalizarHistoricoContabil(p.historico), 500), historicoExtrato, tipoRegra: p.tipoRegra };
  return [
    { ...comum, contaId: p.contaId, descricao: corta(normalizarHistoricoContabil(p.descricao), 500), dc: p.dc },
    {
      ...comum,
      contaId: contaBancariaId,
      descricao: corta(normalizarHistoricoContabil(`Contrapartida bancária: ${p.descricao}`), 500),
      dc: (p.dc === "D" ? "C" : "D") as Dc,
    },
  ];
}

/** Código da conta sintética que o motor cria para agência sem conta contábil (`1.1.B.<hex16>`). */
export function codigoContaSintetica(agenciaId: string): string {
  return `1.1.B.${agenciaId.replace(/-/g, "").slice(0, 16)}`;
}

/** O histórico da classificação manual: o digitado ou, com `manterHistorico`, a linha do banco. */
export function historicoManual(t: { historico: string }, descricao: string | null, manterHistorico: boolean): string | null {
  const h = manterHistorico ? t.historico : descricao;
  return h && h.trim() ? h : null;
}
