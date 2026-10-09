// Dados de exemplo do Connect (02/10/2026): um escritório inventado inteiro —
// equipe, empresas, DP, Societário, Recrutamento, quadros de tarefas,
// transferências, solicitações, Valora e Gestão. Tudo inventado (nomes, CNPJs,
// pessoas, valores). Quem chama decide onde e garante que é o lugar certo:
//
// - `scripts/local/dados-ficticios.ts`: o Connect local (só banco local);
// - `scripts/dados-de-exemplo-no-teste.ts`: o escritório "Teste" da produção,
//   para o Marcos ver o Connect com informação (decisão do Kauan em 02/10).
//
// Carrega uma vez: os dois scripts conferem antes se as empresas de exemplo
// (`source` = FONTE) já estão lá.
//
// O que entra:
// - equipe: cinco pessoas, uma por setor, SEM senha que funcione — ninguém
//   entra com elas; servem de responsável, dono e destino de transferência;
// - seis empresas ativas, cada uma no seu grupo, com o responsável por setor;
// - DP: colaboradores das empresas, admissões, férias (uma vencida), afastados,
//   desligamentos (um finalizado no mês) e horas extras para aprovar; e três
//   funcionários internos do escritório;
// - Societário: processos em vários estados (com protocolo, exigência e
//   cliente devendo), licenças a vencer e taxas em aberto — se o escritório já
//   tem os modelos de processo (`seed-societario.ts`);
// - Recrutamento: três vagas e candidatos em todas as etapas do funil;
// - Kanban: espaços do Contábil, do Fiscal e do DP, com cartões, responsáveis,
//   prazos e comentários — o que enche a Gestão, a Meu dia e a home;
// - transferências entre setores e solicitações do portal com assunto e prazo;
// - Valora: custo de equipe e parâmetros inventados, e propostas calculadas
//   pelo motor — ganhas, perdidas e em aberto;
// - Gestão: horas lançadas nos cartões e processos, e cargos com família,
//   senioridade e faixa salarial;
// - reuniões na agenda (opcional: sem Google, são só leitura).

import type { getPrisma } from "../../src/lib/prisma";
import { camposDoRegime } from "../../src/lib/taxRegime";
import { aplicarAjustes, calcular, MODELO_41, normalizarPerfil, type AjusteSetor, type ParametrosPreco } from "../../src/lib/valora/motor";

type Prisma = ReturnType<typeof getPrisma>;

/** Marca das empresas de exemplo — é por ela que os scripts sabem se já carregaram. */
export const FONTE = "ficticio-local";
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

export async function carregarDadosDeExemplo(
  p: Prisma,
  tenantId: string,
  opcoes: { reunioes: boolean; log?: (m: string) => void }
): Promise<void> {
  const log = opcoes.log ?? console.log;
  // Quem aparece como autor (transferências, propostas): o administrador do
  // escritório, ou a primeira pessoa ativa dele. Escritório sem ninguém — o
  // Teste da produção, em que quem entra é o suporte, vindo de outro
  // escritório — ganha uma administradora fictícia, sem senha como o resto.
  const admin =
    (await p.user.findFirst({ where: { tenantId, role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } })) ??
    (await p.user.findFirst({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } }));
  if (!admin) log("Escritório sem usuários: entra a administradora fictícia Helena Prado, sem senha.");
  const adminId =
    admin?.id ??
    (
      await p.user.upsert({
        where: { tenantId_email: { tenantId, email: "helena.prado@exemplo.invalido" } },
        update: {},
        create: { tenantId, name: "Helena Prado", email: "helena.prado@exemplo.invalido", passwordHash: SEM_SENHA, role: "ADMIN", active: true },
        select: { id: true },
      })
    ).id;

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
  for (const moduleCode of ["societario_licencas", "recrutamento_whatsapp", "gestao_valora", "gestao_painel", "gestao_cargos_salarios", "gestao_indicadores_rh"]) {
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
        ...camposDoRegime(e.regime),
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
  log("equipe e 6 empresas");

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
  await p.absence.create({ data: { tenantId, personId: pessoa["Fernanda Alves"], type: "ATESTADO_INTEGRAL", startDate: dia(-9), returnDate: dia(6), status: "AFASTADO", reason: "Atestado médico de 15 dias", lostDays: 15 } });
  await p.absence.create({ data: { tenantId, personId: pessoa["Marcos Vinícius Souza"], type: "LICENCA", startDate: dia(-3), returnDate: dia(2), status: "RETORNO_PREVISTO", reason: "Licença-paternidade", lostDays: 5 } });
  await p.absence.create({ data: { tenantId, personId: pessoa["Aline Fernandes"], type: "AFASTAMENTO", startDate: dia(-1), status: "EM_ANALISE", reason: "Aguardando perícia do INSS" } });

  await p.termination.create({ data: { tenantId, personId: pessoa["Carlos Eduardo Lima"], type: "SEM_JUSTA_CAUSA", noticeType: "INDENIZADO", terminationDate: dia(4), status: "EM_CALCULO", reason: "Redução do quadro" } });
  const desligado = await p.person.create({
    data: { tenantId, name: "Sérgio Antunes", type: "COLABORADOR", currentCompanyId: empresa.mercado, admissionDate: dia(-700), dismissalDate: dia(-12), employmentStatus: "DESLIGADO", email: "sergio.antunes@exemplo.invalido" },
  });
  await p.termination.create({ data: { tenantId, personId: desligado.id, type: "VOLUNTARIO", noticeType: "TRABALHADO", terminationDate: dia(-12), status: "FINALIZADO", finalizedAt: dia(-10), reason: "Pedido de demissão" } });
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
  log("DP: 12 colaboradores, 3 internos, férias, afastamentos, desligamentos, horas extras");

  // ── Societário ──────────────────────────────────────────────────────────
  const tipos = await p.processType.findMany({ where: { tenantId }, select: { id: true, code: true } });
  // Sem os modelos de processo (`scripts/seed-societario.ts`), os processos
  // ficam de fora — cada `processo()` devolve null — e o resto segue.
  if (tipos.length === 0) log("Societário: sem modelos de processo — processos de fora");
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

  const processos: string[] = [];
  const guardar = (r: { id: string } | null) => r && processos.push(r.id);
  guardar(await processo({ tipo: "constituicao", em: "tech", titulo: "Abertura da filial de Joinville", prazo: 25, concluidas: 2 }));
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
  guardar(alvara);
  guardar(await processo({ tipo: "baixa", em: "mercado", titulo: "Baixa da filial do Centro", status: "AGUARDANDO_CLIENTE", prazo: 30, concluidas: 1 }));
  guardar(await processo({ tipo: "regularizacao", em: "construtora", titulo: "Regularização do CNAE junto à Receita", prazo: 2, prioridade: "URGENTE", concluidas: 0 }));

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
  log(`Societário: ${processos.length} processos, 5 licenças, 2 taxas`);

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
  {
    const contratado = await p.person.create({ data: { tenantId, name: "Lucas Andrade", type: "CANDIDATO", email: "lucas.andrade@exemplo.invalido" } });
    await p.candidatura.create({
      data: { tenantId, vagaId: vagas.auxiliar.id, personId: contratado.id, stage: "CONTRATADO", status: "CONTRATADO", hiredAt: dia(-8), origin: "Indicação", createdAt: dia(-20) },
    });
  }
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
  log("Recrutamento: 3 vagas, 10 candidatos");

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
  const cartoes: { id: string; quem: string[] }[] = [];
  async function cartao(q: { pipe: string; etapas: string[] }, c: { em: Chave; titulo: string; etapa: number; prazo: number; quem: string[]; prioridade?: number; comentario?: { autor: string; texto: string } }) {
    const item = await p.pipelineItem.create({
      data: { tenantId, pipelineId: q.pipe, stageId: q.etapas[c.etapa], entityType: "COMPANY", entityId: empresa[c.em], title: `${c.titulo} — ${EMPRESAS.find((e) => e.chave === c.em)?.fantasia}`, dueDate: dia(c.prazo), priority: c.prioridade ?? 0 },
    });
    for (const userId of c.quem) await p.pipelineItemAssignee.create({ data: { pipelineItemId: item.id, userId } });
    if (c.comentario) await p.activity.create({ data: { tenantId, pipelineItemId: item.id, userId: c.comentario.autor, type: "NOTE", content: c.comentario.texto } });
    cartoes.push({ id: item.id, quem: c.quem });
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
  log("Kanban: 3 quadros, 12 cartões");

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
  log("Transferências: 3");

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
    // O pedido do cliente fica só na `description`, como no portal (06/10/2026):
    // repetido como mensagem, ele aparecia duas vezes na tela, a segunda como "Equipe".
    if (s.resposta) await p.serviceRequestMessage.create({ data: { requestId: r.id, authorUserId: responsavel, body: s.resposta, createdAt: dia(s.aberta + 1) } });
  }
  log("Solicitações: 4 assuntos, 5 pedidos");

  // ── Gestão: horas lançadas e cargos com faixa ───────────────────────────
  // Horas dos últimos 20 dias úteis nos cartões e processos — é o que a tela de
  // horas e o diagnóstico do Valora leem.
  let horas = 0;
  for (let d = 1; d <= 28; d++) {
    const quando = dia(-d);
    const semana = quando.getUTCDay();
    if (semana === 0 || semana === 6) continue;
    for (const [i, c] of cartoes.entries()) {
      if ((d + i) % 3 !== 0) continue;
      await p.timeEntry.create({ data: { tenantId, pipelineItemId: c.id, userId: c.quem[0], minutes: 30 + ((d * 7 + i * 11) % 6) * 15, loggedOn: quando, note: "Andamento do mês" } });
      horas++;
    }
    for (const [i, id] of processos.entries()) {
      if ((d + i) % 4 !== 0) continue;
      await p.timeEntry.create({ data: { tenantId, processId: id, userId: equipe.societario, minutes: 45 + ((d + i) % 4) * 15, loggedOn: quando, note: "Protocolo e conferência" } });
      horas++;
    }
  }
  const FAIXAS: Record<string, { familia: string; area: string; senioridade: "JUNIOR" | "PLENO" | "SENIOR" | "ESPECIALISTA"; min: number; max: number }> = {
    Padeira: { familia: "Produção", area: "Operação", senioridade: "PLENO", min: 2200, max: 2900 },
    Atendente: { familia: "Atendimento", area: "Loja", senioridade: "JUNIOR", min: 1700, max: 2100 },
    "Auxiliar de produção": { familia: "Produção", area: "Operação", senioridade: "JUNIOR", min: 1750, max: 2000 },
    Recepcionista: { familia: "Atendimento", area: "Clínica", senioridade: "JUNIOR", min: 1900, max: 2400 },
    "Técnico de enfermagem": { familia: "Saúde", area: "Clínica", senioridade: "PLENO", min: 2900, max: 3700 },
    "Engenheira civil": { familia: "Engenharia", area: "Obras", senioridade: "SENIOR", min: 8500, max: 12000 },
    Pedreiro: { familia: "Obras", area: "Obras", senioridade: "PLENO", min: 2600, max: 3300 },
    Vendedora: { familia: "Comercial", area: "Loja", senioridade: "JUNIOR", min: 1900, max: 2600 },
    Desenvolvedor: { familia: "Tecnologia", area: "Produto", senioridade: "PLENO", min: 5500, max: 8000 },
    "Analista de suporte": { familia: "Tecnologia", area: "Suporte", senioridade: "JUNIOR", min: 3000, max: 3900 },
    "Operador de caixa": { familia: "Atendimento", area: "Loja", senioridade: "JUNIOR", min: 1750, max: 2100 },
    Repositora: { familia: "Operação", area: "Loja", senioridade: "JUNIOR", min: 1650, max: 1900 },
  };
  for (const [k, id] of Object.entries(cargos)) {
    const f = FAIXAS[k.split(":")[1]];
    if (!f) continue;
    await p.cargo.update({
      where: { id },
      data: { family: f.familia, area: f.area, seniority: f.senioridade, salaryRangeMin: f.min, salaryRangeMid: Math.round((f.min + f.max) / 2), salaryRangeMax: f.max },
    });
  }
  log(`Gestão: ${horas} lançamentos de horas e faixas em ${Object.keys(cargos).length} cargos`);

  // ── Valora: custos inventados e propostas pelo motor ─────────────────────
  // Custo de equipe e parâmetros de exemplo — no escritório de verdade são
  // confidenciais e quem preenche é a administração. As propostas passam pelo
  // mesmo cálculo da tela (`calcular`), então os preços batem com os custos.
  const ajustes: AjusteSetor[] = MODELO_41.setores.map((s) => ({
    codigo: s.codigo,
    custoMensal: ({ FIS: 58000, DP: 31000, SOC: 24000, CTB: 72000 } as Record<string, number>)[s.codigo] ?? 30000,
    capacidadeHorasMes: s.capacidadeHorasMes,
    fatorCalibracao: s.fatorCalibracao,
  }));
  const parametros: ParametrosPreco = { despesasFixasMes: 18000, variaveisPct: 15, margemAlvoPct: 22, margemPisoPct: 8, descontoMaximoPct: 12 };
  await p.valoraConfig.upsert({ where: { tenantId }, create: { tenantId, ajustes, parametros }, update: { ajustes, parametros } });
  const catalogo = aplicarAjustes(MODELO_41, ajustes);
  // As ganhas são das empresas do exemplo (05/10): o diagnóstico da carteira só
  // cruza proposta ganha ligada a uma empresa com as horas dela — antes, eram
  // clientes inventados à parte, sem empresa, e o diagnóstico saía vazio.
  const PROPOSTAS: {
    cliente: string;
    em?: Chave;
    regime: "MEI" | "SIMPLES" | "PRESUMIDO" | "REAL";
    setores: string[];
    volumes: Record<string, number>;
    marcadores?: string[];
    status: "ABERTA" | "GANHA" | "PERDIDA";
    oferta: number;
    dias: number;
    motivo?: string;
    concorrente?: number;
  }[] = [
    { cliente: "Pão Dourado", em: "padaria", regime: "SIMPLES", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 3, sociosProLabore: 2, contasBancarias: 2, movimentacoesBancarias: 180 }, marcadores: ["temICMS"], status: "GANHA", oferta: 1, dias: 80 },
    { cliente: "Nuvem Boa", em: "tech", regime: "SIMPLES", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 2, sociosProLabore: 1, contasBancarias: 1, movimentacoesBancarias: 90 }, marcadores: ["prestaServico"], status: "GANHA", oferta: 0.97, dias: 70 },
    { cliente: "Horizonte Sul", em: "construtora", regime: "PRESUMIDO", setores: ["FIS", "DP", "CTB", "SOC"], volumes: { funcionarios: 18, sociosProLabore: 3, contasBancarias: 3, movimentacoesBancarias: 600, socios: 3 }, marcadores: ["temPonto"], status: "GANHA", oferta: 1.02, dias: 60 },
    { cliente: "Transportadora Vale Sul", regime: "REAL", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 42, sociosProLabore: 2, contasBancarias: 5, movimentacoesBancarias: 1500, contratosFinanceiros: 4 }, marcadores: ["temICMS"], status: "PERDIDA", oferta: 1.05, dias: 55, motivo: "Fechou com um escritório que já atendia o grupo", concorrente: 0.82 },
    { cliente: "Vida Plena", em: "clinica", regime: "PRESUMIDO", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 9, sociosProLabore: 2, contasBancarias: 2, movimentacoesBancarias: 260 }, marcadores: ["prestaServico", "tomaServicoComRetencao"], status: "GANHA", oferta: 0.95, dias: 45 },
    { cliente: "Loja Bela Moda", regime: "SIMPLES", setores: ["FIS", "DP"], volumes: { funcionarios: 4, sociosProLabore: 1 }, marcadores: ["temICMS"], status: "PERDIDA", oferta: 1, dias: 40, motivo: "Preço — cliente quis só a folha", concorrente: 0.7 },
    { cliente: "Bom Preço", em: "mercado", regime: "SIMPLES", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 11, sociosProLabore: 2, contasBancarias: 2, movimentacoesBancarias: 220, parcelamentos: 1 }, marcadores: ["temICMS"], status: "GANHA", oferta: 1, dias: 33 },
    { cliente: "Agência Pixel Norte", regime: "SIMPLES", setores: ["FIS", "CTB"], volumes: { sociosProLabore: 3, contasBancarias: 2, movimentacoesBancarias: 140 }, marcadores: ["prestaServico"], status: "PERDIDA", oferta: 1.08, dias: 25, motivo: "Desistiu de trocar de contador agora", concorrente: undefined },
    { cliente: "Mercearia Dona Lurdes", regime: "SIMPLES", setores: ["FIS", "DP"], volumes: { funcionarios: 2, sociosProLabore: 1 }, marcadores: ["temICMS"], status: "ABERTA", oferta: 1, dias: 12 },
    { cliente: "Construtora Alto Padrão", regime: "REAL", setores: ["FIS", "DP", "CTB", "SOC"], volumes: { funcionarios: 65, sociosProLabore: 4, contasBancarias: 6, movimentacoesBancarias: 2200, contratosFinanceiros: 6, licencas: 5, socios: 4 }, marcadores: ["temPonto", "temVariaveis"], status: "ABERTA", oferta: 0.96, dias: 8 },
    { cliente: "Pet Shop Amigo Fiel", regime: "SIMPLES", setores: ["FIS", "DP", "CTB"], volumes: { funcionarios: 5, sociosProLabore: 2, contasBancarias: 1, movimentacoesBancarias: 120 }, marcadores: ["temICMS"], status: "ABERTA", oferta: 1, dias: 5 },
    { cliente: "Escola Pequeno Saber", regime: "PRESUMIDO", setores: ["FIS", "DP", "CTB", "SOC"], volumes: { funcionarios: 23, sociosProLabore: 2, contasBancarias: 3, movimentacoesBancarias: 480, socios: 2, licencas: 3 }, marcadores: ["prestaServico", "temPonto"], status: "ABERTA", oferta: 0.98, dias: 2 },
  ];
  for (const pr of PROPOSTAS) {
    const perfil = normalizarPerfil(
      { regime: pr.regime, setores: pr.setores, volumes: pr.volumes, marcadores: Object.fromEntries((pr.marcadores ?? []).map((m) => [m, true])), complexidades: [] },
      catalogo
    );
    if (!perfil) continue;
    const resultado = calcular(catalogo, perfil, parametros);
    const alvo = resultado.mensal.alvo ?? resultado.mensal.custo;
    await p.valoraProposta.create({
      data: {
        tenantId,
        cliente: pr.cliente,
        companyId: pr.em ? empresa[pr.em] : null,
        perfil,
        resultado: { ...resultado, parametros },
        precoAlvo: resultado.mensal.alvo,
        precoOferecido: Math.round(alvo * pr.oferta),
        status: pr.status,
        motivo: pr.motivo ?? null,
        precoConcorrente: pr.concorrente ? Math.round(alvo * pr.concorrente) : null,
        createdById: adminId,
        createdAt: dia(-pr.dias),
      },
    });
  }
  log(`Valora: custos de exemplo e ${PROPOSTAS.length} propostas`);

  // ── Agenda (opcional) ───────────────────────────────────────────────────
  if (!opcoes.reunioes) return;
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
  log("Agenda: 4 reuniões (só leitura: editar chama o Google)");
}

/**
 * Conserta o Valora de um escritório carregado antes de 05/10/2026: as cinco
 * propostas ganhas eram de clientes inventados à parte, sem empresa, e o
 * diagnóstico da carteira saía vazio ("Nada para comparar ainda"). Liga cada
 * uma à empresa do exemplo que a substituiu no gerador e troca o nome para o
 * dela. Sem `aplicar`, só diz o que faria. Rodar de novo não faz nada: só
 * pega proposta ganha ainda sem empresa.
 */
export const GANHAS_DE_ANTES: Record<string, { em: Chave; cliente: string }> = {
  "Cafeteria Grão Nobre": { em: "padaria", cliente: "Pão Dourado" },
  "Studio Movimento Pilates": { em: "tech", cliente: "Nuvem Boa" },
  "Auto Peças Rodovia": { em: "construtora", cliente: "Horizonte Sul" },
  "Clínica Sorriso Pleno": { em: "clinica", cliente: "Vida Plena" },
  "Marcenaria Pinho Real": { em: "mercado", cliente: "Bom Preço" },
};

export async function ligarGanhasAsEmpresas(p: Prisma, tenantId: string, aplicar: boolean): Promise<string[]> {
  const empresas = await p.company.findMany({ where: { tenantId, source: FONTE }, select: { id: true, name: true } });
  const linhas: string[] = [];
  for (const [antigo, novo] of Object.entries(GANHAS_DE_ANTES)) {
    const nome = EMPRESAS.find((e) => e.chave === novo.em)?.nome;
    const empresa = empresas.find((e) => e.name === nome);
    const proposta = await p.valoraProposta.findFirst({
      where: { tenantId, cliente: antigo, status: "GANHA", companyId: null },
      select: { id: true },
    });
    if (!proposta) {
      linhas.push(`${antigo}: nada a fazer (não existe ou já está ligada)`);
      continue;
    }
    if (!empresa) {
      linhas.push(`${antigo}: a empresa de exemplo "${nome}" não está neste escritório`);
      continue;
    }
    if (aplicar) {
      await p.valoraProposta.update({ where: { id: proposta.id }, data: { companyId: empresa.id, cliente: novo.cliente } });
    }
    linhas.push(`${antigo} → ${novo.cliente}${aplicar ? "" : " (só mostrando)"}`);
  }
  return linhas;
}
