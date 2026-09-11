import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDateTime } from "@/lib/format";
import {
  situacaoDaConversa,
  telefoneLegivel,
  SITUACAO_LABEL,
  SITUACAO_VARIANTE,
} from "@/lib/whatsapp/conversas";
import type { LinhaDeConversa } from "@/lib/whatsapp/data";

type Props = {
  conversas: LinhaDeConversa[];
  /** Agora, do servidor — o relógio do navegador pode estar noutro fuso. */
  agora: Date;
};

export function ConversasLista({ conversas, agora }: Props) {
  if (conversas.length === 0) {
    return (
      <EmptyState
        title="Nenhuma conversa ainda"
        description="Quando um candidato escrever para o número do Recrutamento, a conversa aparece aqui."
        icon={<MessageSquare />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {conversas.map((c) => {
        const situacao = situacaoDaConversa(c, agora);
        return (
          <Card key={c.id} className="p-0 overflow-hidden">
            <Link
              href={`/whatsapp/${c.id}`}
              className="block p-3.5 hover:bg-surface-hover transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">
                      {c.nome ?? telefoneLegivel(c.waPhone)}
                    </span>
                    <Badge variant={SITUACAO_VARIANTE[situacao]}>{SITUACAO_LABEL[situacao]}</Badge>
                    {c.naoRespondidas > 0 && (
                      <span className="text-[11px] text-danger font-medium">
                        {c.naoRespondidas === 1
                          ? "1 sem resposta"
                          : `${c.naoRespondidas} sem resposta`}
                      </span>
                    )}
                  </div>
                  {/* Sem vínculo, o telefone é a única identidade que temos —
                      e quem vai atender precisa dele à mão para ligar. */}
                  {c.nome && (
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {telefoneLegivel(c.waPhone)}
                      {c.vaga && ` · ${c.vaga}`}
                    </p>
                  )}
                  {c.ultimaMensagem && (
                    <p className="text-[13px] text-fg-secondary mt-1 truncate max-w-[52ch]">
                      {c.ultimaMensagem}
                    </p>
                  )}
                  {c.handoffReason && (
                    <p className="text-[11px] text-warning mt-1">passou para você: {c.handoffReason}</p>
                  )}
                </div>
                <span className="text-[11px] text-fg-muted whitespace-nowrap tabular-nums shrink-0">
                  {c.ultimaMensagemEm ? formatInstantDateTime(c.ultimaMensagemEm) : "—"}
                </span>
              </div>
            </Link>
          </Card>
        );
      })}
    </div>
  );
}
