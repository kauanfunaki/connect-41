"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CamposDoChamado, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import type { DadosDoChamado } from "@/lib/chamados/regras";

type Props = {
  inicial: DadosDoChamado;
  categorias: CategoriaDaTela[];
  setores: { code: string; label: string }[];
  salvando: boolean;
  erro: string;
  onSalvar: (categoryId: string) => void;
  onFechar: () => void;
};

/**
 * "Trocar categoria" (25/11/2026, funcionalidade-827): o administrador corrige
 * a categoria que a triagem deu, mesmo sem ser do setor que atende — o
 * "Editar dados" é da equipe. Só a categoria muda; a escolha é a mesma árvore
 * do "Editar dados" (`CamposDoChamado` com `somenteCategoria`). Se a nova
 * categoria pede aprovação, o chamado volta para "Aguardando aprovação".
 */
export function TrocarCategoria({ inicial, categorias, setores, salvando, erro, onSalvar, onFechar }: Props) {
  const [dados, setDados] = useState(inicial);
  const mudou = dados.categoryId !== inicial.categoryId && !!dados.categoryId;
  const nova = categorias.find((c) => c.id === dados.categoryId);
  return (
    <Modal open onClose={() => { if (!salvando) onFechar(); }} title="Trocar categoria" maxWidth="max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); if (mudou) onSalvar(dados.categoryId); }} className="space-y-4">
        <p className="text-ui text-fg-secondary">
          Só a categoria muda; o resto do chamado fica como está. A troca fica no histórico do chamado e na Auditoria.
        </p>
        <fieldset disabled={salvando}>
          <CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} somenteCategoria />
        </fieldset>
        {mudou && nova?.requiresApproval && (
          <p className="rounded-md bg-warning/10 p-3 text-ui text-warning-fg">
            {nomeDaCategoria(categorias, nova.id)} pede aprovação: o chamado volta para &quot;Aguardando aprovação&quot;.
          </p>
        )}
        {erro && <p role="alert" className="rounded-md bg-danger/8 p-3 text-ui text-danger">{erro}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {!mudou && <span className="mr-auto text-helper text-fg-muted">Escolha a nova categoria.</span>}
          <Button type="button" variant="secondary" disabled={salvando} onClick={onFechar}>Cancelar</Button>
          <Button type="submit" disabled={!mudou} loading={salvando} loadingLabel="Salvando…">Trocar categoria</Button>
        </div>
      </form>
    </Modal>
  );
}
