"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SlideOver } from "@/components/ui/SlideOver";

/**
 * A conversa com o cliente e os documentos do processo, recolhidos numa linha
 * (Processo B, página de opções de 04/11/2026): eram dois cartões altos na
 * coluna da direita, com a caixa de mensagem sempre aberta. Agora o cartão diz
 * quantas mensagens há e de quem foi a última, e o botão abre tudo num painel
 * lateral — a conversa do processo não mora em Solicitações, então o painel é
 * o "abrir a conversa" sem trocar de tela.
 *
 * O conteúdo do painel vem pronto do servidor (`children`).
 */
export function ConversaEmPainel({
  resumo,
  children,
}: {
  /** "2 mensagens · última do cliente em 31/10" — ou o convite, sem conversa. */
  resumo: string;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <Card as="section" aria-labelledby="conversa-do-processo" className="p-4 flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 id="conversa-do-processo" className="text-section font-semibold text-fg">
          Conversa com o cliente
        </h2>
        <p className="text-fs-2 text-fg-muted tabular-nums">{resumo}</p>
      </div>
      <Button variant="secondary" size="sm" className="self-start" onClick={() => setAberta(true)}>
        <MessageSquare size={14} aria-hidden /> Abrir conversa e documentos
      </Button>
      <SlideOver open={aberta} onClose={() => setAberta(false)} title="Conversa com o cliente" width="max-w-xl">
        <div className="flex flex-col gap-6">{children}</div>
      </SlideOver>
    </Card>
  );
}
