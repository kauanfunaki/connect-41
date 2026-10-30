import { chaveCredito, chaveProduto, decimal, mesesDoPeriodo, parametrosSchema, percentual, somar, unidades, type AjusteFiscal, type ApoioEscriturado, type Classificacao, type DecisaoFiscal, type DocumentoEscriturado, type ParametrosFiscais, type ProdutoFiscal, type Obrigacao } from "./dominio";
import depara from "./depara.json";
import desempate from "./desempate.json";

/** Espelha cfop_depara._prefixo_entrada: o prefixo do emitente tem precedência sobre a UF. */
export function cfopEfetivo(cfop: string | null, ncm: string, sentido: "entrada" | "saida", fonte: "xml" | "txt", decisao: Classificacao | null): string | null {
  if (!cfop) return null;
  if (sentido === "saida") return cfop;
  const prefixo = fonte === "txt" ? cfop[0] : ({ "5": "1", "6": "2", "7": "3" }[cfop[0]] ?? cfop[0]);
  if (decisao?.definicao) return prefixo + decisao.definicao;
  if (fonte === "txt") return cfop;
  const candidatas = Object.entries(depara.definicoes).filter(([, v]) => (v.cfops as string[]).includes(cfop)).map(([d]) => d);
  if (candidatas.length === 1) return prefixo + candidatas[0];
  const regras = Object.entries(desempate.definicao_por_ncm).flatMap(([d, prefixos]) => prefixos.map(p => ({ d, p }))).sort((a, b) => b.p.length - a.p.length);
  const porNcm = regras.find(r => ncm.startsWith(r.p) && candidatas.includes(r.d));
  const padrao = (desempate.definicao_padrao as Record<string, string>)[cfop];
  return porNcm ? prefixo + porNcm.d : padrao && candidatas.includes(padrao) ? prefixo + padrao : null;
}
export function produtosDaBase(documentos: DocumentoEscriturado[], decisoes: DecisaoFiscal[]): ProdutoFiscal[] {
  const decisoesPorChave = new Map(decisoes.filter(d => d.tipo === "classificacao").map(d => [d.chave, d.dados as Classificacao]));
  const creditos = new Map(decisoes.filter(d => d.tipo === "credito_icms").map(d => [d.chave, String(d.dados.valor)]));
  const produtos = new Map<string, ProdutoFiscal>();
  const creditosDoProduto = new Map<string, Map<string, string>>();
  for (const doc of documentos.filter(d => d.sentido === "entrada" && !d.cancelado)) for (const item of doc.itens) {
    const chave = chaveProduto(doc.emitente, item.codigo);
    const classificacao = decisoesPorChave.get(chave) ?? null;
    const credito = creditos.get(chaveCredito(doc.cnpjEmpresa, doc.competencia, chave));
    let p = produtos.get(chave);
    if (!p) {
      p = { chave, fornecedor: doc.emitente, codigo: item.codigo, descricao: item.descricao, ncm: item.ncm, tipoItem: classificacao?.tipoItem ?? item.tipoItem, cfop: cfopEfetivo(item.cfop, item.ncm, "entrada", doc.fonte, classificacao), valor: "0.00", icms: "0.00", decidido: !!classificacao, simples: false, ocorrencias: 0, meses: {}, documentos: [], classificacao, creditoDecidido: null };
      produtos.set(chave, p);
    }
    p.valor = somar([p.valor, item.valor]); p.icms = somar([p.icms, item.icms.valor ?? "0"]); p.ocorrencias++;
    p.simples ||= item.icms.cst.length === 3 && ["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"].includes(item.icms.cst);
    p.meses[doc.competencia] = somar([p.meses[doc.competencia] ?? "0", item.icms.valor ?? "0"]);
    if (!p.documentos.includes(doc.id)) p.documentos.push(doc.id);
    // Um crédito é por produto/mês, não por ocorrência.
    if (credito !== undefined) { const mapa = creditosDoProduto.get(chave) ?? new Map<string, string>(); mapa.set(chaveCredito(doc.cnpjEmpresa, doc.competencia, chave), credito); creditosDoProduto.set(chave, mapa); p.creditoDecidido = somar([...mapa.values()]); }
  }
  return [...produtos.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}
export type LinhaFiscal = { documentoId: string; empresaId: string; competencia: string; numero: string; sentido: string; fornecedor: string; descricao: string; cfop: string | null; cst: string; aliquota: string | null; valor: string; base: string | null; imposto: string | null; tributos: Record<string, string | null>; bases: Record<string, string | null>; csts: Record<string, string>; aliquotas: Record<string, string | null>; isentas: string; outras: string };
export type ResumoTributo = { tributo: string; debitos: string; creditos: string; saldoAnterior: string | null; recolher: string | null; transportar: string | null };
export type ApuracaoLocal = { obrigacao: Obrigacao; linhas: LinhaFiscal[]; tributos: ResumoTributo[]; pendencias: string[]; ajustes: AjusteFiscal[]; totalEntradas: string; totalSaidas: string };
export function apurarBase(documentos: DocumentoEscriturado[], decisoes: DecisaoFiscal[], ajustes: AjusteFiscal[], parametros: ParametrosFiscais, obrigacao: Obrigacao, apoios: ApoioEscriturado[] = []): ApuracaoLocal {
  const tributos = obrigacao === "icms_ipi" ? ["icms", "ipi"] as const : ["pis", "cofins"] as const;
  const linhas: LinhaFiscal[] = [], pendencias = new Set<string>();
  const classificacoes = new Map(decisoes.filter(d => d.tipo === "classificacao").map(d => [d.chave, d.dados as Classificacao]));
  const creditosIcms = new Map(decisoes.filter(d => d.tipo === "credito_icms").map(d => [d.chave, String(d.dados.valor)]));
  const creditosAplicados = new Set<string>();
  const tributacoes = new Map(decisoes.filter(d => d.tipo === "tributacao").map(d => [d.chave, d.dados]));
  const somas = Object.fromEntries(tributos.map(t => [t, { debitos: BigInt(0), creditos: BigInt(0) }]));
  const incompletos = new Set<string>();
  if (!documentos.length && !parametros.semMovimento) pendencias.add("Sem documentos fiscais importados. Confira a cobertura ou confirme o período sem movimento.");
  for (const doc of documentos.filter(d => !d.cancelado)) {
    if (!doc.completo) pendencias.add(`Documento ${doc.numero}: dados fiscais incompletos.`);
    for (const item of doc.itens) {
      const produto = chaveProduto(doc.emitente, item.codigo), decisao = classificacoes.get(produto) ?? null;
      const cfop = cfopEfetivo(item.cfop, item.ncm, doc.sentido, doc.fonte, decisao);
      if (!cfop && doc.tipo !== "NFSE") pendencias.add(`Documento ${doc.numero}, item ${item.codigo}: CFOP a decidir.`);
      for (const tributo of tributos) {
        const tributacao = tributacoes.get(`${doc.cnpjEmpresa}|${doc.competencia}|${doc.id}|${item.ordem}`);
        const decidido = tributacao?.[tributo] as typeof item.icms | undefined;
        const t = decidido ?? item[tributo];
        let valor = t.valor;
        if (doc.sentido === "entrada") {
          if (tributo === "icms") {
            const chave = chaveCredito(doc.cnpjEmpresa, doc.competencia, produto);
            if (creditosIcms.has(chave)) { valor = creditosAplicados.has(chave) ? "0.00" : creditosIcms.get(chave)!; creditosAplicados.add(chave); }
          }
          if (["pis", "cofins"].includes(tributo) && decisao?.creditoPisCofins === "N") valor = "0.00";
          // Nunca concede crédito por simples presença de PIS/COFINS no XML do fornecedor.
          if (["pis", "cofins"].includes(tributo) && doc.fonte === "xml" && decisao?.creditoPisCofins !== "N" && (!decidido || decisao?.creditoPisCofins !== "S")) {
            valor = null; pendencias.add(`Produto ${item.codigo}: confirmar crédito de PIS/COFINS.`);
          }
        }
        if (valor === null) { incompletos.add(tributo); pendencias.add(`Documento ${doc.numero}: ${tributo.toUpperCase()} não levantado.`); }
        else somas[tributo][doc.sentido === "entrada" ? "creditos" : "debitos"] += unidades(valor);
        if (tributo === tributos[0]) {
          const fora = unidades(item.valor) - unidades(t.base ?? "0");
          const isenta = ["40", "41", "50"].includes(t.cst.slice(-2));
          linhas.push({ documentoId: doc.id, empresaId: doc.companyId, competencia: doc.competencia, numero: doc.numero, sentido: doc.sentido, fornecedor: doc.emitente, descricao: item.descricao, cfop, cst: t.cst, aliquota: t.aliquota, valor: item.valor, base: t.base, imposto: valor, tributos: { [tributo]: valor }, bases: { [tributo]: t.base }, csts: { [tributo]: t.cst }, aliquotas: { [tributo]: t.aliquota }, isentas: decimal(isenta && fora > BigInt(0) ? fora : BigInt(0)), outras: decimal(!isenta && fora > BigInt(0) ? fora : BigInt(0)) });
        } else { const l = linhas[linhas.length - 1]; l.tributos[tributo] = valor; l.bases[tributo] = t.base; l.csts[tributo] = t.cst; l.aliquotas[tributo] = t.aliquota; }
      }
    }
  }
  const derivados: AjusteFiscal[] = [];
  if (obrigacao === "contribuicoes") {
    if (parametros.receitaBruta === null) pendencias.add("Informar a receita bruta do período (registro 0111).");
    const grupos = new Map<string, ApoioEscriturado[]>();
    for (const apoio of apoios.filter(a => a.decisao === "aceito" && a.credito === "S" && a.categoria !== "contrato_locacao")) {
      const presumido = apoio.documento.length === 11;
      if (presumido && !["rpa", "recibo_motorista", "contrato_motorista"].includes(apoio.categoria)) { pendencias.add(`Documento ${apoio.identidade}: pessoa física fora das categorias de transporte confirmadas na origem.`); continue; }
      if (!apoio.natureza) { pendencias.add(`Documento ${apoio.identidade}: informe a natureza da base de crédito.`); continue; }
      const chave = `${apoio.companyId}|${apoio.competencia}|${apoio.categoria}|${presumido ? "presumido" : "comum"}`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), apoio]);
    }
    for (const [chave, grupo] of grupos) for (const tributo of ["pis", "cofins"] as const) {
      const presumido = grupo[0].documento.length === 11;
      const aliquota = presumido ? tributo === "pis" ? parametros.aliquotaMotoristaPis : parametros.aliquotaMotoristaCofins : tributo === "pis" ? parametros.aliquotaApoioPis : parametros.aliquotaApoioCofins;
      if (aliquota === null) { pendencias.add(`Informe a alíquota de ${tributo.toUpperCase()} de ${presumido ? "motorista autônomo" : "documentos de apoio"} da competência.`); incompletos.add(tributo); continue; }
      const base = somar(grupo.map(a => a.bruto)), valor = percentual(base, aliquota);
      derivados.push({ id: `apoio:${chave}:${tributo}`, companyId: grupo[0].companyId, competencia: grupo[0].competencia, obrigacao, tributo, codigo: "05", descricao: `Crédito de ${grupo[0].categoria} — derivado dos documentos`, natureza: "credito", valor, camposEstaduais: { origem: "documentos", base_calculo: base, aliquota, documentos: grupo.map(a => a.id).join(",") } });
    }
  }
  const aplicaveis = [...ajustes.filter(a => a.obrigacao === obrigacao), ...derivados];
  for (const a of aplicaveis) {
    const s = somas[a.tributo]; if (!s) continue;
    if (["debito", "estorno_credito", "debito_especial"].includes(a.natureza)) s.debitos += unidades(a.valor);
    else s.creditos += unidades(a.valor);
  }
  const saldos = { icms: parametros.saldoIcms, ipi: parametros.saldoIpi, pis: parametros.saldoPis, cofins: parametros.saldoCofins };
  const resultado = tributos.map(t => {
    const saldo = saldos[t]; if (saldo === null) pendencias.add(`Informar ou conferir o saldo anterior de ${t.toUpperCase()}.`);
    const diferenca = somas[t].debitos - somas[t].creditos - unidades(saldo ?? "0");
    return { tributo: t, debitos: decimal(somas[t].debitos), creditos: decimal(somas[t].creditos), saldoAnterior: saldo, recolher: saldo === null || incompletos.has(t) ? null : decimal(diferenca > BigInt(0) ? diferenca : BigInt(0)), transportar: saldo === null || incompletos.has(t) ? null : decimal(diferenca < BigInt(0) ? -diferenca : BigInt(0)) };
  });
  return { obrigacao, linhas, tributos: resultado, pendencias: [...pendencias], ajustes: aplicaveis, totalEntradas: somar(documentos.filter(d => !d.cancelado && d.sentido === "entrada").map(d => d.valor)), totalSaidas: somar(documentos.filter(d => !d.cancelado && d.sentido === "saida").map(d => d.valor)) };
}
export function quadroPorCfop(linhas: LinhaFiscal[]) {
  const grupos = new Map<string, { cfop: string | null; sentido: string; cst: string; aliquota: string | null; valor: string; base: string | null; imposto: string | null; registros: number }>();
  const somaNullable = (a: string | null, b: string | null) => a === null || b === null ? null : somar([a, b]);
  for (const l of linhas) {
    const chave = [l.sentido, l.cfop, l.cst, l.aliquota].join("|");
    const g = grupos.get(chave);
    if (!g) grupos.set(chave, { cfop: l.cfop, sentido: l.sentido, cst: l.cst, aliquota: l.aliquota, valor: l.valor, base: l.base, imposto: l.imposto, registros: 1 });
    else { g.valor = somar([g.valor, l.valor]); g.base = somaNullable(g.base, l.base); g.imposto = somaNullable(g.imposto, l.imposto); g.registros++; }
  }
  return [...grupos.values()].sort((a, b) => String(a.cfop).localeCompare(String(b.cfop)));
}
/** Apura cada competência antes de consolidar: saldos nunca são somados como movimento. */
export function apurarPeriodos(documentos: DocumentoEscriturado[], decisoes: DecisaoFiscal[], ajustes: AjusteFiscal[], periodos: { companyId: string; competencia: string; dados: ParametrosFiscais }[], obrigacao: Obrigacao, apoios: ApoioEscriturado[], periodo: string, empresas: string[], matrizId: string, consolidado: boolean): ApuracaoLocal {
  const meses = mesesDoPeriodo(periodo), sujeitos = consolidado && obrigacao === "contribuicoes" ? [matrizId] : empresas;
  const resultados: ApuracaoLocal[] = [], primeiros: ResumoTributo[][] = [], ultimos: ResumoTributo[][] = [];
  for (const empresa of sujeitos) {
    let anterior: ResumoTributo[] | null = null;
    for (const [indice, mes] of meses.entries()) {
      const p = { ...(periodos.find(p => p.companyId === empresa && p.competencia === mes)?.dados ?? parametrosSchema.parse({})) };
      if (anterior) for (const t of anterior) {
        const campo = ({ icms: "saldoIcms", ipi: "saldoIpi", pis: "saldoPis", cofins: "saldoCofins" } as const)[t.tributo as "icms" | "ipi" | "pis" | "cofins"];
        if (p[campo] === null && t.transportar !== null) p[campo] = t.transportar;
      }
      const pertence = (id: string) => consolidado && obrigacao === "contribuicoes" || id === empresa;
      const r = apurarBase(documentos.filter(d => pertence(d.companyId) && d.competencia === mes), decisoes, ajustes.filter(a => pertence(a.companyId) && a.competencia === mes), p, obrigacao, apoios.filter(a => pertence(a.companyId) && a.competencia === mes));
      r.pendencias = r.pendencias.map(p => `${mes}: ${p}`);
      if (anterior) for (const t of r.tributos) {
        const ant = anterior.find(a => a.tributo === t.tributo);
        if (ant?.transportar !== null && ant?.transportar !== undefined && t.saldoAnterior !== null && unidades(ant.transportar) !== unidades(t.saldoAnterior)) r.pendencias.push(`${mes}: saldo anterior de ${t.tributo.toUpperCase()} diverge da competência anterior.`);
      }
      if (indice === 0) primeiros.push(r.tributos);
      if (indice === meses.length - 1) ultimos.push(r.tributos);
      anterior = r.tributos; resultados.push(r);
    }
  }
  const somarNullable = (valores: (string | null)[]) => valores.some(v => v === null) ? null : somar(valores as string[]);
  const tributos = resultados[0]?.tributos.map(t => ({ tributo: t.tributo,
    debitos: somar(resultados.flatMap(r => r.tributos.filter(j => j.tributo === t.tributo).map(j => j.debitos))),
    creditos: somar(resultados.flatMap(r => r.tributos.filter(j => j.tributo === t.tributo).map(j => j.creditos))),
    saldoAnterior: somarNullable(primeiros.flatMap(r => r.filter(j => j.tributo === t.tributo).map(j => j.saldoAnterior))),
    recolher: somarNullable(resultados.flatMap(r => r.tributos.filter(j => j.tributo === t.tributo).map(j => j.recolher))),
    transportar: somarNullable(ultimos.flatMap(r => r.filter(j => j.tributo === t.tributo).map(j => j.transportar))),
  })) ?? [];
  return { obrigacao, tributos, linhas: resultados.flatMap(r => r.linhas), pendencias: [...new Set(resultados.flatMap(r => r.pendencias))], ajustes: resultados.flatMap(r => r.ajustes), totalEntradas: somar(resultados.map(r => r.totalEntradas)), totalSaidas: somar(resultados.map(r => r.totalSaidas)) };
}
export function conferirApoios(apoios: ApoioEscriturado[]) {
  const grupos = new Map<string, ApoioEscriturado[]>();
  for (const a of apoios.filter(a => a.categoria !== "contrato_locacao" && a.decisao !== "rejeitado")) {
    const chave = [a.companyId, a.documento, a.categoria, a.competencia, a.dataPagamento, a.bruto].join("|");
    grupos.set(chave, [...(grupos.get(chave) ?? []), a]);
  }
  return { pendentes: apoios.filter(a => a.decisao === "pendente"), duplicatas: [...grupos.values()].filter(g => g.length > 1), contratos: apoios.filter(a => a.categoria === "contrato_locacao_imovel" && !a.contratoInformado), bruto: somar(apoios.filter(a => a.categoria !== "contrato_locacao" && a.decisao !== "rejeitado").map(a => a.bruto)) };
}

