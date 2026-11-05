"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CamposDoChamado, type CategoriaDaTela } from "./CamposDoChamado";
import { aoFecharEdicao, dadosMudaram } from "@/lib/chamados/edicaoDosDados";
import type { DadosDoChamado } from "@/lib/chamados/regras";

type Props = {
  inicial: DadosDoChamado;
  categorias: CategoriaDaTela[];
  setores: { code: string; label: string }[];
  salvando: boolean;
  erro: string;
  onSalvar: (dados: DadosDoChamado) => void;
  onFechar: () => void;
};

/**
 * "Editar dados" numa janela em duas colunas (05/11/2026, opção A da tela do
 * chamado). Antes o cartão "Solicitação" virava o formulário inteiro em pilha
 * e empurrava a conversa para baixo. Os campos são os mesmos (`CamposDoChamado`)
 * e a gravação também (`mudar(id, version, "dados", dados)`, no pai): à
 * esquerda a categoria, à direita setor, título, descrição, campos da categoria,
 * prioridade e tags.
 *
 * Monta só quando abre, então cada abertura parte dos dados atuais do chamado.
 * Fechar com mudança não salva pergunta antes (`aoFecharEdicao`).
 */
export function EditarDadosDoChamado({ inicial, categorias, setores, salvando, erro, onSalvar, onFechar }: Props) {
  const [dados, setDados] = useState(inicial), [descartar, setDescartar] = useState(false);
  const mudou = dadosMudaram(inicial, dados);
  function pedirParaFechar() {
    const decisao = aoFecharEdicao(mudou, salvando);
    if (decisao === "fechar") onFechar(); else if (decisao === "confirmar") setDescartar(true);
  }
  return <>
    <Modal open onClose={pedirParaFechar} title="Editar dados do chamado" maxWidth="max-w-5xl">
      <form onSubmit={e => { e.preventDefault(); if (mudou) onSalvar(dados); }} className="space-y-5">
        <p className="text-ui text-fg-secondary">As mudanças valem para quem acompanha o chamado e ficam no histórico.</p>
        <fieldset disabled={salvando} className="grid items-start gap-5 lg:grid-cols-2">
          <div className="min-w-0"><CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} somenteCategoria /></div>
          <div className="min-w-0"><CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} origemFixa ocultarCategoria /></div>
        </fieldset>
        {erro && <p role="alert" className="rounded-md bg-danger/8 p-3 text-ui text-danger">{erro}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {!mudou && <span className="mr-auto text-helper text-fg-muted">Nada alterado ainda.</span>}
          <Button type="button" variant="secondary" disabled={salvando} onClick={pedirParaFechar}>Cancelar</Button>
          <Button type="submit" disabled={!mudou} loading={salvando} loadingLabel="Salvando…">Salvar dados</Button>
        </div>
      </form>
    </Modal>
    <ConfirmDialog open={descartar} title="Descartar as alterações?" description="O que você mudou nos dados do chamado ainda não foi salvo."
      confirmLabel="Descartar alterações" cancelLabel="Continuar editando" destructive
      onConfirm={() => { setDescartar(false); onFechar(); }} onCancel={() => setDescartar(false)} />
  </>;
}
