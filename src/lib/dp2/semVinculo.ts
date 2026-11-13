// A folha do trabalhador sem vínculo de emprego no DP 2 (12/11/2026, fase 3d):
// sócio com pró-labore (723), autônomo por RPA (701) e estagiário (901).
//
// Regras escolhidas (e onde mudar se o escritório discordar):
// - O valor do mês é o do contrato (pró-labore, bolsa ou serviço), proporcional
//   aos dias quando a pessoa entra ou sai no mês. No RPA, o DP também pode
//   lançar o serviço do mês na rubrica "Serviço prestado (RPA)".
// - Contribuinte individual: INSS de 11% sobre o total, limitado ao teto da
//   tabela (Lei 10.666/2003, art. 4º; Lei 8.212/1991, art. 21). Se a pessoa já
//   contribui pelo teto em outro lugar, o DP desconta isso fora do motor.
// - Empresa: 20% sobre o total pago ao contribuinte individual (Lei 8.212/1991,
//   art. 22, III), sem RAT e sem terceiros; zero quando a patronal vai no DAS.
// - Estagiário: a bolsa não tem INSS nem FGTS (Lei 11.788/2008, art. 12); só
//   IRRF. Sem encargos da empresa.
// - Ninguém aqui tem FGTS, férias, 13º ou provisões. O recesso do estagiário,
//   quando pago, entra como rubrica livre.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { calcularIrrf, type ResultadoInss } from "./impostos";
import { reais, pct } from "./formato";
import { INSS_CONTRIBUINTE_INDIVIDUAL, regimeDaCategoria } from "./categorias";
import {
  baseDe,
  calcularMes,
  diasNoMes,
  INSS_EMPRESA_ALIQUOTA,
  itemDaRubrica,
  rubricaDoPapel,
  type CalculoDaPessoa,
  type Encargos,
  type EntradaMensal,
  type ItemDoHolerite,
  type Provisoes,
} from "./mensal";
import type { PapelDaRubrica } from "./rubricas";

const SEM_PROVISOES: Provisoes = {
  base: 0,
  ferias: 0,
  tercoFerias: 0,
  decimo: 0,
  encargosFerias: 0,
  encargosDecimo: 0,
  total: 0,
  memoria: ["Sem férias e 13º: trabalhador sem vínculo de emprego"],
};

/** Os papéis que não valem para quem não é empregado (horas, faltas, vale-transporte…). */
const SO_DO_EMPREGADO: ReadonlySet<PapelDaRubrica> = new Set(["HE50", "HE100", "NOTURNO", "FALTA", "DSR_FALTA", "ATRASO", "VALE_TRANSPORTE"]);

/** A folha do mês pela categoria do contrato: CLT no motor de sempre, os demais aqui. */
export function calcularMesDaCategoria(e: EntradaMensal): CalculoDaPessoa {
  const regime = regimeDaCategoria(e.vinculo.categoria);
  if (regime === "CLT") return calcularMes(e);

  const estagiario = regime === "ESTAGIARIO";
  const papelPrincipal: PapelDaRubrica = estagiario ? "BOLSA_ESTAGIO" : e.vinculo.categoria === "701" ? "SERVICO_AUTONOMO" : "PRO_LABORE";
  const R = (p: PapelDaRubrica) => rubricaDoPapel(e.rubricas, p);
  const itens: ItemDoHolerite[] = [];
  const alertas: string[] = [];

  const dias = diasNoMes(e.ano, e.mes, e.admissao, e.desligamento);
  const valorDoMes = (e.vinculo.salarioBase * dias) / 30;
  if (valorDoMes > 0) {
    itens.push(
      itemDaRubrica(R(papelPrincipal), valorDoMes, `${dias} dias`, dias < 30 ? `${reais(e.vinculo.salarioBase)} × ${dias}/30` : `${reais(e.vinculo.salarioBase)} (mês cheio)`)
    );
  }

  let pensao = 0;
  for (const ev of e.eventos) {
    const r = ev.rubrica;
    if (r.papel && SO_DO_EMPREGADO.has(r.papel)) {
      alertas.push(`${r.nome}: não se aplica a quem não é empregado, ignorado.`);
      continue;
    }
    if (ev.valor === null) {
      alertas.push(`${r.nome}: lançamento sem valor, ignorado.`);
      continue;
    }
    if (r.papel === "PENSAO") pensao += ev.valor;
    itens.push(itemDaRubrica(r, ev.valor, "", r.papel === "PENSAO" ? "Valor informado (deduz da base do IRRF)" : "Valor informado"));
  }

  // ── INSS do contribuinte individual: 11% até o teto ──
  const tabelaInss = e.tabelas.inss.dados;
  const teto = tabelaInss.faixas[tabelaInss.faixas.length - 1].ate;
  const baseInss = estagiario ? 0 : baseDe(itens, "incideInss");
  const baseLimitada = Math.min(baseInss, teto);
  const valorInss = estagiario ? 0 : r2((baseLimitada * INSS_CONTRIBUINTE_INDIVIDUAL) / 100);
  const memoriaInss = estagiario
    ? ["Bolsa de estágio: sem INSS (Lei 11.788/2008, art. 12)"]
    : [`${reais(baseLimitada)}${baseInss > teto ? ` (base ${reais(baseInss)} limitada ao teto)` : ""} × ${pct(INSS_CONTRIBUINTE_INDIVIDUAL)} = ${reais(valorInss)}`];
  const inss: ResultadoInss = { base: baseInss, baseLimitada, teto, valor: valorInss, faixas: [], memoria: memoriaInss };
  if (valorInss > 0) itens.push(itemDaRubrica(R("INSS"), valorInss, pct(INSS_CONTRIBUINTE_INDIVIDUAL), memoriaInss.join("; ")));

  // ── IRRF ──
  const rendimentos = baseDe(itens, "incideIrrf");
  const irrf = calcularIrrf({ rendimentos, inss: valorInss, dependentes: e.vinculo.dependentesIrrf, pensao }, e.tabelas.irrf.dados);
  if (irrf.valor > 0) itens.push(itemDaRubrica(R("IRRF"), irrf.valor, pct(irrf.aliquota), irrf.memoria.join("; ")));
  if (irrf.naoRetido) alertas.push(`IRRF de ${reais(irrf.devido)} não retido (abaixo do mínimo de ${reais(e.tabelas.irrf.dados.minimoRetencao)}).`);

  // ── Totais ──
  let proventos = 0;
  let descontos = 0;
  for (const i of itens) {
    if (i.tipo === "PROVENTO") proventos += i.valor;
    else if (i.tipo === "DESCONTO") descontos += i.valor;
  }
  proventos = r2(proventos);
  descontos = r2(descontos);
  const liquido = r2(proventos - descontos);
  if (liquido < 0) alertas.push("Líquido negativo: os descontos passaram dos proventos.");
  if (dias < 30 && dias > 0) alertas.push(`Mês proporcional: ${dias} dias.`);
  if (e.vinculo.categoria === "701") alertas.push("RPA: o ISS do município, quando houver, não é calculado aqui.");

  // ── Encargos da empresa: 20% sobre o contribuinte individual ──
  const memoria: string[] = [];
  let inssEmpresa = 0;
  if (estagiario) memoria.push("Estagiário: sem encargos da empresa");
  else if (e.empresa.patronalNoDas) memoria.push("Contribuição patronal no DAS (Simples)");
  else {
    inssEmpresa = r2((baseInss * INSS_EMPRESA_ALIQUOTA) / 100);
    memoria.push(`INSS da empresa sobre contribuinte individual: ${reais(baseInss)} × ${pct(INSS_EMPRESA_ALIQUOTA)} = ${reais(inssEmpresa)} (sem RAT e terceiros)`);
  }
  const encargos: Encargos = { base: baseInss, inssEmpresa, rat: 0, terceiros: 0, fgts: 0, total: inssEmpresa, memoria };

  return {
    itens,
    proventos,
    descontos,
    liquido,
    baseInss,
    baseFgts: 0,
    inss,
    irrf,
    fgts: 0,
    encargos,
    provisoes: SEM_PROVISOES,
    diasTrabalhados: dias,
    alertas,
  };
}
