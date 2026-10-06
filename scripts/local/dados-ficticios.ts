// Dados fictícios para as telas além do BPO e do portal, no banco LOCAL —
// pedido do Kauan em 29/09: "dados fictícios em todas as telas" para analisar e
// redesenhar. Só roda pelo lançador:
//
//   node scripts/local/com-banco-local.mjs npx tsx scripts/local/dados-ficticios.ts
//
// Roda depois do seed, da demonstração do BPO, do preparo e dos modelos do
// Societário (`scripts/seed-societario.ts --aplicar`) — o `recriar-banco.mjs`
// já faz tudo nessa ordem. O que entra está em `scripts/dados-de-exemplo/gerador.ts`
// (o mesmo do escritório "Teste" da produção). Carrega uma vez: para recomeçar,
// recrie o banco.
//
// Por cima do gerador, o que só o banco local precisa para os vídeos da ajuda
// (06/10/2026): um processo na empresa do cliente do portal, contas a aprovar
// lançadas por outra pessoa, leads, competências, a permissão de salário do
// administrador e dois processos com ele — ver as funções no fim do arquivo.

import { getPrisma } from "../../src/lib/prisma";
import { carregarDadosDeExemplo, FONTE } from "../dados-de-exemplo/gerador";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "mysql://x@invalido/x");
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Recusado: só roda no banco local (use scripts/local/com-banco-local.mjs).");
  }
  const p = getPrisma();
  const tenant = await p.tenant.findUnique({ where: { slug: "41tech" }, select: { id: true } });
  if (!tenant) throw new Error("Rode o seed antes (prisma/seed.ts).");
  if (await p.company.findFirst({ where: { tenantId: tenant.id, source: FONTE }, select: { id: true } })) {
    console.log("dados fictícios já carregados — para recomeçar, recrie o banco (scripts/local/recriar-banco.mjs)");
    return;
  }
  await carregarDadosDeExemplo(p, tenant.id, { reunioes: true });
  await processoDoClienteDoPortal(p, tenant.id);
  await contasLancadasPorOutraPessoa(p, tenant.id);
  await leadsDeExemplo(p, tenant.id);
  await ajustesParaAsTelasDePessoas(p, tenant.id);
}

/**
 * O que as telas de DP, Gestão e Societário pedem para não abrir vazias nos
 * vídeos (06/10/2026), tudo inventado:
 * - o administrador vê salário (a faixa dos cargos e o relatório de
 *   distorções só aparecem para quem tem a permissão do campo SALARIO);
 * - quatro competências, sem as quais a avaliação de desempenho não avalia;
 * - dois processos do Societário passam para a administradora local, para a
 *   "Minha área" dela ter o que mostrar.
 */
async function ajustesParaAsTelasDePessoas(p: ReturnType<typeof getPrisma>, tenantId: string) {
  await p.fieldPermission.upsert({
    where: { tenantId_role_fieldGroup: { tenantId, role: "ADMIN", fieldGroup: "SALARIO" } },
    update: { canView: true },
    create: { tenantId, role: "ADMIN", fieldGroup: "SALARIO", canView: true },
  });
  if (!(await p.competency.findFirst({ where: { tenantId }, select: { id: true } }))) {
    const competencias = [
      { name: "Comunicação", description: "Clareza com o cliente e com a equipe." },
      { name: "Organização", description: "Prazos, rotina e registro do que foi feito." },
      { name: "Conhecimento técnico", description: "Domínio das rotinas do setor." },
      { name: "Trabalho em equipe", description: "Ajuda os colegas e pede ajuda quando precisa." },
    ];
    for (const c of competencias) await p.competency.create({ data: { tenantId, ...c } });
  }
  const admin = await p.user.findFirst({ where: { tenantId, email: "adm6@41bpo.com.br" }, select: { id: true } });
  if (admin) {
    await p.process.updateMany({
      where: { tenantId, title: { in: ["Alvará da nova sala de exames", "Entrada de novo sócio"] } },
      data: { ownerUserId: admin.id },
    });
  }
  console.log("ajustes das telas de pessoas e do Societário aplicados");
}

/**
 * Três leads, como se tivessem chegado pela ficha "Quero ser cliente" do
 * portal (06/10/2026). A ficha só recebe com `PORTAL_ESCRITORIO_SLUG` no
 * ambiente, que o Connect local não tem — e a tela de Leads abriria vazia.
 * Pessoas e empresas inventadas.
 */
async function leadsDeExemplo(p: ReturnType<typeof getPrisma>, tenantId: string) {
  if (await p.lead.findFirst({ where: { tenantId }, select: { id: true } })) return;
  const agora = Date.now();
  const horasAtras = (h: number) => new Date(agora - h * 3600_000);
  const leads = [
    {
      name: "Juliana Ramos",
      email: "juliana.ramos@exemplo.invalido",
      phone: "41999990101",
      companyName: "Doceria Ramos",
      message: "Abri uma doceria e preciso de contabilidade e folha para dois funcionários.",
      status: "NOVO" as const,
      createdAt: horasAtras(3),
    },
    {
      name: "Eduardo Lins",
      email: "eduardo.lins@exemplo.invalido",
      phone: "41999990202",
      companyName: "Lins Engenharia",
      message: "Quero trocar de escritório. Somos do Lucro Presumido, com 12 funcionários.",
      status: "EM_CONTATO" as const,
      createdAt: horasAtras(30),
    },
    {
      name: "Patrícia Moura",
      email: "patricia.moura@exemplo.invalido",
      phone: null,
      companyName: null,
      message: "Sou MEI e quero saber quando vale virar ME.",
      status: "NOVO" as const,
      createdAt: horasAtras(52),
    },
  ];
  for (const l of leads) {
    await p.lead.create({ data: { tenantId, ...l, source: "PORTAL_FICHA", privacyAcceptedAt: l.createdAt, updatedAt: l.createdAt } });
  }
  console.log("leads de exemplo criados");
}

/**
 * As contas que esperam aprovação passam a ser "lançadas" pela Marina Costa
 * (fictícia), e não pela administradora local (06/10/2026): quem lançou a
 * conta não pode aprová-la, e o vídeo das Aprovações entra como a Camila.
 */
async function contasLancadasPorOutraPessoa(p: ReturnType<typeof getPrisma>, tenantId: string) {
  const marina = await p.user.findFirst({ where: { tenantId, email: "marina.costa@exemplo.invalido" }, select: { id: true } });
  if (!marina) return;
  await p.financeEntry.updateMany({ where: { tenantId, approvalStatus: "AGUARDANDO" }, data: { createdById: marina.id } });
}

/**
 * Um processo do Societário na empresa do cliente do portal (06/10/2026): sem
 * ele, o quadro "Processos em andamento" do Início do portal abre vazio no
 * vídeo. Os processos do gerador são das seis empresas fictícias, e não da
 * Transportes Modelo, que é a do cliente `cliente.demo@`.
 */
async function processoDoClienteDoPortal(p: ReturnType<typeof getPrisma>, tenantId: string) {
  const titulo = "Mudança de endereço da matriz";
  if (await p.process.findFirst({ where: { tenantId, title: titulo }, select: { id: true } })) return;
  const cliente = await p.portalUser.findFirst({ where: { tenantId, email: "cliente.demo@exemplo.invalido" }, select: { clientGroupId: true } });
  const empresa = cliente
    ? await p.company.findFirst({ where: { tenantId, clientGroupId: cliente.clientGroupId, cnpj: { not: null } }, select: { id: true } })
    : null;
  const tipo = await p.processType.findFirst({ where: { tenantId, code: "alteracao_contratual" }, select: { id: true } });
  const modelo = tipo
    ? await p.processTemplate.findFirst({
        where: { tenantId, typeId: tipo.id, published: true },
        orderBy: { version: "desc" },
        select: { id: true, steps: { orderBy: { position: "asc" }, select: { id: true, items: { select: { id: true } } } } },
      })
    : null;
  const responsavel = await p.user.findFirst({ where: { tenantId, email: "larissa.mendes@exemplo.invalido" }, select: { id: true } });
  if (!empresa || !tipo || !modelo) {
    console.log("processo do cliente do portal: faltou a empresa ou o modelo de alteração contratual — ficou de fora");
    return;
  }
  const hoje = new Date();
  const dia = (n: number) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + n, 12));
  const processo = await p.process.create({
    data: {
      tenantId,
      companyId: empresa.id,
      typeId: tipo.id,
      templateId: modelo.id,
      title: titulo,
      status: "EM_ANDAMENTO",
      priority: "NORMAL",
      dueAt: dia(20),
      ownerUserId: responsavel?.id ?? null,
    },
  });
  // As duas primeiras etapas feitas, a terceira em andamento.
  for (const [i, s] of modelo.steps.entries()) {
    const feita = i < 2;
    const etapa = await p.processStep.create({
      data: { tenantId, processId: processo.id, templateStepId: s.id, status: feita ? "CONCLUIDA" : i === 2 ? "EM_ANDAMENTO" : "PENDENTE" },
    });
    for (const item of s.items) {
      await p.processChecklistItem.create({
        data: { tenantId, stepId: etapa.id, templateItemId: item.id, ...(feita ? { done: true, doneAt: dia(-3) } : {}) },
      });
    }
  }
  console.log("processo do cliente do portal criado");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
