"use server";

// DP 2 (11/11/2026, funcionalidade-621) — as ações das telas. Cada uma confere
// de novo quem pode (Server Function aceita POST direto): o módulo ligado, o
// nível no setor, o escritório e, nas telas de empresa, a faixa "Trabalhando
// em" (`recusaDoFoco`).

import { lerRubricasFixas } from "@/lib/dp2/rubricasFixas";
import { lerSaldoInicial } from "@/lib/dp2/saldoInicial";
import { lerGuiaDoFgts } from "@/lib/dp2/guiasDaFolha";
import { guardarArquivo } from "@/lib/drive/servidor";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { lerTotalizadores } from "@/lib/dp2/esocial/totalizadores";
import { calcularRescisaoDaPessoa, dadosDaRescisao, type AvisoDaRescisao } from "@/lib/dp2/rescisaoServidor";
import { TIPOS_DE_INFORMACAO, ehTipoDeInformacao, lerInformacao } from "@/lib/dp2/apuracao";
import { lerOutraBase, mesAnterior } from "@/lib/dp2/outrasBasesInss";
import { camposAjustaveis, lerAjuste, nomeDoCampo } from "@/lib/dp2/ajustesDoCalculo";
import type { ItemDoHolerite, Provisoes } from "@/lib/dp2/mensal";
import { SALARIO_OBRIGATORIO, regimeDaCategoria, salarioValido } from "@/lib/dp2/categorias";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo, type NivelNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";
import {
  calcularCompetencia,
  colaboradoresDaCompetencia,
  colaboradoresDaEmpresa,
  garantirRubricas,
  gravarRubricasFixas,
  mediaDaPessoa,
  periodosDaPessoa,
  tabelasDoEscritorio,
  vinculoDoMotor,
} from "@/lib/dp2/servidor";
import { calcularFerias } from "@/lib/dp2/ferias";
import type { Prisma } from "@/generated/prisma/client";
import { camposDoFormulario, lerLancamentoPorRubrica } from "@/lib/dp2/lancamentoPorRubrica";
import { TIPOS_DE_RUBRICA, ehPapel, regraDeLancamento } from "@/lib/dp2/rubricas";
import { lerDadosDaTabela, tabelasDaCompetencia, TIPOS_DE_TABELA, type TipoDeTabela } from "@/lib/dp2/tabelas";
import { lerComparativo } from "@/lib/dp2/comparativo";
import { lerNumero, lerInteiro } from "@/lib/dp2/entrada";
import { PersonEmploymentStatus, PersonType } from "@/generated/prisma/client";
import { comNovaTentativa, proximoNumero } from "@/lib/enderecoCurtoNumeracao";
import { formatCpf } from "@/lib/format";
import { cpfValido } from "@/lib/dp2/esocial/documentos";
import { importarEventos, podeImportar, type RubricaParaImportar } from "@/lib/dp2/importacaoDeEventos";
import { DIAS_DO_LINK, gerarRemessaDaCompetencia, guardarHoleritesNosArquivos, novoToken } from "@/lib/dp2/saidas";
import { CAMPOS_DAS_CONTAS } from "@/lib/dp2/contabilizacao";
import type { EstadoDoDp2 } from "@/components/dp2/Formulario";
import {
  gerarAdmissao,
  gerarAfastamento,
  gerarAlteracao,
  gerarAso,
  gerarCat,
  gerarCondicaoAmbiental,
  gerarDesligamento,
  gerarExclusao,
  gerarPeriodicos,
  gerarReabertura,
  registrarRecibo,
  gerarTabelas,
  gerarTerminoSemVinculo,
  SITUACOES_ABERTAS,
} from "@/lib/dp2/esocial/servidor";
import { lerAgentes, lerProcedimentos, lerResponsaveis } from "@/lib/dp2/esocial/sst";
import { lerDadosEsocial } from "@/lib/dp2/esocial/cadastro";
import { consolidarTrabalhadores, lerArquivosDoEsocial, type TrabalhadorImportado } from "@/lib/dp2/esocial/importacao";
import { gravarImportacao, previaDaImportacao, type LinhaDaPrevia, type ResultadoDaImportacao } from "@/lib/dp2/esocial/importacaoServidor";
import {
  LIMITE_DE_ACESSOS_POR_DIA,
  acessosDoDia,
  acessosLivres,
  consultaBloqueadaHoje,
  hojeEmBrasilia,
  lerItens,
  lerListaDeCpfs,
  type ItemDaBusca,
  type SituacaoDaBusca,
} from "@/lib/dp2/esocial/buscaPorCpf";
import { MOTIVO_LABEL, type MotivoCanonico } from "@/lib/rescisao/motivos";

type Acesso = { ctx: AuthContext; tenantId: string; userId: string };

async function acesso(modulo: string, nivel: NivelNoModulo): Promise<Acesso | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  // A competência serve também ao 13º salário: quem tem um dos dois módulos
  // abre, calcula e fecha as parcelas.
  const modulos = modulo === "dp2_competencia" ? ["dp2_competencia", "dp2_decimo"] : [modulo];
  for (const m of modulos) if (await podeNoModulo(ctx, m, nivel)) return { ctx, tenantId: ctx.tenantId, userId: ctx.userId };
  return null;
}

const texto = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const marcado = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";

/** As três médias da rubrica (17/11/2026, melhoria-742), com a coluna antiga sincronizada. */
function mediasDoFormulario(fd: FormData) {
  const mediaFerias = marcado(fd, "mediaFerias");
  const mediaDecimo = marcado(fd, "mediaDecimo");
  const mediaRescisao = marcado(fd, "mediaRescisao");
  return { mediaFerias, mediaDecimo, mediaRescisao, entraNaMedia: mediaFerias || mediaDecimo || mediaRescisao };
}
const erro = (t: string): EstadoDoDp2 => ({ ok: false, texto: t });
const SEM_PERMISSAO = erro("Sem permissão para isto no DP 2.");

async function empresaDoEscritorio(a: Acesso, companyId: string): Promise<string | null> {
  if (!companyId) return "Escolha a empresa.";
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId: a.tenantId }, select: { id: true } });
  if (!empresa) return "Empresa não encontrada.";
  return recusaDoFoco(a.ctx, [companyId]);
}

async function competenciaEditavel(a: Acesso, competenciaId: string) {
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId: a.tenantId } });
  if (!comp) return { erro: "Competência não encontrada." } as const;
  const foraDoFoco = await recusaDoFoco(a.ctx, [comp.companyId]);
  if (foraDoFoco) return { erro: foraDoFoco } as const;
  return { comp } as const;
}

function revalidarCompetencia(id?: string) {
  revalidatePath("/dp2");
  revalidatePath("/dp2/competencia");
  revalidatePath("/dp2/decimo-terceiro");
  if (id) revalidatePath(`/dp2/competencia/${id}`);
}

// ─── Competência ────────────────────────────────────────────────────────────

const TIPOS_DE_COMPETENCIA = ["MENSAL", "DECIMO_1", "DECIMO_2"] as const;

export async function abrirCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const m = /^(\d{4})-(\d{2})$/.exec(texto(fd, "competencia"));
  if (!m) return erro("Informe o mês da competência.");
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return erro("Mês inválido.");
  const tipo = texto(fd, "tipo") || "MENSAL";
  if (!(TIPOS_DE_COMPETENCIA as readonly string[]).includes(tipo)) return erro("Tipo de competência inválido.");
  if (tipo === "DECIMO_2" && mes !== 12) return erro("A 2ª parcela do 13º é de dezembro.");

  const prisma = getPrisma();
  await garantirRubricas(a.tenantId);
  const existente = await prisma.dp2Competencia.findFirst({ where: { companyId, ano, mes, tipo }, select: { id: true } });
  const id =
    existente?.id ??
    (await prisma.dp2Competencia.create({ data: { tenantId: a.tenantId, companyId, ano, mes, tipo, abertaPorId: a.userId }, select: { id: true } })).id;
  if (!existente) {
    await logAudit({
      tenantId: a.tenantId,
      userId: a.userId,
      action: "folha.competencia_aberta",
      entityType: "Dp2Competencia",
      entityId: id,
      metadata: { companyId, ano, mes, tipo },
    });
  }
  revalidarCompetencia();
  redirect(`/dp2/competencia/${id}`);
}

export async function calcularCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  const r = await calcularCompetencia(a.tenantId, id);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_calculada",
    entityType: "Dp2Competencia",
    entityId: id,
    metadata: { pessoas: r.totais.pessoas, liquido: r.totais.liquido },
  });
  revalidarCompetencia(id);
  const sem = r.totais.semVinculo > 0 ? ` ${r.totais.semVinculo} sem contrato no DP 2 ficaram de fora.` : "";
  return { ok: true, texto: `Calculado: ${r.totais.pessoas} pessoa(s).${sem}` };
}

export async function fecharCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao !== "CALCULADA") return erro("Só fecha competência calculada, depois do último lançamento.");
  await getPrisma().dp2Competencia.update({ where: { id }, data: { situacao: "FECHADA", fechadaEm: new Date(), fechadaPorId: a.userId } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_fechada",
    entityType: "Dp2Competencia",
    entityId: id,
  });
  revalidarCompetencia(id);
  return { ok: true, texto: "Competência fechada." };
}

/** Reabrir é de quem gere o setor: a competência fechada é a que vale para médias e conferência. */
export async function reabrirCompetenciaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "gerir");
  if (!a) return erro("Só quem gere o DP 2 reabre uma competência fechada.");
  const id = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, id);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao !== "FECHADA") return erro("A competência não está fechada.");
  const motivo = texto(fd, "motivo");
  if (motivo.length < 5) return erro("Diga por que está reabrindo.");
  await getPrisma().dp2Competencia.update({ where: { id }, data: { situacao: "CALCULADA", fechadaEm: null, fechadaPorId: null } });
  // Período fechado também no eSocial (S-1299 aceito): o S-1298 sai junto, se o eSocial do DP 2 está ligado (funcionalidade-754).
  const comEsocial = await podeNoModulo(a.ctx, "dp2_esocial", "agir");
  const reabertura = comEsocial ? await gerarReabertura(a.tenantId, id, a.userId) : null;
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.competencia_reaberta",
    entityType: "Dp2Competencia",
    entityId: id,
    metadata: { motivo, s1298: reabertura?.ok ?? false },
  });
  revalidarCompetencia(id);
  if (reabertura?.ok) revalidatePath("/dp2/esocial");
  return { ok: true, texto: reabertura?.ok ? "Competência reaberta, com o S-1298 pronto na fila do eSocial." : "Competência reaberta." };
}

// ─── Eventos do mês ─────────────────────────────────────────────────────────

export async function lancarEventoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  if (comp.situacao === "FECHADA") return erro("Competência fechada: reabra para lançar.");
  if (comp.tipo !== "MENSAL") return erro("Lançamentos variáveis são só da folha mensal.");

  const prisma = getPrisma();
  const personId = texto(fd, "personId");
  const pessoa = await prisma.person.findFirst({ where: { id: personId, tenantId: a.tenantId, currentCompanyId: comp.companyId }, select: { id: true, name: true } });
  if (!pessoa) return erro("Escolha um colaborador desta empresa.");
  const rubrica = await prisma.dp2Rubrica.findFirst({ where: { id: texto(fd, "rubricaId"), tenantId: a.tenantId, ativa: true } });
  if (!rubrica) return erro("Escolha a rubrica.");
  const { lancavel, porQuantidade } = regraDeLancamento(rubrica);
  if (!lancavel) return erro(`${rubrica.nome} é calculada pelo motor, não se lança.`);

  const quantidade = porQuantidade ? lerNumero(texto(fd, "quantidade")) : null;
  const valor = porQuantidade ? null : lerNumero(texto(fd, "valor"));
  if (porQuantidade && (quantidade === null || quantidade <= 0)) return erro(`Informe ${rubrica.lancamento === "HORAS" ? "as horas" : "os dias"}.`);
  if (!porQuantidade && (valor === null || valor <= 0)) return erro("Informe o valor.");

  const evento = await prisma.dp2Evento.create({
    data: { tenantId: a.tenantId, competenciaId, personId, rubricaId: rubrica.id, quantidade, valor, origem: "DP", observacao: texto(fd, "observacao").slice(0, 300) || null, criadoPorId: a.userId },
    select: { id: true },
  });
  // Lançamento novo deixa o cálculo velho: a competência volta a "aberta".
  if (comp.situacao === "CALCULADA") await prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "ABERTA" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.evento_lancado",
    entityType: "Dp2Evento",
    entityId: evento.id,
    metadata: { competenciaId, pessoa: pessoa.name, rubrica: rubrica.nome, quantidade, valor },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `${rubrica.nome} lançado para ${pessoa.name}.` };
}

/**
 * Lançar por rubrica e em grupo (25/11/2026, funcionalidade-767, parte 1.1): a
 * mesma rubrica para vários colaboradores numa tela só ("Por Rubrica" e "Em
 * Grupo" na Domínio). Cada campo `item_<personId>` traz as horas, os dias ou o
 * valor da pessoa; vazio = fica de fora. Tudo ou nada: um valor errado não
 * lança ninguém. Como no lançamento por pessoa, soma ao que já houver no mês.
 */
export async function lancarPorRubricaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  if (comp.situacao === "FECHADA") return erro("Competência fechada: reabra para lançar.");
  if (comp.tipo !== "MENSAL") return erro("Lançamentos variáveis são só da folha mensal.");

  const prisma = getPrisma();
  const rubrica = await prisma.dp2Rubrica.findFirst({ where: { id: texto(fd, "rubricaId"), tenantId: a.tenantId, ativa: true } });
  if (!rubrica) return erro("Escolha a rubrica.");
  const { lancavel, porQuantidade } = regraDeLancamento(rubrica);
  if (!lancavel) return erro(`${rubrica.nome} é calculada pelo motor, não se lança.`);

  // Só quem tem contrato no DP 2 e está na folha do mês.
  const pessoas = (await colaboradoresDaCompetencia(a.tenantId, comp.companyId, comp.ano, comp.mes)).filter((p) => p.dp2Vinculo);
  const nomes = new Map(pessoas.map((p) => [p.id, p.name]));
  const campos = camposDoFormulario(fd.entries());
  if (campos.some((c) => c.texto.trim() && !nomes.has(c.personId))) return erro("Há colaborador que não está na folha deste mês. Recarregue a tela.");
  const lido = lerLancamentoPorRubrica(campos, porQuantidade, (id) => nomes.get(id) ?? "colaborador");
  if (!lido.ok) return erro(lido.erro);

  const observacao = texto(fd, "observacao").slice(0, 300) || null;
  await prisma.$transaction([
    prisma.dp2Evento.createMany({
      data: lido.itens.map((i) => ({ tenantId: a.tenantId, competenciaId, personId: i.personId, rubricaId: rubrica.id, quantidade: i.quantidade, valor: i.valor, origem: "DP" as const, observacao, criadoPorId: a.userId })),
    }),
    // Lançamento novo deixa o cálculo velho: a competência volta a "aberta".
    ...(comp.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.eventos_lancados_por_rubrica",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { rubrica: rubrica.nome, pessoas: lido.itens.length },
  });
  revalidarCompetencia(competenciaId);
  const k = lido.itens.length;
  return { ok: true, texto: `${rubrica.nome} lançado para ${k} ${k === 1 ? "colaborador" : "colaboradores"}.` };
}

/**
 * Tirar um lançamento da competência ainda aberta é correção do dia a dia (o
 * mesmo que o "rascunho não enviado" da regra de exclusão de 13/10/2026): o
 * lançamento ainda não virou folha fechada. Competência fechada não deixa.
 */
export async function removerEventoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const evento = await prisma.dp2Evento.findFirst({ where: { id: texto(fd, "eventoId"), tenantId: a.tenantId }, include: { rubrica: { select: { nome: true } } } });
  if (!evento) return erro("Lançamento não encontrado.");
  const r0 = await competenciaEditavel(a, evento.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para mexer nos lançamentos.");
  await prisma.$transaction([
    prisma.dp2Evento.delete({ where: { id: evento.id } }),
    ...(r0.comp.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: r0.comp.id }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.evento_removido",
    entityType: "Dp2Competencia",
    entityId: evento.competenciaId,
    metadata: { rubrica: evento.rubrica.nome },
  });
  revalidarCompetencia(evento.competenciaId);
  return { ok: true, texto: "Lançamento retirado." };
}

// ─── Férias gravadas ────────────────────────────────────────────────────────

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** As folhas mensais dos meses do gozo: fechada barra; calculada volta a aberta. */
async function folhasDoGozo(tenantId: string, companyId: string, inicio: Date, dias: number) {
  const fim = new Date(inicio.getTime() + (dias - 1) * DIA_EM_MS);
  const meses = [
    { ano: inicio.getUTCFullYear(), mes: inicio.getUTCMonth() + 1 },
    { ano: fim.getUTCFullYear(), mes: fim.getUTCMonth() + 1 },
  ];
  return getPrisma().dp2Competencia.findMany({
    where: { tenantId, companyId, tipo: "MENSAL", OR: meses.map((m) => ({ ano: m.ano, mes: m.mes })) },
    select: { id: true, ano: true, mes: true, situacao: true },
  });
}

/**
 * Grava as férias de um colaborador (25/11/2026, funcionalidade-745, entrega
 * 2.1): refaz o cálculo no servidor, liga ao período aquisitivo escolhido e
 * deixa a folha dos meses do gozo para calcular de novo — ela lança a parte de
 * cada mês. Período que passou do concessivo é devido em dobro (CLT art. 137),
 * que o DP 2 ainda não calcula: esse não grava.
 */
export async function gravarFeriasAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_ferias", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const pessoa = (await colaboradoresDaEmpresa(a.tenantId, companyId)).find((p) => p.id === texto(fd, "personId"));
  if (!pessoa?.dp2Vinculo || pessoa.dismissalDate || regimeDaCategoria(pessoa.dp2Vinculo.categoria) !== "CLT") return erro("Escolha um empregado ativo com contrato no DP 2.");
  if (!pessoa.admissionDate) return erro(`${pessoa.name} está sem data de admissão: preencha no cadastro.`);
  const inicioTxt = texto(fd, "inicio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicioTxt)) return erro("Informe o início do gozo.");
  const inicio = new Date(`${inicioTxt}T00:00:00.000Z`);
  const dias = lerInteiro(texto(fd, "dias")) ?? 0;
  const abono = lerInteiro(texto(fd, "abono")) ?? 0;
  const faltas = lerInteiro(texto(fd, "faltas")) ?? 0;
  const pagamentoTxt = texto(fd, "dataPagamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagamentoTxt)) return erro("Informe a data do pagamento.");
  const dataPagamento = new Date(`${pagamentoTxt}T00:00:00.000Z`);

  // A situação de cada período no dia em que o gozo começa (vale programar férias futuras).
  const periodos = await periodosDaPessoa(a.tenantId, pessoa, inicio);
  const periodo = periodos.find((p) => p.inicio === texto(fd, "aquisitivoInicio"));
  if (!periodo) return erro("Escolha o período aquisitivo.");
  if (periodo.situacao === "EM_AQUISICAO") return erro(`O período ${periodo.inicio} a ${periodo.fim} ainda estará em aquisição no início do gozo.`);
  if (periodo.situacao === "QUITADO" || periodo.saldo < dias + abono) return erro(`O período ${periodo.inicio} a ${periodo.fim} tem saldo de ${periodo.saldo} dia(s): gozo e abono somam ${dias + abono}.`);
  if (periodo.situacao === "EM_DOBRO" || inicioTxt > periodo.concessivoFim) {
    return erro(`O período ${periodo.inicio} a ${periodo.fim} passou do concessivo (${periodo.concessivoFim}): as férias são devidas em dobro (CLT art. 137), e o DP 2 ainda não calcula a dobra.`);
  }

  const prisma = getPrisma();
  const fim = new Date(inicio.getTime() + (dias - 1) * DIA_EM_MS);
  const sobrepostas = await prisma.dp2Ferias.findMany({ where: { tenantId: a.tenantId, personId: pessoa.id, inicioGozo: { lte: fim } }, select: { inicioGozo: true, diasGozo: true } });
  if (sobrepostas.some((s) => new Date(s.inicioGozo.getTime() + (s.diasGozo - 1) * DIA_EM_MS) >= inicio)) return erro("Já há férias gravadas nesses dias para esta pessoa.");
  const folhas = await folhasDoGozo(a.tenantId, companyId, inicio, Math.max(1, dias));
  const fechada = folhas.find((f) => f.situacao === "FECHADA");
  if (fechada) return erro(`A folha de ${String(fechada.mes).padStart(2, "0")}/${fechada.ano} está fechada: reabra para gravar férias nesse mês.`);

  const competencia = inicioTxt.slice(0, 7);
  const tab = tabelasDaCompetencia(competencia, await tabelasDoEscritorio(a.tenantId));
  if (!tab.ok) return erro(`Faltam tabelas para ${competencia}: ${tab.faltam.join(", ")}.`);
  const media = await mediaDaPessoa(a.tenantId, pessoa.id, competencia, "FERIAS");
  const c = calcularFerias({ inicio, diasDeGozo: dias, diasDeAbono: abono, faltas, vinculo: vinculoDoMotor(pessoa.dp2Vinculo), mediaVariaveis: media.media, tabelas: tab.tabelas });
  if (!c.ok) return erro(c.erro);
  const valor = (nome: string) => c.linhas.find((l) => l.nome === nome)?.valor ?? 0;

  const gravada = await prisma.dp2Ferias.create({
    data: {
      tenantId: a.tenantId,
      companyId,
      personId: pessoa.id,
      aquisitivoInicio: new Date(`${periodo.inicio}T00:00:00.000Z`),
      aquisitivoFim: new Date(`${periodo.fim}T00:00:00.000Z`),
      inicioGozo: inicio,
      diasGozo: dias,
      diasAbono: abono,
      faltas,
      dataPagamento,
      remuneracao: c.remuneracao,
      ferias: valor("Férias"),
      terco: valor("1/3 constitucional"),
      abono: valor("Abono pecuniário"),
      tercoAbono: valor("1/3 do abono"),
      inss: c.inss.valor,
      irrf: c.irrf.valor,
      liquido: c.liquido,
      fgts: c.fgts,
      recibo: { linhas: c.linhas, memoria: [...c.memoria, `Média: ${media.memoria}`], alertas: c.alertas } as Prisma.InputJsonValue,
      criadoPorId: a.userId,
    },
    select: { id: true },
  });
  for (const f of folhas) if (f.situacao === "CALCULADA") await prisma.dp2Competencia.update({ where: { id: f.id }, data: { situacao: "ABERTA" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.ferias_gravadas",
    entityType: "Dp2Ferias",
    entityId: gravada.id,
    metadata: { pessoa: pessoa.name, aquisitivo: `${periodo.inicio} a ${periodo.fim}`, inicio: inicioTxt, dias, abono, liquido: c.liquido },
  });
  revalidatePath("/dp2/ferias");
  for (const f of folhas) revalidarCompetencia(f.id);
  const aviso = dataPagamento.getTime() > c.pagamentoAte.getTime() ? " Atenção: o pagamento ficou depois do prazo (2 dias antes do início, CLT art. 145)." : "";
  return { ok: true, texto: `Férias de ${pessoa.name} gravadas. A folha dos meses do gozo lança a parte de cada mês ao calcular.${aviso}` };
}

/** Exclui férias gravadas enquanto nenhuma folha do gozo está fechada. */
export async function excluirFeriasAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_ferias", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const f = await prisma.dp2Ferias.findFirst({ where: { id: texto(fd, "feriasId"), tenantId: a.tenantId }, include: { person: { select: { name: true } } } });
  if (!f) return erro("Férias não encontradas.");
  const recusa = await empresaDoEscritorio(a, f.companyId);
  if (recusa) return erro(recusa);
  const folhas = await folhasDoGozo(a.tenantId, f.companyId, f.inicioGozo, f.diasGozo);
  const fechada = folhas.find((x) => x.situacao === "FECHADA");
  if (fechada) return erro(`A folha de ${String(fechada.mes).padStart(2, "0")}/${fechada.ano} está fechada: reabra para excluir estas férias.`);
  await prisma.dp2Ferias.delete({ where: { id: f.id } });
  for (const x of folhas) if (x.situacao === "CALCULADA") await prisma.dp2Competencia.update({ where: { id: x.id }, data: { situacao: "ABERTA" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.ferias_excluidas",
    entityType: "Dp2Ferias",
    entityId: f.id,
    metadata: { pessoa: f.person.name, inicio: f.inicioGozo.toISOString().slice(0, 10), dias: f.diasGozo, liquido: Number(f.liquido) },
  });
  revalidatePath("/dp2/ferias");
  for (const x of folhas) revalidarCompetencia(x.id);
  return { ok: true, texto: `Férias de ${f.person.name} excluídas.` };
}

// ─── Outras bases de INSS (mais de um vínculo) ──────────────────────────────

/** A competência mensal ainda aberta da tela; o que muda deixa o cálculo velho. */
async function competenciaMensalAberta(a: Acesso, competenciaId: string) {
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return r0;
  if (r0.comp.situacao === "FECHADA") return { erro: "Competência fechada: reabra para mexer nas outras bases de INSS." } as const;
  if (r0.comp.tipo !== "MENSAL") return { erro: "Outras bases de INSS são da folha mensal." } as const;
  return r0;
}

async function calculoFicouVelho(comp: { id: string; situacao: string }) {
  if (comp.situacao === "CALCULADA") await getPrisma().dp2Competencia.update({ where: { id: comp.id }, data: { situacao: "ABERTA" } });
}

/**
 * Remuneração do colaborador em outra empresa no mês (25/11/2026,
 * funcionalidade-769, "Outras bases INSS" da Domínio): o INSS daqui respeita o
 * teto somando as bases e o S-1200 leva o infoMV. Uma linha por empresa.
 */
export async function incluirOutraBaseInssAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaMensalAberta(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  const prisma = getPrisma();
  const pessoa = (await colaboradoresDaCompetencia(a.tenantId, comp.companyId, comp.ano, comp.mes)).find((p) => p.id === texto(fd, "personId") && p.dp2Vinculo);
  if (!pessoa) return erro("Escolha um colaborador desta folha.");
  // Por enquanto, só empregado (CLT): estagiário não tem INSS, e sócio/autônomo têm outra regra.
  if (regimeDaCategoria(pessoa.dp2Vinculo?.categoria) !== "CLT") return erro(`${pessoa.name} não é empregado (CLT): outras bases de INSS valem só para empregados por enquanto.`);
  const empresa = await prisma.company.findFirst({ where: { id: comp.companyId, tenantId: a.tenantId }, select: { cnpj: true } });
  const lido = lerOutraBase(texto(fd, "documento"), texto(fd, "codCateg"), texto(fd, "remuneracao"), empresa?.cnpj);
  if (!lido.ok) return erro(lido.erro);
  const repetida = await prisma.dp2OutraBaseInss.findFirst({ where: { tenantId: a.tenantId, competenciaId, personId: pessoa.id, nrInsc: lido.base.nrInsc }, select: { id: true } });
  if (repetida) return erro("Essa empresa já está informada para este colaborador no mês: retire a linha para trocar o valor.");
  await prisma.dp2OutraBaseInss.create({ data: { tenantId: a.tenantId, competenciaId, personId: pessoa.id, ...lido.base, criadoPorId: a.userId } });
  await calculoFicouVelho(comp);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.outra_base_inss_incluida",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { pessoa: pessoa.name, outraEmpresa: lido.base.nrInsc, remuneracao: lido.base.remuneracao },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `Outra base de ${pessoa.name} informada. Calcule de novo para o INSS considerar.` };
}

export async function retirarOutraBaseInssAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const linha = await prisma.dp2OutraBaseInss.findFirst({ where: { id: texto(fd, "outraBaseId"), tenantId: a.tenantId }, include: { person: { select: { name: true } } } });
  if (!linha) return erro("Linha não encontrada.");
  const r0 = await competenciaMensalAberta(a, linha.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  await prisma.dp2OutraBaseInss.delete({ where: { id: linha.id } });
  await calculoFicouVelho(r0.comp);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.outra_base_inss_retirada",
    entityType: "Dp2Competencia",
    entityId: linha.competenciaId,
    metadata: { pessoa: linha.person.name, outraEmpresa: linha.nrInsc, remuneracao: Number(linha.remuneracao) },
  });
  revalidarCompetencia(linha.competenciaId);
  return { ok: true, texto: "Outra base retirada. Calcule de novo para o INSS considerar." };
}

/**
 * Copia do mês anterior as outras bases de quem está nesta folha e ainda não
 * tem nenhuma informada aqui (o comum é a outra empresa pagar o mesmo todo mês).
 */
export async function copiarOutrasBasesInssAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaMensalAberta(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  const prisma = getPrisma();
  const { ano, mes } = mesAnterior(comp.ano, comp.mes);
  const anterior = await prisma.dp2Competencia.findFirst({ where: { tenantId: a.tenantId, companyId: comp.companyId, ano, mes, tipo: "MENSAL" }, select: { id: true } });
  if (!anterior) return erro("Não há folha mensal do mês anterior para copiar.");
  const [deLa, daqui, pessoas] = await Promise.all([
    prisma.dp2OutraBaseInss.findMany({ where: { tenantId: a.tenantId, competenciaId: anterior.id } }),
    prisma.dp2OutraBaseInss.findMany({ where: { tenantId: a.tenantId, competenciaId }, select: { personId: true } }),
    colaboradoresDaCompetencia(a.tenantId, comp.companyId, comp.ano, comp.mes),
  ]);
  const naFolha = new Set(pessoas.filter((p) => p.dp2Vinculo).map((p) => p.id));
  const jaTem = new Set(daqui.map((d) => d.personId));
  const copiar = deLa.filter((o) => naFolha.has(o.personId) && !jaTem.has(o.personId));
  if (copiar.length === 0) return erro(deLa.length ? "Quem tinha outra base no mês anterior já tem aqui (ou saiu da folha)." : "O mês anterior não tem outras bases de INSS.");
  await prisma.dp2OutraBaseInss.createMany({
    data: copiar.map((o) => ({ tenantId: a.tenantId, competenciaId, personId: o.personId, tpInsc: o.tpInsc, nrInsc: o.nrInsc, codCateg: o.codCateg, remuneracao: o.remuneracao, criadoPorId: a.userId })),
  });
  await calculoFicouVelho(comp);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.outras_bases_inss_copiadas",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { de: anterior.id, linhas: copiar.length },
  });
  revalidarCompetencia(competenciaId);
  const pessoasCopiadas = new Set(copiar.map((o) => o.personId)).size;
  return { ok: true, texto: `Copiadas ${copiar.length} linha(s) de ${pessoasCopiadas} colaborador(es). Confira os valores e calcule de novo.` };
}

// ─── Ajuste manual do cálculo ───────────────────────────────────────────────

/**
 * Ajuste manual de um valor calculado (25/11/2026, funcionalidade-768): linha
 * do holerite, FGTS ou provisão do mês, sempre com motivo. Um ajuste por campo
 * e pessoa na competência (ajustar de novo troca o anterior). Fica guardado à
 * parte e a competência é recalculada na hora, com o ajuste por cima do motor;
 * recalcular depois mantém. Vai para a Auditoria com o de/para e o motivo.
 */
export async function ajustarCalculoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para ajustar o cálculo.");
  const lido = lerAjuste(texto(fd, "campo"), texto(fd, "valor"), texto(fd, "motivo"));
  if (!lido.ok) return erro(lido.erro);
  const { ajuste } = lido;

  const prisma = getPrisma();
  const personId = texto(fd, "personId");
  const calculo = await prisma.dp2Calculo.findFirst({ where: { tenantId: a.tenantId, competenciaId, personId }, include: { person: { select: { name: true } } } });
  if (!calculo) return erro("Calcule a folha antes de ajustar o cálculo desta pessoa.");
  const itens = calculo.itens as unknown as ItemDoHolerite[];
  const opcao = camposAjustaveis({ itens, fgts: Number(calculo.fgts), provisoes: calculo.provisoes as unknown as Provisoes }).find((o) => o.campo === ajuste.campo);
  if (!opcao) return erro("Esse valor não está no cálculo desta pessoa.");

  const chave = { competenciaId_personId_campo: { competenciaId, personId, campo: ajuste.campo } };
  const anterior = await prisma.dp2AjusteDeCalculo.findUnique({ where: chave });
  // O valor do motor: o guardado no primeiro ajuste (o cálculo de agora já traz o ajuste).
  const valorCalculado = anterior ? anterior.valorCalculado : opcao.valor;
  await prisma.dp2AjusteDeCalculo.upsert({
    where: chave,
    create: { tenantId: a.tenantId, competenciaId, personId, campo: ajuste.campo, valor: ajuste.valor, valorCalculado, motivo: ajuste.motivo, criadoPorId: a.userId },
    update: { valor: ajuste.valor, motivo: ajuste.motivo, criadoPorId: a.userId },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.calculo_ajustado",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { pessoa: calculo.person.name, campo: opcao.nome, de: opcao.valor, para: ajuste.valor, calculado: valorCalculado === null ? null : Number(valorCalculado), motivo: ajuste.motivo },
  });
  const r = await calcularCompetencia(a.tenantId, competenciaId);
  revalidarCompetencia(competenciaId);
  if (!r.ok) return erro(`Ajuste guardado, mas o cálculo não refez: ${r.erro}`);
  return { ok: true, texto: `${opcao.nome} de ${calculo.person.name} ajustado. Competência recalculada.` };
}

/** Retirar o ajuste: volta o valor do motor e recalcula. */
export async function retirarAjusteAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const ajuste = await prisma.dp2AjusteDeCalculo.findFirst({ where: { id: texto(fd, "ajusteId"), tenantId: a.tenantId }, include: { person: { select: { name: true } } } });
  if (!ajuste) return erro("Ajuste não encontrado.");
  const r0 = await competenciaEditavel(a, ajuste.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para mexer nos ajustes.");
  const calculo = await prisma.dp2Calculo.findFirst({ where: { tenantId: a.tenantId, competenciaId: ajuste.competenciaId, personId: ajuste.personId }, select: { itens: true } });
  const nome = nomeDoCampo(ajuste.campo, (calculo?.itens ?? []) as unknown as ItemDoHolerite[]);
  await prisma.dp2AjusteDeCalculo.delete({ where: { id: ajuste.id } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.ajuste_retirado",
    entityType: "Dp2Competencia",
    entityId: ajuste.competenciaId,
    metadata: { pessoa: ajuste.person.name, campo: nome, valor: Number(ajuste.valor), motivo: ajuste.motivo },
  });
  const r = await calcularCompetencia(a.tenantId, ajuste.competenciaId);
  revalidarCompetencia(ajuste.competenciaId);
  if (!r.ok) return erro(`Ajuste retirado, mas o cálculo não refez: ${r.erro}`);
  return { ok: true, texto: `Ajuste de ${nome} retirado. Competência recalculada.` };
}

// ─── Informações da apuração ────────────────────────────────────────────────

/**
 * Retenção de INSS sofrida e compensações de INSS, IRRF e PIS do mês
 * (25/11/2026, funcionalidade-769, parte 2; "Processos › Informações" da
 * Domínio). Não mudam o cálculo das pessoas: entram na apuração do que se
 * recolhe, que a tela refaz na hora.
 */
export async function incluirInformacaoDaApuracaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para mexer nas informações da apuração.");
  if (r0.comp.tipo !== "MENSAL") return erro("As informações da apuração são da folha mensal.");
  const lido = lerInformacao({ tipo: texto(fd, "tipo"), valor: texto(fd, "valor"), documento: texto(fd, "documento"), referencia: texto(fd, "referencia"), observacao: texto(fd, "observacao") });
  if (!lido.ok) return erro(lido.erro);
  const { info } = lido;
  await getPrisma().dp2InformacaoDaApuracao.create({ data: { tenantId: a.tenantId, competenciaId, ...info, criadoPorId: a.userId } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.informacao_apuracao_incluida",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { tipo: TIPOS_DE_INFORMACAO[info.tipo].curto, valor: info.valor, documento: info.documento, referencia: info.referencia },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `${TIPOS_DE_INFORMACAO[info.tipo].curto} incluída na apuração.` };
}

export async function retirarInformacaoDaApuracaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const info = await prisma.dp2InformacaoDaApuracao.findFirst({ where: { id: texto(fd, "informacaoId"), tenantId: a.tenantId } });
  if (!info) return erro("Informação não encontrada.");
  const r0 = await competenciaEditavel(a, info.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para mexer nas informações da apuração.");
  await prisma.dp2InformacaoDaApuracao.delete({ where: { id: info.id } });
  const nome = ehTipoDeInformacao(info.tipo) ? TIPOS_DE_INFORMACAO[info.tipo].curto : info.tipo;
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.informacao_apuracao_retirada",
    entityType: "Dp2Competencia",
    entityId: info.competenciaId,
    metadata: { tipo: nome, valor: Number(info.valor), documento: info.documento, referencia: info.referencia },
  });
  revalidarCompetencia(info.competenciaId);
  return { ok: true, texto: `${nome} retirada da apuração.` };
}

// ─── Saldo inicial das médias (25/11/2026, funcionalidade-747) ──────────────

/**
 * Grava o saldo inicial colado da Domínio ("Lançamento de Rubricas para
 * Médias"): as rubricas de cada mês antes do DP 2. Importar de novo troca o da
 * mesma pessoa, mês e rubrica. Entra como "a conferir": só vale na média
 * depois do Conferir.
 */
export async function importarSaldoInicialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const colado = texto(fd, "texto");
  if (!colado) return erro("Cole as linhas da Domínio: CPF; competência; rubrica; valor.");
  const prisma = getPrisma();
  const [pessoas, rubricas, primeira] = await Promise.all([
    colaboradoresDaEmpresa(a.tenantId, companyId),
    prisma.dp2Rubrica.findMany({ where: { tenantId: a.tenantId }, select: { id: true, codigo: true, nome: true, tipo: true, mediaFerias: true, mediaDecimo: true, mediaRescisao: true } }),
    prisma.dp2Competencia.findFirst({ where: { tenantId: a.tenantId, companyId, tipo: "MENSAL" }, orderBy: [{ ano: "asc" }, { mes: "asc" }], select: { ano: true, mes: true } }),
  ]);
  const antesDe = primeira ? `${primeira.ano}-${String(primeira.mes).padStart(2, "0")}` : undefined;
  const lido = lerSaldoInicial(colado, pessoas, rubricas, antesDe);
  if (lido.erros.length > 0) {
    const mais = lido.erros.length > 8 ? ` E mais ${lido.erros.length - 8}.` : "";
    return erro(`Nada gravado: corrija ${lido.erros.length === 1 ? "a linha" : `as ${lido.erros.length} linhas`} e cole de novo. ${lido.erros.slice(0, 8).join(" ")}${mais}`);
  }
  if (lido.linhas.length === 0) return erro("Nenhuma linha com CPF, competência, rubrica e valor.");
  await prisma.$transaction(
    lido.linhas.map((l) =>
      prisma.dp2SaldoInicialMedia.upsert({
        where: { personId_competencia_rubricaId: { personId: l.personId, competencia: l.competencia, rubricaId: l.rubricaId } },
        create: { tenantId: a.tenantId, companyId, ...l, criadoPorId: a.userId },
        update: { valor: l.valor, conferidoEm: null, criadoPorId: a.userId },
      })
    )
  );
  const quantas = new Set(lido.linhas.map((l) => l.personId)).size;
  await logAudit({ tenantId: a.tenantId, userId: a.userId, action: "folha.saldo_inicial_importado", entityType: "Company", entityId: companyId, metadata: { linhas: lido.linhas.length, pessoas: quantas } });
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `${lido.linhas.length} linha(s) de ${quantas} colaborador(es) a conferir.${lido.avisos.length ? ` ${lido.avisos.join(" ")}` : ""}` };
}

/** Confere o saldo inicial de uma pessoa (ou de todas da empresa): a partir daí ele entra na média. */
export async function conferirSaldoInicialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const personId = texto(fd, "personId") || undefined;
  const r = await getPrisma().dp2SaldoInicialMedia.updateMany({ where: { tenantId: a.tenantId, companyId, personId, conferidoEm: null }, data: { conferidoEm: new Date() } });
  if (r.count === 0) return erro("Não há saldo inicial a conferir.");
  await logAudit({ tenantId: a.tenantId, userId: a.userId, action: "folha.saldo_inicial_conferido", entityType: personId ? "Person" : "Company", entityId: personId ?? companyId, metadata: { linhas: r.count } });
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `${r.count} linha(s) conferida(s): já entram nas médias.` };
}

/** Apaga o saldo inicial de uma pessoa, para importar de novo. */
export async function apagarSaldoInicialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const personId = texto(fd, "personId");
  if (!personId) return erro("Escolha o colaborador.");
  const r = await getPrisma().dp2SaldoInicialMedia.deleteMany({ where: { tenantId: a.tenantId, companyId, personId } });
  await logAudit({ tenantId: a.tenantId, userId: a.userId, action: "folha.saldo_inicial_apagado", entityType: "Person", entityId: personId, metadata: { linhas: r.count } });
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `Saldo inicial apagado (${r.count} linha(s)).` };
}

// ─── Guias da folha (26/11/2026, funcionalidade-744) ────────────────────────

/**
 * Anexa a GFD (guia do FGTS Digital) da competência: o FGTS Digital não tem
 * API, então o DP baixa a guia no portal e anexa aqui o PDF, com o valor e o
 * vencimento. O PDF vai para Arquivos › Guias da empresa e a guia entra na
 * lista de guias (tipo FGTS); a competência confere o valor com o FGTS do mês.
 */
export async function anexarGfdAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  if (comp.tipo !== "MENSAL") return erro("A GFD daqui é a da folha mensal.");
  const lido = lerGuiaDoFgts(texto(fd, "valor"), texto(fd, "vencimento"));
  if (!lido.ok) return erro(lido.erro);
  const pdf = fd.get("arquivo");
  if (!(pdf instanceof File) || pdf.size === 0) return erro("Anexe o PDF da GFD.");
  if (pdf.size > 5 * 1024 * 1024) return erro("O PDF passa de 5 MB.");
  const pasta = await pastaDoModeloDaEmpresa(a.tenantId, comp.companyId, "guias");
  if (!pasta) return erro("A empresa não tem a pasta Guias nos Arquivos (ela vem do modelo de pastas do escritório).");
  const competencia = `${comp.ano}-${String(comp.mes).padStart(2, "0")}`;
  const nome = `GFD FGTS Digital ${String(comp.mes).padStart(2, "0")}-${comp.ano}.pdf`;
  const guardado = await guardarArquivo({ tenantId: a.tenantId, folderId: pasta, arquivo: new File([await pdf.arrayBuffer()], nome, { type: pdf.type || "application/pdf" }), uploadedByUserId: a.userId });
  if (!guardado.ok) return erro(`Não deu para guardar o PDF: ${guardado.erro}`);
  const guia = await getPrisma().guia.create({
    data: {
      tenantId: a.tenantId,
      companyId: comp.companyId,
      tipo: "FGTS",
      descricao: `GFD do FGTS Digital · ${String(comp.mes).padStart(2, "0")}/${comp.ano}`,
      competencia,
      vencimento: lido.vencimento,
      valor: lido.valor,
      origem: "DP2",
      driveFileId: guardado.arquivoId,
      emitidaPorId: a.userId,
    },
    select: { id: true },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.gfd_anexada",
    entityType: "Guia",
    entityId: guia.id,
    metadata: { competencia, valor: lido.valor, vencimento: lido.vencimento },
  });
  revalidarCompetencia(competenciaId);
  revalidatePath("/guias");
  return { ok: true, texto: "GFD anexada: está em Arquivos › Guias e na lista de guias." };
}

// ─── Totalizadores do eSocial (26/11/2026, funcionalidade-755) ─────────────

/**
 * Importa os totalizadores do eSocial (S-5001, S-5002, S-5003, S-5011, S-5013)
 * da competência a partir dos XML de retorno (soltos ou .zip). Só entra o que
 * é do período e do empregador da competência; importar de novo troca o do
 * mesmo tipo, período e CPF. Liga cada um ao evento da fila pelo recibo de
 * origem, quando ele está registrado.
 */
export async function importarTotalizadoresAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const comp = r0.comp;
  if (comp.tipo !== "MENSAL" && comp.tipo !== "DECIMO_2") return erro("Os totalizadores são da folha mensal e do 13º (2ª parcela).");
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: comp.companyId, tenantId: a.tenantId }, select: { cnpj: true } });
  const raiz = (empresa?.cnpj ?? "").replace(/\D/g, "").slice(0, 8);
  const arquivos = fd.getAll("arquivo").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (arquivos.length === 0) return erro("Escolha os .xml de retorno ou o .zip do eSocial.");
  const conteudos = await Promise.all(arquivos.map(async (f) => ({ nome: f.name, conteudo: new Uint8Array(await f.arrayBuffer()) })));
  const leitura = lerTotalizadores(conteudos);
  const perApur = comp.tipo === "DECIMO_2" ? String(comp.ano) : `${comp.ano}-${String(comp.mes).padStart(2, "0")}`;
  const doPeriodo = leitura.lidos.filter((l) => l.perApur === perApur);
  const deOutraEmpresa = doPeriodo.filter((l) => raiz && l.empregador.slice(0, 8) !== raiz);
  const validos = doPeriodo.filter((l) => !raiz || l.empregador.slice(0, 8) === raiz);
  if (validos.length === 0) {
    const fora = leitura.lidos.length - doPeriodo.length;
    return erro(
      [
        "Nenhum totalizador desta competência e desta empresa nos arquivos.",
        fora ? `${fora} é(são) de outro período.` : "",
        deOutraEmpresa.length ? `${deOutraEmpresa.length} é(são) de outro empregador.` : "",
        ...leitura.problemas,
      ]
        .filter(Boolean)
        .join(" ")
    );
  }
  const cpfs = [...new Set(validos.map((v) => v.cpf).filter((c): c is string => !!c))];
  const recibos = [...new Set(validos.map((v) => v.reciboBase).filter((r): r is string => !!r))];
  const [pessoas, eventos] = await Promise.all([
    cpfs.length ? prisma.person.findMany({ where: { tenantId: a.tenantId, currentCompanyId: comp.companyId }, select: { id: true, cpf: true } }) : [],
    recibos.length ? prisma.dp2EventoEsocial.findMany({ where: { tenantId: a.tenantId, companyId: comp.companyId, recibo: { in: recibos } }, select: { id: true, recibo: true } }) : [],
  ]);
  const pessoaDoCpf = new Map(pessoas.map((p) => [(p.cpf ?? "").replace(/\D/g, ""), p.id]));
  const eventoDoRecibo = new Map(eventos.map((e) => [e.recibo, e.id]));
  await prisma.$transaction([
    ...validos.map((v) => prisma.dp2TotalizadorEsocial.deleteMany({ where: { tenantId: a.tenantId, companyId: comp.companyId, tipo: v.tipo, perApur: v.perApur, cpf: v.cpf } })),
    prisma.dp2TotalizadorEsocial.createMany({
      data: validos.map((v) => ({
        tenantId: a.tenantId,
        companyId: comp.companyId,
        competenciaId,
        personId: v.cpf ? (pessoaDoCpf.get(v.cpf) ?? null) : null,
        tipo: v.tipo,
        perApur: v.perApur,
        cpf: v.cpf,
        reciboBase: v.reciboBase,
        eventoId: v.reciboBase ? (eventoDoRecibo.get(v.reciboBase) ?? null) : null,
        valores: v.valores,
        arquivo: v.arquivo.slice(0, 255),
        importadoPorId: a.userId,
      })),
    }),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_totalizadores_importados",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { perApur, lidos: validos.length, outroPeriodo: leitura.lidos.length - doPeriodo.length, outraEmpresa: deOutraEmpresa.length },
  });
  revalidarCompetencia(competenciaId);
  const contagem = (["S-5001", "S-5002", "S-5003", "S-5011", "S-5013"] as const)
    .map((t) => [t, validos.filter((v) => v.tipo === t).length] as const)
    .filter(([, q]) => q > 0)
    .map(([t, q]) => `${q} ${t}`)
    .join(", ");
  const avisos = [deOutraEmpresa.length ? `${deOutraEmpresa.length} de outro empregador ficaram de fora.` : "", ...leitura.problemas].filter(Boolean).join(" ");
  return { ok: true, texto: `Totalizadores importados: ${contagem}.${avisos ? ` ${avisos}` : ""}` };
}

// ─── Comparativo com a Domínio ──────────────────────────────────────────────

export async function importarComparativoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const lido = lerComparativo(texto(fd, "texto"));
  if (lido.linhas.length === 0) return erro(lido.erros[0] ?? "Cole as linhas da Domínio: CPF; proventos; descontos; líquido; INSS; IRRF; FGTS.");

  const prisma = getPrisma();
  const pessoas = await prisma.person.findMany({ where: { tenantId: a.tenantId, currentCompanyId: r0.comp.companyId }, select: { id: true, cpf: true } });
  const porCpf = new Map(pessoas.filter((p) => p.cpf).map((p) => [p.cpf!.replace(/\D/g, ""), p.id]));
  let gravadas = 0;
  const naoAchados: string[] = [];
  for (const l of lido.linhas) {
    const personId = porCpf.get(l.cpf);
    if (!personId) {
      naoAchados.push(l.cpf);
      continue;
    }
    const dados = { proventos: l.proventos, descontos: l.descontos, liquido: l.liquido, inss: l.inss, irrf: l.irrf, fgts: l.fgts, importadoPorId: a.userId, importadoEm: new Date() };
    await prisma.dp2Comparativo.upsert({
      where: { competenciaId_personId: { competenciaId, personId } },
      create: { tenantId: a.tenantId, competenciaId, personId, ...dados },
      update: dados,
    });
    gravadas++;
  }
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.comparativo_importado",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { gravadas, naoAchados: naoAchados.length },
  });
  revalidarCompetencia(competenciaId);
  const partes = [`${gravadas} pessoa(s) com os valores da Domínio.`];
  if (naoAchados.length) partes.push(`CPF não encontrado na empresa: ${naoAchados.slice(0, 5).join(", ")}${naoAchados.length > 5 ? "…" : ""}.`);
  if (lido.erros.length) partes.push(`${lido.erros.length} linha(s) ignorada(s).`);
  return { ok: gravadas > 0, texto: partes.join(" ") };
}

// ─── Contrato do colaborador ────────────────────────────────────────────────

/** Banco, agência e conta digitados (só dígitos; o dígito verificador à parte). */
function contaBancaria(fd: FormData) {
  const banco = texto(fd, "bancoCodigo").replace(/\D/g, "");
  return {
    bancoCodigo: banco ? banco.padStart(3, "0").slice(-3) : null,
    agencia: texto(fd, "agencia").replace(/\D/g, "").slice(0, 10) || null,
    agenciaDigito: texto(fd, "agenciaDigito").toUpperCase().slice(0, 2) || null,
    conta: texto(fd, "conta").replace(/\D/g, "").slice(0, 20) || null,
    contaDigito: texto(fd, "contaDigito").toUpperCase().slice(0, 2) || null,
  };
}

const INSALUBRIDADES = ["NENHUM", "MINIMO", "MEDIO", "MAXIMO"];

export async function salvarVinculoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const pessoa = await prisma.person.findFirst({
    where: { id: texto(fd, "personId"), tenantId: a.tenantId, isInternal: false },
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!pessoa?.currentCompanyId) return erro("Colaborador não encontrado em uma empresa cliente.");
  const recusa = await recusaDoFoco(a.ctx, [pessoa.currentCompanyId]);
  if (recusa) return erro(recusa);

  const salarioBase = lerNumero(texto(fd, "salarioBase"));
  if (!salarioValido(salarioBase, texto(fd, "categoria"))) return erro(SALARIO_OBRIGATORIO);
  const tipoSalario = texto(fd, "tipoSalario") === "HORISTA" ? "HORISTA" : "MENSAL";
  const horasMensais = lerInteiro(texto(fd, "horasMensais")) ?? 220;
  if (horasMensais < 1 || horasMensais > 300) return erro("Horas por mês entre 1 e 300.");
  const dependentesIrrf = lerInteiro(texto(fd, "dependentesIrrf")) ?? 0;
  const filhosSalarioFamilia = lerInteiro(texto(fd, "filhosSalarioFamilia")) ?? 0;
  if (dependentesIrrf < 0 || dependentesIrrf > 30 || filhosSalarioFamilia < 0 || filhosSalarioFamilia > 30) return erro("Confira dependentes e filhos.");
  const insalubridade = INSALUBRIDADES.includes(texto(fd, "insalubridade")) ? texto(fd, "insalubridade") : "NENHUM";

  const dados = {
    companyId: pessoa.currentCompanyId,
    salarioBase,
    tipoSalario,
    horasMensais,
    dependentesIrrf,
    filhosSalarioFamilia,
    insalubridade,
    periculosidade: marcado(fd, "periculosidade"),
    valeTransporte: marcado(fd, "valeTransporte"),
    vtCustoDiario: lerNumero(texto(fd, "vtCustoDiario")),
    aprendiz: marcado(fd, "aprendiz"),
    observacoes: texto(fd, "observacoes") || null,
    matricula: texto(fd, "matricula").slice(0, 30) || null,
    dadosEsocial: lerDadosEsocial({
      sexo: texto(fd, "esocial_sexo"),
      racaCor: texto(fd, "esocial_racaCor"),
      estadoCivil: texto(fd, "esocial_estadoCivil"),
      grauInstrucao: texto(fd, "esocial_grauInstrucao"),
      codigoMunicipio: texto(fd, "esocial_codigoMunicipio"),
      cbo: texto(fd, "esocial_cbo"),
      tipoContrato: texto(fd, "esocial_tipoContrato"),
      dataTermino: texto(fd, "esocial_dataTermino"),
      tipoJornada: texto(fd, "esocial_tipoJornada"),
      descricaoJornada: texto(fd, "esocial_descricaoJornada"),
      estagioNatureza: texto(fd, "esocial_estagioNatureza"),
      estagioNivel: texto(fd, "esocial_estagioNivel"),
      estagioArea: texto(fd, "esocial_estagioArea"),
      estagioApolice: texto(fd, "esocial_estagioApolice"),
      estagioPrevisaoTermino: texto(fd, "esocial_estagioPrevisaoTermino"),
      estagioCnpjInstituicao: texto(fd, "esocial_estagioCnpjInstituicao"),
      estagioCnpjAgente: texto(fd, "esocial_estagioCnpjAgente"),
      estagioCpfSupervisor: texto(fd, "esocial_estagioCpfSupervisor"),
    }),
    categoria: /^\d{3}$/.test(texto(fd, "categoria")) ? texto(fd, "categoria") : marcado(fd, "aprendiz") ? "103" : "101",
    ...contaBancaria(fd),
    tipoConta: texto(fd, "tipoConta") === "POUPANCA" ? "POUPANCA" : "CORRENTE",
  };
  if (dados.bancoCodigo && !/^\d{3}$/.test(dados.bancoCodigo)) return erro("O banco é o código de 3 dígitos (ex.: 341).");
  const fixas = await rubricasFixasDoFormulario(a.tenantId, fd);
  if (!fixas.ok) return erro(fixas.erro);
  await prisma.$transaction(async (tx) => {
    await tx.dp2Vinculo.upsert({ where: { personId: pessoa.id }, create: { tenantId: a.tenantId, personId: pessoa.id, ...dados }, update: dados });
    // Só quem manda a lista (o modal do contrato) troca as rubricas fixas.
    if (fd.has("rubricasFixas")) await gravarRubricasFixas(a.tenantId, pessoa.id, fixas.fixas, a.userId, tx);
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.vinculo_salvo",
    entityType: "Person",
    entityId: pessoa.id,
    metadata: { nome: pessoa.name, salarioBase, tipoSalario, rubricasFixas: fd.has("rubricasFixas") ? fixas.fixas.length : null },
  });
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `Contrato de ${pessoa.name} salvo.` };
}

/** As rubricas fixas do formulário do contrato (campo JSON `rubricasFixas`), conferidas (funcionalidade-767). */
async function rubricasFixasDoFormulario(tenantId: string, fd: FormData) {
  if (!fd.has("rubricasFixas")) return { ok: true as const, fixas: [] };
  const rubricas = await getPrisma().dp2Rubrica.findMany({ where: { tenantId }, select: { id: true, nome: true, papel: true, tipo: true, lancamento: true, ativa: true } });
  return lerRubricasFixas(texto(fd, "rubricasFixas"), rubricas);
}

// ─── Configuração da empresa ────────────────────────────────────────────────

export async function salvarConfigDaEmpresaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_configuracao", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const prisma = getPrisma();
  const convencaoId = texto(fd, "convencaoId") || null;
  if (convencaoId && !(await prisma.dp2Convencao.findFirst({ where: { id: convencaoId, tenantId: a.tenantId }, select: { id: true } }))) {
    return erro("Convenção não encontrada.");
  }
  const ratAliquota = lerNumero(texto(fd, "ratAliquota"));
  const fap = lerNumero(texto(fd, "fap"));
  const terceirosAliquota = lerNumero(texto(fd, "terceirosAliquota"));
  if (ratAliquota === null || ratAliquota < 0 || ratAliquota > 3) return erro("RAT entre 0% e 3%.");
  if (fap === null || fap < 0.5 || fap > 2) return erro("FAP entre 0,5 e 2.");
  if (terceirosAliquota === null || terceirosAliquota < 0 || terceirosAliquota > 10) return erro("Terceiros entre 0% e 10%.");
  const fpas = texto(fd, "fpas").replace(/\D/g, "");
  const codTercs = texto(fd, "codTercs").replace(/\D/g, "");
  const classTrib = texto(fd, "classTrib").replace(/\D/g, "");
  if (fpas && fpas.length !== 3) return erro("O FPAS tem 3 dígitos.");
  if (codTercs && codTercs.length !== 4) return erro("O código de terceiros tem 4 dígitos.");
  if (classTrib && classTrib.length !== 2) return erro("A classificação tributária tem 2 dígitos.");
  const dados = {
    convencaoId,
    patronalNoDas: marcado(fd, "patronalNoDas"),
    pisSobreFolha: marcado(fd, "pisSobreFolha"),
    ratAliquota,
    fap,
    terceirosAliquota,
    fpas: fpas || null,
    codTercs: codTercs || null,
    classTrib: classTrib || null,
    ...contaBancaria(fd),
    convenio: texto(fd, "convenio").slice(0, 20) || null,
  };
  if (dados.bancoCodigo && !/^\d{3}$/.test(dados.bancoCodigo)) return erro("O banco é o código de 3 dígitos (ex.: 341).");
  await prisma.dp2EmpresaConfig.upsert({ where: { companyId }, create: { tenantId: a.tenantId, companyId, ...dados }, update: dados });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.empresa_configurada",
    entityType: "Company",
    entityId: companyId,
    metadata: dados,
  });
  revalidatePath("/dp2/configuracao");
  return { ok: true, texto: "Configuração salva. Recalcule as competências abertas." };
}

/** Médico do PCMSO e responsável pelos registros ambientais (S-2220 e S-2240). */
export async function salvarResponsaveisDeSstAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_configuracao", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const campos = ["medicoNome", "medicoCpf", "medicoCrm", "medicoUf", "ambientalNome", "ambientalCpf", "ambientalOrgao", "ambientalOrgaoNome", "ambientalNumero", "ambientalUf"];
  const sst = lerResponsaveis(Object.fromEntries(campos.map((k) => [k, texto(fd, k)])));
  await getPrisma().dp2EmpresaConfig.upsert({ where: { companyId }, create: { tenantId: a.tenantId, companyId, sst }, update: { sst } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.sst_responsaveis",
    entityType: "Company",
    entityId: companyId,
    metadata: { medico: sst.medicoNome, ambiental: sst.ambientalNome },
  });
  revalidatePath("/dp2/configuracao");
  return { ok: true, texto: "Responsáveis de saúde e segurança salvos. Gere de novo os eventos com pendência." };
}

// ─── Cadastros do escritório ────────────────────────────────────────────────

export async function salvarTabelaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_tabelas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 grava tabelas oficiais.");
  const tipo = texto(fd, "tipo") as TipoDeTabela;
  if (!TIPOS_DE_TABELA.includes(tipo)) return erro("Escolha a tabela.");
  const vigencia = texto(fd, "vigencia");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(vigencia)) return erro("Informe a competência em que a tabela passa a valer.");

  // Faixas: uma por linha, "limite; alíquota; dedução" (o limite da última faixa do IRRF fica vazio).
  const faixas = texto(fd, "faixas")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [ate, aliquota, deducao] = l.split(";").map((p) => lerNumero(p.trim()));
      return { ate, aliquota, deducao };
    });
  const bruto: Record<string, unknown> = {
    faixas,
    valor: lerNumero(texto(fd, "valor")),
    limite: lerNumero(texto(fd, "limite")),
    cota: lerNumero(texto(fd, "cota")),
    deducaoDependente: lerNumero(texto(fd, "deducaoDependente")),
    descontoSimplificado: lerNumero(texto(fd, "descontoSimplificado")),
    minimoRetencao: lerNumero(texto(fd, "minimoRetencao")) ?? 10,
  };
  if (tipo === "IRRF" && texto(fd, "reducaoIsentoAte")) {
    bruto.reducao = {
      isentoAte: lerNumero(texto(fd, "reducaoIsentoAte")),
      reducaoMaxima: lerNumero(texto(fd, "reducaoMaxima")),
      ate: lerNumero(texto(fd, "reducaoAte")),
      constante: lerNumero(texto(fd, "reducaoConstante")),
      fator: lerNumero(texto(fd, "reducaoFator")),
      noDecimo: marcado(fd, "reducaoNoDecimo"),
    };
  }
  const lido = lerDadosDaTabela(tipo, bruto);
  if (!lido.ok) return erro(lido.erro);
  const observacao = texto(fd, "observacao").slice(0, 500) || null;
  await getPrisma().dp2TabelaOficial.upsert({
    where: { tenantId_tipo_vigencia: { tenantId: a.tenantId, tipo, vigencia } },
    create: { tenantId: a.tenantId, tipo, vigencia, dados: lido.dados, observacao, criadaPorId: a.userId },
    update: { dados: lido.dados, observacao, criadaPorId: a.userId },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.tabela_salva",
    entityType: "Dp2TabelaOficial",
    metadata: { tipo, vigencia },
  });
  revalidatePath("/dp2/tabelas");
  return { ok: true, texto: "Tabela gravada. Ela vale a partir da competência informada." };
}

export async function salvarRubricaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rubricas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas rubricas.");
  const prisma = getPrisma();
  const id = texto(fd, "id");
  const nome = texto(fd, "nome");
  if (nome.length < 2) return erro("Dê um nome à rubrica.");
  const comum = {
    nome: nome.slice(0, 120),
    naturezaEsocial: texto(fd, "naturezaEsocial").slice(0, 4) || null,
    contaDebito: texto(fd, "contaDebito").slice(0, 40) || null,
    contaCredito: texto(fd, "contaCredito").slice(0, 40) || null,
    codIncCP: /^\d{2}$/.test(texto(fd, "codIncCP")) ? texto(fd, "codIncCP") : null,
    codIncIRRF: /^\d{2}$/.test(texto(fd, "codIncIRRF")) ? texto(fd, "codIncIRRF") : null,
    codIncFGTS: /^\d{2}$/.test(texto(fd, "codIncFGTS")) ? texto(fd, "codIncFGTS") : null,
  };
  if (id) {
    const atual = await prisma.dp2Rubrica.findFirst({ where: { id, tenantId: a.tenantId } });
    if (!atual) return erro("Rubrica não encontrada.");
    // As do motor guardam tipo e incidências: são elas que a lei define.
    const livre = atual.papel === null;
    await prisma.dp2Rubrica.update({
      where: { id },
      data: {
        ...comum,
        ...(livre
          ? {
              tipo: TIPOS_DE_RUBRICA.includes(texto(fd, "tipo") as never) ? texto(fd, "tipo") : atual.tipo,
              incideInss: marcado(fd, "incideInss"),
              incideFgts: marcado(fd, "incideFgts"),
              incideIrrf: marcado(fd, "incideIrrf"),
              ...mediasDoFormulario(fd),
              ativa: marcado(fd, "ativa"),
            }
          : {}),
      },
    });
    await logAudit({
      tenantId: a.tenantId,
      userId: a.userId,
      action: "folha.rubrica_salva",
      entityType: "Dp2Rubrica",
      entityId: id,
      metadata: { nome },
    });
    revalidatePath("/dp2/rubricas");
    return { ok: true, texto: "Rubrica salva." };
  }

  const codigo = texto(fd, "codigo");
  if (!/^[0-9A-Za-z]{1,10}$/.test(codigo)) return erro("Código com até 10 letras ou números.");
  if (await prisma.dp2Rubrica.findFirst({ where: { tenantId: a.tenantId, codigo }, select: { id: true } })) return erro(`Já existe a rubrica ${codigo}.`);
  const tipo = texto(fd, "tipo");
  if (!TIPOS_DE_RUBRICA.includes(tipo as never) || tipo === "INFORMATIVA") return erro("Rubrica livre é provento ou desconto.");
  // Rubrica livre é sempre de valor: horas e dias só fazem sentido nas do
  // motor, que sabem transformar quantidade em dinheiro.
  const criada = await prisma.dp2Rubrica.create({
    data: {
      tenantId: a.tenantId,
      codigo,
      tipo,
      papel: null,
      lancamento: "VALOR",
      incideInss: marcado(fd, "incideInss"),
      incideFgts: marcado(fd, "incideFgts"),
      incideIrrf: marcado(fd, "incideIrrf"),
      ...mediasDoFormulario(fd),
      ...comum,
    },
    select: { id: true },
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.rubrica_salva",
    entityType: "Dp2Rubrica",
    entityId: criada.id,
    metadata: { nome, codigo },
  });
  revalidatePath("/dp2/rubricas");
  return { ok: true, texto: `Rubrica ${codigo} criada.` };
}

export async function salvarConvencaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_convencoes", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas convenções.");
  const nome = texto(fd, "nome");
  if (nome.length < 3) return erro("Dê um nome à convenção.");
  const he50 = lerNumero(texto(fd, "he50")) ?? 50;
  const he100 = lerNumero(texto(fd, "he100")) ?? 100;
  const noturno = lerNumero(texto(fd, "noturno")) ?? 20;
  if (he50 < 50) return erro("Hora extra de no mínimo 50% (CF art. 7º, XVI).");
  if (noturno < 20) return erro("Adicional noturno de no mínimo 20% (CLT art. 73).");
  const dataBase = lerInteiro(texto(fd, "dataBase"));
  const data = {
    nome: nome.slice(0, 160),
    sindicato: texto(fd, "sindicato").slice(0, 160) || null,
    cnpjSindicato: texto(fd, "cnpjSindicato").replace(/\D/g, "").slice(0, 14) || null,
    dataBase: dataBase && dataBase >= 1 && dataBase <= 12 ? dataBase : null,
    vigenciaInicio: texto(fd, "vigenciaInicio") || null,
    vigenciaFim: texto(fd, "vigenciaFim") || null,
    piso: lerNumero(texto(fd, "piso")),
    he50,
    he100,
    noturno,
    observacoes: texto(fd, "observacoes") || null,
    // A caixa "Ativa" só existe na edição: sem ela (criação), nasce ativa.
    ativa: fd.has("temAtiva") ? marcado(fd, "ativa") : true,
  };
  const prisma = getPrisma();
  const id = texto(fd, "id");
  let entityId = id;
  if (id) {
    if (!(await prisma.dp2Convencao.findFirst({ where: { id, tenantId: a.tenantId }, select: { id: true } }))) return erro("Convenção não encontrada.");
    await prisma.dp2Convencao.update({ where: { id }, data });
  } else {
    entityId = (await prisma.dp2Convencao.create({ data: { tenantId: a.tenantId, ...data }, select: { id: true } })).id;
  }
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.convencao_salva",
    entityType: "Dp2Convencao",
    entityId,
    metadata: { nome },
  });
  revalidatePath("/dp2/convencoes");
  return { ok: true, texto: id ? "Convenção salva." : "Convenção criada." };
}

// ─── Fase 2 (12/11/2026): eventos importados, link do cliente e saídas ──────

function paraImportar(r: { id: string; codigo: string; nome: string; tipo: string; papel: string | null; lancamento: string; ativa: boolean }): RubricaParaImportar {
  return {
    id: r.id,
    codigo: r.codigo,
    nome: r.nome,
    tipo: r.tipo as RubricaParaImportar["tipo"],
    papel: ehPapel(r.papel) ? r.papel : null,
    lancamento: r.lancamento as RubricaParaImportar["lancamento"],
    ativa: r.ativa,
  };
}

/**
 * Eventos colados de uma planilha ou do relatório do Pontomais. Com "trocar",
 * os lançamentos da mesma origem que já estavam na competência saem antes:
 * colar o relatório de novo não duplica as horas.
 */
export async function importarEventosAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA") return erro("Competência fechada: reabra para lançar.");
  if (r0.comp.tipo !== "MENSAL") return erro("Lançamentos variáveis são só da folha mensal.");
  const origem = texto(fd, "origem") === "PONTO" ? "PONTO" : "PLANILHA";

  const prisma = getPrisma();
  const [rubricas, pessoas] = await Promise.all([
    prisma.dp2Rubrica.findMany({ where: { tenantId: a.tenantId } }),
    prisma.person.findMany({
      where: { tenantId: a.tenantId, currentCompanyId: r0.comp.companyId, isInternal: false, dp2Vinculo: { isNot: null } },
      select: { id: true, name: true, cpf: true },
    }),
  ]);
  const lido = importarEventos(
    texto(fd, "texto"),
    rubricas.map(paraImportar).filter(podeImportar),
    pessoas.map((p) => ({ id: p.id, nome: p.name, cpf: p.cpf }))
  );
  if (lido.eventos.length === 0) return erro(lido.avisos[0] ?? "Nenhum evento encontrado no texto colado.");

  const trocar = marcado(fd, "trocar");
  await prisma.$transaction([
    ...(trocar ? [prisma.dp2Evento.deleteMany({ where: { tenantId: a.tenantId, competenciaId, origem } })] : []),
    prisma.dp2Evento.createMany({
      data: lido.eventos.map((e) => ({
        tenantId: a.tenantId,
        competenciaId,
        personId: e.personId,
        rubricaId: e.rubricaId,
        quantidade: e.quantidade,
        valor: e.valor,
        origem,
        criadoPorId: a.userId,
      })),
    }),
    ...(r0.comp.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: competenciaId }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.eventos_importados",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { origem, eventos: lido.eventos.length, trocou: trocar, avisos: lido.avisos.length },
  });
  revalidarCompetencia(competenciaId);
  const ignoradas = lido.colunas.filter((c) => !c.rubrica).map((c) => c.cabecalho);
  const partes = [`${lido.eventos.length} lançamento(s) importado(s).`];
  if (ignoradas.length) partes.push(`Colunas ignoradas: ${ignoradas.join(", ")}.`);
  if (lido.avisos.length) partes.push(lido.avisos.slice(0, 3).join(" "));
  return { ok: true, texto: partes.join(" ") };
}

/** O link para o cliente informar os eventos do mês sem login. Um aberto por competência: pedir de novo cancela o anterior. */
export async function pedirEventosAoClienteAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (r0.comp.situacao === "FECHADA" || r0.comp.tipo !== "MENSAL") return erro("O link é para a folha mensal ainda aberta.");
  const prisma = getPrisma();
  const pedido = await prisma.$transaction(async (tx) => {
    await tx.dp2PedidoDeEventos.updateMany({ where: { tenantId: a.tenantId, competenciaId, situacao: "ABERTO" }, data: { situacao: "CANCELADO" } });
    return tx.dp2PedidoDeEventos.create({
      data: { tenantId: a.tenantId, competenciaId, token: novoToken(), expiraEm: new Date(Date.now() + DIAS_DO_LINK * 86_400_000), criadoPorId: a.userId },
      select: { id: true },
    });
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.pedido_de_eventos",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { pedidoId: pedido.id },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: `Link criado. Copie e mande ao cliente (vale por ${DIAS_DO_LINK} dias).` };
}

export async function cancelarPedidoDeEventosAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const pedido = await prisma.dp2PedidoDeEventos.findFirst({ where: { id: texto(fd, "pedidoId"), tenantId: a.tenantId } });
  if (!pedido) return erro("Link não encontrado.");
  const r0 = await competenciaEditavel(a, pedido.competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  if (pedido.situacao !== "ABERTO") return erro("O link já não está aberto.");
  await prisma.dp2PedidoDeEventos.update({ where: { id: pedido.id }, data: { situacao: "CANCELADO" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.pedido_cancelado",
    entityType: "Dp2Competencia",
    entityId: pedido.competenciaId,
  });
  revalidarCompetencia(pedido.competenciaId);
  return { ok: true, texto: "Link cancelado: quem abrir verá que ele não vale mais." };
}

export async function guardarHoleritesAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const r = await guardarHoleritesNosArquivos(a.tenantId, competenciaId, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.holerites_guardados",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
  });
  revalidatePath("/arquivos");
  return { ok: true, texto: r.texto };
}

export async function gerarRemessaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_competencia", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const r0 = await competenciaEditavel(a, competenciaId);
  if ("erro" in r0) return erro(r0.erro!);
  const data = texto(fd, "dataPagamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe a data do pagamento.");
  const r = await gerarRemessaDaCompetencia(a.tenantId, competenciaId, data, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.remessa_gerada",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { remessaId: r.id, dataPagamento: data },
  });
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: r.texto };
}

export async function salvarContasDaFolhaAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rubricas", "gerir");
  if (!a) return erro("Só quem gere o DP 2 mexe nas contas da folha.");
  const contas = Object.fromEntries(CAMPOS_DAS_CONTAS.map((c) => [c.chave, texto(fd, c.chave).slice(0, 40)]));
  await getPrisma().dp2ContasDaFolha.upsert({ where: { tenantId: a.tenantId }, create: { tenantId: a.tenantId, contas }, update: { contas } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.contas_salvas",
    entityType: "Dp2Rubrica",
    metadata: contas,
  });
  revalidatePath("/dp2/rubricas");
  return { ok: true, texto: "Contas da folha salvas." };
}
// ─── eSocial (fase 3a, 12/11/2026): gerar e conferir, sem assinar e enviar ──

export async function gerarTabelasEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const iniValid = texto(fd, "iniValid");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(iniValid)) return erro("Informe desde quando as tabelas valem.");
  const r = await gerarTabelas(a.tenantId, companyId, iniValid, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_tabelas",
    entityType: "Company",
    entityId: companyId,
    metadata: { iniValid, total: r.total, prontos: r.prontos },
  });
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: `${r.total} evento(s) de tabela: ${r.prontos} pronto(s), ${r.comPendencia} com pendência.` };
}

export async function gerarPeriodicosEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId: a.tenantId }, select: { companyId: true } });
  if (!comp) return erro("Competência não encontrada.");
  const recusa = await recusaDoFoco(a.ctx, [comp.companyId]);
  if (recusa) return erro(recusa);
  const dtPgto = texto(fd, "dtPgto");
  const r = await gerarPeriodicos(a.tenantId, competenciaId, /^\d{4}-\d{2}-\d{2}$/.test(dtPgto) ? dtPgto : null, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_periodicos",
    entityType: "Dp2Competencia",
    entityId: competenciaId,
    metadata: { total: r.total, prontos: r.prontos },
  });
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: `${r.total} evento(s) periódico(s): ${r.prontos} pronto(s), ${r.comPendencia} com pendência.` };
}

// ─── eSocial não periódicos (fase 3b, 12/11/2026) ───────────────────────────

/** A pessoa do evento: do escritório, de uma empresa cliente, dentro da faixa. */
async function pessoaDoEvento(a: Acesso, personId: string): Promise<{ id: string; name: string; companyId: string } | string> {
  const p = await getPrisma().person.findFirst({
    where: { id: personId, tenantId: a.tenantId, isInternal: false },
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!p?.currentCompanyId) return "Colaborador não encontrado.";
  const recusa = await recusaDoFoco(a.ctx, [p.currentCompanyId]);
  if (recusa) return recusa;
  return { id: p.id, name: p.name, companyId: p.currentCompanyId };
}

// ─── Recibo, exclusão e reabertura no eSocial (25/11/2026, funcionalidade-754) ─

/** O evento da fila na empresa em foco. */
async function eventoDaFila(a: Acesso, eventoId: string) {
  const ev = await getPrisma().dp2EventoEsocial.findFirst({ where: { id: eventoId, tenantId: a.tenantId }, select: { id: true, tipo: true, referencia: true, companyId: true } });
  if (!ev) return "Evento não encontrado.";
  const recusa = await recusaDoFoco(a.ctx, [ev.companyId]);
  return recusa ?? ev;
}

/**
 * Registra o recibo de um evento enviado por fora do Connect (enquanto o envio
 * pelo Assinador não está ligado): o evento fica aceito, e o que ele
 * retifica, exclui ou reabre muda de situação.
 */
export async function registrarReciboEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const ev = await eventoDaFila(a, texto(fd, "eventoId"));
  if (typeof ev === "string") return erro(ev);
  const r = await registrarRecibo(a.tenantId, ev.id, texto(fd, "recibo"));
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_recibo_registrado",
    entityType: "Dp2EventoEsocial",
    entityId: ev.id,
    metadata: { tipo: ev.tipo, referencia: ev.referencia, recibo: texto(fd, "recibo"), alvo: r.alvo },
  });
  revalidatePath("/dp2/esocial");
  const doAlvo = r.alvo === "EXCLUIDO" ? " O evento excluído ficou marcado." : r.alvo === "RETIFICADO" ? " O evento retificado ficou marcado." : r.alvo === "REABERTO" ? " O fechamento ficou reaberto." : "";
  return { ok: true, texto: `${ev.tipo} aceito com o recibo.${doAlvo}` };
}

/** S-3000 de um evento aceito, a partir da fila. */
export async function excluirNoEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const ev = await eventoDaFila(a, texto(fd, "eventoId"));
  if (typeof ev === "string") return erro(ev);
  const r = await gerarExclusao(a.tenantId, ev.id, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_exclusao",
    entityType: "Dp2EventoEsocial",
    entityId: ev.id,
    metadata: { tipo: ev.tipo, referencia: ev.referencia },
  });
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: r.prontos ? `S-3000 do ${ev.tipo} pronto na fila.` : `S-3000 do ${ev.tipo} gerado com pendência: veja o que falta na fila.` };
}

/** S-1298 da competência (o período fechado no eSocial), para retificar os periódicos. */
export async function reabrirNoEsocialAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const competenciaId = texto(fd, "competenciaId");
  const comp = await getPrisma().dp2Competencia.findFirst({ where: { id: competenciaId, tenantId: a.tenantId }, select: { companyId: true } });
  if (!comp) return erro("Competência não encontrada.");
  const recusa = await recusaDoFoco(a.ctx, [comp.companyId]);
  if (recusa) return erro(recusa);
  const r = await gerarReabertura(a.tenantId, competenciaId, a.userId);
  if (!r.ok) return erro(r.erro);
  await logAudit({ tenantId: a.tenantId, userId: a.userId, action: "folha.esocial_reabertura", entityType: "Dp2Competencia", entityId: competenciaId, metadata: {} });
  revalidatePath("/dp2/esocial");
  revalidarCompetencia(competenciaId);
  return { ok: true, texto: "S-1298 (reabertura) pronto na fila do eSocial." };
}

function respostaDoEvento(evento: string, nome: string, r: { ok: true; prontos: number } | { ok: false; erro: string }): EstadoDoDp2 {
  if (!r.ok) return erro(r.erro);
  revalidatePath("/dp2/esocial");
  return { ok: true, texto: r.prontos ? `${evento} de ${nome} pronto.` : `${evento} de ${nome} gerado com pendência: veja o que falta na tela do eSocial.` };
}

export async function gerarAdmissaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const r = await gerarAdmissao(a.tenantId, p.id, a.userId);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_admissao",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, evento: r.ok ? r.evento : null },
  });
  return respostaDoEvento(r.ok && r.evento ? r.evento : "S-2200", p.name, r);
}

/** O término do sócio, do autônomo ou do estagiário (S-2399). */
export async function gerarTerminoSemVinculoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const termino = texto(fd, "termino");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(termino)) return erro("Informe a data do término.");
  const r = await gerarTerminoSemVinculo(a.tenantId, p.id, termino, a.userId);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_termino_sem_vinculo",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, termino },
  });
  return respostaDoEvento("S-2399", p.name, r);
}

export async function gerarAlteracaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const data = texto(fd, "dataAlteracao");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe a data em que a alteração vale.");
  const r = await gerarAlteracao(a.tenantId, p.id, data, texto(fd, "descricao") || null, a.userId);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_alteracao",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, data },
  });
  return respostaDoEvento("S-2206", p.name, r);
}

export async function gerarAfastamentoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const motivo = (texto(fd, "motivoOutro") || texto(fd, "motivo")).replace(/\D/g, "").padStart(2, "0").slice(-2);
  const inicio = texto(fd, "inicio");
  const fim = texto(fd, "fim");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return erro("Informe o início do afastamento.");
  const r = await gerarAfastamento(
    a.tenantId,
    p.id,
    { motivo, inicio, fim: /^\d{4}-\d{2}-\d{2}$/.test(fim) ? fim : null, observacao: texto(fd, "observacao") || null },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_afastamento",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, motivo, inicio },
  });
  return respostaDoEvento("S-2230", p.name, r);
}

const ehData = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function gerarAsoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const data = ehData(texto(fd, "dataAso"));
  if (!data) return erro("Informe a data do ASO.");
  const r = await gerarAso(
    a.tenantId,
    p.id,
    {
      tipoExame: texto(fd, "tipoExame"),
      data,
      resultado: texto(fd, "resultado") === "2" ? "2" : "1",
      procedimentos: lerProcedimentos(texto(fd, "procedimentos")),
      medicoNome: texto(fd, "medicoNome") || null,
      medicoCrm: texto(fd, "medicoCrm").replace(/\D/g, "") || null,
      medicoUf: texto(fd, "medicoUf").toUpperCase() || null,
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_aso",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, tipoExame: texto(fd, "tipoExame"), data },
  });
  return respostaDoEvento("S-2220", p.name, r);
}

export async function gerarCondicaoAmbientalAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const inicio = ehData(texto(fd, "inicioCondicao"));
  if (!inicio) return erro("Informe desde quando vale a condição.");
  const epc = (k: string) => (["0", "1", "2"].includes(texto(fd, k)) ? texto(fd, k) : "0");
  const r = await gerarCondicaoAmbiental(
    a.tenantId,
    p.id,
    {
      inicio,
      setor: texto(fd, "setor") || null,
      atividade: texto(fd, "atividade") || null,
      agentes: lerAgentes(texto(fd, "agentes")),
      usaEpc: epc("usaEpc"),
      usaEpi: epc("usaEpi"),
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_ambiente",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, inicio },
  });
  return respostaDoEvento("S-2240", p.name, r);
}

export async function gerarCatAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return SEM_PERMISSAO;
  const p = await pessoaDoEvento(a, texto(fd, "personId"));
  if (typeof p === "string") return erro(p);
  const dataAcidente = ehData(texto(fd, "dataAcidente"));
  if (!dataAcidente) return erro("Informe a data do acidente.");
  const ou = (k: string) => texto(fd, k) || null;
  const r = await gerarCat(
    a.tenantId,
    p.id,
    {
      dataAcidente,
      horaAcidente: ou("horaAcidente"),
      horasTrabalhadasAntes: ou("horasTrabalhadasAntes"),
      tipoAcidente: texto(fd, "tipoAcidente"),
      obito: marcado(fd, "obito"),
      comunicouPolicia: marcado(fd, "comunicouPolicia"),
      situacaoGeradora: ou("situacaoGeradora"),
      ultimoDiaTrabalhado: ehData(texto(fd, "ultimoDiaTrabalhado")) ?? dataAcidente,
      houveAfastamento: marcado(fd, "houveAfastamento"),
      localDescricao: ou("localDescricao"),
      localLogradouro: ou("localLogradouro"),
      localNumero: ou("localNumero"),
      localCep: ou("localCep"),
      localMunicipio: ou("localMunicipio"),
      localUf: texto(fd, "localUf").toUpperCase() || null,
      parteAtingida: ou("parteAtingida"),
      lateralidade: ["0", "1", "2", "3"].includes(texto(fd, "lateralidade")) ? texto(fd, "lateralidade") : "0",
      agenteCausador: ou("agenteCausador"),
      dataAtendimento: ehData(texto(fd, "dataAtendimento")),
      horaAtendimento: ou("horaAtendimento"),
      internacao: marcado(fd, "internacao"),
      diasDeTratamento: lerInteiro(texto(fd, "diasDeTratamento")),
      naturezaDaLesao: ou("naturezaDaLesao"),
      cid: ou("cid"),
      emitenteNome: ou("emitenteNome"),
      emitenteCrm: ou("emitenteCrm"),
      emitenteUf: texto(fd, "emitenteUf").toUpperCase() || null,
      observacao: ou("observacaoCat"),
    },
    a.userId
  );
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_cat",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, dataAcidente },
  });
  return respostaDoEvento("S-2210", p.name, r);
}

const MOTIVOS_DE_RESCISAO = Object.keys(MOTIVO_LABEL) as MotivoCanonico[];

const avisoDaTela = (v: string): AvisoDaRescisao => (v === "TRABALHADO" ? "TRABALHADO" : v === "DISPENSADO" ? "DISPENSADO" : "INDENIZADO");

/** A folha mensal do mês do desligamento: fechada barra; calculada volta a aberta. */
async function folhaDoDesligamento(tenantId: string, companyId: string, data: Date) {
  return getPrisma().dp2Competencia.findFirst({
    where: { tenantId, companyId, tipo: "MENSAL", ano: data.getUTCFullYear(), mes: data.getUTCMonth() + 1 },
    select: { id: true, ano: true, mes: true, situacao: true },
  });
}

/**
 * Grava a rescisão (25/11/2026, funcionalidade-746, entrega 2.3): refaz o
 * cálculo no servidor com as entradas da tela, liga ao desligamento em
 * andamento da pessoa e tira a pessoa da folha mensal do mês (as verbas do mês
 * estão na rescisão e vão no S-2299). Uma rescisão por pessoa.
 */
export async function gravarRescisaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rescisoes", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);
  const pessoa = (await colaboradoresDaEmpresa(a.tenantId, companyId)).find((p) => p.id === texto(fd, "personId"));
  if (!pessoa?.dp2Vinculo || regimeDaCategoria(pessoa.dp2Vinculo.categoria) !== "CLT") return erro("Escolha um empregado com contrato no DP 2.");
  const desligamento = texto(fd, "desligamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desligamento)) return erro("Informe o último dia trabalhado.");
  const motivo = texto(fd, "motivo") as MotivoCanonico;
  if (!MOTIVOS_DE_RESCISAO.includes(motivo)) return erro("Escolha o motivo do desligamento.");
  const entrada = {
    desligamento,
    motivo,
    aviso: avisoDaTela(texto(fd, "aviso")),
    vencidos: Math.max(0, Math.min(2, lerInteiro(texto(fd, "vencidos")) ?? 0)),
    faltas: lerInteiro(texto(fd, "faltas")) ?? 0,
    saldoFgts: lerNumero(texto(fd, "saldoFgts")),
    adiantado: lerNumero(texto(fd, "adiantado")) ?? 0,
  };
  const prisma = getPrisma();
  const ja = await prisma.dp2Rescisao.findFirst({ where: { tenantId: a.tenantId, personId: pessoa.id }, select: { desligamento: true } });
  if (ja) return erro(`${pessoa.name} já tem rescisão gravada (desligamento em ${ja.desligamento.toISOString().slice(0, 10)}): exclua a gravada para gravar outra.`);
  const data = new Date(`${desligamento}T00:00:00.000Z`);
  if (pessoa.admissionDate && data < pessoa.admissionDate) return erro("O desligamento vem antes da admissão.");
  const folha = await folhaDoDesligamento(a.tenantId, companyId, data);
  if (folha?.situacao === "FECHADA") return erro(`A folha de ${String(folha.mes).padStart(2, "0")}/${folha.ano} está fechada: reabra para gravar a rescisão nesse mês.`);
  const r = await calcularRescisaoDaPessoa(a.tenantId, pessoa, entrada);
  if (!r.ok) return erro(r.erro);
  const desligando = await prisma.termination.findFirst({
    where: { tenantId: a.tenantId, personId: pessoa.id, status: { notIn: ["FINALIZADO", "CANCELADO"] } },
    orderBy: { requestedAt: "desc" },
    select: { id: true },
  });
  const gravada = await prisma.dp2Rescisao.create({
    data: {
      tenantId: a.tenantId,
      companyId,
      personId: pessoa.id,
      terminationId: desligando?.id ?? null,
      desligamento: data,
      motivo,
      aviso: entrada.aviso,
      periodosVencidos: entrada.vencidos,
      faltas: entrada.faltas,
      saldoFgts: entrada.saldoFgts,
      decimoAdiantado: entrada.adiantado,
      ...dadosDaRescisao(r.calculo, r.media),
      criadoPorId: a.userId,
    },
    select: { id: true },
  });
  if (folha?.situacao === "CALCULADA") await prisma.dp2Competencia.update({ where: { id: folha.id }, data: { situacao: "ABERTA" } });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.rescisao_gravada",
    entityType: "Dp2Rescisao",
    entityId: gravada.id,
    metadata: { pessoa: pessoa.name, desligamento, motivo, aviso: entrada.aviso, liquido: r.calculo.liquido, desligamentoEmAndamento: desligando?.id ?? null },
  });
  revalidatePath("/dp2/rescisoes");
  revalidatePath("/desligamentos");
  if (folha) revalidarCompetencia(folha.id);
  return {
    ok: true,
    texto: `Rescisão de ${pessoa.name} gravada${desligando ? " e ligada ao desligamento em andamento" : ""}. ${pessoa.name} sai da folha mensal do mês do desligamento.`,
  };
}

/** Exclui a rescisão gravada: só com a folha do mês aberta e o S-2299 ainda não enviado. */
export async function excluirRescisaoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_rescisoes", "agir");
  if (!a) return SEM_PERMISSAO;
  const prisma = getPrisma();
  const r = await prisma.dp2Rescisao.findFirst({ where: { id: texto(fd, "rescisaoId"), tenantId: a.tenantId }, include: { person: { select: { name: true } } } });
  if (!r) return erro("Rescisão não encontrada.");
  const recusa = await empresaDoEscritorio(a, r.companyId);
  if (recusa) return erro(recusa);
  const folha = await folhaDoDesligamento(a.tenantId, r.companyId, r.desligamento);
  if (folha?.situacao === "FECHADA") return erro(`A folha de ${String(folha.mes).padStart(2, "0")}/${folha.ano} está fechada: reabra para excluir a rescisão.`);
  const evento = r.eventoEsocialId ? await prisma.dp2EventoEsocial.findFirst({ where: { id: r.eventoEsocialId, tenantId: a.tenantId }, select: { id: true, situacao: true } }) : null;
  if (evento && !(SITUACOES_ABERTAS as readonly string[]).includes(evento.situacao)) return erro("O S-2299 desta rescisão já foi enviado ao eSocial: a exclusão sai pelo S-3000.");
  await prisma.$transaction([
    ...(evento ? [prisma.dp2EventoEsocial.delete({ where: { id: evento.id } })] : []),
    prisma.dp2Rescisao.delete({ where: { id: r.id } }),
    ...(folha?.situacao === "CALCULADA" ? [prisma.dp2Competencia.update({ where: { id: folha.id }, data: { situacao: "ABERTA" } })] : []),
  ]);
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.rescisao_excluida",
    entityType: "Dp2Rescisao",
    entityId: r.id,
    metadata: { pessoa: r.person.name, desligamento: r.desligamento.toISOString().slice(0, 10), s2299Apagado: Boolean(evento) },
  });
  revalidatePath("/dp2/rescisoes");
  revalidatePath("/desligamentos");
  if (folha) revalidarCompetencia(folha.id);
  return { ok: true, texto: `Rescisão de ${r.person.name} excluída${evento ? ", com o S-2299 que ainda não tinha sido enviado" : ""}.` };
}

/** O S-2299 a partir da rescisão gravada, ligado a ela (funcionalidade-746). */
export async function gerarDesligamentoAction(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_esocial", "agir");
  if (!a) return erro("Ligue o módulo eSocial do DP 2 para gerar o desligamento.");
  const prisma = getPrisma();
  const resc = await prisma.dp2Rescisao.findFirst({ where: { id: texto(fd, "rescisaoId"), tenantId: a.tenantId } });
  if (!resc) return erro("Grave a rescisão antes de gerar o S-2299.");
  const p = await pessoaDoEvento(a, resc.personId);
  if (typeof p === "string") return erro(p);
  const data = resc.desligamento.toISOString().slice(0, 10);
  const motivo = resc.motivo as MotivoCanonico;
  const antes = new Date(Date.now() - 1000);
  const r = await gerarDesligamento(
    a.tenantId,
    p.id,
    {
      motivo,
      data,
      aviso: avisoDaTela(resc.aviso),
      vencidos: resc.periodosVencidos,
      faltas: resc.faltas,
      saldoFgts: resc.saldoFgts === null ? null : Number(resc.saldoFgts),
      adiantado: Number(resc.decimoAdiantado),
    },
    a.userId
  );
  if (r.ok) {
    const ev = await prisma.dp2EventoEsocial.findFirst({
      where: { tenantId: a.tenantId, personId: p.id, tipo: "S-2299", createdAt: { gte: antes } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (ev) await prisma.dp2Rescisao.update({ where: { id: resc.id }, data: { eventoEsocialId: ev.id } });
  }
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.esocial_desligamento",
    entityType: "Person",
    entityId: p.id,
    metadata: { nome: p.name, data, motivo, rescisao: resc.id },
  });
  revalidatePath("/dp2/rescisoes");
  return respostaDoEvento("S-2299", p.name, r);
}

// ─── Importar colaboradores do eSocial (13/11/2026, funcionalidade-666) ─────

export type EstadoDaImportacao =
  | { ok: false; texto: string }
  | { ok: true; etapa: "previa"; previa: LinhaDaPrevia[]; problemas: string[] }
  | { ok: true; etapa: "feita"; texto: string; resultado: ResultadoDaImportacao }
  | null;

/** Lê os arquivos do formulário (enviados ou trazidos pelo Assinador) e junta por trabalhador. */
async function trabalhadoresDoFormulario(a: Acesso, fd: FormData): Promise<{ erro: string } | { companyId: string; trabalhadores: TrabalhadorImportado[]; problemas: string[] }> {
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return { erro: recusa };
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId: a.tenantId }, select: { cnpj: true, kind: true } });
  if (!empresa?.cnpj || empresa.kind === "PESSOA_FISICA") return { erro: "A empresa precisa de CNPJ no cadastro para conferir os eventos do eSocial." };
  const arquivos = fd.getAll("arquivo").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (arquivos.length === 0) return { erro: "Escolha o .zip ou os .xml do eSocial." };
  const lidos = await Promise.all(arquivos.map(async (f) => ({ nome: f.name, conteudo: new Uint8Array(await f.arrayBuffer()) })));
  const leitura = lerArquivosDoEsocial(lidos);
  const junto = consolidarTrabalhadores(leitura.eventos, empresa.cnpj);
  if (junto.trabalhadores.length === 0) {
    return { erro: [...leitura.problemas, ...junto.problemas, "Nenhuma admissão, alteração ou desligamento desta empresa nos arquivos."].join(" ") };
  }
  return { companyId, trabalhadores: junto.trabalhadores, problemas: [...leitura.problemas, ...junto.problemas] };
}

export async function previaDoEsocialAction(_: EstadoDaImportacao, fd: FormData): Promise<EstadoDaImportacao> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return { ok: false, texto: "Sem permissão para isto no DP 2." };
  const r = await trabalhadoresDoFormulario(a, fd);
  if ("erro" in r) return { ok: false, texto: r.erro };
  return { ok: true, etapa: "previa", previa: await previaDaImportacao(a.tenantId, r.companyId, r.trabalhadores), problemas: r.problemas };
}

export async function importarDoEsocialAction(_: EstadoDaImportacao, fd: FormData): Promise<EstadoDaImportacao> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return { ok: false, texto: "Sem permissão para isto no DP 2." };
  const r = await trabalhadoresDoFormulario(a, fd);
  if ("erro" in r) return { ok: false, texto: r.erro };
  const resultado = await gravarImportacao(a.tenantId, r.companyId, r.trabalhadores, {
    incluirDesligados: marcado(fd, "incluirDesligados"),
    atualizarExistentes: marcado(fd, "atualizarExistentes"),
    ignorar: new Set(fd.getAll("ignorar").map(String)),
  });
  await logAudit({
    tenantId: a.tenantId,
    userId: a.userId,
    action: "folha.colaboradores_importados",
    entityType: "Company",
    entityId: r.companyId,
    metadata: { ...resultado, fora: resultado.fora.length, arquivos: fd.getAll("arquivo").map((f) => (typeof f === "string" ? f : f.name)) },
  });
  revalidatePath("/dp2/colaboradores");
  const partes = [
    `${resultado.criadas} colaborador(es) novo(s)`,
    `${resultado.atualizadas} atualizado(s)`,
    `${resultado.contratos} contrato(s) criado(s)`,
    `${resultado.dependentes} dependente(s)`,
  ];
  return { ok: true, etapa: "feita", texto: `Importado: ${partes.join(", ")}.${resultado.fora.length ? ` ${resultado.fora.length} ficaram de fora.` : ""}`, resultado };
}

// ─── Buscar colaboradores no eSocial por CPF e admissão (13/11/2026, funcionalidade-671) ─

export type BuscaNaTela = { id: string; itens: ItemDaBusca[]; usadosHoje: number; bloqueadaHoje: boolean };
export type EstadoDaBusca = { ok: false; texto: string } | { ok: true; busca: BuscaNaTela | null; erros: string[] };

/** Os acessos ao eSocial que a empresa já usou hoje, somando todas as buscas dela. */
async function usadosHojeNaEmpresa(tenantId: string, companyId: string): Promise<number> {
  const dia = hojeEmBrasilia();
  const buscas = await getPrisma().dp2BuscaEsocial.findMany({
    where: { tenantId, companyId, updatedAt: { gte: new Date(Date.now() - 2 * 86_400_000) } },
    select: { acessos: true },
  });
  return buscas.reduce((s, b) => s + acessosDoDia(b.acessos, dia), 0);
}

async function buscaNaTela(tenantId: string, companyId: string, id?: string): Promise<BuscaNaTela | null> {
  const b = await getPrisma().dp2BuscaEsocial.findFirst({
    where: id ? { id, tenantId, companyId } : { tenantId, companyId, concluida: false },
    orderBy: { createdAt: "desc" },
  });
  if (!b) return null;
  return { id: b.id, itens: lerItens(b.itens), usadosHoje: await usadosHojeNaEmpresa(tenantId, companyId), bloqueadaHoje: consultaBloqueadaHoje() };
}

async function acessoABusca(companyId: string): Promise<{ erro: string } | { a: Acesso }> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return { erro: "Sem permissão para isto no DP 2." };
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return { erro: recusa };
  return { a };
}

export async function abrirBuscaEsocialAction(companyId: string): Promise<EstadoDaBusca> {
  const r = await acessoABusca(companyId);
  if ("erro" in r) return { ok: false, texto: r.erro };
  return { ok: true, busca: await buscaNaTela(r.a.tenantId, companyId), erros: [] };
}

/** Cria a busca com a lista colada; havendo uma em aberto, junta os CPFs novos nela. */
export async function criarBuscaEsocialAction(companyId: string, texto: string): Promise<EstadoDaBusca> {
  const r = await acessoABusca(companyId);
  if ("erro" in r) return { ok: false, texto: r.erro };
  const { itens, erros } = lerListaDeCpfs(texto);
  if (itens.length === 0) return { ok: false, texto: erros.length ? erros.join(" ") : "Cole ao menos um CPF com a data de admissão." };
  const prisma = getPrisma();
  const aberta = await prisma.dp2BuscaEsocial.findFirst({ where: { tenantId: r.a.tenantId, companyId, concluida: false }, orderBy: { createdAt: "desc" } });
  let id: string;
  if (aberta) {
    const ja = lerItens(aberta.itens);
    const novos = itens.filter((i) => !ja.some((x) => x.cpf === i.cpf));
    await prisma.dp2BuscaEsocial.update({ where: { id: aberta.id }, data: { itens: [...ja, ...novos] } });
    id = aberta.id;
  } else {
    id = (await prisma.dp2BuscaEsocial.create({ data: { tenantId: r.a.tenantId, companyId, itens, acessos: {}, criadaPorId: r.a.userId }, select: { id: true } })).id;
  }
  return { ok: true, busca: await buscaNaTela(r.a.tenantId, companyId, id), erros };
}

/**
 * Guarda um acesso ao eSocial antes de o Assinador chamar: recusa do dia 1 ao
 * 7 e depois do 10º acesso do dia da empresa. Conta mesmo se a chamada falhar,
 * como o eSocial conta.
 */
export async function reservarAcessoEsocialAction(companyId: string, buscaId: string): Promise<{ ok: true; livres: number } | { ok: false; texto: string }> {
  const r = await acessoABusca(companyId);
  if ("erro" in r) return { ok: false, texto: r.erro };
  if (consultaBloqueadaHoje()) return { ok: false, texto: "O eSocial não aceita consultas do dia 1 ao 7 de cada mês. A busca continua a partir do dia 8." };
  const usados = await usadosHojeNaEmpresa(r.a.tenantId, companyId);
  if (usados >= LIMITE_DE_ACESSOS_POR_DIA) {
    return { ok: false, texto: `A empresa já usou os ${LIMITE_DE_ACESSOS_POR_DIA} acessos ao eSocial de hoje. A busca continua amanhã de onde parou.` };
  }
  const prisma = getPrisma();
  const b = await prisma.dp2BuscaEsocial.findFirst({ where: { id: buscaId, tenantId: r.a.tenantId, companyId }, select: { acessos: true } });
  if (!b) return { ok: false, texto: "Busca não encontrada." };
  const dia = hojeEmBrasilia();
  await prisma.dp2BuscaEsocial.update({
    where: { id: buscaId },
    data: { acessos: { ...((b.acessos ?? {}) as Record<string, number>), [dia]: acessosDoDia(b.acessos, dia) + 1 } },
  });
  return { ok: true, livres: acessosLivres(usados + 1) };
}

/** O que a consulta ou o download devolveu, para cada CPF. */
export async function registrarResultadoEsocialAction(
  companyId: string,
  buscaId: string,
  resultados: { cpf: string; situacao: SituacaoDaBusca; ids?: string[]; mensagem?: string | null }[]
): Promise<EstadoDaBusca> {
  const r = await acessoABusca(companyId);
  if ("erro" in r) return { ok: false, texto: r.erro };
  const prisma = getPrisma();
  const b = await prisma.dp2BuscaEsocial.findFirst({ where: { id: buscaId, tenantId: r.a.tenantId, companyId } });
  if (!b) return { ok: false, texto: "Busca não encontrada." };
  const itens = lerItens(b.itens).map((it) => {
    const novo = resultados.find((x) => x.cpf === it.cpf);
    if (!novo) return it;
    return { ...it, situacao: novo.situacao, ids: novo.ids ?? it.ids, mensagem: novo.mensagem?.slice(0, 300) ?? null };
  });
  const concluida = itens.every((i) => i.situacao === "BAIXADO" || i.situacao === "NAO_ENCONTRADO");
  await prisma.dp2BuscaEsocial.update({ where: { id: buscaId }, data: { itens, concluida } });
  if (concluida) {
    await logAudit({
      tenantId: r.a.tenantId,
      userId: r.a.userId,
      action: "folha.busca_esocial_concluida",
      entityType: "Company",
      entityId: companyId,
      metadata: { pessoas: itens.length, baixadas: itens.filter((i) => i.situacao === "BAIXADO").length },
    });
  }
  return { ok: true, busca: await buscaNaTela(r.a.tenantId, companyId, buscaId), erros: [] };
}

/** Recomeça um CPF (data errada, por exemplo): volta a pendente com a nova data. */
export async function corrigirItemDaBuscaAction(companyId: string, buscaId: string, cpf: string, admissao: string): Promise<EstadoDaBusca> {
  const r = await acessoABusca(companyId);
  if ("erro" in r) return { ok: false, texto: r.erro };
  const lido = lerListaDeCpfs(`${cpf};${admissao}`);
  if (lido.itens.length === 0) return { ok: false, texto: lido.erros.join(" ") || "Data inválida." };
  const prisma = getPrisma();
  const b = await prisma.dp2BuscaEsocial.findFirst({ where: { id: buscaId, tenantId: r.a.tenantId, companyId } });
  if (!b) return { ok: false, texto: "Busca não encontrada." };
  const itens = lerItens(b.itens).map((it) => (it.cpf === lido.itens[0].cpf ? lido.itens[0] : it));
  await prisma.dp2BuscaEsocial.update({ where: { id: buscaId }, data: { itens, concluida: false } });
  return { ok: true, busca: await buscaNaTela(r.a.tenantId, companyId, buscaId), erros: [] };
}

// ─── Novo colaborador direto no DP 2 (13/11/2026, funcionalidade-671) ────────

/**
 * Cadastra a pessoa e o contrato do DP 2 de uma vez, sem passar pelo setor
 * Recrutamento. CPF já cadastrado no escritório não é duplicado: se for desta
 * empresa, o DP usa o Editar; se for de outra, avisa onde está.
 */
export async function criarColaboradorDp2Action(_: EstadoDoDp2, fd: FormData): Promise<EstadoDoDp2> {
  const a = await acesso("dp2_colaboradores", "agir");
  if (!a) return SEM_PERMISSAO;
  const companyId = texto(fd, "companyId");
  const recusa = await empresaDoEscritorio(a, companyId);
  if (recusa) return erro(recusa);

  const nome = texto(fd, "novo_nome").replace(/\s+/g, " ");
  const cpf = texto(fd, "novo_cpf").replace(/\D/g, "");
  const admissao = texto(fd, "novo_admissao");
  const nascimento = texto(fd, "novo_nascimento");
  if (nome.length < 3) return erro("Informe o nome completo.");
  if (!cpfValido(cpf)) return erro("CPF inválido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(admissao)) return erro("Informe a data de admissão.");
  const salarioBase = lerNumero(texto(fd, "salarioBase"));
  if (!salarioValido(salarioBase, texto(fd, "categoria"))) return erro(SALARIO_OBRIGATORIO);
  const banco = texto(fd, "bancoCodigo").replace(/\D/g, "");
  if (banco && banco.length !== 3) return erro("O banco é o código de 3 dígitos (ex.: 341).");
  // As rubricas fixas são conferidas antes de criar a pessoa, para não sobrar cadastro sem contrato.
  const fixas = await rubricasFixasDoFormulario(a.tenantId, fd);
  if (!fixas.ok) return erro(fixas.erro);

  const prisma = getPrisma();
  const existente = await prisma.person.findFirst({
    where: { tenantId: a.tenantId, cpf: { in: [cpf, formatCpf(cpf)] } },
    select: { id: true, name: true, currentCompanyId: true, currentCompany: { select: { name: true, displayName: true } } },
  });
  if (existente) {
    if (existente.currentCompanyId === companyId) return erro(`${existente.name} já está cadastrado nesta empresa: use o Editar na lista.`);
    const onde = existente.currentCompany?.displayName || existente.currentCompany?.name;
    return erro(`Este CPF já é de ${existente.name}${onde ? `, cadastrado em ${onde}` : ""}. Transfira a pessoa no cadastro antes de criar o contrato aqui.`);
  }

  const data = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null);
  const nomeDoCargo = texto(fd, "novo_cargo").slice(0, 120);
  const pessoa = await comNovaTentativa(() =>
    prisma.$transaction(async (tx) => {
      const cargo = nomeDoCargo
        ? ((await tx.cargo.findFirst({ where: { companyId, name: nomeDoCargo }, select: { id: true } })) ??
          (await tx.cargo.create({ data: { tenantId: a.tenantId, companyId, name: nomeDoCargo }, select: { id: true } })))
        : null;
      return tx.person.create({
        data: {
          tenantId: a.tenantId,
          number: await proximoNumero(tx, "pessoa", a.tenantId),
          name: nome,
          cpf: formatCpf(cpf),
          birthDate: data(nascimento),
          admissionDate: data(admissao),
          email: texto(fd, "novo_email") || null,
          phone: texto(fd, "novo_telefone") || null,
          type: PersonType.COLABORADOR,
          isInternal: false,
          currentCompanyId: companyId,
          employmentStatus: PersonEmploymentStatus.ATIVO,
          currentSalary: salarioBase,
          ...(cargo ? { cargoId: cargo.id } : {}),
        },
        select: { id: true, name: true },
      });
    })
  );
  await logAudit({ tenantId: a.tenantId, userId: a.userId, action: "person.create", entityType: "Person", entityId: pessoa.id, metadata: { name: pessoa.name, origem: "dp2" } });

  // O contrato pelo mesmo caminho do Editar (mesmas regras e a mesma Auditoria).
  fd.set("personId", pessoa.id);
  const contrato = await salvarVinculoAction(null, fd);
  if (!contrato?.ok) return erro(`${pessoa.name} foi cadastrado, mas o contrato não: ${contrato?.texto ?? "erro desconhecido"}. Abra pelo Editar e corrija.`);
  revalidatePath("/dp2/colaboradores");
  return { ok: true, texto: `${pessoa.name} cadastrado, com o contrato.` };
}
