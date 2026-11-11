import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { alvoDoEndereco, decidirEndereco, type TelaCurta } from "@/lib/enderecoCurto";

/**
 * O lado do servidor do endereço curto (10/11/2026, pedido do Kauan): a
 * leitura do endereço nas telas de detalhe. O número na criação mora em
 * src/lib/enderecoCurtoNumeracao.ts; a regra (prefixos, formato, decisão de
 * redirecionar), em src/lib/enderecoCurto.ts, sem Prisma.
 */

type Onde = { tenantId: string } & ({ id: string } | { number: number });
const SO_O_NUMERO = { id: true, number: true } as const;
function buscar(tela: TelaCurta, where: Onde): Promise<{ id: string; number: number } | null> {
  const db = getPrisma();
  switch (tela) {
    case "empresa": return db.company.findFirst({ where, select: SO_O_NUMERO });
    case "pessoa": return db.person.findFirst({ where, select: SO_O_NUMERO });
    case "chamado": return db.helpdeskTicket.findFirst({ where, select: SO_O_NUMERO });
    case "processo": return db.process.findFirst({ where, select: SO_O_NUMERO });
    case "transferencia": return db.handoff.findFirst({ where, select: SO_O_NUMERO });
    case "solicitacao": return db.serviceRequest.findFirst({ where, select: SO_O_NUMERO });
    case "pendencia": return db.clientRequest.findFirst({ where, select: SO_O_NUMERO });
    case "tarefa": return db.pipelineItem.findFirst({ where, select: SO_O_NUMERO });
  }
}

/**
 * O registro do pedaço do endereço — uuid ou id curto —, no escritório. Só o
 * id e o número: quem confere se a pessoa pode ver é a própria tela, depois.
 */
export async function registroDoEndereco(tela: TelaCurta, tenantId: string | null | undefined, segmento: string) {
  const alvo = alvoDoEndereco(tela, segmento);
  if (!alvo || !tenantId) return null;
  return buscar(tela, { tenantId, ...alvo });
}

type Busca = Record<string, string | string[] | undefined>;
/**
 * A abertura da tela de detalhe: 404 para o que não existe; o endereço com o
 * uuid (ou com outra grafia) passa para o curto, com a mesma query; no curto,
 * devolve o uuid e o número para a tela seguir como antes. `base` é onde o id
 * curto fica, quando não é a rota da tela (a tarefa, dentro do quadro).
 */
export async function abrirPeloEndereco(tela: TelaCurta, tenantId: string | null | undefined, segmento: string, busca?: Busca, base?: string) {
  const registro = await registroDoEndereco(tela, tenantId, segmento);
  const decisao = decidirEndereco(tela, segmento, registro, busca, { base });
  if (decisao.tipo === "nao_encontrado" || !registro) notFound();
  if (decisao.tipo === "redirecionar") redirect(decisao.para);
  return registro;
}

/**
 * As telas abaixo do detalhe (/empresas/empresa-301/socios, /pessoas/pessoa-12/ferias…):
 * aceitam o uuid ou o id curto do pai e seguem com o uuid. Com `resto` (o
 * pedaço depois do pai, "/socios"), o endereço com o uuid passa para o curto,
 * como na ficha — os links e os "salvar" que ainda montam o endereço pelo uuid
 * terminam no curto.
 */
export async function registroDaRota(tela: TelaCurta, tenantId: string | null | undefined, segmento: string, resto?: string, busca?: Busca) {
  const registro = await registroDoEndereco(tela, tenantId, segmento);
  if (!registro) notFound();
  if (resto !== undefined) {
    const decisao = decidirEndereco(tela, segmento, registro, busca, { resto });
    if (decisao.tipo === "redirecionar") redirect(decisao.para);
  }
  return registro;
}

