// eSocial do DP 2 (12/11/2026, fase 3a) — o que lê e grava no banco. Os
// eventos e as pendências moram em `eventos.ts`; aqui se junta o cadastro,
// gera e guarda na fila. Gerar de novo troca o evento ainda não enviado do
// mesmo assunto (mesmo tipo, empresa e referência).

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { garantirRubricas, mediaDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "@/lib/dp2/servidor";
import { adesaoNoMes, faixasGravadas, planosParaS1210, valorDoBeneficiario } from "@/lib/dp2/planoDeSaude";
import { competenciaDe, tabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { calcularRescisaoDoDp2 } from "@/lib/dp2/rescisao";
import { dataProjetada, diasDeAvisoPrevio } from "@/lib/rescisao/avos";
import type { MotivoCanonico } from "@/lib/rescisao/motivos";
import { lerDadosEsocial } from "./cadastro";
import { eventoS2300, eventoS2306, eventoS2399 } from "./semVinculo";
import { semVinculo } from "@/lib/dp2/categorias";
import { expostoANocivo } from "@/lib/dp2/licencaPremio";
import { eventoS2210, eventoS2220, eventoS2240, lerResponsaveis, SEM_AGENTE_NOCIVO, type Aso, type Cat, type CondicaoAmbiental, type ResponsaveisDeSst } from "./sst";
import {
  eventoS2200,
  eventoS2206,
  eventoS2230,
  eventoS2298,
  eventoS2299,
  eventoS2299Transferencia,
  PAPEL_DA_VERBA,
  type Afastamento,
  type Reintegracao,
  type SindicatoDoVinculo,
  type TrabalhadorCompleto,
} from "./naoPeriodicos";
import type { ItemDoHolerite } from "@/lib/dp2/mensal";
import {
  classificacaoTributaria,
  eventoS1000,
  eventoS1005,
  eventoS1010,
  eventoS1020,
  eventoS1200,
  eventoS1210,
  eventoS1298,
  eventoS1299,
  eventoS3000,
  geradorDeId,
  podeExcluirPeloS3000,
  reciboValido,
  type EmpregadorEsocial,
  type EventoGerado,
  type PeriodosAnteriores,
  type RubricaEsocial,
  type TrabalhadorEsocial,
} from "./eventos";

const n = (v: unknown) => Number(v ?? 0);

export const SITUACOES_ABERTAS = ["PENDENCIA", "PRONTO"] as const;

export async function empregadorDaEmpresa(tenantId: string, companyId: string, iniValid: string): Promise<EmpregadorEsocial | null> {
  const c = await getPrisma().company.findFirst({
    where: { id: companyId, tenantId },
    select: { name: true, displayName: true, cnpj: true, taxRegimeKind: true, cnaePrincipal: true, dp2Config: true },
  });
  if (!c) return null;
  const cfg = c.dp2Config;
  return {
    cnpj: c.cnpj ?? "",
    nome: nomeExibicao(c),
    classTrib: classificacaoTributaria(c.taxRegimeKind, cfg?.patronalNoDas ?? false, cfg?.classTrib ?? null),
    cnae: c.cnaePrincipal,
    ratAliquota: n(cfg?.ratAliquota ?? 2),
    fap: n(cfg?.fap ?? 1),
    fpas: cfg?.fpas ?? null,
    codTercs: cfg?.codTercs ?? null,
    iniValid,
  };
}

async function guardar(tenantId: string, companyId: string, competenciaId: string | null, userId: string, eventos: EventoGerado[]) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    for (const ev of eventos) {
      await tx.dp2EventoEsocial.deleteMany({
        where: { tenantId, companyId, tipo: ev.tipo, referencia: ev.referencia, situacao: { in: [...SITUACOES_ABERTAS] } },
      });
      await tx.dp2EventoEsocial.create({
        data: {
          tenantId,
          companyId,
          competenciaId,
          personId: ev.personId,
          tipo: ev.tipo,
          referencia: ev.referencia,
          idEvento: ev.idEvento,
          situacao: ev.pendencias.some((p) => p.bloqueia) ? "PENDENCIA" : "PRONTO",
          xml: ev.xml,
          pendencias: ev.pendencias as unknown as Prisma.InputJsonValue,
          alvoId: ev.alvoId ?? null,
          geradoPorId: userId,
        },
      });
    }
  });
  const prontos = eventos.filter((e) => !e.pendencias.some((p) => p.bloqueia)).length;
  return { total: eventos.length, prontos, comPendencia: eventos.length - prontos };
}

/** Os eventos de tabela da empresa: empregador, estabelecimento, lotação e as rubricas ativas. */
export async function gerarTabelas(tenantId: string, companyId: string, iniValid: string, userId: string) {
  const empregador = await empregadorDaEmpresa(tenantId, companyId, iniValid);
  if (!empregador) return { ok: false as const, erro: "Empresa não encontrada." };
  await garantirRubricas(tenantId);
  const rubricas = await getPrisma().dp2Rubrica.findMany({ where: { tenantId, ativa: true }, orderBy: { codigo: "asc" } });
  const novoId = geradorDeId(empregador.cnpj || "0", new Date());
  const eventos: EventoGerado[] = [eventoS1000(empregador, novoId), eventoS1005(empregador, novoId), eventoS1020(empregador, novoId)];
  for (const r of rubricas) eventos.push(eventoS1010(empregador, rubricaEsocial(r), novoId));
  return { ok: true as const, ...(await guardar(tenantId, companyId, null, userId, eventos)) };
}

export function rubricaEsocial(r: {
  codigo: string;
  nome: string;
  tipo: string;
  papel: string | null;
  incideInss: boolean;
  incideFgts: boolean;
  incideIrrf: boolean;
  naturezaEsocial: string | null;
  codIncCP: string | null;
  codIncIRRF: string | null;
  codIncFGTS: string | null;
}): RubricaEsocial {
  return {
    codigo: r.codigo,
    nome: r.nome,
    tipo: r.tipo === "DESCONTO" ? "DESCONTO" : r.tipo === "INFORMATIVA" ? "INFORMATIVA" : "PROVENTO",
    papel: r.papel,
    incideInss: r.incideInss,
    incideFgts: r.incideFgts,
    incideIrrf: r.incideIrrf,
    naturezaEsocial: r.naturezaEsocial,
    codIncCP: r.codIncCP,
    codIncIRRF: r.codIncIRRF,
    codIncFGTS: r.codIncFGTS,
  };
}

/**
 * Os periódicos da competência fechada: S-1200 e S-1210 de cada pessoa e o
 * S-1299. Na 2ª parcela do 13º, a apuração é anual (perApur "AAAA"): o S-1200
 * leva o 13º do ano, o adiantamento e os descontos; o S-1210 é o pagamento de
 * dezembro.
 */
export async function gerarPeriodicos(tenantId: string, competenciaId: string, dtPgto: string | null, userId: string) {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false as const, erro: "Competência não encontrada." };
  if (comp.situacao !== "FECHADA") return { ok: false as const, erro: "Feche a competência antes de gerar os eventos do eSocial." };
  if (comp.tipo === "DECIMO_1") {
    return { ok: false as const, erro: "A 1ª parcela do 13º entra no S-1200 anual: gere os eventos na competência da 2ª parcela, depois de fechá-la." };
  }
  if (comp.tipo !== "MENSAL" && comp.tipo !== "DECIMO_2") return { ok: false as const, erro: "Este tipo de competência não gera periódicos do eSocial." };
  const anual = comp.tipo === "DECIMO_2";
  // No 13º, a apuração é do ano; o pagamento (S-1210), do mês em que se pagou.
  const mesDoPagamento = competenciaDe(comp.ano, comp.mes);
  const perApur = anual ? String(comp.ano) : mesDoPagamento;
  const empregador = await empregadorDaEmpresa(tenantId, comp.companyId, perApur);
  if (!empregador) return { ok: false as const, erro: "Empresa não encontrada." };
  // Período já fechado no eSocial: retificar pede o S-1298 antes (funcionalidade-754).
  if (await fechamentoAceito(tenantId, comp.companyId, perApur)) {
    return { ok: false as const, erro: `O período ${perApur} está fechado no eSocial (S-1299 aceito): reabra a competência com o S-1298 antes de gerar de novo.` };
  }

  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId },
    include: { person: { select: { id: true, name: true, cpf: true, birthDate: true, dp2Vinculo: { select: { matricula: true, categoria: true, aprendiz: true, previdenciaCnpj: true, grauExposicao: true } } } } },
  });
  // Plano de saúde e previdência complementar (funcionalidade-762): o infoIRComplem do S-1210.
  const adesoesAoPlano = anual
    ? []
    : (await prisma.dp2AdesaoAoPlano.findMany({ where: { tenantId, personId: { in: calculos.map((c) => c.person.id) } }, include: { plano: true, person: { select: { birthDate: true } } } })).filter((a) =>
        adesaoNoMes({ inicio: a.inicio.toISOString().slice(0, 10), fim: a.fim ? a.fim.toISOString().slice(0, 10) : null }, comp.ano, comp.mes)
      );
  const idsDosDependentes = adesoesAoPlano.flatMap((a) => (Array.isArray(a.dependentes) ? (a.dependentes as string[]) : []));
  const dependentesDoPlano = new Map(
    (idsDosDependentes.length ? await prisma.dependente.findMany({ where: { tenantId, id: { in: idsDosDependentes } }, select: { id: true, name: true, cpf: true, birthDate: true } }) : []).map((d) => [d.id, d])
  );
  // Os S-1200/S-1210 já aceitos do período: o novo sai como retificação, com o recibo (funcionalidade-754).
  const aceitos = await prisma.dp2EventoEsocial.findMany({
    where: { tenantId, companyId: comp.companyId, tipo: { in: ["S-1200", "S-1210"] }, situacao: "ACEITO", personId: { in: calculos.map((c) => c.person.id) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, tipo: true, referencia: true, personId: true, recibo: true },
  });
  const aceitoDe = (tipo: string, personId: string, periodo: string) => aceitos.find((a) => a.tipo === tipo && a.personId === personId && a.referencia.startsWith(`${periodo} · `) && a.recibo);
  // Outras bases de INSS (funcionalidade-769): vão no infoMV do S-1200, com o indMV do cálculo.
  const outrasBases = await prisma.dp2OutraBaseInss.findMany({ where: { tenantId, competenciaId }, orderBy: { createdAt: "asc" } });
  // Diferenças de meses anteriores (funcionalidade-760): vão no infoPerAnt, não no mês.
  const diferencas = anual ? [] : await prisma.dp2DiferencaRetroativa.findMany({ where: { tenantId, competenciaId, origem: { in: ["SALARIO", "RUBRICA"] } }, orderBy: { perRef: "asc" } });
  const novoId = geradorDeId(empregador.cnpj || "0", new Date());
  const eventos: EventoGerado[] = [];
  for (const c of calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"))) {
    const v = c.person.dp2Vinculo;
    const doCalculo = (c.itens as unknown as ItemDoHolerite[]) ?? [];
    const codigoDiferenca = doCalculo.find((i) => i.papel === "DIFERENCA_RETROATIVA")?.codigo ?? null;
    const codigoInssDiferenca = doCalculo.find((i) => i.papel === "INSS_DIFERENCA")?.codigo ?? null;
    const daPessoa = diferencas.filter((d) => d.personId === c.person.id);
    const perAnt: PeriodosAnteriores[] = [];
    if (codigoDiferenca && daPessoa.length) {
      for (const d of daPessoa) {
        const dataInstrumento = d.dataInstrumento ? isoDoDia(d.dataInstrumento) : null;
        let a = perAnt.find((x) => x.instrumento === (d.instrumento ?? "J") && x.dataInstrumento === dataInstrumento && x.descricao === d.descricao);
        if (!a) {
          a = { instrumento: d.instrumento ?? "J", dataInstrumento, descricao: d.descricao, periodos: [] };
          perAnt.push(a);
        }
        let p = a.periodos.find((x) => x.perRef === d.perRef);
        if (!p) {
          p = { perRef: d.perRef, itens: [] };
          a.periodos.push(p);
        }
        p.itens.push({ codigo: codigoDiferenca, tipo: "PROVENTO", referencia: "", valor: n(d.valor), quantidade: null });
        if (codigoInssDiferenca && n(d.inss) > 0) p.itens.push({ codigo: codigoInssDiferenca, tipo: "DESCONTO", referencia: "", valor: n(d.inss), quantidade: null });
      }
    }
    const itens = doCalculo.filter((i) => !(perAnt.length && (i.papel === "DIFERENCA_RETROATIVA" || i.papel === "INSS_DIFERENCA"))).map((i) => ({
      codigo: i.codigo,
      tipo: i.tipo,
      referencia: i.referencia,
      valor: i.valor,
      quantidade: /^\d+([.,]\d+)?\s*(h|dias?)$/.test(i.referencia) ? Number(i.referencia.replace(/[^\d,.]/g, "").replace(",", ".")) : null,
    }));
    const t = {
      personId: c.person.id,
      nome: c.person.name,
      cpf: c.person.cpf,
      matricula: v?.matricula ?? null,
      categoria: v?.categoria || (v?.aprendiz ? "103" : "101"),
      itens,
      liquido: n(c.liquido),
      nascimento: isoDoDia(c.person.birthDate),
      infoMV: infoMVDoCalculo(c.memoria, outrasBases.filter((o) => o.personId === c.person.id)),
      perAnt,
      irComplementar: anual
        ? null
        : (() => {
            const previdenciaPaga = doCalculo.filter((i) => i.papel === "PREVIDENCIA_COMPLEMENTAR").reduce((s, i) => s + i.valor, 0);
            const coparticipacao = doCalculo.filter((i) => i.papel === "COPARTICIPACAO_PLANO").reduce((s, i) => s + i.valor, 0);
            const { planos, semCpf } = planosParaS1210(
              adesoesAoPlano
                .filter((a) => a.personId === c.person.id)
                .map((a) => {
                  const valores = { valorTitular: n(a.plano.valorTitular), valorDependente: n(a.plano.valorDependente), faixas: faixasGravadas(a.plano.faixas) };
                  return {
                    plano: { tipo: a.plano.tipo === "ODONTO" ? ("ODONTO" as const) : ("SAUDE" as const), cnpjOperadora: a.plano.cnpjOperadora, registroAns: a.plano.registroAns },
                    titular: valorDoBeneficiario(valores, true, isoDoDia(a.person.birthDate), comp.ano, comp.mes).valor,
                    dependentes: (Array.isArray(a.dependentes) ? (a.dependentes as string[]) : [])
                      .map((id) => dependentesDoPlano.get(id))
                      .filter((d): d is NonNullable<typeof d> => !!d)
                      .map((d) => ({ cpf: d.cpf, nome: d.name, valor: valorDoBeneficiario(valores, false, isoDoDia(d.birthDate), comp.ano, comp.mes).valor })),
                  };
                }),
              coparticipacao
            );
            return { previdencia: previdenciaPaga > 0 ? { cnpj: v?.previdenciaCnpj ?? null, valor: Math.round(previdenciaPaga * 100) / 100 } : null, planos, semCpf };
          })(),
      grauExp: v?.grauExposicao ?? null,
    };
    const r1200 = aceitoDe("S-1200", c.person.id, perApur);
    const r1210 = aceitoDe("S-1210", c.person.id, perApur);
    eventos.push({ ...eventoS1200(empregador, perApur, t, novoId, r1200?.recibo ?? null), alvoId: r1200?.id ?? null });
    eventos.push({ ...eventoS1210(empregador, mesDoPagamento, dtPgto, t, novoId, perApur, r1210?.recibo ?? null), alvoId: r1210?.id ?? null });
  }
  eventos.push(eventoS1299(empregador, perApur, calculos.length > 0, novoId));
  return { ok: true as const, ...(await guardar(tenantId, comp.companyId, competenciaId, userId, eventos)) };
}

// ─── Não periódicos (fase 3b, 12/11/2026) ───────────────────────────────────

const TIPO_DO_DEPENDENTE: Record<string, string> = { CONJUGE: "01", COMPANHEIRO: "02", FILHO: "03", ENTEADO: "03", PAIS: "09", OUTRO: "99" };
const isoDoDia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** A pessoa com o contrato do DP 2, os dependentes e o cargo, no formato dos eventos do vínculo. */
export async function trabalhadorCompleto(tenantId: string, personId: string): Promise<{ companyId: string; t: TrabalhadorCompleto } | null> {
  const p = await getPrisma().person.findFirst({
    where: { id: personId, tenantId, isInternal: false },
    include: { dp2Vinculo: true, cargo: { select: { name: true } }, dependentes: { orderBy: { birthDate: "asc" } } },
  });
  if (!p?.currentCompanyId || !p.dp2Vinculo) return null;
  const v = p.dp2Vinculo;
  return {
    companyId: p.currentCompanyId,
    t: {
      personId: p.id,
      nome: p.name,
      cpf: p.cpf,
      nascimento: isoDoDia(p.birthDate),
      endereco: { logradouro: p.addressStreet, numero: p.addressNumber, complemento: p.addressComplement, bairro: p.neighborhood, cep: p.zipCode, uf: p.stateCode },
      dados: lerDadosEsocial(v.dadosEsocial),
      matricula: v.matricula,
      categoria: v.categoria || (v.aprendiz ? "103" : "101"),
      admissao: isoDoDia(p.admissionDate),
      salario: n(v.salarioBase),
      tipoSalario: v.tipoSalario === "HORISTA" ? "HORISTA" : "MENSAL",
      horasMensais: v.horasMensais,
      nomeDoCargo: p.cargo?.name ?? null,
      aprendiz: v.aprendiz,
      dependentes: p.dependentes.map((d) => ({
        nome: d.name,
        cpf: d.cpf,
        nascimento: isoDoDia(d.birthDate),
        tipo: TIPO_DO_DEPENDENTE[d.relationship] ?? "99",
        irrf: d.isIRDependent,
        salarioFamilia: d.isSalarioFamilia,
      })),
    },
  };
}

async function sindicatoDaEmpresa(tenantId: string, companyId: string): Promise<SindicatoDoVinculo> {
  const cfg = await getPrisma().dp2EmpresaConfig.findFirst({
    where: { tenantId, companyId },
    include: { convencao: { select: { cnpjSindicato: true, dataBase: true } } },
  });
  return { cnpj: cfg?.convencao?.cnpjSindicato ?? null, mesDataBase: cfg?.convencao?.dataBase ?? null };
}

type Resultado = { ok: true; total: number; prontos: number; comPendencia: number; evento?: string } | { ok: false; erro: string };

const SEM_VINCULO_NAO = "Sócio, autônomo e estagiário não têm esse evento: o início é o S-2300 e o término, o S-2399.";

async function doVinculo(tenantId: string, personId: string, iniValid: string) {
  const r = await trabalhadorCompleto(tenantId, personId);
  if (!r) return null;
  const empregador = await empregadorDaEmpresa(tenantId, r.companyId, iniValid);
  if (!empregador) return null;
  return { ...r, empregador, novoId: geradorDeId(empregador.cnpj || "0", new Date()) };
}

const SEM_CONTRATO = "Colaborador sem contrato no DP 2 (crie em DP 2 › Colaboradores).";

export async function gerarAdmissao(tenantId: string, personId: string, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, new Date().toISOString().slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  // Sócio, autônomo e estagiário: o início é o S-2300.
  if (semVinculo(v.t.categoria)) return { ok: true, evento: "S-2300", ...(await guardar(tenantId, v.companyId, null, userId, [eventoS2300(v.empregador, v.t, v.novoId)])) };
  const ev = eventoS2200(v.empregador, v.t, await sindicatoDaEmpresa(tenantId, v.companyId), v.novoId);
  return { ok: true, evento: "S-2200", ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export async function gerarAlteracao(tenantId: string, personId: string, data: string, descricao: string | null, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, data.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  // Sócio, autônomo e estagiário: a alteração é o S-2306 (funcionalidade-756).
  if (semVinculo(v.t.categoria)) return { ok: true, evento: "S-2306", ...(await guardar(tenantId, v.companyId, null, userId, [eventoS2306(v.empregador, v.t, data, v.novoId)])) };
  const ev = eventoS2206(v.empregador, v.t, await sindicatoDaEmpresa(tenantId, v.companyId), { data, descricao }, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export async function gerarAfastamento(tenantId: string, personId: string, a: Afastamento, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, a.inicio.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  const ev = eventoS2230(v.empregador, v.t, a, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

/** O S-2298 de quem foi desligado e volta (funcionalidade-756). */
export async function gerarReintegracao(tenantId: string, personId: string, r: Omit<Reintegracao, "desligamento">, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, r.retorno.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  if (semVinculo(v.t.categoria)) return { ok: false, erro: "A reintegração (S-2298) é de empregado; sócio, autônomo e estagiário voltam com um novo S-2300." };
  const p = await getPrisma().person.findFirst({ where: { id: personId, tenantId }, select: { dismissalDate: true } });
  const desligamento = p?.dismissalDate ? p.dismissalDate.toISOString().slice(0, 10) : null;
  if (!desligamento) return { ok: false, erro: "A pessoa não tem desligamento no cadastro: a reintegração é de quem foi desligado." };
  const ev = eventoS2298(v.empregador, v.t, { ...r, desligamento }, v.novoId);
  return { ok: true, evento: "S-2298", ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

// ─── Saúde e segurança (fase 3c) ────────────────────────────────────────────

export async function responsaveisDeSst(tenantId: string, companyId: string): Promise<ResponsaveisDeSst> {
  const cfg = await getPrisma().dp2EmpresaConfig.findFirst({ where: { tenantId, companyId }, select: { sst: true } });
  return lerResponsaveis(cfg?.sst);
}

export async function gerarAso(tenantId: string, personId: string, aso: Aso, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, (aso.data ?? new Date().toISOString()).slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  const ev = eventoS2220(v.empregador, v.t, aso, await responsaveisDeSst(tenantId, v.companyId), v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export async function gerarCondicaoAmbiental(tenantId: string, personId: string, c: CondicaoAmbiental, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, (c.inicio ?? new Date().toISOString()).slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  const ev = eventoS2240(v.empregador, v.t, c, await responsaveisDeSst(tenantId, v.companyId), v.novoId);
  // Aposentadoria especial (funcionalidade-763): o grau de exposição do contrato tem de combinar com o S-2240.
  const vinculo = await getPrisma().dp2Vinculo.findFirst({ where: { tenantId, personId }, select: { grauExposicao: true } });
  const comAgente = c.agentes.some((a) => a !== SEM_AGENTE_NOCIVO);
  const exposto = expostoANocivo(vinculo?.grauExposicao);
  if (comAgente && !exposto) {
    ev.pendencias.push({ onde: "colaborador", texto: `${v.t.nome}: o S-2240 tem agente nocivo e o contrato não tem grau de exposição. Se o LTCAT concluir que dá aposentadoria especial, marque o grau no contrato: ele gera o adicional do GILRAT e o grauExp do S-1200.`, link: null, bloqueia: false });
  }
  if (!comAgente && exposto) {
    ev.pendencias.push({ onde: "colaborador", texto: `${v.t.nome}: o contrato tem grau de exposição para a aposentadoria especial e o S-2240 não tem agente nocivo. Confira com o LTCAT.`, link: null, bloqueia: false });
  }
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export async function gerarCat(tenantId: string, personId: string, c: Cat, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, (c.dataAcidente ?? new Date().toISOString()).slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  const ev = eventoS2210(v.empregador, v.t, c, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

/** O término do sócio, do autônomo ou do estagiário (S-2399). */
export async function gerarTerminoSemVinculo(tenantId: string, personId: string, termino: string, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, termino.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  if (!semVinculo(v.t.categoria)) return { ok: false, erro: "Empregado: o desligamento (S-2299) sai da tela de Rescisões." };
  const ev = eventoS2399(v.empregador, v.t, termino, v.novoId);
  return { ok: true, evento: "S-2399", ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export type PedidoDeDesligamento = {
  motivo: MotivoCanonico;
  data: string;
  aviso: "INDENIZADO" | "TRABALHADO" | "DISPENSADO";
  vencidos: number;
  faltas: number;
  saldoFgts: number | null;
  adiantado: number;
};

/**
 * O S-2299 com as verbas do cálculo de rescisão do DP 2 (o mesmo da tela de
 * Rescisões), cada verba na rubrica de rescisão do escritório.
 */
export async function gerarDesligamento(tenantId: string, personId: string, d: PedidoDeDesligamento, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, d.data.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  if (semVinculo(v.t.categoria)) return { ok: false, erro: SEM_VINCULO_NAO };
  if (!v.t.admissao) return { ok: false, erro: "Sem data de admissão no cadastro da pessoa." };
  const prisma = getPrisma();
  const competencia = d.data.slice(0, 7);
  const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(tenantId));
  if (!tab.ok) return { ok: false, erro: `Faltam tabelas para ${competencia}: ${tab.faltam.join(", ")}.` };
  const [pessoa, media] = await Promise.all([
    prisma.person.findFirst({ where: { id: personId, tenantId }, select: { dp2Vinculo: true } }),
    mediaDaPessoa(tenantId, personId, competencia, "RESCISAO"),
  ]);
  await garantirRubricas(tenantId);
  const rubricas = await prisma.dp2Rubrica.findMany({ where: { tenantId }, select: { codigo: true, papel: true } });
  const codigoDoPapel = new Map(rubricas.filter((r) => r.papel).map((r) => [r.papel as string, r.codigo]));
  const admissao = new Date(`${v.t.admissao}T00:00:00.000Z`);
  const desligamento = new Date(`${d.data}T00:00:00.000Z`);
  const calc = calcularRescisaoDoDp2({
    motivo: d.motivo,
    admissao,
    desligamento,
    avisoIndenizado: d.aviso === "INDENIZADO",
    avisoDispensado: d.aviso === "DISPENSADO",
    vinculo: vinculoDoMotor(pessoa!.dp2Vinculo!),
    mediaVariaveis: media.media,
    periodosVencidos: d.vencidos,
    faltas: d.faltas,
    saldoFgts: d.saldoFgts,
    decimoAdiantado: d.adiantado,
    tabelas: tab.tabelas,
  });
  const verbas = calc.linhas
    .filter((l) => l.valor > 0 && l.chave !== "fgts_multa")
    .map((l) => {
      const papel = l.chave === "aviso_previo" && l.tipo === "DESCONTO" ? "AVISO_DESCONTO" : PAPEL_DA_VERBA[l.chave];
      return { codigo: (papel && codigoDoPapel.get(papel)) || "", valor: l.valor };
    })
    .filter((x) => x.codigo);
  const indenizado = d.aviso === "INDENIZADO";
  const fimProjetado = indenizado ? dataProjetada(desligamento, diasDeAvisoPrevio(admissao, desligamento)).toISOString().slice(0, 10) : null;
  const ev = eventoS2299(v.empregador, v.t, { motivo: d.motivo, data: d.data, avisoIndenizado: indenizado, fimProjetado, verbas }, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

// ─── Transferência entre empresas do grupo (26/11/2026, funcionalidade-771) ─

/**
 * Os eventos da transferência: o S-2299 com o motivo 11 na empresa de origem
 * (último dia = véspera da transferência) e o S-2200 com a sucessão do vínculo
 * na de destino. Cada um vai para a fila da sua empresa.
 */
export async function gerarEventosDaTransferencia(tenantId: string, transferenciaId: string, lado: "ORIGEM" | "DESTINO", userId: string): Promise<Resultado> {
  const prisma = getPrisma();
  const tr = await prisma.dp2Transferencia.findFirst({ where: { id: transferenciaId, tenantId } });
  if (!tr) return { ok: false, erro: "Transferência não encontrada." };
  const r = await trabalhadorCompleto(tenantId, tr.personId);
  if (!r) return { ok: false, erro: SEM_CONTRATO };
  if (semVinculo(r.t.categoria)) return { ok: false, erro: "Sócio, autônomo e estagiário não têm S-2299/S-2200: a troca de empresa é o S-2399 e o S-2300." };
  const data = tr.data.toISOString().slice(0, 10);
  const ultimoDia = new Date(tr.data.getTime() - 86400000).toISOString().slice(0, 10);
  const [origem, destino] = await Promise.all([empregadorDaEmpresa(tenantId, tr.deCompanyId, ultimoDia.slice(0, 7)), empregadorDaEmpresa(tenantId, tr.companyId, data.slice(0, 7))]);
  if (!origem || !destino) return { ok: false, erro: "Empresa da transferência não encontrada." };
  const matriculaAnterior = tr.matriculaAnterior ?? r.t.matricula;
  const novoId = geradorDeId((lado === "ORIGEM" ? origem.cnpj : destino.cnpj) || "0", new Date());
  if (lado === "ORIGEM") {
    const ev = eventoS2299Transferencia(origem, { ...r.t, matricula: matriculaAnterior }, { ultimoDia, cnpjSucessora: destino.cnpj, observacao: tr.motivo }, novoId);
    return { ok: true, evento: "S-2299", ...(await guardar(tenantId, tr.deCompanyId, null, userId, [ev])) };
  }
  const ev = eventoS2200(destino, r.t, await sindicatoDaEmpresa(tenantId, tr.companyId), novoId, { cnpjAnterior: origem.cnpj, matriculaAnterior, data, observacao: tr.motivo });
  return { ok: true, evento: "S-2200", ...(await guardar(tenantId, tr.companyId, null, userId, [ev])) };
}

// ─── Recibo, exclusão e reabertura (25/11/2026, funcionalidade-754) ────────

/** O que acontece com o alvo quando o evento que aponta para ele é aceito. */
const SITUACAO_DO_ALVO: Record<string, string> = { "S-3000": "EXCLUIDO", "S-1298": "REABERTO", "S-1200": "RETIFICADO", "S-1210": "RETIFICADO" };


/**
 * Registra o recibo de um evento enviado por fora do Connect (o envio pelo
 * Assinador ainda não está ligado, funcionalidade-668): o evento fica ACEITO e
 * passa a poder ser retificado ou excluído. Se ele retifica, exclui ou reabre
 * outro, o alvo muda de situação.
 */
export async function registrarRecibo(tenantId: string, eventoId: string, recibo: string): Promise<{ ok: true; tipo: string; alvo: string | null } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const ev = await prisma.dp2EventoEsocial.findFirst({ where: { id: eventoId, tenantId }, select: { id: true, tipo: true, situacao: true, alvoId: true } });
  if (!ev) return { ok: false, erro: "Evento não encontrado." };
  if (!["PRONTO", "ENVIADO"].includes(ev.situacao)) return { ok: false, erro: "Só evento pronto ou enviado recebe o recibo." };
  const nr = recibo.trim();
  if (!reciboValido(nr)) return { ok: false, erro: "Informe o nº do recibo como o eSocial devolve (dígitos e pontos)." };
  const repetido = await prisma.dp2EventoEsocial.findFirst({ where: { tenantId, recibo: nr }, select: { id: true } });
  if (repetido) return { ok: false, erro: "Esse recibo já está em outro evento da fila." };
  const novaDoAlvo = ev.alvoId ? SITUACAO_DO_ALVO[ev.tipo] : undefined;
  await prisma.$transaction([
    prisma.dp2EventoEsocial.update({ where: { id: ev.id }, data: { situacao: "ACEITO", recibo: nr } }),
    ...(ev.alvoId && novaDoAlvo ? [prisma.dp2EventoEsocial.updateMany({ where: { id: ev.alvoId, tenantId }, data: { situacao: novaDoAlvo } })] : []),
  ]);
  return { ok: true, tipo: ev.tipo, alvo: novaDoAlvo ?? null };
}

/** S-3000 de um evento aceito da fila, ligado a ele. */
export async function gerarExclusao(tenantId: string, eventoId: string, userId: string): Promise<Resultado> {
  const prisma = getPrisma();
  const alvo = await prisma.dp2EventoEsocial.findFirst({
    where: { id: eventoId, tenantId },
    include: { person: { select: { cpf: true } }, competencia: { select: { ano: true, mes: true, tipo: true } } },
  });
  if (!alvo) return { ok: false, erro: "Evento não encontrado." };
  if (alvo.situacao !== "ACEITO" || !alvo.recibo) return { ok: false, erro: "Só evento aceito, com o recibo registrado, se exclui pelo S-3000." };
  if (!podeExcluirPeloS3000(alvo.tipo)) return { ok: false, erro: alvo.tipo === "S-1299" ? "O fechamento (S-1299) se desfaz com a reabertura (S-1298), na competência." : `O ${alvo.tipo} não se exclui pelo S-3000.` };
  const empregador = await empregadorDaEmpresa(tenantId, alvo.companyId, competenciaDe(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1));
  if (!empregador) return { ok: false, erro: "Empresa não encontrada." };
  // O período: o da competência; sem ela, o começo da referência ("2026-11 · CPF").
  const perApur = alvo.competencia
    ? alvo.competencia.tipo === "DECIMO_2"
      ? String(alvo.competencia.ano)
      : competenciaDe(alvo.competencia.ano, alvo.competencia.mes)
    : /^\d{4}(-\d{2})?$/.test(alvo.referencia.split(" · ")[0]) ? alvo.referencia.split(" · ")[0] : null;
  const ev = eventoS3000(empregador, { tipo: alvo.tipo, recibo: alvo.recibo, cpf: alvo.person?.cpf ?? null, perApur }, geradorDeId(empregador.cnpj || "0", new Date()));
  return { ok: true, ...(await guardar(tenantId, alvo.companyId, alvo.competenciaId, userId, [{ ...ev, personId: alvo.personId, alvoId: alvo.id }])) };
}

/** O S-1299 aceito (e ainda não reaberto) do período da competência, se houver. */
async function fechamentoAceito(tenantId: string, companyId: string, perApur: string) {
  return getPrisma().dp2EventoEsocial.findFirst({ where: { tenantId, companyId, tipo: "S-1299", referencia: perApur, situacao: "ACEITO" }, orderBy: { createdAt: "desc" }, select: { id: true } });
}

/** S-1298 do período da competência, quando o S-1299 dele foi aceito. */
export async function gerarReabertura(tenantId: string, competenciaId: string, userId: string): Promise<Resultado> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.tipo !== "MENSAL" && comp.tipo !== "DECIMO_2") return { ok: false, erro: "Este tipo de competência não tem periódicos no eSocial." };
  const perApur = comp.tipo === "DECIMO_2" ? String(comp.ano) : competenciaDe(comp.ano, comp.mes);
  const fechamento = await fechamentoAceito(tenantId, comp.companyId, perApur);
  if (!fechamento) return { ok: false, erro: `O período ${perApur} não está fechado no eSocial (sem S-1299 aceito).` };
  const empregador = await empregadorDaEmpresa(tenantId, comp.companyId, perApur);
  if (!empregador) return { ok: false, erro: "Empresa não encontrada." };
  const ev = eventoS1298(empregador, perApur, geradorDeId(empregador.cnpj || "0", new Date()));
  return { ok: true, ...(await guardar(tenantId, comp.companyId, competenciaId, userId, [{ ...ev, alvoId: fechamento.id }])) };
}

/** O infoMV do S-1200: o indMV que o cálculo gravou e as outras empresas do mês. */
function infoMVDoCalculo(
  memoria: unknown,
  outras: readonly { tpInsc: number; nrInsc: string; codCateg: string; remuneracao: unknown }[]
): TrabalhadorEsocial["infoMV"] {
  const indMV = (memoria as { infoMV?: { indMV?: number } } | null)?.infoMV?.indMV;
  if (!outras.length || (indMV !== 1 && indMV !== 2 && indMV !== 3)) return null;
  return { indMV, outras: outras.map((o) => ({ tpInsc: o.tpInsc === 2 ? 2 : 1, nrInsc: o.nrInsc, codCateg: o.codCateg, valor: Number(o.remuneracao) })) };
}
