"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { confirmacaoConfere } from "@/lib/exclusaoConfirmada";

type Props = {
  titulo: string;
  /** A frase de cima — o que a exclusão faz. */
  descricao?: string;
  /** O nome que a pessoa digita para confirmar. */
  nome: string;
  /** Outros textos aceitos no lugar do nome (o e-mail do acesso). */
  alternativas?: string[];
  rotuloDoBotao: string;
  /** Enquanto a contagem do que está ligado chega, sem campo nem botão ativo. */
  carregando?: boolean;
  /** A contagem não veio (sem permissão, registro sumiu): fica só o erro. */
  indisponivel?: boolean;
  pending: boolean;
  erro: string | null;
  onConfirm: (digitado: string) => void;
  onCancel: () => void;
  /** O que está ligado ao registro — o que fica e o que sai junto. */
  children?: React.ReactNode;
};

/**
 * A janela da exclusão de verdade (regras de 13/10/2026): o que está ligado ao
 * registro, e o botão de excluir só acende com o nome digitado.
 *
 * É o `ConfirmDialog` de sempre, mais largo e com o campo — a mesma moldura
 * das outras confirmações do app. Monte só enquanto estiver aberta: o texto
 * digitado mora aqui e precisa começar vazio a cada vez.
 */
export function ExclusaoConfirmada({
  titulo,
  descricao,
  nome,
  alternativas = [],
  rotuloDoBotao,
  carregando = false,
  indisponivel = false,
  pending,
  erro,
  onConfirm,
  onCancel,
  children,
}: Props) {
  const [digitado, setDigitado] = useState("");
  const campoId = useId();
  const confere = confirmacaoConfere(digitado, [nome, ...alternativas]);

  return (
    <ConfirmDialog
      open
      title={titulo}
      description={descricao}
      confirmLabel={rotuloDoBotao}
      pendingLabel="Excluindo…"
      destructive
      pending={pending}
      error={erro}
      confirmDisabled={carregando || indisponivel || !confere}
      largura="max-w-lg"
      onConfirm={() => onConfirm(digitado)}
      onCancel={onCancel}
    >
      {carregando ? (
        <p className="text-ui text-fg-muted">Conferindo o que está ligado a este cadastro…</p>
      ) : indisponivel ? null : (
        <div className="space-y-4">
          {children}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={campoId} className="text-label font-medium leading-5 text-fg">
              Para confirmar, digite <span className="font-semibold">{nome}</span>
            </label>
            <Input
              id={campoId}
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confere && !pending) onConfirm(digitado);
              }}
            />
            <p className="text-helper text-fg-muted">
              Não dá para desfazer. Fica registrado na auditoria quem excluiu e quando.
            </p>
          </div>
        </div>
      )}
    </ConfirmDialog>
  );
}

/** Uma lista curta dentro da janela, com "e mais N" quando passa do teto. */
export function ListaDaExclusao({ titulo, itens, teto = 6 }: { titulo: string; itens: React.ReactNode[]; teto?: number }) {
  if (itens.length === 0) return null;
  const visiveis = itens.slice(0, teto);
  const resto = itens.length - visiveis.length;
  return (
    <div>
      <p className="text-ui font-medium text-fg mb-1">{titulo}</p>
      <ul className="list-disc pl-5 space-y-0.5 text-ui text-fg-secondary">
        {visiveis.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
        {resto > 0 && <li className="text-fg-muted">e mais {resto}</li>}
      </ul>
    </div>
  );
}
