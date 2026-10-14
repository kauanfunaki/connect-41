// As telas do portal que o escritório ainda não liberou (14/10/2026): a leitura
// do banco e a pergunta que cada tela faz antes de consultar os dados dela.
//
// Pedido do Kauan: os primeiros clientes testam o portal antes de toda tela
// estar validada (algumas nem têm dados ainda), e as telas vão sendo liberadas
// conforme o escritório testa. Quem bloqueia é o administrador, em
// Administração › Portal do cliente › Telas liberadas; vale para todos os
// acessos do escritório.
//
// Onde o bloqueio pega:
// - o menu, o Início, a ajuda e o tutorial passam as bloqueadas para
//   `telasVisiveis` (telas.ts) e deixam de falar da tela;
// - cada tela (e cada download dela) pergunta `telaBloqueadaNoPortal` no
//   servidor, antes de qualquer consulta, e mostra `TelaIndisponivel` (ou 404,
//   no download). A pergunta é da tela, e não do layout: o layout não roda de
//   novo a cada navegação entre telas, e o link do e-mail cai direto na tela.
//
// Nunca derruba o portal: sem a tabela (deploy antes da migration) ou com o
// banco recusando a leitura, nada fica bloqueado — o portal de antes.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { telaBloqueavel } from "./telas";

/** `sem-tabela`: a migration ainda não rodou. `erro`: o banco recusou a leitura. */
export type SituacaoDasTelasBloqueadas = "ok" | "sem-tabela" | "erro";

export type LeituraDasTelasBloqueadas = {
  bloqueadas: ReadonlySet<string>;
  situacao: SituacaoDasTelasBloqueadas;
};

// A falta da tabela se repete em toda tela do portal até a migration rodar:
// avisa uma vez por processo, e não a cada requisição.
let avisouSemTabela = false;

/**
 * As telas bloqueadas do escritório, só as que existem no catálogo e podem ser
 * bloqueadas — uma linha antiga de tela que saiu do catálogo, ou do Início,
 * não esconde nada. Nunca lança.
 */
export async function lerTelasBloqueadas(tenantId: string): Promise<LeituraDasTelasBloqueadas> {
  if (!tenantId) return { bloqueadas: new Set(), situacao: "ok" };
  try {
    const linhas = await getPrisma().portalTelaBloqueada.findMany({ where: { tenantId }, select: { href: true } });
    return { bloqueadas: new Set(linhas.map((l) => l.href).filter(telaBloqueavel)), situacao: "ok" };
  } catch (err) {
    if (isPrismaMissingTableError(err)) {
      if (!avisouSemTabela) {
        avisouSemTabela = true;
        console.warn("[portal] tabela portal_telas_bloqueadas ainda não existe: nenhuma tela bloqueada até rodar a migration.");
      }
      return { bloqueadas: new Set(), situacao: "sem-tabela" };
    }
    console.error("[portal] telas bloqueadas", err);
    return { bloqueadas: new Set(), situacao: "erro" };
  }
}

/**
 * As bloqueadas, uma leitura por requisição: o layout, a tela e o tutorial
 * fazem a mesma pergunta na mesma renderização. Fora de uma renderização
 * (rota de download), só repassa.
 */
export const telasBloqueadasDoPortal = cache(async (tenantId: string): Promise<ReadonlySet<string>> => {
  return (await lerTelasBloqueadas(tenantId)).bloqueadas;
});

/** A tela está bloqueada para os clientes deste escritório? */
export async function telaBloqueadaNoPortal(tenantId: string, href: string): Promise<boolean> {
  return (await telasBloqueadasDoPortal(tenantId)).has(href);
}
