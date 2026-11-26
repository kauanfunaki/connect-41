"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
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
 * "Editar dados" numa janela de uma coluna (26/11/2026, melhoria-809,
 * alternativa A). De 05/11 a 26/11 eram duas colunas em 1024 px, com a grade
 * de 28 botões de categoria à esquerda; agora são 672 px, a categoria é um
 * campo com os grupos da árvore (`CampoDeCategoria`) e a descrição ganha a
 * altura. O setor solicitante não muda aqui: vai como texto, com o cadeado. A
 * gravação é a mesma (`mudar(id, version, "dados", dados)`, no pai).
 *
 * Monta só quando abre, então cada abertura parte dos dados atuais do chamado.
 * Fechar com mudança não salva pergunta antes (`aoFecharEdicao`).
 */
export function EditarDadosDoChamado({ inicial, categorias, setores, salvando, erro, onSalvar, onFechar }: Props) {
  const [dados, setDados] = useState(inicial), [descartar, setDescartar] = useState(false);
  const mudou = dadosMudaram(inicial, dados);
  const setor = setores.find(s => s.code === dados.requesterSectorCode)?.label ?? dados.requesterSectorCode;
  function pedirParaFechar() {
    const decisao = aoFecharEdicao(mudou, salvando);
    if (decisao === "fechar") onFechar(); else if (decisao === "confirmar") setDescartar(true);
  }
  return <>
    <Modal open onClose={pedirParaFechar} title="Editar dados do chamado" maxWidth="max-w-2xl">
      <form onSubmit={e => { e.preventDefault(); if (mudou) onSalvar(dados); }} className="space-y-5">
        <div className="space-y-1">
          <p className="text-ui text-fg-secondary">As mudanças valem para quem acompanha o chamado e ficam no histórico.</p>
          <p className="flex min-w-0 items-center gap-2 text-ui text-fg-secondary">
            <Lock size={12} aria-hidden className="shrink-0" />
            <span className="shrink-0">Setor solicitante</span>
            <span className="truncate font-medium text-fg" title={setor}>{setor || "—"}</span>
            <span className="sr-only">(não muda aqui)</span>
          </p>
        </div>
        <fieldset disabled={salvando} className="min-w-0">
          <CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} ocultarSetor />
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
