// eSocial do DP 2 (12/11/2026, fase 3a) — o que lê e grava no banco. Os
// eventos e as pendências moram em `eventos.ts`; aqui se junta o cadastro,
// gera e guarda na fila. Gerar de novo troca o evento ainda não enviado do
// mesmo assunto (mesmo tipo, empresa e referência).

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { garantirRubricas, mediaDaPessoa, tabelasDoEscritorio, vinculoDoMotor } from "@/lib/dp2/servidor";
import { competenciaDe, tabelasDaCompetencia } from "@/lib/dp2/tabelas";
import { calcularRescisaoDoDp2 } from "@/lib/dp2/rescisao";
import { dataProjetada, diasDeAvisoPrevio } from "@/lib/rescisao/avos";
import type { MotivoCanonico } from "@/lib/rescisao/motivos";
import { lerDadosEsocial } from "./cadastro";
import { eventoS2300, eventoS2399 } from "./semVinculo";
import { semVinculo } from "@/lib/dp2/categorias";
import { eventoS2210, eventoS2220, eventoS2240, lerResponsaveis, type Aso, type Cat, type CondicaoAmbiental, type ResponsaveisDeSst } from "./sst";
import {
  eventoS2200,
  eventoS2206,
  eventoS2230,
  eventoS2299,
  PAPEL_DA_VERBA,
  type Afastamento,
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
  eventoS1299,
  geradorDeId,
  type EmpregadorEsocial,
  type EventoGerado,
  type RubricaEsocial,
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

  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId },
    include: { person: { select: { id: true, name: true, cpf: true, birthDate: true, dp2Vinculo: { select: { matricula: true, categoria: true, aprendiz: true } } } } },
  });
  const novoId = geradorDeId(empregador.cnpj || "0", new Date());
  const eventos: EventoGerado[] = [];
  for (const c of calculos.sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR"))) {
    const v = c.person.dp2Vinculo;
    const itens = ((c.itens as unknown as ItemDoHolerite[]) ?? []).map((i) => ({
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
    };
    eventos.push(eventoS1200(empregador, perApur, t, novoId));
    eventos.push(eventoS1210(empregador, mesDoPagamento, dtPgto, t, novoId, perApur));
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
  if (semVinculo(v.t.categoria)) return { ok: false, erro: "A alteração de sócio, autônomo e estagiário é o S-2306, que ainda não está no Connect." };
  const ev = eventoS2206(v.empregador, v.t, await sindicatoDaEmpresa(tenantId, v.companyId), { data, descricao }, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
}

export async function gerarAfastamento(tenantId: string, personId: string, a: Afastamento, userId: string): Promise<Resultado> {
  const v = await doVinculo(tenantId, personId, a.inicio.slice(0, 7));
  if (!v) return { ok: false, erro: SEM_CONTRATO };
  const ev = eventoS2230(v.empregador, v.t, a, v.novoId);
  return { ok: true, ...(await guardar(tenantId, v.companyId, null, userId, [ev])) };
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
    mediaDaPessoa(tenantId, personId, competencia),
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
