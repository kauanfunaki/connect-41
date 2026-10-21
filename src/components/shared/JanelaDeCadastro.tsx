"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type Props = {
  /** O texto do botão, que é também o título da janela ("Novo feriado"). */
  rotulo: string;
  maxWidth?: string;
  /**
   * Abre a janela junto com a tela — o endereço antigo da página de cadastro
   * (`/kanban/novo`) leva à lista com `?novo=1` (15/10/2026). Ao fechar, o
   * `novo` sai do endereço, para a janela não voltar ao recarregar.
   */
  abertaDeInicio?: boolean;
  /** O formulário. Recebe `fechar`, para fechar a janela quando o cadastro der certo. */
  children: (fechar: () => void) => React.ReactNode;
};

/**
 * O botão de criar no cabeçalho da tela, que abre o formulário numa janela
 * (escolha 5A do Kauan, 08/10/2026).
 *
 * Em Feriados, Competências, Obrigações recorrentes, Planos e Acessos do
 * portal o formulário de cadastro morava aberto no topo da lista — ou num
 * cartão que abria no lugar do botão —, e cada tela tinha o "criar" num lugar.
 * Agora é o "+ Novo …" à direita do título, como nas outras listas do Connect.
 */
export function JanelaDeCadastro({ rotulo, maxWidth = "max-w-lg", abertaDeInicio = false, children }: Props) {
  const [aberta, setAberta] = useState(abertaDeInicio);
  const fechar = () => {
    setAberta(false);
    if (abertaDeInicio) {
      const url = new URL(window.location.href);
      if (url.searchParams.has("novo")) {
        url.searchParams.delete("novo");
        window.history.replaceState(null, "", url);
      }
    }
  };

  return (
    <>
      <Button onClick={() => setAberta(true)}>
        <Plus size={14} /> {rotulo}
      </Button>
      <Modal open={aberta} onClose={fechar} title={rotulo} maxWidth={maxWidth}>
        {aberta && children(fechar)}
      </Modal>
    </>
  );
}
