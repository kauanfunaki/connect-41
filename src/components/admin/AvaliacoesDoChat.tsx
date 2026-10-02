import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { formatInstantDateTime } from "@/lib/format";
import { MOTIVOS_DO_NAO, type MotivoDoNao } from "@/lib/ia/chat/regras";
import { DIAS_DO_PAINEL, RUINS_NO_PAINEL, type PainelDoOrquestrador as Dados } from "@/lib/ia/chat/painel";

function nomeDaIa(code: string): string {
  return agenteDoCatalogo(code)?.label.replace(" (chat)", "") ?? code;
}

function porcento(parte: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((parte / total) * 100)}%`;
}

/**
 * O 👍/👎 das respostas do chat (02/10/2026): a taxa de 👎 por IA e as últimas
 * respostas marcadas com 👎. Só estas aparecem por inteiro — quem marcou foi
 * avisado de que iam para a revisão, sem o nome dela (ver `painel.ts`).
 */
export function AvaliacoesDoChat({ dados }: { dados: Dados }) {
  return (
    <Card className="p-4 flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-semibold text-fg">Avaliação das respostas — últimos {DIAS_DO_PAINEL} dias</p>
        <p className="text-[12px] text-fg-secondary max-w-[70ch]">
          O que as pessoas acharam das respostas (útil ou não ajudou). As que não ajudaram aparecem abaixo com a pergunta,
          sem o nome de quem perguntou e sem o resto da conversa — quem marca é avisado disso na hora.
        </p>
      </div>

      {dados.avaliacoes.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhuma resposta avaliada neste período.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Por IA — a pior taxa primeiro</p>
          <ul className="flex flex-col">
            {dados.avaliacoes.map((a) => {
              const motivos = Object.entries(a.motivos) as [MotivoDoNao, number][];
              return (
                <li key={a.agentCode} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 border-b border-border-soft last:border-0 text-[13px]">
                  <span className="flex-1 min-w-[10rem] text-fg">{nomeDaIa(a.agentCode)}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-fg-secondary">
                    <ThumbsUp size={12} aria-label="Úteis" /> {a.boas}
                  </span>
                  <span className={`inline-flex items-center gap-1 tabular-nums ${a.ruins > 0 ? "text-danger" : "text-fg-secondary"}`}>
                    <ThumbsDown size={12} aria-label="Não úteis" /> {a.ruins}
                  </span>
                  <span className="tabular-nums text-fg w-[9rem] text-right">{porcento(a.ruins, a.boas + a.ruins)} não ajudaram</span>
                  {motivos.length > 0 && (
                    <span className="basis-full text-[12px] text-fg-muted">
                      {motivos.map(([m, n]) => `${MOTIVOS_DO_NAO[m]}: ${n}`).join(" · ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {dados.ruins.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">
            Respostas que não ajudaram{dados.ruins.length === RUINS_NO_PAINEL ? ` — as ${RUINS_NO_PAINEL} mais recentes` : ""}
          </p>
          <ul className="flex flex-col">
            {dados.ruins.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 py-3 border-b border-border-soft last:border-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <span className="font-medium text-fg">{nomeDaIa(r.agentCode)}</span>
                  {r.motivo && <span className="rounded bg-danger/10 px-1.5 py-px text-danger">{MOTIVOS_DO_NAO[r.motivo]}</span>}
                  <span className="text-fg-muted tabular-nums">{formatInstantDateTime(new Date(r.avaliadaEm))}</span>
                </p>
                {r.pergunta && (
                  <p className="text-[13px] text-fg-secondary whitespace-pre-wrap break-words">
                    <span className="text-fg-muted">Pergunta: </span>
                    {r.pergunta}
                  </p>
                )}
                <p className="text-[13px] text-fg whitespace-pre-wrap break-words border-l-2 border-border pl-3">{r.resposta}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
