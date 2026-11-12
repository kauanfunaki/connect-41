// eSocial do DP 2 (12/11/2026, fase 3a) — o que lê e grava no banco. Os
// eventos e as pendências moram em `eventos.ts`; aqui se junta o cadastro,
// gera e guarda na fila. Gerar de novo troca o evento ainda não enviado do
// mesmo assunto (mesmo tipo, empresa e referência).

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { garantirRubricas } from "@/lib/dp2/servidor";
import { competenciaDe } from "@/lib/dp2/tabelas";
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

function rubricaEsocial(r: {
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

/** Os periódicos da competência mensal fechada: S-1200 e S-1210 de cada pessoa e o S-1299. */
export async function gerarPeriodicos(tenantId: string, competenciaId: string, dtPgto: string | null, userId: string) {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false as const, erro: "Competência não encontrada." };
  if (comp.situacao !== "FECHADA") return { ok: false as const, erro: "Feche a competência antes de gerar os eventos do eSocial." };
  if (comp.tipo !== "MENSAL") return { ok: false as const, erro: "Por enquanto o eSocial do DP 2 gera os periódicos da folha mensal; o 13º vem em seguida." };
  const perApur = competenciaDe(comp.ano, comp.mes);
  const empregador = await empregadorDaEmpresa(tenantId, comp.companyId, perApur);
  if (!empregador) return { ok: false as const, erro: "Empresa não encontrada." };

  const calculos = await prisma.dp2Calculo.findMany({
    where: { tenantId, competenciaId },
    include: { person: { select: { id: true, name: true, cpf: true, dp2Vinculo: { select: { matricula: true, categoria: true, aprendiz: true } } } } },
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
    };
    eventos.push(eventoS1200(empregador, perApur, t, novoId));
    eventos.push(eventoS1210(empregador, perApur, dtPgto, t, novoId));
  }
  eventos.push(eventoS1299(empregador, perApur, calculos.length > 0, novoId));
  return { ok: true as const, ...(await guardar(tenantId, comp.companyId, competenciaId, userId, eventos)) };
}
