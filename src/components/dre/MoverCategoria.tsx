"use client";

import { useState, useTransition } from "react";
import { ArrowRightLeft, Check } from "lucide-react";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { FORA_DO_RESULTADO, modeloDoCodigo, type CodigoDoModelo } from "@/lib/dre/estrutura";
import { moverCategoria } from "@/app/(app)/dre/actions";

/**
 * O "Mover" de uma categoria aberta na DRE da equipe (28/10/2026, pedido da
 * coordenação do BPO): leva a categoria para outra linha só nesta empresa —
 * o IPTU que caiu nos impostos sobre a receita vai para as despesas
 * administrativas deste cliente, e o dos outros fica onde está.
 *
 * Fica discreto até o mouse ou o teclado chegarem na linha; escolher a linha
 * já grava, como a fila de classificação, e o relatório atrás recalcula. O
 * "Voltar ao padrão" fica no painel de classificação, nas exceções — o aviso
 * de "Movida" diz onde.
 *
 * Num menu (`Popover`) desde 30/10/2026 (auditoria de UX): era um `Select`
 * aberto no lugar do botão, com `onBlur`/`onKeyDown` que o `Select` não repassa
 * — não fechava nem no Esc nem saindo do campo.
 */
export function MoverCategoria({
  companyId,
  modelo: codigoDoModelo,
  nome,
  origem,
  grupoAtual,
}: {
  companyId: string;
  modelo: CodigoDoModelo;
  nome: string;
  origem: "pagamento" | "recebimento";
  /** O grupo da linha onde a categoria está — sai da lista. */
  grupoAtual: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [movida, setMovida] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const grupos = modeloDoCodigo(codigoDoModelo).grupos.filter((g) => g.origem === origem && g.code !== grupoAtual);

  if (movida) {
    return (
      <span role="status" className="inline-flex items-center gap-1 text-fs-1 text-success-fg whitespace-nowrap" data-dica="Para desfazer: Classificação › Exceções › Voltar ao padrão">
        <Check size={12} aria-hidden /> Movida para {movida}
      </span>
    );
  }

  function mover(grupo: string, rotulo: string) {
    setErro(null);
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof moverCategoria>>;
      try {
        r = await moverCategoria(companyId, nome, origem, grupo);
      } catch {
        r = { error: "Não consegui gravar. Tente de novo." };
      }
      if (r && "error" in r) setErro(r.error);
      else setMovida(rotulo);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Popover
        align="right"
        width={260}
        aria-label={`Nova linha da DRE para ${nome}`}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            disabled={pendente}
            aria-expanded={open}
            aria-label={`Mover ${nome} para outra linha nesta empresa`}
            data-dica="Mudar a linha só nesta empresa"
            className={`inline-flex items-center gap-1 rounded-sm px-1 text-fs-1 text-fg-muted transition-opacity hover:text-fg focus-visible:opacity-100 ${
              open || pendente ? "opacity-100" : "opacity-0 group-hover/linha:opacity-100"
            }`}
          >
            <ArrowRightLeft size={12} aria-hidden /> {pendente ? "Movendo…" : "Mover"}
          </button>
        )}
      >
        {({ close }) => (
          <div className="flex flex-col gap-0.5 max-h-80 overflow-y-auto">
            {grupos.map((g) => (
              <ItemDoMenu
                key={g.code}
                onClick={() => {
                  close();
                  mover(g.code, g.label);
                }}
              >
                {g.label}
              </ItemDoMenu>
            ))}
            <p className="c41-rotulo px-2 pt-2 pb-1">Fora do DRE</p>
            {FORA_DO_RESULTADO.map((f) => (
              <ItemDoMenu
                key={f.code}
                onClick={() => {
                  close();
                  mover(f.code, f.label);
                }}
              >
                {f.label}
              </ItemDoMenu>
            ))}
          </div>
        )}
      </Popover>
      {erro && (
        <p role="alert" className="text-fs-1 text-danger max-w-56 text-right">
          {erro}
        </p>
      )}
    </div>
  );
}
