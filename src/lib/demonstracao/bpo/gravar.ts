// Grava a demonstração do BPO (ver `plano.ts`) — sempre dentro de uma
// transação aberta por quem chama, para sair tudo ou nada.
//
// Prisma direto, de propósito: nenhuma action do app roda aqui, então não sai
// aviso, e-mail, push, WhatsApp, evento na agenda do Google ou da Microsoft,
// nem chamada ao Omie. Os avisos automáticos do servidor (src/lib/alerts.ts) e
// o lembrete de pendência deixam as empresas "[demo]" de fora — ver
// src/lib/demonstracao/marca.ts. Os ids nascem aqui para gravar cada tabela
// num `createMany` só: poucas idas ao banco de produção, transação curta.

import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { camposDoRegime } from "@/lib/taxRegime";
import { somarDias } from "@/lib/datas/calendario";
import { FONTE_DA_DEMO, MARCA, SETOR, contagemDoPlano, type Autor, type ChaveDaEmpresa, type PlanoDoBpo, type Quem, type Responsavel } from "./plano";

type Tx = Prisma.TransactionClient;

/** Quem figura: quem apresenta e, se houver, um segundo administrador (quem lança a conta não a aprova). */
export type Pessoas = { apresentador: string; outro: string | null };
export type Geradores = { id: () => string; senhaDescartavel: () => string };
const GERADORES: Geradores = { id: randomUUID, senhaDescartavel: () => randomBytes(32).toString("hex") };

/** O texto guardado (cifrado) nas senhas do cofre da demonstração. Não abre nada em lugar nenhum. */
export const TEXTO_FICTICIO_DO_COFRE = "senha-ficticia-da-demonstracao";

/** Data de calendário como o financeiro grava: meio-dia de São Paulo (`instanteDaData`). */
const dia = (iso: string) => new Date(`${iso}T12:00:00-03:00`);
/** Prazo da pendência: meio-dia UTC, como a tela grava. */
const prazoDaPendencia = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
const valor = (centavos: number) => (centavos / 100).toFixed(2);

// ─── Antes de criar ─────────────────────────────────────────────────────────

export type Conferencia = {
  /** A demonstração (ou parte dela) já está no escritório. */
  jaExiste: string[];
  /** Algo de verdade usa um nome ou CNPJ da demonstração — não grava. */
  conflitos: string[];
};

/** O que impede gravar: a demonstração já gravada (rodar `--aplicar` de novo não duplica) e cadastro de verdade com dado dela. */
export async function conferirAntesDeCriar(db: Tx, tenantId: string, plano: PlanoDoBpo): Promise<Conferencia> {
  const jaExiste: string[] = [];
  const conflitos: string[] = [];

  const empresas = await db.company.findMany({
    where: {
      tenantId,
      OR: [{ source: FONTE_DA_DEMO }, { name: { in: plano.empresas.map((e) => e.name) } }, { cnpj: { in: plano.empresas.map((e) => e.cnpj) } }],
    },
    select: { name: true, cnpj: true, source: true },
  });
  for (const e of empresas) {
    if (e.source === FONTE_DA_DEMO) jaExiste.push(`empresa ${e.name}`);
    else conflitos.push(`empresa já cadastrada com o mesmo nome ou CNPJ: ${e.name} (${e.cnpj ?? "sem CNPJ"})`);
  }

  const acesso = await db.portalUser.findFirst({ where: { tenantId, email: plano.acessoDoPortal.email }, select: { name: true } });
  if (acesso) jaExiste.push(`acesso do portal ${acesso.name}`);
  const espaco = await db.space.findFirst({ where: { tenantId, sectorCode: SETOR, name: plano.quadro.espaco.name }, select: { id: true } });
  if (espaco) jaExiste.push(`quadro ${plano.quadro.espaco.name}`);
  const etiquetas = await db.tag.findMany({ where: { tenantId, sectorCode: SETOR, name: { in: plano.quadro.etiquetas.map((t) => t.name) } }, select: { name: true } });
  if (etiquetas.length > 0) jaExiste.push(`etiquetas: ${etiquetas.map((t) => t.name).join(", ")}`);
  const manual = await db.manualDocument.findFirst({ where: { tenantId, sectorCode: SETOR, title: plano.manual.title }, select: { id: true } });
  if (manual) jaExiste.push(`manual ${plano.manual.title}`);
  const comunicado = await db.clientAnnouncement.findFirst({ where: { tenantId, title: plano.comunicado.title }, select: { id: true } });
  if (comunicado) jaExiste.push(`comunicado ${plano.comunicado.title}`);
  const pastas = plano.pastas.filter((p) => p.empresa === null && p.pai === null).map((p) => p.name);
  const pasta = await db.driveFolder.findFirst({ where: { tenantId, companyId: null, parentId: null, name: { in: pastas } }, select: { name: true } });
  if (pasta) jaExiste.push(`pasta ${pasta.name}`);

  const contas = await db.user.findMany({ where: { tenantId, email: { in: plano.equipe.map((m) => m.email) } }, select: { name: true } });
  if (contas.length > 0) jaExiste.push(`equipe: ${contas.map((u) => u.name).join(", ")}`);

  return { jaExiste: [...new Set(jaExiste)], conflitos };
}

// ─── Gravação ───────────────────────────────────────────────────────────────

export type ResultadoDaGravacao = ReturnType<typeof contagemDoPlano> & {
  idDaMatriz: string;
  senhasGravadas: number;
  numerosDasSolicitacoes: number[];
  /** O assunto das solicitações foi criado (inativo) porque o escritório não tinha nenhum do BPO. */
  assuntoCriado: boolean;
};

export async function gravarDemonstracaoDoBpo(
  tx: Tx,
  tenantId: string,
  plano: PlanoDoBpo,
  pessoas: Pessoas,
  agora: Date,
  /** `encryptSecret` de src/lib/crypto.ts, com a chave da produção; sem ela, o cofre fica de fora. */
  cifrar: ((texto: string) => string) | null,
  gerar: Geradores = GERADORES
): Promise<ResultadoDaGravacao> {
  const ids = new Map<string, string>();
  const novo = (chave: string) => {
    if (ids.has(chave)) throw new Error(`Demonstração com a chave repetida "${chave}".`);
    const id = gerar.id();
    ids.set(chave, id);
    return id;
  };
  const id = (chave: string) => {
    const x = ids.get(chave);
    if (!x) throw new Error(`Demonstração sem a chave "${chave}".`);
    return x;
  };
  const quem = (q: Quem) => (q === "outro" ? (pessoas.outro ?? pessoas.apresentador) : pessoas.apresentador);
  /** O responsável de um card: alguém da equipe fictícia, ou quem apresenta, ou o segundo administrador. */
  const responsavel = (r: Responsavel) => (r.startsWith("equipe:") ? id(r) : quem(r as Quem));
  const autor = (a: Autor, portalId: string) =>
    a === "portal" ? { authorUserId: null, authorPortalUserId: portalId } : { authorUserId: quem(a), authorPortalUserId: null };
  const empresa = (e: ChaveDaEmpresa) => id(`empresa:${e}`);
  const ate = (iso: string, hora: string) => new Date(Math.min(new Date(`${iso}T${hora}:00-03:00`).getTime(), agora.getTime()));

  // ── Empresas: a matriz antes, as filiais apontam para ela ─────────────────
  for (const e of plano.empresas) novo(`empresa:${e.chave}`);
  const dadosDaEmpresa = (e: PlanoDoBpo["empresas"][number]) => ({
    id: empresa(e.chave),
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
    parentCompanyId: e.matriz ? empresa(e.matriz) : null,
    // ACTIVE: os seletores de empresa do BPO só listam as ativas.
    status: "ACTIVE" as const,
    source: FONTE_DA_DEMO,
  });
  await tx.company.createMany({ data: plano.empresas.filter((e) => !e.matriz).map(dadosDaEmpresa) });
  await tx.company.createMany({ data: plano.empresas.filter((e) => e.matriz).map(dadosDaEmpresa) });

  // ── Acesso do portal: ligado direto à matriz, com as filiais; senha que ninguém conhece ──
  const portalId = novo("portal");
  await tx.portalUser.create({
    data: { id: portalId, tenantId, name: plano.acessoDoPortal.name, email: plano.acessoDoPortal.email, passwordHash: gerar.senhaDescartavel() },
  });
  await tx.portalUserCompany.createMany({ data: [{ id: gerar.id(), tenantId, portalUserId: portalId, companyId: empresa(plano.acessoDoPortal.empresa), incluiFiliais: true }] });
  await tx.portalApprovalLimit.createMany({
    data: [{ id: gerar.id(), tenantId, companyId: empresa(plano.acessoDoPortal.empresa), portalUserId: portalId, maxAmount: valor(plano.acessoDoPortal.alcadaCentavos) }],
  });

  // ── Cadastros financeiros, todos da empresa ───────────────────────────────
  await tx.financeCategory.createMany({
    data: plano.categorias.map((c) => ({
      id: novo(`categoria:${c.chave}`),
      tenantId,
      companyId: empresa(c.empresa),
      // Categoria só da empresa: `scope` = id da empresa (src/lib/financeiro/categoriaDaEmpresa.ts).
      scope: empresa(c.empresa),
      name: c.name,
      kind: c.kind,
      dreGroup: c.dreGroup,
    })),
  });
  await tx.costCenter.createMany({
    data: plano.centros.map((c) => ({ id: novo(`centro:${c.chave}`), tenantId, companyId: empresa(c.empresa), name: c.name, code: c.code })),
  });
  // Sem e-mail, de propósito: a régua de cobrança só procura contraparte com e-mail.
  await tx.financeCounterparty.createMany({
    data: plano.contrapartes.map((c) => ({
      id: novo(`contraparte:${c.chave}`),
      tenantId,
      companyId: empresa(c.empresa),
      name: c.name,
      document: c.document,
      email: null,
      defaultCategoryId: c.categoria ? id(`categoria:${c.categoria}`) : null,
      defaultCostCenterId: c.centro ? id(`centro:${c.centro}`) : null,
    })),
  });
  await tx.bankAccount.createMany({
    data: plano.contas.map((c) => ({
      id: novo(`conta:${c.chave}`),
      tenantId,
      companyId: empresa(c.empresa),
      nickname: c.nickname,
      bankCode: c.bankCode,
      agency: c.agency,
      accountNumber: c.accountNumber,
      accountDigits: c.accountDigits,
      openingBalance: valor(c.aberturaCentavos),
      openingBalanceDate: dia(c.aberturaEm),
    })),
  });

  // ── Acordo antes dos lançamentos: a parcela e o original apontam para ele ──
  await tx.collectionAgreement.createMany({
    data: plano.acordos.map((a) => ({
      id: novo(`acordo:${a.chave}`),
      tenantId,
      companyId: empresa(a.empresa),
      counterpartyId: id(`contraparte:${a.contraparte}`),
      originalAmount: valor(a.originalCentavos),
      agreedAmount: valor(a.acordadoCentavos),
      installments: a.parcelas,
      firstDueDate: dia(a.primeiroVencimento),
      agreedAt: dia(a.acordadoEm),
      notes: a.notas,
      createdById: pessoas.apresentador,
      createdAt: ate(a.acordadoEm, "15:00"),
    })),
  });

  await tx.financeEntry.createMany({
    data: plano.lancamentos.map((l) => {
      const criador = quem(l.criadoPor);
      return {
        id: novo(`lancamento:${l.chave}`),
        tenantId,
        companyId: empresa(l.empresa),
        kind: l.kind,
        status: l.status,
        counterpartyId: id(`contraparte:${l.contraparte}`),
        categoryId: l.categoria ? id(`categoria:${l.categoria}`) : null,
        costCenterId: l.centro ? id(`centro:${l.centro}`) : null,
        competence: l.competence,
        dueDate: dia(l.vencimento),
        paidAt: l.pagoEm ? dia(l.pagoEm) : null,
        amount: valor(l.centavos),
        description: l.descricao,
        createdById: criador,
        reviewedById: criador,
        reviewedAt: ate(l.criadoEm, "10:30"),
        approvalStatus: l.aprovacao,
        approvedAt: l.aprovadoEm ? dia(l.aprovadoEm) : null,
        closeReason: l.renegociadoNo ? ("RENEGOCIADO" as const) : null,
        statusBeforeClose: l.renegociadoNo ? ("CONFERIDO" as const) : null,
        renegotiatedAgreementId: l.renegociadoNo ? id(`acordo:${l.renegociadoNo}`) : null,
        agreementId: l.parcelaDo ? id(`acordo:${l.parcelaDo}`) : null,
        createdAt: ate(l.criadoEm, "10:00"),
      };
    }),
  });
  await tx.financeApprovalEvent.createMany({
    data: plano.aprovacoes.map((a) => ({
      id: gerar.id(),
      entryId: id(`lancamento:${a.lancamento}`),
      decision: a.decisao,
      actorUserId: a.quem === "portal" ? null : quem(a.quem),
      actorPortalUserId: a.quem === "portal" ? portalId : null,
      reason: a.motivo,
      createdAt: new Date(a.quando),
    })),
  });
  await tx.collectionContact.createMany({
    data: plano.contatos.map((c) => ({
      id: gerar.id(),
      tenantId,
      entryId: id(`lancamento:${c.lancamento}`),
      contactedAt: new Date(c.quando),
      channel: c.canal,
      outcome: c.resultado,
      notes: c.notas,
      nextActionAt: c.proximaAcao ? dia(c.proximaAcao) : null,
      userId: quem(c.quem),
    })),
  });
  // Reforço: a régua de cobrança desligada nas empresas da demonstração (aparece na aba Régua).
  await tx.collectionReminderOptOut.createMany({
    data: plano.empresas.map((e) => ({ id: gerar.id(), tenantId, companyId: empresa(e.chave), createdById: pessoas.apresentador })),
  });

  // ── Extratos, transações e conciliações ───────────────────────────────────
  await tx.bankStatementImport.createMany({
    data: plano.extratos.map((x) => ({
      id: novo(`extrato:${x.chave}`),
      tenantId,
      bankAccountId: id(`conta:${x.conta}`),
      fileName: x.fileName,
      periodStart: dia(x.inicio),
      periodEnd: dia(x.fim),
      ledgerBalance: valor(x.saldoCentavos),
      ledgerBalanceAt: dia(x.fim),
      transactionsRead: x.transacoes,
      transactionsNew: x.transacoes,
      importedById: pessoas.apresentador,
      createdAt: ate(somarDias(x.fim, 1), "08:30"),
    })),
  });
  await tx.bankTransaction.createMany({
    data: plano.transacoes.map((t) => {
      const resolvida = t.status !== "PENDENTE";
      return {
        id: novo(`transacao:${t.chave}`),
        tenantId,
        bankAccountId: id(`conta:${t.conta}`),
        importId: id(`extrato:${t.extrato}`),
        fitId: t.fitId,
        postedAt: dia(t.data),
        amount: valor(t.centavos),
        memo: t.memo,
        status: t.status,
        ignoredReason: t.motivoIgnorada,
        reconciledAt: resolvida ? ate(somarDias(t.data, 1), "09:00") : null,
        reconciledById: resolvida ? pessoas.apresentador : null,
      };
    }),
  });
  const centavosDe = new Map(plano.lancamentos.map((l) => [l.chave, l.centavos]));
  await tx.bankTransactionMatch.createMany({
    data: plano.transacoes.flatMap((t) =>
      t.lancamentos.map((l) => ({
        id: gerar.id(),
        transactionId: id(`transacao:${t.chave}`),
        financeEntryId: id(`lancamento:${l}`),
        amount: valor(centavosDe.get(l)!),
        entryStatusBefore: "CONFERIDO" as const,
        entryPaidAtBefore: null,
        createdById: pessoas.apresentador,
      }))
    ),
  });

  // ── Pedidos ao cliente e conversa ─────────────────────────────────────────
  await tx.clientRequest.createMany({
    data: plano.pendencias.map((p) => ({
      id: novo(`pendencia:${p.chave}`),
      tenantId,
      companyId: empresa(p.empresa),
      kind: p.kind,
      title: p.title,
      description: p.description,
      dueDate: prazoDaPendencia(p.vencimento),
      status: p.status,
      financeEntryId: p.lancamento ? id(`lancamento:${p.lancamento}`) : null,
      sectorCode: SETOR,
      createdById: pessoas.apresentador,
      resolvedAt: p.resolvidoEm ? new Date(p.resolvidoEm) : null,
      resolvedById: p.resolvidoEm ? pessoas.apresentador : null,
      createdAt: new Date(p.criadoEm),
    })),
  });
  await tx.clientRequestMessage.createMany({
    data: plano.pendencias.flatMap((p) =>
      p.mensagens.map((m) => ({ id: gerar.id(), requestId: id(`pendencia:${p.chave}`), ...autor(m.quem, portalId), body: m.body, createdAt: new Date(m.quando) }))
    ),
  });
  await tx.companyMessage.createMany({
    data: plano.conversa.map((m) => ({ id: gerar.id(), tenantId, companyId: empresa(m.empresa), ...autor(m.quem, portalId), body: m.body, createdAt: new Date(m.quando) })),
  });

  // ── Orçamento ─────────────────────────────────────────────────────────────
  for (const o of plano.orcamentos) {
    const budgetId = gerar.id();
    await tx.budget.create({
      data: {
        id: budgetId,
        tenantId,
        companyId: empresa(o.empresa),
        year: o.ano,
        name: o.nome,
        status: "APROVADO",
        approvedAt: dia(o.aprovadoEm),
        approvedById: pessoas.apresentador,
        createdById: pessoas.apresentador,
      },
    });
    await tx.budgetLine.createMany({ data: o.linhas.map((x) => ({ id: gerar.id(), budgetId, groupCode: x.grupo, month: x.mes, amount: valor(x.centavos) })) });
  }

  // ── NFS-e: a integração da empresa sem chave nenhuma — a tela abre, nada chama o Omie ──
  const comEmissao = [...new Set(plano.emissoes.map((e) => e.empresa))];
  await tx.tenantIntegration.createMany({
    data: comEmissao.map((e) => ({
      id: gerar.id(),
      tenantId,
      integrationCode: "omie",
      instanceKey: `empresa:${empresa(e)}`,
      label: `${MARCA} Omie da demonstração (sem chave)`,
      enabled: true,
      configEnc: "",
    })),
  });
  const cnpjDe = new Map(plano.empresas.map((e) => [e.chave, e.cnpj]));
  await tx.omieEmissao.createMany({
    data: plano.emissoes.map((x) => ({
      id: gerar.id(),
      tenantId,
      companyId: empresa(x.empresa),
      estado: x.estado,
      tomadorCodigoOmie: x.tomadorCodigo,
      tomadorNome: x.tomadorNome,
      tomadorDocumento: x.tomadorDocumento,
      servicoCodigoOmie: x.servicoCodigo,
      servicoDescricao: x.servicoDescricao,
      valor: valor(x.centavos),
      competencia: x.competencia,
      descricao: x.descricao,
      pedidoPorId: pessoas.apresentador,
      // Sem o código da OS no Omie, a tela não oferece "Cancelar".
      omieCodigoOS: null,
      omieNumeroOS: x.numeroOS,
      nfseNumero: x.nfseNumero,
      nfseCnpjPrestador: cnpjDe.get(x.empresa)!,
      ambiente: "H",
      faturadaEm: x.faturadaEm ? new Date(x.faturadaEm) : null,
      mensagem: x.mensagem,
      canceladaEm: x.canceladaEm ? new Date(x.canceladaEm) : null,
      canceladaPorId: x.canceladaEm ? pessoas.apresentador : null,
      createdAt: new Date(x.quando),
    })),
  });

  // ── Cofre de senhas: só com a chave de cifra da produção ──────────────────
  if (cifrar) {
    await tx.bpoCredential.createMany({
      data: plano.senhas.map((s) => ({
        id: gerar.id(),
        tenantId,
        companyId: empresa(s.empresa),
        title: s.title,
        username: s.username,
        passwordEnc: cifrar(TEXTO_FICTICIO_DO_COFRE),
        url: s.url,
        notes: s.notes,
        createdById: pessoas.apresentador,
      })),
    });
  }

  // ── Manual do BPO ─────────────────────────────────────────────────────────
  const manualId = gerar.id();
  await tx.manualDocument.create({ data: { id: manualId, tenantId, sectorCode: SETOR, title: plano.manual.title, icon: plano.manual.icon, createdById: pessoas.apresentador } });
  await tx.manualPage.createMany({
    data: plano.manual.paginas.map((p, i) => ({ id: gerar.id(), tenantId, documentId: manualId, title: p.title, content: p.content, order: i, createdById: pessoas.apresentador })),
  });

  // ── Solicitações dos clientes: no assunto do BPO que o escritório já usa ──
  const existente = await tx.serviceRequestSubject.findFirst({
    where: { tenantId, sectorCode: SETOR },
    orderBy: [{ active: "desc" }, { order: "asc" }],
    select: { id: true },
  });
  let assuntoId = existente?.id ?? null;
  if (!assuntoId) {
    // Inativo: um assunto "[demo]" ativo apareceria para os clientes de verdade no portal.
    assuntoId = gerar.id();
    await tx.serviceRequestSubject.create({
      data: { id: assuntoId, tenantId, label: `${MARCA} Atendimento do BPO`, sectorCode: SETOR, responseDays: 2, active: false, order: 999 },
    });
  }
  const maior = await tx.serviceRequest.aggregate({ where: { tenantId }, _max: { number: true } });
  let numero = (maior?._max?.number ?? 0) + 1;
  const numeros: number[] = [];
  await tx.serviceRequest.createMany({
    data: plano.solicitacoes.map((s) => {
      numeros.push(numero);
      return {
        id: novo(`solicitacao:${s.chave}`),
        tenantId,
        number: numero++,
        companyId: empresa(s.empresa),
        subjectId: assuntoId!,
        sectorCode: SETOR,
        description: s.description,
        status: s.status,
        responseDue: new Date(s.prazoDeResposta),
        firstResponseAt: s.primeiraRespostaEm ? new Date(s.primeiraRespostaEm) : null,
        assigneeId: quem(s.responsavel),
        openedByPortalUserId: portalId,
        closedAt: s.concluidaEm ? new Date(s.concluidaEm) : null,
        closedById: s.concluidaEm ? quem(s.responsavel) : null,
        lastMessageAt: new Date(s.mensagens[s.mensagens.length - 1]?.quando ?? s.criadoEm),
        createdAt: new Date(s.criadoEm),
      };
    }),
  });
  await tx.serviceRequestMessage.createMany({
    data: plano.solicitacoes.flatMap((s) =>
      s.mensagens.map((m) => ({ id: gerar.id(), requestId: id(`solicitacao:${s.chave}`), ...autor(m.quem, portalId), body: m.body, internal: m.interna, createdAt: new Date(m.quando) }))
    ),
  });

  // Comunicado já "enviado" (notifiedAt preenchido): só a action manda aviso, e ela não roda aqui.
  const comunicadoId = gerar.id();
  await tx.clientAnnouncement.create({
    data: {
      id: comunicadoId,
      tenantId,
      sectorCode: SETOR,
      title: plano.comunicado.title,
      body: plano.comunicado.body,
      createdById: pessoas.apresentador,
      notifiedAt: new Date(plano.comunicado.quando),
      createdAt: new Date(plano.comunicado.quando),
    },
  });
  await tx.clientAnnouncementCompany.createMany({ data: plano.comunicado.empresas.map((e) => ({ id: gerar.id(), announcementId: comunicadoId, companyId: empresa(e) })) });

  // ── A equipe fictícia: contas inativas, sem setor e sem senha ─────────────
  // Inativa não entra no Connect nem aparece para receber tarefa; o "Meu time"
  // mostra a carga dela pelo nome. Sem setor, nenhum aviso ao setor a alcança.
  await tx.user.createMany({
    data: plano.equipe.map((m) => ({
      id: novo(m.chave),
      tenantId,
      name: m.name,
      email: m.email,
      passwordHash: gerar.senhaDescartavel(),
      role: "SECTOR_USER" as const,
      active: false,
    })),
  });

  // ── Quadro do BPO ─────────────────────────────────────────────────────────
  const q = plano.quadro;
  const espacoId = gerar.id();
  await tx.space.create({ data: { id: espacoId, tenantId, sectorCode: SETOR, name: q.espaco.name, color: q.espaco.color, order: 99 } });
  await tx.folder.createMany({ data: q.pastas.map((p, i) => ({ id: novo(p.chave), tenantId, spaceId: espacoId, name: p.name, order: i })) });
  await tx.pipeline.createMany({
    data: q.listas.map((l) => ({
      id: novo(l.chave),
      tenantId,
      sectorCode: SETOR,
      spaceId: espacoId,
      folderId: l.pasta ? id(l.pasta) : null,
      name: l.name,
      color: l.color,
      entityType: "COMPANY" as const,
      active: true,
    })),
  });
  await tx.pipelineStage.createMany({
    data: q.listas.flatMap((l) =>
      l.etapas.map((e, i) => ({ id: novo(e.chave), pipelineId: id(l.chave), name: e.name, order: i, color: e.color, type: e.type, isTerminal: e.type === "DONE" }))
    ),
  });
  await tx.tag.createMany({ data: q.etiquetas.map((t) => ({ id: novo(`etiqueta:${t.name}`), tenantId, sectorCode: SETOR, name: t.name, color: t.color })) });
  for (const c of q.cards) novo(c.chave);
  // Card de empresa (a da demonstração): os alertas da gestão pulam card de empresa "[demo]".
  const dadosDoCard = (c: (typeof q.cards)[number]) => ({
    id: id(c.chave),
    tenantId,
    pipelineId: id(c.lista),
    stageId: id(c.etapa),
    entityType: "COMPANY" as const,
    entityId: empresa(c.empresa),
    title: c.title,
    parentItemId: c.pai ? id(c.pai) : null,
    order: c.ordem,
    priority: c.prioridade,
    startDate: c.inicio ? dia(c.inicio) : null,
    dueDate: c.prazo ? new Date(c.prazo) : null,
    description: c.description || null,
    estimateMinutes: c.estimativaMinutos,
    createdAt: new Date(c.criadoEm),
    updatedAt: new Date(c.atualizadoEm),
  });
  await tx.pipelineItem.createMany({ data: q.cards.filter((c) => !c.pai).map(dadosDoCard) });
  await tx.pipelineItem.createMany({ data: q.cards.filter((c) => c.pai).map(dadosDoCard) });
  await tx.pipelineItemAssignee.createMany({
    data: q.cards.flatMap((c) => [...new Set(c.responsaveis.map(responsavel))].map((userId) => ({ pipelineItemId: id(c.chave), userId }))),
  });
  await tx.pipelineItemTag.createMany({ data: q.cards.flatMap((c) => c.etiquetas.map((t) => ({ pipelineItemId: id(c.chave), tagId: id(`etiqueta:${t}`) }))) });
  await tx.checklistItem.createMany({
    data: q.cards.flatMap((c) => c.checklist.map((x, i) => ({ id: gerar.id(), tenantId, pipelineItemId: id(c.chave), text: x.text, done: x.done, order: i }))),
  });
  // As atividades: primeiro as que não respondem a ninguém, depois as respostas.
  const atividades = q.cards.flatMap((c) => c.atividades.map((a, i) => ({ c, a, i, chave: `${c.chave}:atividade:${i}` })));
  for (const x of atividades) novo(x.chave);
  const dadosDaAtividade = ({ c, a, chave }: (typeof atividades)[number]) => ({
    id: id(chave),
    tenantId,
    pipelineItemId: id(c.chave),
    userId: responsavel(a.quem),
    type: a.tipo,
    content: a.content,
    parentActivityId: a.respostaA === null ? null : id(`${c.chave}:atividade:${a.respostaA}`),
    createdAt: new Date(a.quando),
  });
  await tx.activity.createMany({ data: atividades.filter((x) => x.a.respostaA === null).map(dadosDaAtividade) });
  await tx.activity.createMany({ data: atividades.filter((x) => x.a.respostaA !== null).map(dadosDaAtividade) });
  await tx.timeEntry.createMany({
    data: q.cards.flatMap((c) =>
      c.horas.map((h) => ({ id: gerar.id(), tenantId, pipelineItemId: id(c.chave), userId: responsavel(h.quem), minutes: h.minutos, note: h.nota, loggedOn: dia(h.dia) }))
    ),
  });

  // ── Agenda: sem evento no Google — o link e o id externo são fictícios ────
  await tx.meeting.createMany({
    data: plano.reunioes.map((r) => {
      const meetingId = novo(r.chave);
      return {
        id: meetingId,
        tenantId,
        provider: "GOOGLE" as const,
        title: r.title,
        meetingUrl: `https://exemplo.invalido/reuniao/${meetingId}`,
        externalEventId: `demo-${meetingId}`,
        startAt: new Date(r.inicio),
        endAt: new Date(r.fim),
        pipelineItemId: r.card ? id(r.card) : null,
        sectorCode: SETOR,
        companyId: empresa(r.empresa),
        createdByUserId: pessoas.apresentador,
      };
    }),
  });
  // Ciente desde já: sem isto, o aviso de "reunião em 15 minutos" trava a tela de quem participa.
  await tx.meetingAttendee.createMany({
    data: plano.reunioes.flatMap((r) => [...new Set(r.participantes.map(quem))].map((userId) => ({ meetingId: id(r.chave), userId, acknowledgedAt: agora }))),
  });

  // ── Arquivos: só pastas (os arquivos ficam no disco do servidor) ──────────
  const pastasNaOrdem = [...plano.pastas.filter((p) => !p.pai), ...plano.pastas.filter((p) => p.pai)];
  for (const p of pastasNaOrdem) novo(p.chave);
  await tx.driveFolder.createMany({
    data: pastasNaOrdem.filter((p) => !p.pai).map((p) => ({ id: id(p.chave), tenantId, companyId: p.empresa ? empresa(p.empresa) : null, parentId: null, name: p.name, sectorCode: p.empresa ? null : SETOR, createdById: pessoas.apresentador })),
  });
  await tx.driveFolder.createMany({
    data: pastasNaOrdem.filter((p) => p.pai).map((p) => ({ id: id(p.chave), tenantId, companyId: p.empresa ? empresa(p.empresa) : null, parentId: id(p.pai!), name: p.name, sectorCode: p.empresa ? null : SETOR, createdById: pessoas.apresentador })),
  });

  // ── Notificações de quem apresenta: gravar a linha não manda push ─────────
  const alvo = (a: PlanoDoBpo["avisos"][number]["alvo"]) =>
    !a
      ? { entityType: null, entityId: null }
      : a.tipo === "empresa"
        ? { entityType: "COMPANY" as const, entityId: empresa(a.chave) }
        : { entityType: null, entityId: id(a.tipo === "card" ? a.chave : `${a.tipo}:${a.chave}`) };
  await tx.notification.createMany({
    data: plano.avisos.map((n) => ({
      id: gerar.id(),
      tenantId,
      userId: quem(n.quem),
      type: n.type,
      message: n.message.slice(0, 255),
      ...alvo(n.alvo),
      read: n.lida,
      actorUserId: n.ator ? quem(n.ator) : null,
      createdAt: new Date(n.quando),
    })),
  });

  return {
    ...contagemDoPlano(plano),
    idDaMatriz: empresa("matriz"),
    senhasGravadas: cifrar ? plano.senhas.length : 0,
    numerosDasSolicitacoes: numeros,
    assuntoCriado: !existente,
  };
}
