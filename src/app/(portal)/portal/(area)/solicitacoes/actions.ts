"use server";

// O lado do cliente numa solicitação: abrir, responder e cancelar.
//
// Autoria no próprio modelo (`openedByPortalUserId`, `authorPortalUserId`),
// como na pendência: o AuditLog exige um `User` interno, e cliente não é um.
//
// Empresa sempre do alcance no `where`: solicitação de outro grupo responde
// "não encontrada", igual a uma que não existe.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { headers } from "next/headers";
import { logAudit } from "@/lib/audit";
import { clientIp, hit } from "@/lib/rateLimit";
import { avaliarEnvio } from "@/lib/carreiras/antiRobo";
import type { ResultadoDoPedido } from "@/lib/solicitacoes/linkPublico";
import { ORIGEM_DO_PEDIDO_PUBLICO, descricaoDoPedido, validarPedido } from "@/lib/solicitacoes/pedidoPublico";
import { destinoDoPedido, prospectoDoPedido } from "@/lib/solicitacoes/pedidoPublicoServidor";
import { saoPauloParts } from "@/lib/agenda";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { arquivosDoFormulario } from "@/lib/financeiro/pendencias/armazenamento";
import { validarResposta } from "@/lib/financeiro/pendencias/regras";
import { anexosDaSolicitacao } from "@/lib/solicitacoes/armazenamento";
import { somarDiasUteis, transicao, validarAbertura } from "@/lib/solicitacoes/regras";
import { avisarEquipeDaSolicitacao, responsavelDaEmpresaNoSetor } from "@/lib/solicitacoes/avisos";
import { criarCartaoDaSolicitacao, moverCartaoDaSolicitacao } from "@/lib/solicitacoes/cartaoServidor";
import { ASSUNTO_DA_SUGESTAO, validarSugestao } from "@/lib/solicitacoes/sugestao";

const MODULO = "portal_solicitacoes";

export type ResultadoDaAbertura = { error: string } | { ok: true; id: string; numero: number };
export type ResultadoDoPortal = { error: string } | { ok: true };

/** Erro de regra dentro da transação: aborta o que já foi gravado e vira mensagem. */
class Recusa extends Error {}

function revalidar(id?: string) {
  revalidatePath("/portal/solicitacoes");
  revalidatePath("/portal");
  revalidatePath("/solicitacoes");
  if (id) {
    revalidatePath(`/portal/solicitacoes/${id}`);
    revalidatePath(`/solicitacoes/${id}`);
  }
}

async function clienteComSolicitacoes() {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente) return { ok: false as const, erro: "Sessão expirada. Entre de novo no portal." };
  if (!cliente.modulos.has(MODULO)) return { ok: false as const, erro: "As solicitações não estão habilitadas." };
  return { ok: true as const, cliente };
}

/**
 * Abre a solicitação.
 *
 * O prazo de resposta é contado **aqui**, com os feriados do tenant, e gravado:
 * mudar o prazo do assunto depois não muda a promessa já feita ao cliente.
 * O responsável vem do serviço da empresa no setor do assunto, se houver.
 */
export async function abrirSolicitacao(formData: FormData): Promise<ResultadoDaAbertura> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;
  const prisma = getPrisma();

  const empresa = await prisma.company.findFirst({
    where: { tenantId: cliente.tenantId, AND: [{ id: String(formData.get("companyId") ?? "") }, { id: { in: cliente.companyIds } }] },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "Escolha a empresa." };

  const assunto = await prisma.serviceRequestSubject.findFirst({
    where: { id: String(formData.get("subjectId") ?? ""), tenantId: cliente.tenantId, active: true },
    select: { id: true, label: true, sectorCode: true, responseDays: true },
  });
  if (!assunto) return { error: "Escolha o assunto." };

  const texto = validarAbertura(String(formData.get("description") ?? ""));
  if (!texto.ok) return { error: texto.erro };

  return gravarSolicitacao(cliente, empresa, assunto, texto.texto, arquivosDoFormulario(formData, "anexos"));
}

/**
 * Quem abre: o cliente do portal, ou — no pedido pelo link público
 * (09/11/2026) — ninguém com conta: `usuario.id` nulo, e a solicitação fica
 * sem autor do portal (ver `enviarPedidoPeloLink`).
 */
type QuemAbre = { tenantId: string; usuario: { id: string | null } };
type AssuntoDaAbertura = { id: string; label: string; sectorCode: string; responseDays: number };

/**
 * Grava a solicitação já conferida e avisa a equipe — o miolo da abertura,
 * que a sugestão do portal (21/10/2026) também usa.
 */
async function gravarSolicitacao(
  cliente: QuemAbre,
  empresa: { id: string; name: string; displayName: string | null },
  assunto: AssuntoDaAbertura,
  descricao: string,
  arquivos: ReturnType<typeof arquivosDoFormulario>
): Promise<ResultadoDaAbertura> {
  const prisma = getPrisma();
  const feriados = await feriadosDoTenant(cliente.tenantId);
  const prazo = lerDataDoCampo(somarDiasUteis(saoPauloParts(new Date()).dateKey, assunto.responseDays, feriados));
  if (!prazo.ok || !prazo.data) throw new Error("Prazo de resposta inválido.");
  const responseDue = prazo.data;

  const assigneeId = await responsavelDaEmpresaNoSetor(cliente.tenantId, empresa.id, assunto.sectorCode);

  const gravados = await anexosDaSolicitacao.gravarAnexos(cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };
  const anexos = gravados.anexos;

  // O número é o maior do tenant + 1, dentro da transação. Dois clientes
  // abrindo no mesmo instante podem calcular o mesmo número: o índice único
  // recusa o segundo, e ele tenta de novo com o número seguinte.
  let criada: { id: string; number: number } | null = null;
  try {
    for (let tentativa = 0; tentativa < 3 && !criada; tentativa++) {
      try {
        criada = await prisma.$transaction(async (tx) => {
          const maior = await tx.serviceRequest.aggregate({ where: { tenantId: cliente.tenantId }, _max: { number: true } });
          const s = await tx.serviceRequest.create({
            data: {
              tenantId: cliente.tenantId,
              number: (maior._max.number ?? 0) + 1,
              companyId: empresa.id,
              subjectId: assunto.id,
              sectorCode: assunto.sectorCode,
              description: descricao,
              responseDue,
              assigneeId,
              openedByPortalUserId: cliente.usuario.id,
            },
            select: { id: true, number: true },
          });
          if (anexos.length > 0) {
            await tx.serviceRequestAttachment.createMany({
              data: anexos.map((a) => ({ requestId: s.id, uploadedByPortalUserId: cliente.usuario.id, ...a })),
            });
          }
          return s;
        });
      } catch (err) {
        if (!isPrismaUniqueError(err)) throw err;
      }
    }
  } catch (err) {
    await anexosDaSolicitacao.apagarAnexosGravados(anexos);
    throw err;
  }
  if (!criada) {
    await anexosDaSolicitacao.apagarAnexosGravados(anexos);
    throw new Error("Não foi possível numerar a solicitação.");
  }

  // O cartão no quadro do setor, se o assunto pede (09/11/2026). Depois de
  // gravada: falha no quadro não chega ao cliente.
  await criarCartaoDaSolicitacao(cliente.tenantId, criada.id);

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: criada.id,
      numero: criada.number,
      assunto: assunto.label,
      empresaNome: nomeExibicao(empresa),
      setor: assunto.sectorCode,
      assigneeId,
    },
    "nova"
  );

  revalidar(criada.id);
  return { ok: true, id: criada.id, numero: criada.number };
}

async function daEmpresaDoCliente(tenantId: string, companyIds: string[], id: string) {
  return getPrisma().serviceRequest.findFirst({
    where: { id, tenantId, companyId: { in: companyIds } },
    select: {
      id: true,
      number: true,
      status: true,
      sectorCode: true,
      assigneeId: true,
      subject: { select: { label: true } },
      company: { select: { name: true, displayName: true } },
    },
  });
}

/** Responde com texto e/ou anexos. Numa concluída, reabre (ver `transicao`). */
export async function responderSolicitacaoCliente(formData: FormData): Promise<ResultadoDoPortal> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;

  const s = await daEmpresaDoCliente(cliente.tenantId, cliente.companyIds, String(formData.get("requestId") ?? ""));
  if (!s) return { error: "Solicitação não encontrada." };

  const arquivos = arquivosDoFormulario(formData, "anexos");
  const resposta = validarResposta(String(formData.get("body") ?? ""), arquivos.length);
  if (!resposta.ok) return { error: resposta.erro };
  const t = transicao(s.status, "CLIENTE", "RESPONDER");
  if (!t.ok) return { error: t.motivo };

  const gravados = await anexosDaSolicitacao.gravarAnexos(cliente.tenantId, arquivos);
  if (!gravados.ok) return { error: gravados.erro };

  const agora = new Date();
  try {
    await getPrisma().$transaction(async (tx) => {
      const mudou = await tx.serviceRequest.updateMany({
        where: { id: s.id, tenantId: cliente.tenantId, status: s.status },
        // Reaberta pelo cliente deixa de estar encerrada.
        data: { status: t.novo, lastMessageAt: agora, ...(s.status === "CONCLUIDA" ? { closedAt: null, closedById: null } : {}) },
      });
      if (mudou.count !== 1) throw new Recusa("A solicitação acabou de mudar — atualize a página.");
      const msg = await tx.serviceRequestMessage.create({
        data: { requestId: s.id, authorPortalUserId: cliente.usuario.id, body: resposta.corpo },
        select: { id: true },
      });
      if (gravados.anexos.length > 0) {
        await tx.serviceRequestAttachment.createMany({
          data: gravados.anexos.map((a) => ({ requestId: s.id, messageId: msg.id, uploadedByPortalUserId: cliente.usuario.id, ...a })),
        });
      }
    });
  } catch (err) {
    await anexosDaSolicitacao.apagarAnexosGravados(gravados.anexos);
    if (err instanceof Recusa) return { error: err.message };
    throw err;
  }

  // A resposta do cliente devolve a vez à equipe (ou reabre a concluída): o cartão vai junto.
  if (t.novo !== s.status) await moverCartaoDaSolicitacao(cliente.tenantId, s.id, null);

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      empresaNome: nomeExibicao(s.company),
      setor: s.sectorCode,
      assigneeId: s.assigneeId,
    },
    "resposta"
  );

  revalidar(s.id);
  return { ok: true };
}

/**
 * O cliente desiste: "não preciso mais".
 *
 * Devolve `null` no sucesso, e não `{ ok }`: é o contrato do botão com
 * confirmação (`ConfirmActionButton`) que chama esta action.
 */
export async function cancelarSolicitacaoCliente(id: string): Promise<{ error: string } | null> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;

  const s = await daEmpresaDoCliente(cliente.tenantId, cliente.companyIds, id);
  if (!s) return { error: "Solicitação não encontrada." };
  const t = transicao(s.status, "CLIENTE", "CANCELAR");
  if (!t.ok) return { error: t.motivo };

  const mudou = await getPrisma().serviceRequest.updateMany({
    where: { id: s.id, tenantId: cliente.tenantId, status: s.status },
    data: { status: t.novo, closedAt: new Date(), closedById: null },
  });
  if (mudou.count !== 1) return { error: "A solicitação acabou de mudar — atualize a página." };

  await moverCartaoDaSolicitacao(cliente.tenantId, s.id, null);

  await avisarEquipeDaSolicitacao(
    {
      tenantId: cliente.tenantId,
      id: s.id,
      numero: s.number,
      assunto: s.subject.label,
      empresaNome: nomeExibicao(s.company),
      setor: s.sectorCode,
      assigneeId: s.assigneeId,
    },
    "cancelada"
  );

  revalidar(s.id);
  return null;
}

/**
 * "Sugestão ou problema no portal" (21/10/2026): a nota e o texto do botão do
 * rodapé viram uma solicitação comum, no assunto da sugestão, para o Tech. O
 * assunto nasce na primeira sugestão se o escritório não o criou; desativado
 * por ele, a sugestão é recusada (e o botão nem aparece — `sugestaoLigada`).
 * A empresa é a primeira do acesso: a sugestão é do portal, não de uma empresa.
 */
export async function enviarSugestaoDoPortal(formData: FormData): Promise<ResultadoDaAbertura> {
  const c = await clienteComSolicitacoes();
  if (!c.ok) return { error: c.erro };
  const { cliente } = c;
  const prisma = getPrisma();

  const lida = validarSugestao({
    nota: String(formData.get("nota") ?? ""),
    texto: String(formData.get("texto") ?? ""),
    tela: String(formData.get("tela") ?? ""),
  });
  if (!lida.ok) return { error: lida.erro };

  const empresa = await prisma.company.findFirst({
    where: { tenantId: cliente.tenantId, id: { in: cliente.companyIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true },
  });
  if (!empresa) return { error: "O seu acesso ainda não tem empresa ligada. Fale com o escritório." };

  const assunto = await assuntoDaSugestao(cliente.tenantId);
  if (!assunto) return { error: "O escritório não está recebendo sugestões pelo portal agora." };

  return gravarSolicitacao(cliente, empresa, assunto, lida.descricao, []);
}

/** O assunto da sugestão: o do escritório, ou criado agora. Nulo se ele o desativou. */
async function assuntoDaSugestao(tenantId: string): Promise<AssuntoDaAbertura | null> {
  const prisma = getPrisma();
  const select = { id: true, label: true, sectorCode: true, responseDays: true, active: true } as const;
  const existente = await prisma.serviceRequestSubject.findFirst({ where: { tenantId, label: ASSUNTO_DA_SUGESTAO.label }, select });
  if (existente) return existente.active ? existente : null;
  try {
    const maior = await prisma.serviceRequestSubject.aggregate({ where: { tenantId }, _max: { order: true } });
    return await prisma.serviceRequestSubject.create({
      data: { tenantId, ...ASSUNTO_DA_SUGESTAO, order: (maior._max.order ?? 0) + 1 },
      select,
    });
  } catch (err) {
    // Duas sugestões ao mesmo tempo: o índice único (tenant, nome) recusa a segunda, que usa a primeira.
    if (!isPrismaUniqueError(err)) throw err;
    return prisma.serviceRequestSubject.findFirst({ where: { tenantId, label: ASSUNTO_DA_SUGESTAO.label, active: true }, select });
  }
}

// ─── O pedido pelo link público (09/11/2026) ─────────────────────────────────

/** Pedidos pelo link por IP por hora — o mesmo teto da ficha "Quero ser cliente". */
const PEDIDOS_PELO_LINK_POR_HORA = 5;

function textoDoForm(form: FormData, nome: string): string | null {
  const v = form.get(nome);
  return typeof v === "string" ? v : null;
}

/**
 * O pedido de quem ainda não é cliente, pelo link público do assunto: vira
 * uma solicitação comum, com a mesma numeração, o mesmo prazo e o mesmo aviso
 * ao setor (e, quando o assunto pede, o mesmo cartão no quadro). Mora aqui, ao
 * lado do `gravarSolicitacao`, para chamá-lo sem exportá-lo: em arquivo
 * "use server", toda função exportada é um endpoint que qualquer um chama.
 *
 * Sem login e sem captcha: as defesas são as do portal de vagas e da ficha
 * "Quero ser cliente" — campo-armadilha, carimbo de tempo assinado, envio
 * rápido demais recebido em silêncio e limite por IP. Robô recebe o mesmo
 * "recebemos" de uma pessoa, sem número, e nada é gravado.
 *
 * A empresa é uma prospecto (ver `prospectoDoPedido`). Nada sai por e-mail
 * para o endereço digitado (ver `pedidoPublico.ts`): a equipe responde por
 * telefone ou e-mail, por fora.
 */
export async function enviarPedidoPeloLink(form: FormData): Promise<ResultadoDoPedido> {
  const veredicto = avaliarEnvio({ carimbo: textoDoForm(form, "carimbo"), armadilha: textoDoForm(form, "website"), agora: new Date() });
  if (veredicto === "robo") return { ok: true, numero: null };
  if (veredicto === "carimbo_invalido") {
    return { ok: false, erro: "Esta página ficou aberta por muito tempo. Recarregue a página e envie de novo." };
  }

  const v = validarPedido({
    nome: form.get("nome"),
    email: form.get("email"),
    telefone: form.get("telefone"),
    empresa: form.get("empresa"),
    documento: form.get("documento"),
    mensagem: form.get("mensagem"),
    aceite: form.get("aceite"),
  });
  if (!v.ok) return { ok: false, erro: v.erro, campo: v.campo };

  // Depois da validação: quem errou um campo e corrigiu não gasta o limite.
  const ip = clientIp({ headers: await headers() });
  if (!hit(`pedido-pelo-link:${ip}`, PEDIDOS_PELO_LINK_POR_HORA, 60 * 60_000).allowed) {
    return { ok: false, erro: "Recebemos vários pedidos deste endereço em pouco tempo. Tente de novo daqui a uma hora." };
  }

  const destino = await destinoDoPedido(textoDoForm(form, "slug") ?? "", textoDoForm(form, "assunto") ?? "");
  if (!destino) {
    return { ok: false, erro: "Este link não está mais recebendo pedidos. Fale com o escritório pelos canais de sempre." };
  }
  const { tenantId, assunto } = destino;

  try {
    const empresa = await prospectoDoPedido(tenantId, v.pedido);
    const r = await gravarSolicitacao({ tenantId, usuario: { id: null } }, empresa, assunto, descricaoDoPedido(v.pedido), []);
    if ("error" in r) return { ok: false, erro: r.error };

    // A trilha diz de onde veio: quem age é a rotina do link, não uma pessoa.
    if (empresa.nova) {
      await logAudit({
        tenantId,
        rotina: "linkPublicoDePedido",
        action: "company.create",
        entityType: "Company",
        entityId: empresa.id,
        metadata: { name: empresa.name, origem: ORIGEM_DO_PEDIDO_PUBLICO },
      });
    }
    await logAudit({
      tenantId,
      rotina: "linkPublicoDePedido",
      action: "solicitacao.link_publico",
      entityType: "ServiceRequest",
      entityId: r.id,
      metadata: { nome: `nº ${r.numero} · ${assunto.label}`, empresa: empresa.name, empresaNova: empresa.nova },
    });
    return { ok: true, numero: r.numero };
  } catch (err) {
    console.error("[enviarPedidoPeloLink]", err);
    return { ok: false, erro: "Não foi possível enviar agora. Tente de novo em alguns minutos." };
  }
}
