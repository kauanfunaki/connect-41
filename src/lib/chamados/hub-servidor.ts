import { getPrisma } from "@/lib/prisma";
import { endereco, idCurto } from "@/lib/enderecoCurto";
import { A_CLASSIFICAR } from "./catalogo";
import { TENTATIVAS_NO_HUB, configDoHub, lerRespostaDoHub, montarEnvio, motivoDaFalhaNoHub, rotaDoHub, type ConfigDoHub, type EnvioAoHub } from "./hub";

// O envio do chamado ao Hub (17/11/2026, funcionalidade-711). As regras estão
// em ./hub.ts. Quem chama: a triagem, quando conclui (`levarAoHub`), e o motor
// de alertas, para o que ficou pendente (`reenviarAoHub`). Nada aqui segura o
// chamado: falha vira tentativa, com o motivo no chamado e no log.

/** Quanto o Connect espera o Hub responder. */
const ESPERA_MS = 15_000;

const log = (ticketId: string, texto: string) => `[chamados] Hub, chamado ${ticketId}: ${texto}`;

/** A configuração, só para o escritório que manda os chamados ao Hub. */
async function configDoEscritorio(tenantId: string): Promise<ConfigDoHub | null> {
  const config = configDoHub(process.env);
  if (!config) return null;
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  return tenant?.slug === config.escritorio ? config : null;
}

/**
 * Marca o chamado recém-triado como pendente de ir ao Hub e tenta mandar. Só
 * vale para chamado novo: o que já existia antes desta mudança não é marcado e
 * não vai.
 */
export async function levarAoHub(tenantId: string, ticketId: string): Promise<void> {
  const config = await configDoEscritorio(tenantId);
  if (!config) return;
  const marcado = await getPrisma().helpdeskTicket.updateMany({ where: { tenantId, id: ticketId, hubTicketId: null }, data: { hubPending: true } });
  if (marcado.count === 1) await enviarAoHub(config, tenantId, ticketId);
}

/** O motor de alertas: tenta de novo os pendentes, os mais antigos primeiro, cinco por vez. */
export async function reenviarAoHub(tenantId: string): Promise<number> {
  const config = await configDoEscritorio(tenantId);
  if (!config) return 0;
  const pendentes = await getPrisma().helpdeskTicket.findMany({
    where: { tenantId, hubPending: true, hubTicketId: null, hubAttempts: { lt: TENTATIVAS_NO_HUB } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  let enviados = 0;
  for (const p of pendentes) if (await enviarAoHub(config, tenantId, p.id)) enviados++;
  return enviados;
}

async function enviarAoHub(config: ConfigDoHub, tenantId: string, ticketId: string): Promise<boolean> {
  const db = getPrisma();
  const t = await db.helpdeskTicket.findFirst({
    where: { tenantId, id: ticketId, hubTicketId: null },
    select: {
      id: true,
      number: true,
      title: true,
      description: true,
      priority: true,
      requesterSectorCode: true,
      handlingSectorCode: true,
      createdById: true,
      category: { select: { name: true } },
    },
  });
  if (!t) return false;

  const [setores, quem] = await Promise.all([
    db.sector.findMany({ where: { tenantId, code: { in: [t.requesterSectorCode, t.handlingSectorCode] } }, select: { code: true, label: true } }),
    db.user.findFirst({ where: { id: t.createdById, tenantId }, select: { name: true, email: true } }),
  ]);
  const setor = (code: string) => setores.find((s) => s.code === code)?.label ?? code;
  const base = (process.env.APP_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const envio: EnvioAoHub = montarEnvio({
    id: t.id,
    protocolo: idCurto("chamado", t.number),
    titulo: t.title,
    descricao: t.description,
    categoria: t.category.name === A_CLASSIFICAR ? null : t.category.name,
    setorSolicitante: setor(t.requesterSectorCode),
    setorQueAtende: setor(t.handlingSectorCode),
    prioridade: t.priority,
    solicitante: quem ? { nome: quem.name, email: quem.email } : null,
    connectUrl: base ? `${base}${endereco("chamado", t.number)}` : null,
  });

  let status: number | null = null;
  let corpo: unknown = null;
  let erro: unknown;
  try {
    const r = await fetch(rotaDoHub(config), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(envio),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    status = r.status;
    corpo = await r.json().catch(() => null);
  } catch (e) {
    erro = e;
  }

  const resposta = status !== null && status >= 200 && status < 300 ? lerRespostaDoHub(corpo) : null;
  if (resposta) {
    await db.helpdeskTicket.updateMany({
      where: { tenantId, id: t.id, hubTicketId: null },
      data: { hubTicketId: resposta.id, hubTicketUrl: resposta.url, hubSentAt: new Date(), hubPending: false, hubLastError: null, hubAttempts: { increment: 1 } },
    });
    return true;
  }

  const motivo = status !== null && status >= 200 && status < 300 ? "O Hub respondeu sem o número do chamado" : motivoDaFalhaNoHub(status, corpo, erro);
  console.error(log(t.id, `não foi para o Hub, tenta de novo depois: ${motivo}`));
  await db.helpdeskTicket
    .updateMany({ where: { tenantId, id: t.id, hubTicketId: null }, data: { hubAttempts: { increment: 1 }, hubLastError: motivo } })
    .catch(() => {});
  return false;
}
