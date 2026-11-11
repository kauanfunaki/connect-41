import "server-only";
import { cache } from "react";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";
import { pendenciasAguardandoCliente } from "@/lib/financeiro/pendencias/consultas";
import { solicitacoesAguardandoCliente } from "@/lib/solicitacoes/consultas";
import { comunicadosNaoLidos } from "@/lib/comunicados/consultas";
import type { ContadoresDoMenu } from "./contadoresDoMenu";

/**
 * Os números do menu do portal (11/11/2026, P09) — as mesmas consultas do "O
 * que precisa de você" do Início, todas de uma vez (um `Promise.all`), e só
 * das telas que estão no menu deste cliente. Tudo é `count`, menos as
 * aprovações: só contam as que ele pode aprovar (dentro do teto dele), e o
 * teto é por empresa — a mesma consulta do Início, que já tem limite de linhas.
 *
 * `cache` do React: uma vez por requisição, por mais que o layout e a tela
 * peçam. Falha aqui não derruba o portal — o menu só fica sem os números, e o
 * erro vai para o log.
 *
 * O menu mora no layout, que não roda de novo a cada troca de tela: o número
 * se atualiza quando a página recarrega ou quando uma ação do cliente
 * (responder, aprovar) revalida a rota.
 */
export function contadoresDoMenu(
  tenantId: string,
  portalUserId: string,
  companyIds: readonly string[],
  telas: ReadonlySet<string>
): Promise<ContadoresDoMenu> {
  // O `cache` compara os argumentos por identidade: lista e conjunto viram
  // texto, para duas chamadas iguais na mesma requisição darem uma consulta só.
  return contadoresPorChave(tenantId, portalUserId, [...companyIds].sort().join(","), [...telas].sort().join(","));
}

const contadoresPorChave = cache(async function contadoresPorChave(
  tenantId: string,
  portalUserId: string,
  empresas: string,
  telasDoMenu: string
): Promise<ContadoresDoMenu> {
  if (!empresas) return {};
  const telas = new Set(telasDoMenu.split(","));
  const escopo = { tenantId, companyIds: empresas.split(",") };
  try {
    const [pendencias, aprovacoes, solicitacoes, comunicados] = await Promise.all([
      telas.has("/portal/pendencias") ? pendenciasAguardandoCliente(escopo) : null,
      telas.has("/portal/aprovacoes") ? aprovacoesDoCliente(escopo, portalUserId) : null,
      telas.has("/portal/solicitacoes") ? solicitacoesAguardandoCliente(escopo) : null,
      telas.has("/portal/comunicados") ? comunicadosNaoLidos(tenantId, escopo.companyIds, portalUserId) : null,
    ]);
    const contadores: ContadoresDoMenu = {};
    if (pendencias) contadores["/portal/pendencias"] = pendencias;
    const aprovar = aprovacoes?.contas.filter((c) => c.dentroDoTeto).length ?? 0;
    if (aprovar) contadores["/portal/aprovacoes"] = aprovar;
    if (solicitacoes) contadores["/portal/solicitacoes"] = solicitacoes;
    if (comunicados) contadores["/portal/comunicados"] = comunicados;
    return contadores;
  } catch (err) {
    console.error("[portal] números do menu", err);
    return {};
  }
});
