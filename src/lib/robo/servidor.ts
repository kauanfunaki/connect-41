// A fila do robô do Societário (30/10/2026) — o banco. A regra mora em
// `tarefas.ts`, e a decisão do alvará em `alvara.ts`.

import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { isModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { pessoaOuRotina } from "@/lib/auditoria/rotinas";
import { notifyUser } from "@/lib/notifications";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { pastaDoModeloDaEmpresa } from "@/lib/serpro/situacaoFiscal";
import { ErroOps, type CredencialAutenticadaOps } from "@/lib/ops/servidor";
import { MODULO_OPS } from "@/lib/ops/regras";
import { ACEITE_ANTES_DE_IMPRIMIR } from "@/lib/societario/orgaos/alvara-curitiba";
import {
  PRAZO_DA_EXECUCAO_MS,
  TIPOS_DE_TAREFA,
  capacidadesConhecidas,
  chaveAberta,
  destinoDaFalha,
  ehTipoDeTarefa,
  execucaoPerdida,
  rotuloNaFrase,
  type Devolucao,
  type TipoDeTarefa,
} from "./tarefas";
import { decidirAlvara, nomeDoPdfDoAlvara, pedidoDoAlvara, resultadoDoAlvaraSchema } from "./alvara";
import { FALHAS_PARA_PARAR, pedidoDaIE, resultadoDaIESchema, vigilanciaPodeSeguir } from "./inscricaoEstadual";
import { empresasParaVigiarIE, registrarSituacaoDaIE } from "@/lib/societario/inscricaoEstadualServidor";
import { INTERVALO_DA_VIGILANCIA_DIAS } from "@/lib/societario/inscricaoEstadual";
import { lerProtocolosDoSima, pedidoDoSima, resultadoDoSimaSchema, rodadaDoSimaPodeComecar, type ProtocoloDoSima } from "./sima";
import { SIGLA as SIGLA_DO_SIMA } from "@/lib/societario/orgaos/sima";
import { aplicarDecisaoDoProtocolo, anotarFalhaDoProtocolo } from "@/lib/societario/observadorServidor";
import { registrarUsoDoCertificado } from "@/lib/certificados/registro";
import { usoDaTarefa } from "@/lib/certificados/usos";

export type ResultadoDoPedido = { ok: true; texto: string } | { ok: false; erro: string };

/**
 * Pede ao robô a impressão do alvará de uma licença. O tenant é conferido na
 * licença e na empresa; a tarefa repetida (dois cliques, duas abas) é
 * recusada pelo índice único da chave aberta.
 */
export async function pedirImpressaoDoAlvara(tenantId: string, licenseId: string, userId: string | null): Promise<ResultadoDoPedido> {
  const prisma = getPrisma();
  const licenca = await prisma.license.findFirst({
    where: { id: licenseId, tenantId },
    select: { id: true, kind: true, revokedAt: true, companyId: true },
  });
  if (!licenca) return { ok: false, erro: "Licença não encontrada." };
  const empresa = await prisma.company.findFirst({
    where: { id: licenca.companyId, tenantId },
    select: { municipalRegistration: true, city: true },
  });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  const pedido = pedidoDoAlvara({ tipoDaLicenca: licenca.kind, revogada: licenca.revokedAt !== null, inscricao: empresa.municipalRegistration, cidade: empresa.city });
  if (!pedido.ok) return pedido;
  // A máquina entra como automação do Ops Center: sem o módulo, ela não busca nada.
  if (!(await isModuleEnabled(tenantId, MODULO_OPS))) {
    return { ok: false, erro: "O robô roda como automação do Orquestrador, e o Orquestrador está desligado neste escritório." };
  }
  try {
    await prisma.robotTask.create({
      data: {
        tenantId,
        kind: "imprimir_alvara",
        companyId: licenca.companyId,
        licenseId: licenca.id,
        payload: JSON.stringify(pedido.dados),
        openKey: chaveAberta(tenantId, "imprimir_alvara", licenca.id),
        requestedById: userId,
      },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { ok: false, erro: "Este alvará já está na fila do robô." };
    throw err;
  }
  await logAudit({ tenantId, ...pessoaOuRotina(userId, "roboDoSocietario"), action: "societario.robo.pedido", entityType: "License", entityId: licenca.id, metadata: { tipo: "imprimir_alvara" } });
  return { ok: true, texto: "Pedido ao robô. Ele imprime quando a máquina do TI buscar a próxima tarefa; acompanhe no Hub de robôs." };
}

/** Tira da fila uma tarefa que a máquina ainda não pegou. */
export async function cancelarTarefa(tenantId: string, id: string, userId: string | null): Promise<ResultadoDoPedido> {
  const r = await getPrisma().robotTask.updateMany({
    where: { id, tenantId, status: "PENDENTE" },
    data: { status: "CANCELADA", openKey: null, finishedAt: new Date(), reason: "Cancelada na tela do robô." },
  });
  if (r.count !== 1) return { ok: false, erro: "A tarefa já saiu da fila: a máquina pegou ou ela terminou." };
  await logAudit({ tenantId, ...pessoaOuRotina(userId, "roboDoSocietario"), action: "societario.robo.cancelada", entityType: "RobotTask", entityId: id });
  return { ok: true, texto: "Tarefa tirada da fila." };
}

export type TarefaParaAMaquina = { id: string; tipo: TipoDeTarefa; tentativa: number; dados: unknown };

/**
 * A máquina pede a próxima tarefa. Antes, devolve à fila (ou a uma pessoa) o
 * que ela pegou e não devolveu no prazo. O pedido também vale como sinal de
 * vida da automação no Ops Center.
 */
export async function pegarProxima(w: CredencialAutenticadaOps, capacidades: readonly string[]): Promise<{ tarefa: TarefaParaAMaquina | null }> {
  if (!w.slug) throw new ErroOps("O endereço precisa da automação.", 400);
  const prisma = getPrisma();
  const agora = new Date();
  await prisma.opsWatcher.updateMany({ where: { tenantId: w.tenantId, slug: w.slug, isActive: true }, data: { lastHeartbeatAt: agora } });
  await recolherPerdidas(w.tenantId, agora);

  const tipos = capacidadesConhecidas(capacidades);
  if (tipos.length === 0) return { tarefa: null };
  if (tipos.includes("vigiar_ie")) await criarVigilanciaDaIE(w.tenantId, agora);
  if (tipos.includes("observar_sima")) await criarRodadaDoSima(w.tenantId, agora);
  // Duas máquinas (ou duas voltas) podem mirar a mesma: quem não conseguir
  // marcar tenta a seguinte.
  for (let i = 0; i < 3; i++) {
    const candidata = await prisma.robotTask.findFirst({
      where: { tenantId: w.tenantId, status: "PENDENTE", kind: { in: tipos } },
      orderBy: { createdAt: "asc" },
      select: { id: true, kind: true, attempts: true, payload: true },
    });
    if (!candidata || !ehTipoDeTarefa(candidata.kind)) return { tarefa: null };
    const marcada = await prisma.robotTask.updateMany({
      where: { id: candidata.id, status: "PENDENTE" },
      data: { status: "EM_EXECUCAO", machineSlug: w.slug, claimedAt: agora, attempts: { increment: 1 } },
    });
    if (marcada.count === 1) {
      return { tarefa: { id: candidata.id, tipo: candidata.kind, tentativa: candidata.attempts + 1, dados: JSON.parse(candidata.payload) } };
    }
  }
  return { tarefa: null };
}

/**
 * A próxima empresa da rodada da IE vira tarefa, se a fila não tiver uma
 * aberta. Uma por vez: a máquina lê, devolve, e no pedido seguinte vem a
 * próxima.
 */
async function criarVigilanciaDaIE(tenantId: string, agora: Date) {
  const prisma = getPrisma();
  const aberta = await prisma.robotTask.findFirst({ where: { tenantId, kind: "vigiar_ie", status: { in: ["PENDENTE", "EM_EXECUCAO"] } }, select: { id: true } });
  if (aberta) return;
  const ultimas = await prisma.robotTask.findMany({
    where: { tenantId, kind: "vigiar_ie", status: { in: ["CONCLUIDA", "PRECISA_DE_GENTE"] } },
    orderBy: { finishedAt: "desc" },
    take: FALHAS_PARA_PARAR,
    select: { status: true, finishedAt: true },
  });
  if (!vigilanciaPodeSeguir(ultimas, agora)) return;
  const naSemana = await prisma.robotTask.findMany({
    where: { tenantId, kind: "vigiar_ie", createdAt: { gte: new Date(agora.getTime() - INTERVALO_DA_VIGILANCIA_DIAS * 86_400_000) } },
    select: { companyId: true },
  });
  const [empresa] = await empresasParaVigiarIE(tenantId, agora, 1, new Set(naSemana.map((t) => t.companyId).filter((id): id is string => id !== null)));
  if (!empresa) return;
  try {
    await prisma.robotTask.create({
      data: {
        tenantId,
        kind: "vigiar_ie",
        companyId: empresa.id,
        payload: JSON.stringify(pedidoDaIE(empresa.stateRegistration, empresa.cnpj)),
        openKey: chaveAberta(tenantId, "vigiar_ie", empresa.id),
        requestedById: null,
      },
    });
  } catch (err) {
    // Dois pedidos da máquina ao mesmo tempo: o outro já criou.
    if (!isPrismaUniqueError(err)) throw err;
  }
}

/** Os protocolos do SIMA à espera do órgão, com número para consultar. */
async function protocolosPendentesDoSima(tenantId: string, numeros?: string[]): Promise<ProtocoloDoSima[]> {
  const linhas = await getPrisma().processProtocol.findMany({
    where: { tenantId, outcome: "PENDENTE", number: numeros ? { in: numeros } : { not: null }, organ: { acronym: SIGLA_DO_SIMA } },
    select: { id: true, tenantId: true, stepId: true, outcome: true, number: true, organ: { select: { acronym: true, trackingUrl: true } } },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: 500,
  });
  return linhas.map((p) => ({ id: p.id, tenantId: p.tenantId, stepId: p.stepId, outcome: p.outcome, numero: p.number, trackingUrl: p.organ.trackingUrl, siglaDoOrgao: p.organ.acronym }));
}

/**
 * Uma rodada do SIMA vira tarefa: há protocolo pendente com número, nenhuma
 * rodada aberta e a última foi há mais do intervalo.
 */
async function criarRodadaDoSima(tenantId: string, agora: Date) {
  const prisma = getPrisma();
  const ultima = await prisma.robotTask.findFirst({ where: { tenantId, kind: "observar_sima" }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } });
  if (ultima && (ultima.status === "PENDENTE" || ultima.status === "EM_EXECUCAO")) return;
  if (!rodadaDoSimaPodeComecar(ultima?.createdAt ?? null, agora)) return;
  const pedido = pedidoDoSima((await protocolosPendentesDoSima(tenantId)).map((p) => p.numero));
  if (pedido.protocolos.length === 0) return;
  try {
    await prisma.robotTask.create({
      data: { tenantId, kind: "observar_sima", payload: JSON.stringify(pedido), openKey: chaveAberta(tenantId, "observar_sima", "rodada"), requestedById: null },
    });
  } catch (err) {
    if (!isPrismaUniqueError(err)) throw err;
  }
}

async function recolherPerdidas(tenantId: string, agora: Date) {
  const prisma = getPrisma();
  // O banco filtra pelo menor prazo; cada tipo confere o seu (06/11/2026: a
  // geração do SPED tem uma hora, as tarefas do Societário seguem com 15 min).
  const candidatas = await prisma.robotTask.findMany({
    where: { tenantId, status: "EM_EXECUCAO", claimedAt: { lt: new Date(agora.getTime() - PRAZO_DA_EXECUCAO_MS) } },
    select: { id: true, kind: true, attempts: true, requestedById: true, companyId: true, claimedAt: true },
    take: 20,
  });
  for (const t of candidatas) {
    if (!ehTipoDeTarefa(t.kind) || !execucaoPerdida(t.claimedAt, agora, t.kind)) continue;
    const minutos = Math.round(TIPOS_DE_TAREFA[t.kind].prazoMs / 60_000);
    await encerrarComFalha(tenantId, t, { motivo: `A máquina pegou a tarefa e não devolveu em ${minutos} minutos.`, recuperavel: true }, null);
  }
}

type TarefaAberta = { id: string; kind: string; attempts: number; requestedById: string | null; companyId: string | null };

async function encerrarComFalha(tenantId: string, t: TarefaAberta, falha: { motivo: string; recuperavel: boolean }, maquina: string | null) {
  if (!ehTipoDeTarefa(t.kind)) return;
  const destino = destinoDaFalha({ tipo: t.kind, tentativas: t.attempts, recuperavel: falha.recuperavel });
  const final = destino === "PRECISA_DE_GENTE";
  const r = await getPrisma().robotTask.updateMany({
    where: { id: t.id, tenantId, status: "EM_EXECUCAO", ...(maquina ? { machineSlug: maquina } : {}) },
    data: { status: destino, reason: falha.motivo.slice(0, 500), ...(final ? { openKey: null, finishedAt: new Date() } : { machineSlug: null, claimedAt: null }) },
  });
  if (r.count === 1 && final) await avisarQuemPediu(tenantId, t, falha.motivo);
}

async function avisarQuemPediu(tenantId: string, t: TarefaAberta, motivo: string) {
  if (!t.requestedById || !ehTipoDeTarefa(t.kind)) return;
  const empresa = t.companyId
    ? await getPrisma().company.findFirst({ where: { id: t.companyId, tenantId }, select: { name: true, displayName: true } })
    : null;
  const deQuem = empresa ? ` de ${nomeExibicao(empresa)}` : "";
  // A geração do SPED (06/11/2026) avisa com o próprio tipo, que leva à tela
  // do Gerar SPED, e não à do robô do Societário.
  const fiscal = TIPOS_DE_TAREFA[t.kind].area === "fiscal";
  await notifyUser(t.requestedById, {
    tenantId,
    type: fiscal ? "SPED_GERACAO_PARADA" : "ROBO_PRECISA_DE_VOCE",
    message: fiscal ? `A geração do SPED${deQuem} parou e precisa de você. ${motivo}` : `O robô precisa de você: ${rotuloNaFrase(t.kind)}${deQuem}. ${motivo}`,
    entityId: t.id,
  }).catch((err) => console.error("[robo] aviso", err instanceof Error ? err.name : "erro"));
}

/**
 * A máquina devolve o que fez. Só a máquina que pegou, e só enquanto a tarefa
 * está com ela: a que voltou para a fila por prazo pode ter ido para outra.
 */
export async function devolverTarefa(w: CredencialAutenticadaOps, id: string, devolucao: Devolucao, arquivo: File | null): Promise<{ ok: true; status: string }> {
  if (!w.slug) throw new ErroOps("O endereço precisa da automação.", 400);
  const prisma = getPrisma();
  const t = await prisma.robotTask.findFirst({
    where: { id, tenantId: w.tenantId, status: "EM_EXECUCAO", machineSlug: w.slug },
    select: { id: true, kind: true, attempts: true, requestedById: true, companyId: true, licenseId: true, payload: true },
  });
  if (!t) throw new ErroOps("A tarefa não está mais com esta máquina.", 409);

  // O certificado com que a máquina fez a tarefa (05/11/2026): conta como uso
  // quando ela terminou o trabalho no site, mesmo que o Connect depois mande o
  // resultado para uma pessoa — o login com o certificado funcionou.
  if (devolucao.ok && devolucao.certificado) {
    await registrarUsoDoCertificado(w.tenantId, devolucao.certificado.documento, usoDaTarefa(t.kind));
  }

  // A geração do SPED mora no Fiscal e é carregada só quando a tarefa é dela:
  // o robô do Societário não precisa dela (nem os testes dele).
  const geracao = t.kind === "gerar_sped" ? await import("@/lib/fiscal/sped/local/geracaoPeloAgente") : null;

  if (!devolucao.ok) {
    // A próxima tentativa começa do zero: as partes desta não servem para ela.
    if (geracao) await geracao.descartarPartesDaTentativa(w.tenantId, t.id, t.attempts);
    await encerrarComFalha(w.tenantId, t, devolucao, w.slug);
    const depois = await prisma.robotTask.findUnique({ where: { id }, select: { status: true } });
    return { ok: true, status: depois?.status ?? "PENDENTE" };
  }
  if (geracao) return { ok: true, status: await geracao.concluirGeracaoSped(w, t, devolucao.resultado) };
  if (t.kind === "imprimir_alvara") return { ok: true, status: await concluirAlvara(w, t, devolucao.resultado, arquivo) };
  if (t.kind === "vigiar_ie") return { ok: true, status: await concluirIE(w, t, devolucao.resultado) };
  if (t.kind === "observar_sima") return { ok: true, status: await concluirSima(w, t, devolucao.resultado) };
  throw new ErroOps("Tipo de tarefa desconhecido.", 400);
}

async function concluirAlvara(w: CredencialAutenticadaOps, t: TarefaAberta & { licenseId: string | null; payload: string }, bruto: Record<string, unknown>, arquivo: File | null): Promise<string> {
  const prisma = getPrisma();
  const lido = resultadoDoAlvaraSchema.safeParse(bruto);
  if (!lido.success) throw new ErroOps("Resultado do alvará fora do formato.", 400);
  const pdf = arquivo && arquivo.type === "application/pdf" && arquivo.size > 0 ? arquivo : null;
  const decisao = decidirAlvara(lido.data, pdf !== null, (JSON.parse(t.payload) as { inscricao?: string }).inscricao ?? null);
  const resultado = JSON.stringify({ tela: lido.data.tela, aceiteMarcado: lido.data.aceiteMarcado, texto: lido.data.texto.slice(0, 4_000) });

  // O robô marcou o aceite em nome do cliente: fica registrado, com empresa,
  // inscrição e data, mesmo quando o resto não deu certo (decisão de 15/09).
  if (lido.data.aceiteMarcado) {
    const { inscricao } = JSON.parse(t.payload) as { inscricao?: string };
    await logAudit({
      tenantId: w.tenantId,
      // Quem pediu responde pelo aceite que o robô marcou no lugar dele.
      ...pessoaOuRotina(t.requestedById, "roboDoSocietario"),
      action: "societario.robo.aceite_alvara",
      entityType: "Company",
      entityId: t.companyId ?? undefined,
      metadata: { inscricao: inscricao ?? null, maquina: w.slug, aceite: lido.data.aceite ?? ACEITE_ANTES_DE_IMPRIMIR },
    });
  }

  if (decisao.tipo === "pessoa") {
    await finalizar(w, t.id, { status: "PRECISA_DE_GENTE", reason: decisao.motivo, result: resultado });
    await avisarQuemPediu(w.tenantId, t, decisao.motivo);
    return "PRECISA_DE_GENTE";
  }

  const guardado = await guardarOPdf(w.tenantId, t.companyId, pdf!, decisao.emitidoEm);
  if (!guardado.ok) {
    await finalizar(w, t.id, { status: "PRECISA_DE_GENTE", reason: guardado.erro, result: resultado });
    await avisarQuemPediu(w.tenantId, t, guardado.erro);
    return "PRECISA_DE_GENTE";
  }
  // Preenche na licença só o que está vazio: o que alguém digitou fica.
  if (t.licenseId) {
    const licenca = await prisma.license.findFirst({ where: { id: t.licenseId, tenantId: w.tenantId }, select: { number: true, issuedAt: true } });
    if (licenca) {
      const dados = {
        ...(!licenca.number && decisao.numero ? { number: decisao.numero } : {}),
        ...(!licenca.issuedAt && decisao.emitidoEm ? { issuedAt: decisao.emitidoEm } : {}),
      };
      if (Object.keys(dados).length) await prisma.license.updateMany({ where: { id: t.licenseId, tenantId: w.tenantId }, data: dados });
    }
  }
  await finalizar(w, t.id, { status: "CONCLUIDA", reason: null, result: resultado, fileId: guardado.arquivoId });
  return "CONCLUIDA";
}

async function concluirIE(w: CredencialAutenticadaOps, t: TarefaAberta, bruto: Record<string, unknown>): Promise<string> {
  const lido = resultadoDaIESchema.safeParse(bruto);
  if (!lido.success) throw new ErroOps("Resultado da IE fora do formato.", 400);
  const resultado = JSON.stringify({ situacao: lido.data.situacao });
  if (!t.companyId) {
    await finalizar(w, t.id, { status: "PRECISA_DE_GENTE", reason: "A tarefa não tem empresa.", result: resultado });
    return "PRECISA_DE_GENTE";
  }
  const r = await registrarSituacaoDaIE({ tenantId: w.tenantId, companyId: t.companyId, texto: lido.data.situacao, lidaEm: new Date() });
  if (r.tipo === "sem_empresa") {
    await finalizar(w, t.id, { status: "PRECISA_DE_GENTE", reason: "A empresa não existe mais.", result: resultado });
    return "PRECISA_DE_GENTE";
  }
  if (r.tipo === "nao_reconhecida") {
    await finalizar(w, t.id, { status: "PRECISA_DE_GENTE", reason: `O CICAD mostrou uma situação que o Connect não conhece: "${r.texto}". Confira na Receita do PR.`, result: resultado });
    return "PRECISA_DE_GENTE";
  }
  await finalizar(w, t.id, { status: "CONCLUIDA", reason: null, result: resultado });
  return "CONCLUIDA";
}

/**
 * A rodada do SIMA voltou: cada protocolo pedido que segue pendente recebe a
 * decisão (ou a falha anotada), pela mesma gravação do cron do observador.
 */
async function concluirSima(w: CredencialAutenticadaOps, t: TarefaAberta & { payload: string }, bruto: Record<string, unknown>): Promise<string> {
  const lido = resultadoDoSimaSchema.safeParse(bruto);
  if (!lido.success) throw new ErroOps("Resultado do SIMA fora do formato.", 400);
  const { protocolos } = JSON.parse(t.payload) as { protocolos?: string[] };
  // Relido agora: alguém pode ter resolvido um protocolo à mão durante a rodada.
  const pendentes = await protocolosPendentesDoSima(w.tenantId, protocolos ?? []);
  const contagem = { deferidos: 0, exigencias: 0, seguemPendentes: 0, falhas: 0 };
  for (const l of lerProtocolosDoSima(pendentes, lido.data)) {
    const p = pendentes.find((x) => x.id === l.id)!;
    if (l.tipo === "falha") {
      await anotarFalhaDoProtocolo(p.id, l.mensagem);
      contagem.falhas++;
      continue;
    }
    const feito = await aplicarDecisaoDoProtocolo(p, l.decisao);
    if (feito === "deferido") contagem.deferidos++;
    else if (feito === "exigencia") contagem.exigencias++;
    else contagem.seguemPendentes++;
  }
  await finalizar(w, t.id, { status: "CONCLUIDA", reason: null, result: JSON.stringify({ lidos: lido.data.itens.length, ...contagem }) });
  return "CONCLUIDA";
}

async function finalizar(w: CredencialAutenticadaOps, id: string, d: { status: "CONCLUIDA" | "PRECISA_DE_GENTE"; reason: string | null; result: string; fileId?: string }) {
  await getPrisma().robotTask.updateMany({
    where: { id, tenantId: w.tenantId, status: "EM_EXECUCAO", machineSlug: w.slug },
    data: { status: d.status, reason: d.reason?.slice(0, 500) ?? null, result: d.result, fileId: d.fileId ?? null, openKey: null, finishedAt: new Date() },
  });
}

async function guardarOPdf(tenantId: string, companyId: string | null, pdf: File, emitidoEm: Date | null): Promise<{ ok: true; arquivoId: string } | { ok: false; erro: string }> {
  if (!companyId) return { ok: false, erro: "A tarefa não tem empresa." };
  if (!(await isModuleEnabled(tenantId, MODULO_ARQUIVOS))) return { ok: false, erro: "O alvará veio, mas os Arquivos estão desligados: não há onde guardar." };
  const pasta = await pastaDoModeloDaEmpresa(tenantId, companyId, "societario");
  if (!pasta) return { ok: false, erro: "O alvará veio, mas a empresa não tem a pasta Societário nos Arquivos." };
  const empresa = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { name: true, displayName: true } });
  const ano = (emitidoEm ?? new Date()).getUTCFullYear();
  const nome = nomeDoPdfDoAlvara(empresa ? nomeExibicao(empresa) : "EMPRESA", ano);
  const g = await guardarArquivo({ tenantId, folderId: pasta, arquivo: new File([await pdf.arrayBuffer()], nome, { type: "application/pdf" }) });
  return g.ok ? { ok: true, arquivoId: g.arquivoId } : { ok: false, erro: `O alvará veio, mas não foi guardado nos Arquivos: ${g.erro}` };
}
