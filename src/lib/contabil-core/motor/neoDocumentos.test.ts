// Gabarito do NEO com notas fiscais e comprovantes (Bloco C, Fase C2, 19/11/2026).
//
// `gabarito/documentos/neo-documentos-*.json` foi gerado por `scripts/contabil-core/gabarito_neo_documentos.py`:
// as chamadas do motor original (`neo/engine.py`) que envolvem nota ou comprovante na suíte
// `tests/integration/test_neo.py` — `processar`, a escolha da candidata, a contraparte pela nota e pelo
// comprovante e o modo sombra — e mundos inventados com semente fixa em volta das tolerâncias. Cada caso
// traz o que o motor leu do banco e o que saiu: as contagens, o status das transações, a decisão gravada,
// a partida da classificação e a ligação de cada documento.
//
// Aqui o laço do servidor (`servidor/neo.ts`) é repetido sobre a entrada com as funções puras do motor
// (`decidir`, `DocumentosDoNeo`, `pernas`). Se um caso falhar, o porte está errado, e não o gabarito.
//
// Divergência deliberada (D0, decisão do Angelo em 26/11/2026): o número da nota vai para o histórico só
// quando a contraparte veio da própria nota candidata. O original o levava também pela via do nome (a
// nota candidata, de OUTRO CNPJ, emprestava o número). O gabarito NÃO foi regerado: os casos em que isso
// muda são contados um a um, e neles a única diferença aceita é o "NF <número> - " a menos no histórico
// da classificação por nome.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { dec } from "./decimal";
import {
  comprovanteCandidato,
  decidir,
  DocumentosDoNeo,
  notaCandidata,
  pernas,
  resolverContraparte,
  type ContextoDoNeo,
  type ContraparteDoNeo,
  type TransacaoDoNeo,
  type Vinculos,
} from "./neo";
import { ESTRATEGIA_VALOR_SUSPEITO, gerarHistoricoSugerido, ordenarRegras, type Dc } from "./regras";
import { normalizarParaMatch } from "./texto";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caso = { id: number; tipo: string; origem: "suite" | "inventado"; entrada: any; saida: any };

const PASTA = path.join(__dirname, "gabarito", "documentos");
const casos: Caso[] = readdirSync(PASTA)
  .filter((n) => /^neo-documentos-\d+\.json$/.test(n))
  .flatMap((n) => JSON.parse(readFileSync(path.join(PASTA, n), "utf8")) as Caso[]);

const diaUtc = (d: string) => new Date(`${d}T00:00:00.000Z`);

function transacao(t: any): TransacaoDoNeo {
  return { id: t.id, agenciaId: t.agencia_id, historico: t.historico, dc: t.dc as Dc, valor: dec(t.valor), data: diaUtc(t.data) };
}

const contraparte = (c: any): ContraparteDoNeo => ({
  id: c.id,
  documento: c.documento,
  tipo: c.tipo,
  origem: c.origem,
  razaoSocial: c.razao_social,
  nomeFantasia: c.nome_fantasia,
  contaContabilId: c.conta_contabil_id,
});

const nota = (n: any) => ({
  id: n.id,
  numero: n.numero,
  cnpjEmitente: n.cnpj_emitente,
  cnpjDestinatario: n.cnpj_destinatario,
  valor: dec(n.valor),
  dataEmissao: new Date(n.data_emissao),
});
const comprovante = (c: any) => ({ id: c.id, cpfCnpj: c.cpf_cnpj, valorPago: dec(c.valor_pago), dataPagamento: c.data_pagamento ? new Date(c.data_pagamento) : null });

/** O contexto do motor com o banco da entrada: as regras e contrapartes que o servidor carrega e os documentos livres. */
function contexto(e: any): ContextoDoNeo {
  const ch = e.chamada;
  const regras = e.regras
    .filter((r: any) => r.ativa && !r.apagada && r.tipo === "automatica" && (!ch.agencia_id || r.agencia_id === null || r.agencia_id === ch.agencia_id))
    .map((r: any) => ({ id: r.id, agenciaId: r.agencia_id, historico: r.historico, dc: r.dc, contaId: r.conta_id, descricao: r.descricao, manterHistorico: r.manter_historico, tipo: r.tipo }));
  const consumidosN = new Set(ch.notas_consumidas ?? []);
  const consumidosC = new Set(ch.comprovantes_consumidos ?? []);
  const documentos = new DocumentosDoNeo(
    e.notas.filter((n: any) => !n.apagada && n.transacao_id === null && n.status === "pendente" && !consumidosN.has(n.id)).map(nota),
    e.comprovantes.filter((c: any) => !c.apagado && c.transacao_id === null && !consumidosC.has(c.id)).map(comprovante),
  );
  const formas = new Map<string, string>();
  return {
    regras: ordenarRegras(regras),
    contrapartes: e.contrapartes.filter((c: any) => c.ativa && !c.apagada).map(contraparte),
    cnpjDaEmpresa: ch.tipo === "processar" || ch.cnpj_definido ? e.empresa.cnpj : null,
    documentos,
    formaDeMatch: (r) => {
      let f = formas.get(r.id);
      if (f === undefined) formas.set(r.id, (f = normalizarParaMatch(r.historico)));
      return f;
    },
  };
}

/** `processar` no laço do servidor, sobre a entrada: o resultado e o que muda no banco. */
function processar(e: any) {
  const ch = e.chamada;
  const ctx = contexto(e);
  const status: Record<string, string> = Object.fromEntries(e.transacoes.map((t: any) => [t.id, t.status]));
  const notas: Record<string, { transacao_id: string | null; status: string }> = Object.fromEntries(
    e.notas.map((n: any) => [n.id, { transacao_id: n.transacao_id, status: n.status }]),
  );
  const comprovantes: Record<string, string | null> = Object.fromEntries(e.comprovantes.map((c: any) => [c.id, c.transacao_id]));
  const decisoes: Record<string, any> = {};
  const partidas: Record<string, any> = {};
  const abertas = new Set(e.decisoes_abertas);
  const fimDoMes = (mes: string) => {
    const [a, m] = mes.split("-").map(Number);
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  };
  const pendentes = e.transacoes
    .filter(
      (t: any) =>
        t.status === "pendente" &&
        !t.apagada &&
        !t.recusada &&
        (!ch.agencia_id || t.agencia_id === ch.agencia_id) &&
        (!ch.mes || (t.data >= `${ch.mes}-01` && t.data <= fimDoMes(ch.mes))),
    )
    .sort((a: any, b: any) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const r = {
    total_pendentes: pendentes.length,
    associadas: 0,
    sem_regra: 0,
    erros: 0,
    comprovantes_associados: 0,
    notas_associadas: 0,
    classificadas_por_contraparte: 0,
    bloqueadas_valor_suspeito: 0,
  };
  const decisao = (resultado: string, x: Partial<Record<string, unknown>> = {}) => ({
    resultado,
    estrategia: null,
    motivo: null,
    regra_id: null,
    conta_id: null,
    contraparte_id: null,
    conta_contraparte_id: null,
    origem_evidencia: null,
    conta_divergente: null,
    ...x,
  });
  for (const bruta of pendentes) {
    const t = transacao(bruta);
    const d = decidir(t, ctx);
    if (d.tipo === "valor_suspeito") {
      decisoes[t.id] = decisao("sem_regra", { estrategia: ESTRATEGIA_VALOR_SUSPEITO, motivo: d.motivo });
      r.sem_regra++;
      r.bloqueadas_valor_suspeito++;
      continue;
    }
    if (d.tipo === "sem_regra") {
      if (d.recusa || !abertas.has(t.id)) decisoes[t.id] = decisao("sem_regra", { motivo: d.motivo });
      r.sem_regra++;
      continue;
    }
    status[t.id] = "processada";
    const [perna] = pernas(d.partidas, "conta-do-banco", t.historico);
    partidas[t.id] = { conta_id: perna.contaId, descricao: perna.descricao, historico: perna.historico, dc: perna.dc, tipo_regra: perna.tipoRegra };
    if (d.tipo === "regra") {
      const s = d.sombra;
      decisoes[t.id] = decisao("associada", {
        regra_id: d.regra.id,
        conta_id: d.regra.contaId,
        estrategia: d.estrategia,
        motivo: d.motivo,
        contraparte_id: s?.contraparteId ?? null,
        conta_contraparte_id: s?.contaContraparteId ?? null,
        origem_evidencia: s?.origemEvidencia ?? null,
        conta_divergente: s?.contaDivergente ?? null,
      });
    } else {
      decisoes[t.id] = decisao("associada", { conta_id: d.contraparte.contaContabilId, estrategia: "contraparte", motivo: d.motivo });
      r.classificadas_por_contraparte++;
    }
    if (d.vincular.comprovante) {
      comprovantes[d.vincular.comprovante.id] = t.id;
      r.comprovantes_associados++;
    }
    if (d.vincular.nota) {
      notas[d.vincular.nota.id] = { transacao_id: t.id, status: "associada" };
      r.notas_associadas++;
    }
    ctx.documentos!.consumir(d.vincular);
    r.associadas++;
  }
  return { resultado: r, depois: { status, decisoes, partidas, notas, comprovantes } };
}

const doTipo = (tipo: string) => casos.filter((c) => c.tipo === tipo);

/** Os casos que divergem de propósito do gabarito (o número da nota que o original levava pela via do nome). */
const numeroPeloNome = { processar: [] as number[], resolver: [] as number[], sombra: [] as number[] };

/** "PGTO REF NF 123 - FULANO" → "PGTO REF FULANO": o histórico que o original geraria sem o número. */
function semNumeroDaNota(historico: string): string | null {
  const m = /^(PGTO|REC) REF NF \S+ - ([\s\S]*)$/.exec(historico);
  return m ? `${m[1]} REF ${m[2]}` : null;
}

/**
 * As partidas esperadas com a divergência aplicada: na transação classificada PELO NOME (motivo "via nome")
 * cujo histórico do original trazia o número da nota, o porte o gera sem o número. Devolve também quantas
 * transações mudaram.
 */
function partidasSemNumeroPeloNome(esperado: any): { partidas: Record<string, any>; mudadas: number } {
  const partidas: Record<string, any> = {};
  let mudadas = 0;
  for (const [id, p] of Object.entries<any>(esperado.depois.partidas)) {
    const d = esperado.depois.decisoes[id];
    const sem = p.tipo_regra === "contraparte" && d?.estrategia === "contraparte" && / via nome /.test(d.motivo ?? "") ? semNumeroDaNota(p.historico) : null;
    if (sem === null) partidas[id] = p;
    else {
      partidas[id] = { ...p, historico: sem };
      mudadas++;
    }
  }
  return { partidas, mudadas };
}

describe("NEO com notas e comprovantes: processar (gabarito)", () => {
  test("o gabarito traz casos da suíte do original e documentos ligados", () => {
    expect(casos.filter((c) => c.origem === "suite").length).toBeGreaterThan(0);
    expect(doTipo("processar").some((c) => c.saida.resultado.comprovantes_associados > 0)).toBe(true);
    expect(doTipo("processar").some((c) => c.saida.resultado.notas_associadas > 0)).toBe(true);
  });

  test.each(doTipo("processar").map((c) => [c.id, c.origem, c] as const))("#%s (%s)", (_id, _origem, c) => {
    const obtido = processar(c.entrada);
    expect(obtido.resultado).toEqual(c.saida.resultado);
    expect(obtido.depois.status).toEqual(c.saida.depois.status);
    expect(obtido.depois.decisoes).toEqual(c.saida.depois.decisoes);
    // A partida da classificação de cada transação classificada nesta execução (a do banco fica de fora).
    // Onde o original levava o número da nota pela via do nome, a única diferença aceita é ele a menos.
    const { partidas, mudadas } = partidasSemNumeroPeloNome(c.saida);
    if (mudadas) numeroPeloNome.processar.push(c.id);
    expect(obtido.depois.partidas).toEqual(partidas);
    expect(obtido.depois.notas).toEqual(c.saida.depois.notas);
    expect(obtido.depois.comprovantes).toEqual(c.saida.depois.comprovantes);
  });
});

describe("NEO com notas e comprovantes: candidata, contraparte e sombra (gabarito)", () => {
  const achar = (lista: any[], id: string | null) => (id ? lista.find((x) => x.id === id) : null);

  test.each(casos.filter((c) => ["comprovante", "nota"].includes(c.tipo)).map((c) => [c.id, c.tipo, c] as const))("#%s %s", (_id, tipo, c) => {
    const e = c.entrada;
    const t = transacao(achar(e.transacoes, e.chamada.transacao_id));
    const achado = tipo === "comprovante" ? comprovanteCandidato(t, contexto(e)) : notaCandidata(t, contexto(e));
    expect(achado?.id ?? null).toBe(c.saida.candidato);
  });

  test.each(casos.filter((c) => c.tipo.startsWith("tentar_")).map((c) => [c.id, c.tipo, c] as const))("#%s %s", (_id, tipo, c) => {
    const e = c.entrada;
    const t = transacao(achar(e.transacoes, e.chamada.transacao_id));
    const achado = tipo === "tentar_comprovante" ? comprovanteCandidato(t, contexto(e)) : notaCandidata(t, contexto(e));
    expect(achado !== null).toBe(c.saida.associou);
    if (achado && tipo === "tentar_comprovante") expect(c.saida.depois.comprovantes[achado.id]).toBe(t.id);
    if (achado && tipo === "tentar_nota") expect(c.saida.depois.notas[achado.id]).toEqual({ transacao_id: t.id, status: "associada" });
  });

  test.each(casos.filter((c) => ["resolver", "sombra"].includes(c.tipo)).map((c) => [c.id, c.tipo, c] as const))("#%s %s", (_id, tipo, c) => {
    const e = c.entrada;
    const ctx = contexto(e);
    const t = transacao(achar(e.transacoes, e.chamada.transacao_id));
    const n = achar(e.notas, e.chamada.nota_id);
    const cp = achar(e.comprovantes, e.chamada.comprovante_id);
    const vinculos: Vinculos = { nota: n ? nota(n) : null, comprovante: cp ? comprovante(cp) : null };
    const { achada } = resolverContraparte(ctx, t, vinculos);
    if (tipo === "resolver") {
      // Pelo nome, o número da nota não vem mais (a divergência da D0).
      const esperado = c.saida.contraparte;
      const divergente = esperado?.origem === "nome" && esperado.numero_nf !== null;
      if (divergente) numeroPeloNome.resolver.push(c.id);
      expect(achada ? { contraparte_id: achada.contraparte.id, origem: achada.origem, numero_nf: achada.numeroNf } : null).toEqual(
        divergente ? { ...esperado, numero_nf: null } : esperado,
      );
      return;
    }
    const esperado = c.saida.sombra;
    const sem = esperado?.origem === "nome" ? semNumeroDaNota(esperado.historico_sugerido) : null;
    if (sem !== null) numeroPeloNome.sombra.push(c.id);
    expect(
      achada
        ? {
            contraparte_id: achada.contraparte.id,
            origem: achada.origem,
            conta_contraparte_id: achada.contraparte.contaContabilId,
            conta_divergente: achada.contraparte.contaContabilId !== e.chamada.regra_conta_id,
            historico_sugerido: gerarHistoricoSugerido(t.dc, achada.contraparte.razaoSocial, achada.numeroNf),
          }
        : null,
    ).toEqual(sem === null ? esperado : { ...esperado, historico_sugerido: sem });
  });
});

describe("NEO com notas e comprovantes: divergências deliberadas", () => {
  // Roda depois dos casos (o vitest executa os testes de um arquivo na ordem).
  test("o número da nota pela via do nome: os casos contados um a um", () => {
    expect(numeroPeloNome).toEqual({ processar: [46, 117, 249], resolver: [], sombra: [] });
  });
});
