"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { definirPublicoDoChat } from "@/app/(app)/ia/chat-actions";

/**
 * Quem vê o chat de IA do canto da tela. Começa só com coordenadores (piloto
 * de duas semanas, decidido em 25/09) — o custo real sai dele antes de abrir
 * para todo mundo.
 */
export function PublicoDoChat({ todos, disponivel }: { todos: boolean; disponivel: boolean }) {
  const [valor, setValor] = useState(todos);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <Card className="p-4 mb-5 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">Chat de IA no canto da tela</p>
          <p className="text-[12px] text-fg-secondary max-w-[62ch]">
            Aparece para quem tem acesso a alguma IA ligada abaixo — a do setor (hoje, Societário, Recrutamento, Fiscal, BPO e DP) ou a Ajuda do
            Connect. Cada pessoa tem até 30 perguntas por dia, e as conversas são apagadas 90 dias depois da última
            mensagem.
          </p>
        </div>
        <Checkbox
          id="chat-para-todos"
          label="Liberar para todos"
          checked={valor}
          disabled={pendente || !disponivel}
          onChange={(e) => {
            const novo = e.target.checked;
            setErro(null);
            startTransition(async () => {
              const r = await definirPublicoDoChat(novo);
              if ("error" in r) setErro(r.error);
              else setValor(novo);
            });
          }}
        />
      </div>
      <p className="text-[12px] text-fg-muted">
        {valor ? "Todos os usuários (menos somente leitura) veem o chat." : "Piloto: só coordenadores e administradores veem o chat."}
      </p>
      {!disponivel && (
        <p className="text-[12px] text-warning">A configuração do chat ainda não está no banco — falta rodar a migration.</p>
      )}
      {erro && <p className="text-[12px] text-danger">{erro}</p>}
    </Card>
  );
}
