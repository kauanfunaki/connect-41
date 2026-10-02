// Dados fictícios para as telas além do BPO e do portal (02/10/2026), no banco
// LOCAL — pedido do Kauan em 29/09: "dados fictícios em todas as telas" para
// analisar e redesenhar. Só roda pelo lançador:
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/dados-ficticios.ts
//
// Roda depois do seed, da demonstração do BPO, do preparo e dos modelos do
// Societário (`scripts/seed-societario.ts --aplicar`) — o `recriar-banco.mjs`
// já faz tudo nessa ordem. Carrega uma vez: se as empresas fictícias já
// existem, não faz nada (para recomeçar, recrie o banco).
//
// O que entra, tudo inventado (nomes, CNPJs, pessoas):
// - equipe: cinco pessoas, uma por setor, SEM senha que funcione — ninguém
//   entra com elas; servem de responsável, dono e destino de transferência;
// - seis empresas ativas, cada uma no seu grupo, com o responsável por setor;
// - DP: colaboradores das empresas, admissões, férias (uma vencida), afastados,
//   desligamentos em curso e horas extras para aprovar; e três internos da 41;
// - Societário: processos em vários estados (com protocolo, exigência e
//   cliente devendo), licenças a vencer e taxas em aberto;
// - Recrutamento: três vagas e candidatos em todas as etapas do funil;
// - Kanban: espaços do Contábil, do Fiscal e do DP, com cartões, responsáveis,
//   prazos e comentários — o que enche a Gestão, a Meu dia e a home;
// - Transferências entre setores, solicitações do portal com assunto e prazo,
//   e reuniões na agenda (sem Google: são só leitura).

import { getPrisma } from "../../src/lib/prisma";

const FONTE = "ficticio-local";
/** Não é hash de senha nenhuma: ninguém entra com as contas da equipe fictícia. */
const SEM_SENHA = "!sem-senha";

/** CNPJ só com dígitos e com os dígitos verificadores certos. */
function cnpj(base12: string): string {
  const d = base12.split("").map(Number);
  const dv = (pesos: number[]) => {
    const r = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  d.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}

const HOJE = new Date();
/** Meio-dia UTC de hoje + n dias — o jeito do Connect de guardar data de calendário. */
function dia(n: number): Date {
  return new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), HOJE.getUTCDate() + n, 12));
}
/** Um horário de hoje + n dias, em horário de São Paulo (UTC−3). */
function hora(n: number, h: number, m = 0): Date {
  return new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth(), HOJE.getUTCDate() + n, h + 3, m));
}

const EQUIPE = [
  { email: "renata.lopes@exemplo.invalido", nome: "Renata Lopes", role: "SECTOR_ADMIN", setor: "recrutamento" },
  { email: "bruno.teixeira@exemplo.invalido", nome: "Bruno Teixeira", role: "SECTOR_USER", setor: "dp" },
  { email: "larissa.mendes@exemplo.invalido", nome: "Larissa Mendes", role: "SECTOR_ADMIN", setor: "societario" },
  { email: "paulo.rocha@exemplo.invalido", nome: "Paulo Henrique Rocha", role: "SECTOR_USER", setor: "fiscal" },
  { email: "marina.costa@exemplo.invalido", nome: "Marina Costa", role: "SECTOR_USER", setor: "contabil" },
] as const;

const EMPRESAS = [
  { chave: "padaria", nome: "PANIFICADORA PÃO DOURADO LTDA", fantasia: "Pão Dourado", base: "482917300001", cidade: "Curitiba", regime: "Simples Nacional", cnae: "1091-1/02" },
  { chave: "clinica", nome: "CLÍNICA VIDA PLENA LTDA", fantasia: "Vida Plena", base: "573108420001", cidade: "São José dos Pinhais", regime: "Lucro Presumido", cnae: "8630-5/03" },
  { chave: "construtora", nome: "CONSTRUTORA HORIZONTE SUL LTDA", fantasia: "Horizonte Sul", base: "619274580001", cidade: "Curitiba", regime: "Lucro Presumido", cnae: "4120-4/00" },
  { chave: "otica", nome: "ÓTICA ALVORADA LTDA", fantasia: "Ótica Alvorada", base: "704381960001", cidade: "Pinhais", regime: "Simples Nacional", cnae: "4774-1/00" },
  { chave: "tech", nome: "NUVEM BOA SISTEMAS LTDA", fantasia: "Nuvem Boa", base: "835620170001", cidade: "Curitiba", regime: "Simples Nacional", cnae: "6201-5/01" },
  { chave: "mercado", nome: "MERCADO BOM PREÇO LTDA", fantasia: "Bom Preço", base: "916473250001", cidade: "Colombo", regime: "Simples Nacional", cnae: "4711-3/02" },
] as const;
type Chave = (typeof EMPRESAS)[number]["chave"];

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Recusado: só roda no banco local (use scripts/local/com-banco-local.mjs).");
  }
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes (prisma/seed.ts).");
  const tenantId = tenant.id;
  if (await p.company.findFirst({ where: { tenantId, source: FONTE }, select: { id: true } })) {
    console.log("dados fictícios já carregados — para recomeçar, recrie o banco (scripts/local/recriar-banco.mjs)");
    return;
  }
  const admin = await p.user.findFirst({ where: { tenantId, role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) throw new Error("Administrador local não achado.");
  const adminId = admin.id;

  // ── Equipe ──────────────────────────────────────────────────────────────
  const equipe = {} as Record<(typeof EQUIPE)[number]["setor"], string>;
  for (const e of EQUIPE) {
    const u = await p.user.upsert({
      where: { tenantId_email: { tenantId, email: e.email } },
      update: {},
      create: { tenantId, name: e.nome, email: e.email, passwordHash: SEM_SENHA, role: e.role, active: true, sectors: { create: { sectorCode: e.setor } } },
      select: { id: true },
    });
    equipe[e.setor] = u.id;
  }

  // Módulos desligados por padrão que estas telas usam.
  for (const moduleCode of ["societario_licencas", "recrutamento_whatsapp"]) {
    await p.tenantModule.upsert({
      where: { tenantId_moduleCode: { tenantId, moduleCode } },
      update: { enabled: true },
      create: { tenantId, moduleCode, enabled: true },
    });
  }

  // ── Empresas ────────────────────────────────────────────────────────────
  const empresa = {} as Record<Chave, string>;
  for (const e of EMPRESAS) {
    const grupo = await p.clientGroup.create({ data: { tenantId, name: e.fantasia, cnpjRoot: cnpj(e.base).slice(0, 8) } });
    const c = await p.company.create({
      data: {
        tenantId,
        name: e.nome,
        tradeName: e.fantasia,
        cnpj: cnpj(e.base),
        status: "ACTIVE",
        source: FONTE,
        city: e.cidade,
        stateCode: "PR",
        taxRegime: e.regime,
        cnaePrincipal: e.cnae,
        clientGroupId: grupo.id,
        responsibleUserId: adminId,
        email: `contato@${e.chave}.exemplo.invalido`,
        foundationDate: dia(-365 * (3 + EMPRESAS.indexOf(e))),
      },
    });
    empresa[e.chave] = c.id;
    for (const setor of ["contabil", "fiscal", "dp", "societario"] as const) {
      await p.companyService.create({ data: { tenantId, companyId: c.id, sectorCode: setor, responsibleUserId: equipe[setor] } });
    }
  }
  console.log("equipe e 6 empresas");

  // ── DP ──────────────────────────────────────────────────────────────────
  const cargos: Record<string, string> = {};
  async function cargo(chave: Chave, nome: string) {
    const k = `${chave}:${nome}`;
    if (!cargos[k]) cargos[k] = (await p.cargo.create({ data: { tenantId, companyId: empresa[chave], name: nome } })).id;
    return cargos[k];
  }
  const COLABORADORES: { nome: string; em: Chave; cargo: string; admitido: number; salario: number; status?: "ADMISSAO_EM_ANDAMENTO" | "ATIVO" | "AFASTADO" | "EM_FERIAS" }[] = [
    { nome: "Joana Ribeiro", em: "padaria", cargo: "Padeira", admitido: -900, salario: 2450 },
    { nome: "Carlos Eduardo Lima", em: "padaria", cargo: "Atendente", admitido: -420, salario: 1850 },
    { nome: "Fernanda Alves", em: "clinica", cargo: "Recepcionista", admitido: -700, salario: 2100, status: "AFASTADO" },
    { nome: "Rafael Moreira", em: "clinica", cargo: "Técnico de enfermagem", admitido: -1300, salario: 3200 },
    { nome: "Juliana Prado", em: "construtora", cargo: "Engenheira civil", admitido: -1500, salario: 9800, status: "EM_FERIAS" },
    { nome: "Marcos Vinícius Souza", em: "construtora", cargo: "Pedreiro", admitido: -380, salario: 2900 },
    { nome: "Patrícia Gomes", em: "otica", cargo: "Vendedora", admitido: -800, salario: 2000 },
    { nome: "Diego Martins", em: "tech", cargo: "Desenvolvedor", admitido: -600, salario: 6500 },
    { nome: "Aline Fernandes", em: "tech", cargo: "Analista de suporte", admitido: -250, salario: 3400 },
    { nome: "Rodrigo Pereira", em: "mercado", cargo: "Operador de caixa", admitido: -1100, salario: 1900 },
    { nome: "Camila Rocha", em: "mercado", cargo: "Repositora", admitido: 3, salario: 1750, status: "ADMISSAO_EM_ANDAMENTO" },
    { nome: "Tiago Nunes", em: "padaria", cargo: "Auxiliar de produção", admitido: 7, salario: 1800, status: "ADMISSAO_EM_ANDAMENTO" },
  ];
  const pessoa: Record<string, string> = {};
  for (const [i, c] of COLABORADORES.entries()) {
    const novo = await p.person.create({
      data: {
        tenantId,
        name: c.nome,
        type: "COLABORADOR",
        email: `${c.nome.split(" ")[0].toLowerCase()}.${i}@exemplo.invalido`,
        phone: `(41) 9${String(91000000 + i * 1371).slice(0, 4)}-${String(1000 + i * 7).slice(0, 4)}`,
        currentCompanyId: empresa[c.em],
        cargoId: await cargo(c.em, c.cargo),
        admissionDate: dia(c.admitido),
        currentSalary: c.salario,
        employmentStatus: c.status ?? "ATIVO",
        weeklyWorkHours: 44,
      },
    });
    pessoa[c.nome] = novo.id;
  }
  // Internos da 41 (a tela /pessoas).
  for (const nome of ["Ana Beatriz Correia", "Lucas Ferraz", "Sofia Albuquerque"]) {
    await p.person.create({ data: { tenantId, name: nome, type: "COLABORADOR", isInternal: true, employmentStatus: "ATIVO", admissionDate: dia(-500), email: `${nome.split(" ")[0].toLowerCase()}.interno@exemplo.invalido` } });
  }

  const ferias: { quem: string; status: "PLANEJADA" | "SOLICITADA" | "APROVADA" | "PROGRAMADA" | "EM_GOZO"; aquisitivoFim: number; inicio?: number }[] = [
    { quem: "Joana Ribeiro", status: "PLANEJADA", aquisitivoFim: -380 }, // concessivo vencido: aparece como vencida
    { quem: "Rafael Moreira", status: "SOLICITADA", aquisitivoFim: -200, inicio: 20 },
    { quem: "Patrícia Gomes", status: "APROVADA", aquisitivoFim: -90, inicio: 12 },
    { quem: "Rodrigo Pereira", status: "PROGRAMADA", aquisitivoFim: -40, inicio: 35 },
    { quem: "Juliana Prado", status: "EM_GOZO", aquisitivoFim: -150, inicio: -6 },
  ];
  for (const f of ferias) {
    await p.vacation.create({
      data: {
        tenantId,
        personId: pessoa[f.quem],
        acquisitivePeriodStart: dia(f.aquisitivoFim - 365),
        acquisitivePeriodEnd: dia(f.aquisitivoFim),
        concessivePeriodStart: dia(f.aquisitivoFim + 1),
        concessivePeriodEnd: dia(f.aquisitivoFim + 365),
        startDate: f.inicio !== undefined ? dia(f.inicio) : null,
        returnDate: f.inicio !== undefined ? dia(f.inicio + 30) : null,
        status: f.status,
      },
    });
  }
  await p.absence.create({ data: { tenantId, personId: pessoa["Fernanda Alves"], type: "ATESTADO_INTEGRAL", startDate: dia(-9), returnDate: dia(6), status: "AFASTADO", reason: "Atestado médico de 15 dias" } });
  await p.absence.create({ data: { tenantId, personId: pessoa["Marcos Vinícius Souza"], type: "LICENCA", startDate: dia(-3), returnDate: dia(2), status: "RETORNO_PREVISTO", reason: "Licença-paternidade" } });
  await p.absence.create({ data: { tenantId, personId: pessoa["Aline Fernandes"], type: "AFASTAMENTO", startDate: dia(-1), status: "EM_ANALISE", reason: "Aguardando perícia do INSS" } });

  await p.termination.create({ data: { tenantId, personId: pessoa["Carlos Eduardo Lima"], type: "SEM_JUSTA_CAUSA", noticeType: "INDENIZADO", terminationDate: dia(4), status: "EM_CALCULO", reason: "Redução do quadro" } });
  await p.termination.create({ data: { tenantId, personId: pessoa["Aline Fernandes"], type: "EXPERIENCIA", noticeType: "NAO_APLICAVEL", terminationDate: dia(10), status: "DOCUMENTACAO_PENDENTE" } });

  for (const [i, quem] of ["Rafael Moreira", "Marcos Vinícius Souza", "Diego Martins", "Rodrigo Pereira"].entries()) {
    await p.overtimeEntry.create({
      data: {
        tenantId,
        personId: pessoa[quem],
        date: dia(-2 - i),
        dayType: i === 2 ? "DOMINGO" : "UTIL",
        workedHours: 10 + i * 0.5,
        overtimeHours: 2 + i * 0.5,
        status: "PENDENTE_APROVACAO",
        justification: ["Plantão de fechamento", "Concretagem da laje", "Virada de sistema", "Inventário da loja"][i],
      },
    });
  }
  console.log("DP: 12 colaboradores, 3 internos, férias, afastamentos, desligamentos, horas extras");

  // ── Societário ──────────────────────────────────────────────────────────
  const tipos = await p.processType.findMany({ where: { tenantId }, select: { id: true, code: true } });
  if (tipos.length === 0) throw new Error("Rode antes: scripts/seed-societario.ts --aplicar (modelos de processo).");
  const orgaos = await p.processOrgan.findMany({ where: { tenantId }, select: { id: true, name: true, acronym: true } });
  const orgao = (texto: RegExp) => orgaos.find((o) => texto.test(`${o.acronym ?? ""} ${o.name}`))?.id ?? null;
  const junta = orgao(/junta|jucepar/i);
  const prefeitura = orgao(/prefeitura|\bPM\b/i);
  const vigilancia = orgao(/vigil/i);
  const bombeiros = orgao(/bombeiro|\bCB\b/i);
  const ambiente = orgao(/ambient|\bMA\b/i);

  async function processo(params: {
    tipo: string;
    em: Chave;
    titulo: string;
    status?: "EM_ANDAMENTO" | "AGUARDANDO_CLIENTE";
    prazo: number;
    prioridade?: "NORMAL" | "ALTA" | "URGENTE";
    concluidas: number;
    protocolo?: { orgao: string | null; resultado: "PENDENTE" | "EXIGENCIA"; numero: string; exigencia?: string };
  }) {
    const typeId = tipos.find((t) => t.code === params.tipo)?.id;
    if (!typeId) return null;
    const modelo = await p.processTemplate.findFirst({
      where: { tenantId, typeId, published: true },
      orderBy: { version: "desc" },
      select: { id: true, steps: { orderBy: { position: "asc" }, select: { id: true, items: { select: { id: true } } } } },
    });
    if (!modelo) return null;
    const proc = await p.process.create({
      data: {
        tenantId,
        companyId: empresa[params.em],
        typeId,
        templateId: modelo.id,
        title: params.titulo,
        status: params.status ?? "EM_ANDAMENTO",
        statusReason: params.status === "AGUARDANDO_CLIENTE" ? "Falta a assinatura dos sócios no distrato" : null,
        priority: params.prioridade ?? "NORMAL",
        dueAt: dia(params.prazo),
        ownerUserId: equipe.societario,
      },
    });
    let primeiraAberta: string | null = null;
    for (const [i, s] of modelo.steps.entries()) {
      const feita = i < params.concluidas;
      const passo = await p.processStep.create({
        data: { tenantId, processId: proc.id, templateStepId: s.id, status: feita ? "CONCLUIDA" : i === params.concluidas ? "EM_ANDAMENTO" : "PENDENTE" },
      });
      if (!feita && !primeiraAberta) primeiraAberta = passo.id;
      for (const item of s.items) {
        await p.processChecklistItem.create({ data: { tenantId, stepId: passo.id, templateItemId: item.id, ...(feita ? { done: true, doneAt: dia(-5) } : {}) } });
      }
    }
    if (params.protocolo?.orgao) {
      const prot = await p.processProtocol.create({
        data: { tenantId, processId: proc.id, organId: params.protocolo.orgao, stepId: primeiraAberta, number: params.protocolo.numero, outcome: params.protocolo.resultado },
      });
      if (params.protocolo.exigencia) {
        await p.processRequirement.create({ data: { tenantId, protocolId: prot.id, description: params.protocolo.exigencia } });
      }
      return { id: proc.id, protocolo: prot.id };
    }
    return { id: proc.id, protocolo: null };
  }

  await processo({ tipo: "constituicao", em: "tech", titulo: "Abertura da filial de Joinville", prazo: 25, concluidas: 2 });
  await processo({
    tipo: "alteracao_contratual",
    em: "padaria",
    titulo: "Entrada de novo sócio",
    prazo: 12,
    concluidas: 3,
    protocolo: { orgao: junta, resultado: "PENDENTE", numero: "PRJ2611045789" },
  });
  const alvara = await processo({
    tipo: "alvara",
    em: "clinica",
    titulo: "Alvará da nova sala de exames",
    prazo: 6,
    prioridade: "ALTA",
    concluidas: 1,
    protocolo: { orgao: prefeitura, resultado: "EXIGENCIA", numero: "ALV-2026-08812", exigencia: "Apresentar a planta baixa assinada pelo responsável técnico" },
  });
  await processo({ tipo: "baixa", em: "mercado", titulo: "Baixa da filial do Centro", status: "AGUARDANDO_CLIENTE", prazo: 30, concluidas: 1 });
  await processo({ tipo: "regularizacao", em: "construtora", titulo: "Regularização do CNAE junto à Receita", prazo: 2, prioridade: "URGENTE", concluidas: 0 });

  const licencas: { em: Chave; tipo: string; orgao: string | null; vence: number; numero: string }[] = [
    { em: "clinica", tipo: "Licença sanitária", orgao: vigilancia, vence: -4, numero: "VISA-55201" },
    { em: "padaria", tipo: "Alvará de funcionamento", orgao: prefeitura, vence: 18, numero: "AF-2025-33190" },
    { em: "construtora", tipo: "AVCB", orgao: bombeiros, vence: 55, numero: "AVCB-118734" },
    { em: "mercado", tipo: "Licença ambiental", orgao: ambiente, vence: 300, numero: "LA-2025-0412" },
    { em: "otica", tipo: "Alvará de funcionamento", orgao: prefeitura, vence: 120, numero: "AF-2025-41877" },
  ];
  for (const l of licencas) {
    await p.license.create({ data: { tenantId, companyId: empresa[l.em], organId: l.orgao, kind: l.tipo, number: l.numero, issuedAt: dia(l.vence - 365), expiresAt: dia(l.vence) } });
  }
  await p.processFee.create({ data: { tenantId, companyId: empresa.clinica, processId: alvara?.id, protocolId: alvara?.protocolo, description: "Taxa de licença de funcionamento", amountCents: 48_730, dueDate: dia(5) } });
  await p.processFee.create({ data: { tenantId, companyId: empresa.padaria, description: "Taxa da Junta Comercial — alteração", amountCents: 21_600, dueDate: dia(9) } });
  console.log("Societário: 5 processos, 5 licenças, 2 taxas");

  // ── Recrutamento ────────────────────────────────────────────────────────
  const vagas = {
    auxiliar: await p.vaga.create({
      data: { tenantId, companyId: empresa.padaria, sectorCode: "recrutamento", title: "Auxiliar de produção", status: "ABERTA", priority: "ALTA", quantity: 2, responsibleUserId: equipe.recrutamento, workMode: "PRESENCIAL", contractType: "CLT", workCity: "Curitiba", workStateCode: "PR", salaryMin: 1800, salaryMax: 2100, openedAt: dia(-12) },
    }),
    recepcao: await p.vaga.create({
      data: { tenantId, companyId: empresa.clinica, sectorCode: "recrutamento", title: "Recepcionista", status: "EM_ANDAMENTO", responsibleUserId: equipe.recrutamento, workMode: "PRESENCIAL", contractType: "CLT", workCity: "São José dos Pinhais", workStateCode: "PR", openedAt: dia(-25) },
    }),
    dev: await p.vaga.create({
      data: {
        tenantId,
        companyId: empresa.tech,
        sectorCode: "recrutamento",
        title: "Desenvolvedor(a) Front-end",
        status: "ABERTA",
        responsibleUserId: equipe.recrutamento,
        isPublic: true,
        publicDescription: "Time pequeno, produto próprio. React e TypeScript no dia a dia.",
        workMode: "REMOTO",
        contractType: "PJ",
        salaryMin: 5500,
        salaryMax: 8000,
        showSalary: true,
        openedAt: dia(-5),
      },
    }),
  };
  const CANDIDATOS: { nome: string; vaga: keyof typeof vagas; etapa: "TRIAGEM" | "ENTREVISTA" | "TESTE" | "PROPOSTA"; status?: "REPROVADO" | "DESISTENTE"; origem: string }[] = [
    { nome: "Gabriel Santos", vaga: "auxiliar", etapa: "TRIAGEM", origem: "Portal de vagas" },
    { nome: "Larissa Oliveira", vaga: "auxiliar", etapa: "TRIAGEM", origem: "WhatsApp" },
    { nome: "Eduardo Ramos", vaga: "auxiliar", etapa: "ENTREVISTA", origem: "Indicação" },
    { nome: "Bianca Cardoso", vaga: "auxiliar", etapa: "TRIAGEM", status: "REPROVADO", origem: "Portal de vagas" },
    { nome: "Vanessa Lima", vaga: "recepcao", etapa: "ENTREVISTA", origem: "Portal de vagas" },
    { nome: "Mariana Duarte", vaga: "recepcao", etapa: "PROPOSTA", origem: "Indicação" },
    { nome: "Thiago Barbosa", vaga: "recepcao", etapa: "TESTE", status: "DESISTENTE", origem: "Portal de vagas" },
    { nome: "Pedro Henrique Alves", vaga: "dev", etapa: "TESTE", origem: "LinkedIn" },
    { nome: "Isabela Freitas", vaga: "dev", etapa: "ENTREVISTA", origem: "Portal de vagas" },
    { nome: "Felipe Carvalho", vaga: "dev", etapa: "TRIAGEM", origem: "Portal de vagas" },
  ];
  for (const [i, c] of CANDIDATOS.entries()) {
    const pessoaCandidata = await p.person.create({
      data: { tenantId, name: c.nome, type: "CANDIDATO", email: `${c.nome.split(" ")[0].toLowerCase()}.candidato${i}@exemplo.invalido`, phone: `(41) 98${String(700 + i * 13)}-${String(2200 + i * 41)}` },
    });
    await p.candidatura.create({
      data: {
        tenantId,
        vagaId: vagas[c.vaga].id,
        personId: pessoaCandidata.id,
        stage: c.etapa,
        status: c.status ?? "EM_ANDAMENTO",
        origin: c.origem,
        rejectionReason: c.status === "REPROVADO" ? "Sem disponibilidade para o turno da madrugada" : null,
        withdrawalReason: c.status === "DESISTENTE" ? "Aceitou outra proposta" : null,
        pretensaoSalarial: c.vaga === "dev" ? 7000 : 2000,
        createdAt: dia(-10 + i),
      },
    });
  }
  console.log("Recrutamento: 3 vagas, 10 candidatos");

  // ── Kanban ──────────────────────────────────────────────────────────────
  async function quadro(setor: string, espaco: string, nome: string, cor: string) {
    const space = await p.space.create({ data: { tenantId, sectorCode: setor, name: espaco, color: cor } });
    const pipe = await p.pipeline.create({ data: { tenantId, sectorCode: setor, spaceId: space.id, name: nome, entityType: "COMPANY" } });
    const etapas = [
      { name: "A fazer", type: "NOT_STARTED" as const },
      { name: "Em andamento", type: "IN_PROGRESS" as const },
      { name: "Aguardando cliente", type: "PENDING" as const },
      { name: "Concluído", type: "DONE" as const },
    ];
    const ids: string[] = [];
    for (const [order, e] of etapas.entries()) {
      ids.push((await p.pipelineStage.create({ data: { pipelineId: pipe.id, name: e.name, order, type: e.type, isTerminal: e.type === "DONE" } })).id);
    }
    return { pipe: pipe.id, etapas: ids };
  }
  async function cartao(q: { pipe: string; etapas: string[] }, c: { em: Chave; titulo: string; etapa: number; prazo: number; quem: string[]; prioridade?: number; comentario?: { autor: string; texto: string } }) {
    const item = await p.pipelineItem.create({
      data: { tenantId, pipelineId: q.pipe, stageId: q.etapas[c.etapa], entityType: "COMPANY", entityId: empresa[c.em], title: `${c.titulo} — ${EMPRESAS.find((e) => e.chave === c.em)?.fantasia}`, dueDate: dia(c.prazo), priority: c.prioridade ?? 0 },
    });
    for (const userId of c.quem) await p.pipelineItemAssignee.create({ data: { pipelineItemId: item.id, userId } });
    if (c.comentario) await p.activity.create({ data: { tenantId, pipelineItemId: item.id, userId: c.comentario.autor, type: "NOTE", content: c.comentario.texto } });
  }

  const contabil = await quadro("contabil", "Contábil", "Fechamento mensal", "#2F6FDE");
  await cartao(contabil, { em: "padaria", titulo: "Fechamento de setembro", etapa: 1, prazo: 3, quem: [equipe.contabil, adminId], comentario: { autor: equipe.contabil, texto: "Faltam as notas de compra da segunda quinzena." } });
  await cartao(contabil, { em: "clinica", titulo: "Fechamento de setembro", etapa: 2, prazo: 1, quem: [equipe.contabil], prioridade: 2, comentario: { autor: equipe.contabil, texto: "Cliente ficou de mandar o extrato da conta da Caixa." } });
  await cartao(contabil, { em: "construtora", titulo: "Fechamento de setembro", etapa: 0, prazo: 6, quem: [equipe.contabil] });
  await cartao(contabil, { em: "tech", titulo: "Balancete do 3º trimestre", etapa: 0, prazo: -1, quem: [adminId], prioridade: 2 });
  await cartao(contabil, { em: "otica", titulo: "Fechamento de agosto", etapa: 3, prazo: -20, quem: [equipe.contabil] });

  const fiscal = await quadro("fiscal", "Fiscal", "Obrigações do mês", "#0E8A6A");
  await cartao(fiscal, { em: "padaria", titulo: "Apuração do Simples (PGDAS-D)", etapa: 1, prazo: 0, quem: [equipe.fiscal, adminId], prioridade: 1 });
  await cartao(fiscal, { em: "mercado", titulo: "Apuração do Simples (PGDAS-D)", etapa: 0, prazo: 0, quem: [equipe.fiscal] });
  await cartao(fiscal, { em: "clinica", titulo: "EFD-Reinf", etapa: 0, prazo: 13, quem: [equipe.fiscal] });
  await cartao(fiscal, { em: "construtora", titulo: "DCTFWeb", etapa: 2, prazo: 13, quem: [equipe.fiscal], comentario: { autor: equipe.fiscal, texto: "Aguardando a folha fechada do DP." } });

  const dp = await quadro("dp", "DP", "Folha de pagamento", "#7A4CC2");
  await cartao(dp, { em: "construtora", titulo: "Folha de setembro", etapa: 1, prazo: 3, quem: [equipe.dp], prioridade: 1 });
  await cartao(dp, { em: "mercado", titulo: "Admissão — Camila Rocha", etapa: 0, prazo: 2, quem: [equipe.dp, adminId] });
  await cartao(dp, { em: "padaria", titulo: "Rescisão — Carlos Eduardo Lima", etapa: 1, prazo: 4, quem: [equipe.dp] });
  console.log("Kanban: 3 quadros, 12 cartões");

  // ── Transferências ──────────────────────────────────────────────────────
  async function transferencia(params: { de: string; em: Chave; mensagem: string; prioridade: "LOW" | "MEDIUM" | "HIGH" | "URGENT"; destinos: { setor: string; status: "NEW" | "IN_PROGRESS" | "DONE"; quem?: string; instrucao: string }[] }) {
    const h = await p.handoff.create({
      data: { tenantId, fromSector: params.de, entityType: "COMPANY", entityId: empresa[params.em], requestedBy: adminId, message: params.mensagem, priority: params.prioridade },
    });
    for (const d of params.destinos) {
      const hs = await p.handoffSector.create({
        data: { tenantId, handoffId: h.id, sectorCode: d.setor, status: d.status, instruction: d.instrucao, resolvedAt: d.status === "DONE" ? dia(-1) : null },
      });
      if (d.quem) await p.handoffSectorAssignee.create({ data: { handoffSectorId: hs.id, userId: d.quem } });
    }
  }
  await transferencia({
    de: "comercial",
    em: "tech",
    mensagem: "Cliente novo: contrato assinado, começa em outubro.",
    prioridade: "HIGH",
    destinos: [
      { setor: "contabil", status: "IN_PROGRESS", quem: equipe.contabil, instrucao: "Levantar os saldos de abertura." },
      { setor: "fiscal", status: "NEW", instrucao: "Conferir o enquadramento no Simples." },
      { setor: "dp", status: "DONE", quem: equipe.dp, instrucao: "Cadastrar os dois funcionários." },
    ],
  });
  await transferencia({
    de: "societario",
    em: "padaria",
    mensagem: "Alteração contratual protocolada — novo sócio entra no quadro.",
    prioridade: "MEDIUM",
    destinos: [{ setor: "contabil", status: "NEW", instrucao: "Ajustar a distribuição de lucros a partir de novembro." }],
  });
  await transferencia({
    de: "dp",
    em: "construtora",
    mensagem: "Folha de setembro fechada.",
    prioridade: "URGENT",
    destinos: [{ setor: "fiscal", status: "IN_PROGRESS", quem: equipe.fiscal, instrucao: "Pode transmitir a DCTFWeb." }],
  });
  console.log("Transferências: 3");

  // ── Solicitações do portal ──────────────────────────────────────────────
  const assuntos = {
    guia: await p.serviceRequestSubject.upsert({
      where: { tenantId_label: { tenantId, label: "Segunda via de guia" } },
      update: {},
      create: { tenantId, label: "Segunda via de guia", sectorCode: "fiscal", responseDays: 2 },
    }),
    endereco: await p.serviceRequestSubject.upsert({
      where: { tenantId_label: { tenantId, label: "Alteração de endereço" } },
      update: {},
      create: { tenantId, label: "Alteração de endereço", sectorCode: "societario", responseDays: 5 },
    }),
    declaracao: await p.serviceRequestSubject.upsert({
      where: { tenantId_label: { tenantId, label: "Declaração de faturamento" } },
      update: {},
      create: { tenantId, label: "Declaração de faturamento", sectorCode: "contabil", responseDays: 3 },
    }),
    admissao: await p.serviceRequestSubject.upsert({
      where: { tenantId_label: { tenantId, label: "Admissão de funcionário" } },
      update: {},
      create: { tenantId, label: "Admissão de funcionário", sectorCode: "dp", responseDays: 2 },
    }),
  };
  let numero = ((await p.serviceRequest.aggregate({ where: { tenantId }, _max: { number: true } }))._max.number ?? 0) + 1;
  const pedidos: { em: Chave; assunto: keyof typeof assuntos; texto: string; status: "ABERTA" | "EM_ANDAMENTO" | "AGUARDANDO_CLIENTE" | "CONCLUIDA"; aberta: number; prazo: number; resposta?: string }[] = [
    { em: "otica", assunto: "guia", texto: "Perdi a guia do DAS de setembro, podem mandar de novo?", status: "ABERTA", aberta: -3, prazo: -1 },
    { em: "mercado", assunto: "endereco", texto: "Vamos mudar a loja para a Rua XV, 1200, a partir de novembro.", status: "EM_ANDAMENTO", aberta: -2, prazo: 3, resposta: "Já iniciamos o levantamento dos documentos." },
    { em: "clinica", assunto: "declaracao", texto: "Preciso da declaração de faturamento dos últimos 12 meses para o banco.", status: "AGUARDANDO_CLIENTE", aberta: -4, prazo: -1, resposta: "Pode confirmar se é em nome da matriz ou da filial?" },
    { em: "padaria", assunto: "admissao", texto: "Contratamos o Tiago para a produção, começa segunda.", status: "ABERTA", aberta: 0, prazo: 2 },
    { em: "tech", assunto: "guia", texto: "Guia do ISS de agosto.", status: "CONCLUIDA", aberta: -9, prazo: -7, resposta: "Enviada por aqui. Qualquer coisa é só chamar." },
  ];
  for (const s of pedidos) {
    const assunto = assuntos[s.assunto];
    const responsavel = s.status === "ABERTA" ? null : equipe[assunto.sectorCode as keyof typeof equipe] ?? adminId;
    const r = await p.serviceRequest.create({
      data: {
        tenantId,
        number: numero++,
        companyId: empresa[s.em],
        subjectId: assunto.id,
        sectorCode: assunto.sectorCode,
        description: s.texto,
        status: s.status,
        responseDue: dia(s.prazo),
        assigneeId: responsavel,
        firstResponseAt: s.resposta ? dia(s.aberta + 1) : null,
        closedAt: s.status === "CONCLUIDA" ? dia(s.aberta + 2) : null,
        closedById: s.status === "CONCLUIDA" ? responsavel : null,
        createdAt: dia(s.aberta),
        lastMessageAt: dia(s.resposta ? s.aberta + 1 : s.aberta),
      },
    });
    await p.serviceRequestMessage.create({ data: { requestId: r.id, body: s.texto, createdAt: dia(s.aberta) } });
    if (s.resposta) await p.serviceRequestMessage.create({ data: { requestId: r.id, authorUserId: responsavel, body: s.resposta, createdAt: dia(s.aberta + 1) } });
  }
  console.log("Solicitações: 4 assuntos, 5 pedidos");

  // ── Agenda ──────────────────────────────────────────────────────────────
  const reunioes: { titulo: string; dia: number; h: number; dur: number; em?: Chave; setor: string; convidados: string[] }[] = [
    { titulo: "Alinhamento do fechamento com a Pão Dourado", dia: 1, h: 10, dur: 45, em: "padaria", setor: "contabil", convidados: [equipe.contabil] },
    { titulo: "Entrevista — Mariana Duarte (Recepcionista)", dia: 2, h: 14, dur: 30, em: "clinica", setor: "recrutamento", convidados: [equipe.recrutamento] },
    { titulo: "Reunião de início — Nuvem Boa", dia: 3, h: 9, dur: 60, em: "tech", setor: "comercial", convidados: [equipe.fiscal, equipe.dp] },
    { titulo: "Ritual semanal do Societário", dia: 7, h: 16, dur: 30, setor: "societario", convidados: [equipe.societario] },
  ];
  for (const [i, r] of reunioes.entries()) {
    const inicio = hora(r.dia, r.h);
    const m = await p.meeting.create({
      data: {
        tenantId,
        provider: "GOOGLE",
        title: r.titulo,
        meetingUrl: `https://meet.google.com/fic-tici-o${i}`,
        externalEventId: `local-ficticio-${i}`,
        startAt: inicio,
        endAt: new Date(inicio.getTime() + r.dur * 60_000),
        sectorCode: r.setor,
        companyId: r.em ? empresa[r.em] : null,
        createdByUserId: adminId,
      },
    });
    for (const userId of r.convidados) await p.meetingAttendee.create({ data: { meetingId: m.id, userId } });
  }
  console.log("Agenda: 4 reuniões (só leitura: editar chama o Google)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
