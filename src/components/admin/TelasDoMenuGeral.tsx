"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { TELAS_SEMPRE_NO_MENU, type TelaDoGeral } from "@/lib/menuGeral";
import type { ActionState } from "@/lib/actionState";

export type TelaDaConfiguracao = {
  chave: TelaDoGeral;
  rotulo: string;
  descricao: string;
  visivel: boolean;
  /** Uma linha a mais quando a tela depende de algo além desta escolha. */
  observacao: string | null;
};

type Props = {
  /** O nome do setor, para o texto. */
  setor: string;
  telas: TelaDaConfiguracao[];
  /** O setor tem alguma tela escondida (há o que restaurar). */
  personalizado: boolean;
  /** O banco respondeu — sem a tabela (deploy antes da migration), não dá para salvar. */
  disponivel: boolean;
  /** Fora da assinatura em somente leitura (ver `podeConfigurarMenuGeral`). */
  podeEditar: boolean;
  alternar: (tela: TelaDoGeral, visivel: boolean) => Promise<ActionState>;
  restaurar: () => Promise<ActionState>;
};

/** "Início e Meu dia". */
function emLista(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/**
 * As telas do menu Geral de um setor, com um interruptor cada (14/10/2026,
 * pedido do Kauan para o Recrutamento). Cada clique grava na hora, como os
 * módulos; enquanto um salva, os outros esperam — dois cliques seguidos não
 * podem se atropelar na mesma linha do banco.
 */
export function TelasDoMenuGeral({ setor, telas, personalizado, disponivel, podeEditar, alternar, restaurar }: Props) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [visiveis, setVisiveis] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(telas.map((t) => [t.chave, t.visivel])),
  );
  const algumaEscondida = Object.values(visiveis).some((v) => !v);
  const editavel = disponivel && podeEditar;

  function trocar(tela: TelaDaConfiguracao, visivel: boolean) {
    setVisiveis((atual) => ({ ...atual, [tela.chave]: visivel }));
    startTransition(async () => {
      const r = await alternar(tela.chave, visivel);
      if (r?.error) {
        setVisiveis((atual) => ({ ...atual, [tela.chave]: !visivel }));
        toast.error(r.error);
        return;
      }
      toast.success(visivel ? `${tela.rotulo} volta ao menu de ${setor}.` : `${tela.rotulo} saiu do menu de ${setor}.`);
    });
  }

  function voltarAoPadrao() {
    startTransition(async () => {
      const r = await restaurar();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setVisiveis(Object.fromEntries(telas.map((t) => [t.chave, t.visivel])));
      toast.success(`O menu de ${setor} voltou aos padrões.`);
    });
  }

  return (
    <section aria-labelledby="telas-do-menu-geral" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="telas-do-menu-geral" className="text-card-title font-semibold text-fg">
          Telas do menu Geral
        </h2>
        <p className="text-body text-fg-secondary">
          Escolha quais telas do grupo Geral aparecem no menu de quem trabalha em {setor}.{" "}
          {emLista(TELAS_SEMPRE_NO_MENU)} aparecem sempre.
        </p>
        <p className="text-fs-2 text-fg-muted">
          Esconder tira a tela do menu, da busca (Ctrl+K) e das telas fixadas — não bloqueia: quem tiver o endereço
          ainda consegue abrir. Quem está em mais de um setor vê, em “Todos os setores”, as telas de todos os seus
          setores juntas. Administradores, em “Todos os setores”, veem o padrão do menu.
        </p>
      </div>

      {!disponivel ? (
        <Aviso tom="atencao">
          Esta escolha ainda não pode ser salva: falta a atualização do banco desta versão. Até lá, valem os padrões
          do menu Geral e a ativação de cada módulo.
        </Aviso>
      ) : (
        !podeEditar && (
          <Aviso tom="atencao">A assinatura está em modo somente leitura: o menu dos setores não pode ser alterado agora.</Aviso>
        )
      )}

      <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
        {telas.map((t) => {
          const visivel = visiveis[t.chave] ?? true;
          return (
            <div key={t.chave} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 bg-surface">
              <div className="min-w-0">
                <p className="text-fs-3 font-medium text-fg">{t.rotulo}</p>
                <p className="text-fs-1 text-fg-muted">{t.descricao}</p>
                {t.observacao && <p className="text-fs-1 text-fg-muted mt-0.5">{t.observacao}</p>}
              </div>
              {/* Largura fixa: "Aparece" e "Escondida" têm tamanhos diferentes. */}
              <Switch
                checked={visivel}
                onCheckedChange={(ligado) => trocar(t, ligado)}
                disabled={!editavel || isPending}
                rotulo={visivel ? "Aparece" : "Escondida"}
                aria-label={`${t.rotulo} aparece no menu de ${setor}`}
                className="w-28 shrink-0"
              />
            </div>
          );
        })}
      </div>

      {editavel && (personalizado || algumaEscondida) && (
        <Button variant="ghost" size="sm" onClick={voltarAoPadrao} disabled={isPending}>
          Voltar aos padrões
        </Button>
      )}
    </section>
  );
}
