import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { Sparkles } from "lucide-react";
import { formatInstantDateTime } from "@/lib/format";
import { saoPauloParts } from "@/lib/agenda";
import {
  desfechoDaChamada,
  DESFECHO_LABEL,
  DESFECHO_VARIANTE,
  TRIGGER_LABEL,
  moeda,
} from "@/lib/ia/tela";
import type { ChamadaNaLista } from "@/lib/ia/data";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";

type Props = {
  chamadas: ChamadaNaLista[];
  /** Agora, do servidor — é o relógio que decide o que está abandonado. */
  agora: Date;
};

/**
 * As últimas chamadas de IA, no casco padrão das tabelas (polimento de 30/09).
 * A lista vem inteira (as 30 mais recentes), então o funil das colunas filtra
 * no navegador — "as do Fiscal que falharam" sem ler a tabela toda.
 */
export function ChamadasDeIA({ chamadas, agora }: Props) {
  if (chamadas.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Nenhuma chamada ainda"
          description="Toda vez que alguém usar a IA no Connect, a chamada aparece aqui — com quem pediu, sobre o quê e quanto custou."
          icon={<Sparkles />}
        />
      </Card>
    );
  }

  return (
    <>
    {/* No celular, um cartão por chamada (15/10/2026): a tabela de 820px
        rolava de lado. */}
    <CartoesNoCelular>
      {chamadas.map((c) => {
        const desfecho = desfechoDaChamada(c, agora);
        return (
          <Cartao key={c.id}>
            <TopoDoCartao
              nome={c.agentLabel}
              valor={
                c.costCents === null ? (
                  <span className="font-normal text-warning-fg" data-dica="Modelo fora da tabela de preço">
                    não apurado
                  </span>
                ) : (
                  moeda(c.costCents)
                )
              }
            />
            <InfoDoCartao>
              {c.model} · {c.userName ?? TRIGGER_LABEL[c.trigger] ?? c.trigger}
            </InfoDoCartao>
            <InfoDoCartao className="tabular-nums">
              {formatInstantDateTime(c.startedAt)}
              {c.entityType && (
                <>
                  {" · "}
                  <span className="font-mono">
                    {c.entityType}
                    {c.entityId ? `:${c.entityId.slice(0, 8)}` : ""}
                  </span>
                </>
              )}
            </InfoDoCartao>
            <PeDoCartao>
              <Selo tom={tomDaVariante(DESFECHO_VARIANTE[desfecho])}>{DESFECHO_LABEL[desfecho]}</Selo>
            </PeDoCartao>
            {c.error && <InfoDoCartao className="mt-1">{c.error}</InfoDoCartao>}
          </Cartao>
        );
      })}
    </CartoesNoCelular>
    <TabelaFiltravel
      linhas={chamadas.map((c) => ({
        id: c.id,
        valores: {
          quando: saoPauloParts(c.startedAt).dateKey,
          agente: c.agentLabel,
          quem: c.userName ?? TRIGGER_LABEL[c.trigger] ?? c.trigger,
          desfecho: DESFECHO_LABEL[desfechoDaChamada(c, agora)],
        },
      }))}
    >
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3">
                <FiltroDaColuna rotulo="Quando" chave="quando" tipo="data" />
              </th>
              <th className="py-2 pr-3">
                <FiltroDaColuna rotulo="Agente" chave="agente" />
              </th>
              <th className="py-2 pr-3">
                <FiltroDaColuna rotulo="Quem pediu" chave="quem" />
              </th>
              <th className="py-2 pr-3">Sobre</th>
              <th className="py-2 pr-3">Custo</th>
              <th className="py-2 pr-3">
                <FiltroDaColuna rotulo="Desfecho" chave="desfecho" align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {chamadas.map((c) => {
              const desfecho = desfechoDaChamada(c, agora);
              return (
                <LinhaFiltravel key={c.id} id={c.id} className="border-b border-border-soft">
                  <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums text-fg-secondary">
                    {formatInstantDateTime(c.startedAt)}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{c.agentLabel}</span>
                    <span className="block text-fs-1 text-fg-muted">{c.model}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">
                    {c.userName ?? TRIGGER_LABEL[c.trigger] ?? c.trigger}
                  </td>
                  <td className="py-2.5 pr-3 text-fg-muted">
                    {c.entityType ? (
                      <span className="font-mono text-fs-1">
                        {c.entityType}
                        {c.entityId ? `:${c.entityId.slice(0, 8)}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {/* Traço, e não "R$ 0,00": custo não apurado não é chamada de
                        graça, e mostrar zero aqui seria a mesma mentira que o
                        resto da fundação evita. */}
                    {c.costCents === null ? (
                      <span className="text-warning-fg" title="Modelo fora da tabela de preço">
                        não apurado
                      </span>
                    ) : (
                      moeda(c.costCents)
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Selo tom={tomDaVariante(DESFECHO_VARIANTE[desfecho])}>{DESFECHO_LABEL[desfecho]}</Selo>
                    {c.error && (
                      <span className="block text-fs-1 text-fg-muted truncate max-w-[260px]" title={c.error}>
                        {c.error}
                      </span>
                    )}
                  </td>
                </LinhaFiltravel>
              );
            })}
          </tbody>
        </table>
      </TabelaNoDesktop>
    </TabelaFiltravel>
    </>
  );
}
