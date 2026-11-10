// Qual máquina do escritório é o agente do SPED, para o sinal do Gerar SPED
// (10/11/2026). Puro.
//
// Até aqui o sinal só aparecia depois da primeira geração: a máquina era
// achada pela última tarefa `gerar_sped` que alguém pegou. Sem nenhuma, a tela
// dizia "Nenhuma máquina buscou geração neste escritório ainda" mesmo com o
// agente ligado e mandando sinal de vida.
//
// ─── Por que o slug, e não a capacidade ─────────────────────────────────────
//
// A máquina diz que sabe `gerar_sped` a cada pedido de trabalho (`capacidades`
// no corpo de `POST /api/ops/watchers/{slug}/tarefas`), mas isso não fica
// gravado: o `OpsWatcher` guarda só o slug, o nome e o último sinal. A
// capacidade vale aqui na forma em que fica registrada — a tarefa `gerar_sped`
// que a máquina pegou, que continua sendo a primeira escolha. Antes dela, vale
// a automação com o identificador do agente do SPED: `agente_sped` na
// produção, `agente-sped` no exemplo da documentação, com ou sem sufixo
// (`agente-sped-2`, para uma segunda máquina).

import { maquinaSemSinal } from "@/lib/robo/tarefas";

export type AgenteNaTela = { nome: string; ultimoSinal: string | null; semSinal: boolean };

export type MaquinaDoOrquestrador = { slug: string; name: string; isActive: boolean; lastHeartbeatAt: Date | null };

/** O identificador da automação do agente do SPED, com hífen ou sublinhado, com ou sem sufixo. */
export function ehSlugDoAgenteSped(slug: string): boolean {
  const s = slug.toLowerCase().replace(/-/g, "_");
  return s === "agente_sped" || s.startsWith("agente_sped_");
}

/** O começo comum dos slugs do agente, para o banco filtrar antes da regra. */
export const PREFIXO_DO_AGENTE_SPED = "agente";

/**
 * A máquina do sinal: a que pegou a última `gerar_sped`; antes da primeira, a
 * automação ativa do agente do SPED com o sinal mais recente. Nenhuma das duas,
 * `null` — e a tela diz que nenhuma máquina do agente está cadastrada.
 */
export function agenteDoSinal(ultimaQuePegou: string | null, maquinas: readonly MaquinaDoOrquestrador[], agora: Date): AgenteNaTela | null {
  const daTarefa = ultimaQuePegou ? maquinas.find((m) => m.slug === ultimaQuePegou) : undefined;
  const escolhida = daTarefa ?? maquinas
    .filter((m) => m.isActive && ehSlugDoAgenteSped(m.slug))
    .sort((a, b) => (b.lastHeartbeatAt?.getTime() ?? -1) - (a.lastHeartbeatAt?.getTime() ?? -1))[0];
  if (!escolhida) return null;
  return { nome: escolhida.name, ultimoSinal: escolhida.lastHeartbeatAt?.toISOString() ?? null, semSinal: maquinaSemSinal(escolhida.lastHeartbeatAt, agora) };
}
