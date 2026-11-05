import { FORA_DO_MENU_COM_SOLICITACOES, MODULOS_DO_MENU_GERAL, getModuleRoute } from "@/lib/module-catalog";
import type { TelaDoMenu } from "@/lib/menuDoSetor";

/**
 * As telas do menu de um setor, na ordem do catálogo — o que o layout passa ao
 * menu e o que a tela "Organizar menu" ordena (05/11/2026: saiu de dentro do
 * layout para as duas usarem a mesma regra).
 *
 * - Só módulo ligado e do setor (dono ou "Também em").
 * - As telas do Geral (Solicitações, Arquivos, Apoio…) ficam fora — menos os
 *   Chamados no setor que os atende (`chamadosNoSetor`).
 * - Com as Solicitações ligadas, Pendências, Aprovações e Conversa saem: moram
 *   nas abas das Solicitações (21/10/2026).
 * - `semMenu`: as que nunca entram (ver `MODULOS_FORA_DO_MENU` e companhia).
 */
export function telasDoMenuDoSetor(
  estados: readonly { code: string; label: string; enabled: boolean; sectorCodes: readonly string[] }[],
  setor: string,
  opcoes: { chamadosNoSetor: boolean; solicitacoesLigadas: boolean; semMenu: ReadonlySet<string> },
): TelaDoMenu[] {
  return estados
    .filter(
      (m) =>
        m.enabled &&
        m.sectorCodes.includes(setor) &&
        (!MODULOS_DO_MENU_GERAL.has(m.code) || (m.code === "helpdesk" && opcoes.chamadosNoSetor)) &&
        !opcoes.semMenu.has(m.code) &&
        !(opcoes.solicitacoesLigadas && FORA_DO_MENU_COM_SOLICITACOES.has(m.code)),
    )
    .map((m) => ({ code: m.code, label: m.label, href: getModuleRoute(m.code) ?? `/setor/${setor}/${m.code}` }));
}
