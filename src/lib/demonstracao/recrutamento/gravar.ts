// Grava a demonstração do Recrutamento (ver `plano.ts`) — sempre dentro de uma
// transação aberta por quem chama, para sair tudo ou nada.
//
// Prisma direto, de propósito: nenhuma action do app roda aqui, então não sai
// aviso, e-mail, WhatsApp, chamada ao n8n nem à IA. Os ids nascem aqui (e não
// no banco) para gravar cada tabela num `createMany` só — poucas idas ao banco
// de produção, transação curta.

import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { camposDoRegime } from "@/lib/taxRegime";
import { scoreQuiz } from "@/lib/quiz";
import { DOMINIO_FICTICIO } from "./documentos";
import { FONTE_DA_DEMO, SETOR, contagemDaDemonstracao, type PlanoDaDemonstracao } from "./plano";

type Tx = Prisma.TransactionClient;
type Json = Prisma.InputJsonValue;

/** Quem figura como autor: o administrador escolhido e, se houver, um segundo (a segunda avaliação de entrevista). */
export type Autores = { principal: string; segundo: string | null };

export type Geradores = { id: () => string; token: () => string };
const GERADORES: Geradores = { id: randomUUID, token: () => randomBytes(32).toString("hex") };

// ─── Antes de criar ─────────────────────────────────────────────────────────

export type Conferencia = {
  /** A demonstração (ou parte dela) já está no escritório. */
  jaExiste: string[];
  /** Algo de verdade usa um CPF ou e-mail da demonstração — não grava. */
  conflitos: string[];
};

/**
 * O que impede gravar: a demonstração já gravada (rodar `--aplicar` de novo
 * não duplica nada) e qualquer CPF, CNPJ ou e-mail da demonstração que já
 * exista no escritório.
 */
export async function conferirAntesDeCriar(db: Tx, tenantId: string, plano: PlanoDaDemonstracao): Promise<Conferencia> {
  const jaExiste: string[] = [];
  const conflitos: string[] = [];

  const etiquetas = await db.tag.findMany({
    where: { tenantId, sectorCode: SETOR, name: { in: plano.etiquetas.map((e) => e.name) } },
    select: { name: true },
  });
  if (etiquetas.length > 0) jaExiste.push(`etiquetas: ${etiquetas.map((e) => e.name).join(", ")}`);

  const empresas = await db.company.findMany({
    where: {
      tenantId,
      OR: [
        { source: FONTE_DA_DEMO },
        { name: { in: plano.empresas.map((e) => e.name) } },
        { cnpj: { in: plano.empresas.map((e) => e.cnpj) } },
      ],
    },
    select: { name: true, cnpj: true, source: true },
  });
  for (const e of empresas) {
    if (e.source === FONTE_DA_DEMO) jaExiste.push(`empresa ${e.name}`);
    else conflitos.push(`empresa já cadastrada com o mesmo nome ou CNPJ: ${e.name} (${e.cnpj ?? "sem CNPJ"})`);
  }

  const modelo = await db.assessmentTemplate.findFirst({ where: { tenantId, name: plano.questionario.name }, select: { id: true } });
  if (modelo) jaExiste.push(`modelo de teste ${plano.questionario.name}`);

  const porCpf = await db.person.findMany({
    where: { tenantId, cpf: { in: plano.pessoas.map((p) => p.cpf) } },
    select: { name: true, cpf: true, email: true },
  });
  for (const p of porCpf) {
    if (p.email?.toLowerCase().endsWith(DOMINIO_FICTICIO)) jaExiste.push(`pessoa ${p.name}`);
    else conflitos.push(`CPF ${p.cpf} já pertence a ${p.name}`);
  }

  const porEmail = await db.person.findMany({
    where: { tenantId, email: { in: plano.pessoas.map((p) => p.email) } },
    select: { name: true, email: true, cpf: true },
  });
  const cpfs = new Set(plano.pessoas.map((p) => p.cpf));
  for (const p of porEmail) if (!p.cpf || !cpfs.has(p.cpf)) jaExiste.push(`pessoa com o e-mail ${p.email}`);

  return { jaExiste: [...new Set(jaExiste)], conflitos };
}

// ─── Gravação ───────────────────────────────────────────────────────────────

export type ResultadoDaGravacao = ReturnType<typeof contagemDaDemonstracao> & {
  idsDasVagas: { title: string; id: string; isPublic: boolean }[];
};

export async function gravarDemonstracao(
  tx: Tx,
  tenantId: string,
  plano: PlanoDaDemonstracao,
  autores: Autores,
  gerar: Geradores = GERADORES
): Promise<ResultadoDaGravacao> {
  const idDe = <T extends { chave: string }>(lista: readonly T[]) => new Map(lista.map((x) => [x.chave, gerar.id()]));
  const empresa = idDe(plano.empresas);
  const cargo = idDe(plano.cargos);
  const pessoa = idDe(plano.pessoas);
  const vaga = idDe(plano.vagas);
  const candidatura = idDe(plano.candidaturas);
  const etiqueta = new Map(plano.etiquetas.map((e) => [e.name, gerar.id()]));
  const versao = new Map<string, string>(); // "vaga:versao" → id
  for (const v of plano.vagas) for (const r of v.requisitos) versao.set(`${v.chave}:${r.versao}`, gerar.id());
  const get = (m: Map<string, string>, chave: string) => {
    const id = m.get(chave);
    if (!id) throw new Error(`Demonstração sem a chave "${chave}".`);
    return id;
  };

  // Sem Cliente desde 15/10/2026 (etapa 3 da saída do Cliente): até aqui cada
  // empresa ganhava um grupo de cliente com o mesmo nome.
  await tx.company.createMany({
    data: plano.empresas.map((e) => ({
      id: get(empresa, e.chave),
      tenantId,
      name: e.name,
      displayName: e.displayName,
      tradeName: e.tradeName,
      cnpj: e.cnpj,
      cnaePrincipal: e.cnaePrincipal,
      ...camposDoRegime(e.taxRegime),
      zipCode: e.zipCode,
      addressStreet: e.addressStreet,
      addressNumber: e.addressNumber,
      neighborhood: e.neighborhood,
      city: e.city,
      stateCode: e.stateCode,
      // ACTIVE: o seletor de empresa (Colaboradores de clientes) só lista as ativas.
      status: "ACTIVE" as const,
      source: FONTE_DA_DEMO,
    })),
  });
  await tx.cargo.createMany({
    data: plano.cargos.map((c) => ({ id: get(cargo, c.chave), tenantId, companyId: get(empresa, c.empresa), name: c.name, area: c.area })),
  });
  await tx.tag.createMany({
    data: plano.etiquetas.map((e) => ({ id: get(etiqueta, e.name), tenantId, sectorCode: SETOR, name: e.name, color: e.color })),
  });

  await tx.person.createMany({
    data: plano.pessoas.map((p) => ({
      id: get(pessoa, p.chave),
      tenantId,
      type: p.type,
      name: p.name,
      cpf: p.cpf,
      email: p.email,
      phone: p.phone,
      birthDate: p.birthDate,
      education: p.education,
      zipCode: p.zipCode,
      addressStreet: p.addressStreet,
      addressNumber: p.addressNumber,
      neighborhood: p.neighborhood,
      city: p.city,
      stateCode: p.stateCode,
      notes: p.notes,
      isInternal: false,
      active: p.active,
      currentCompanyId: p.empresa ? get(empresa, p.empresa) : null,
      cargoId: p.cargo ? get(cargo, p.cargo) : null,
      employmentStatus: p.employmentStatus,
      admissionDate: p.admissionDate,
      dismissalDate: p.dismissalDate,
      currentSalary: p.currentSalary,
      createdAt: p.createdAt,
    })),
  });
  await tx.personTag.createMany({
    data: plano.pessoas.flatMap((p) => p.etiquetas.map((nome) => ({ personId: get(pessoa, p.chave), tagId: get(etiqueta, nome) }))),
  });

  await tx.vaga.createMany({
    data: plano.vagas.map((v) => ({
      id: get(vaga, v.chave),
      tenantId,
      companyId: get(empresa, v.empresa),
      cargoId: get(cargo, v.cargo),
      sectorCode: SETOR,
      title: v.title,
      quantity: v.quantity,
      responsibleUserId: autores.principal,
      openedAt: v.openedAt,
      closedAt: v.closedAt,
      status: v.status,
      priority: v.priority,
      notes: v.notes,
      isPublic: v.isPublic,
      publicDescription: v.publicDescription,
      salaryMin: v.salaryMin,
      salaryMax: v.salaryMax,
      showSalary: v.showSalary,
      workMode: v.workMode,
      contractType: v.contractType,
      benefits: v.benefits,
      applicationDeadline: v.applicationDeadline,
      workCity: v.workCity,
      workStateCode: v.workStateCode,
      createdAt: v.openedAt,
    })),
  });
  await tx.vagaRequisitos.createMany({
    data: plano.vagas.flatMap((v) =>
      v.requisitos.map((r) => ({
        id: get(versao, `${v.chave}:${r.versao}`),
        tenantId,
        vagaId: get(vaga, v.chave),
        versao: r.versao,
        itens: r.itens as unknown as Json,
        corteCompativel: r.corteCompativel,
        corteParcial: r.corteParcial,
        createdById: autores.principal,
        createdAt: r.createdAt,
      }))
    ),
  });

  await tx.candidatura.createMany({
    data: plano.candidaturas.map((c) => ({
      id: get(candidatura, c.chave),
      tenantId,
      vagaId: get(vaga, c.vaga),
      personId: get(pessoa, c.pessoa),
      origin: c.origin,
      status: c.status,
      stage: c.stage,
      rejectionReason: c.rejectionReason,
      withdrawalReason: c.withdrawalReason,
      hiredAt: c.hiredAt,
      pretensaoSalarial: c.pretensaoSalarial,
      disponibilidade: c.disponibilidade,
      deslocamentoMinutos: c.deslocamentoMinutos,
      ...(c.respostasFonte ? { respostasFonte: c.respostasFonte as Json } : {}),
      createdAt: c.createdAt,
    })),
  });
  await tx.candidaturaNota.createMany({
    data: plano.candidaturas.flatMap((c) =>
      c.notas.map((n) => ({
        id: gerar.id(),
        tenantId,
        candidaturaId: get(candidatura, c.chave),
        requisitosId: get(versao, `${c.vaga}:${n.versao}`),
        score: n.score,
        faixa: n.faixa,
        avaliacoes: n.avaliacoes as unknown as Json,
        resumo: n.resumo,
        origem: n.origem,
        createdById: n.origem === "AUTO" ? null : autores.principal,
        createdAt: n.createdAt,
      }))
    ),
  });

  // A segunda avaliação só existe com um segundo administrador: a avaliação é
  // uma por avaliador em cada candidatura.
  const entrevistas = plano.entrevistas.filter((e) => e.avaliador === "principal" || autores.segundo);
  await tx.interviewScorecard.createMany({
    data: entrevistas.map((e) => ({
      id: gerar.id(),
      tenantId,
      candidaturaId: get(candidatura, e.candidatura),
      evaluatorUserId: e.avaliador === "principal" ? autores.principal : autores.segundo!,
      stage: e.stage,
      comunicacao: e.comunicacao,
      tecnico: e.tecnico,
      fitCultural: e.fitCultural,
      experiencia: e.experiencia,
      recommendation: e.recommendation,
      notes: e.notes,
      createdAt: e.createdAt,
    })),
  });

  // O questionário: o modelo, as perguntas e — para quem respondeu — a nota
  // calculada pela mesma função da página pública do teste.
  const modeloId = gerar.id();
  const perguntas = plano.questionario.perguntas.map((q, i) => ({ id: gerar.id(), order: i, ...q }));
  await tx.assessmentTemplate.create({
    data: {
      id: modeloId,
      tenantId,
      sectorCode: SETOR,
      name: plano.questionario.name,
      description: plano.questionario.description,
      createdById: autores.principal,
    },
  });
  await tx.assessmentTemplateQuestion.createMany({
    data: perguntas.map((q) => ({ id: q.id, tenantId, templateId: modeloId, order: q.order, text: q.text, options: q.options, correctIndex: q.correctIndex })),
  });

  await tx.assessmentLink.createMany({
    data: plano.testes.map((t) => {
      const base = {
        id: gerar.id(),
        tenantId,
        personId: get(pessoa, t.pessoa),
        candidaturaId: get(candidatura, t.candidatura),
        sectorCode: SETOR,
        type: t.type,
        templateId: t.type === "DISC" ? null : modeloId,
        token: gerar.token(),
        status: t.status,
        expiresAt: t.expiresAt,
        submittedAt: t.submittedAt,
        createdById: autores.principal,
        createdAt: t.createdAt,
      };
      if (t.disc) {
        return {
          ...base,
          answers: t.disc.answers as unknown as Json,
          scores: t.disc.scores as unknown as Json,
          primaryProfile: t.disc.primaryProfile,
          secondaryProfile: t.disc.secondaryProfile,
        };
      }
      if (t.escolhas) {
        const answers = perguntas.map((q, i) => ({ questionId: q.id, selectedIndex: t.escolhas![i]! }));
        return { ...base, answers: answers as unknown as Json, scores: scoreQuiz(answers, perguntas) as unknown as Json };
      }
      return base;
    }),
  });

  return {
    ...contagemDaDemonstracao(plano),
    entrevistas: entrevistas.length,
    idsDasVagas: plano.vagas.map((v) => ({ title: v.title, id: get(vaga, v.chave), isPublic: v.isPublic && v.status === "ABERTA" })),
  };
}
