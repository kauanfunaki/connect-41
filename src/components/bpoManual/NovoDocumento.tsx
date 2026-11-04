"use client";

import { useState, useTransition } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type Acao = (title: string) => Promise<{ error: string } | { id: string }>;

/**
 * O "+ Nova pasta" do Repositório de manuais, com o título numa janela.
 *
 * Esteve no cabeçalho de 15/10/2026 (P19) — antes, no pé da árvore, criava ali
 * mesmo, num campo solto que sumia ao perder o foco. Volta ao pé da coluna de
 * pastas no lote C dos ajustes de 03/11/2026, a pedido do Kauan, mas com a
 * janela: é onde se procura criar a pasta, logo abaixo das que existem. A
 * pasta nova chega aberta na árvore.
 */
export function NovoDocumento({ action }: { action: Acao }) {
  return (
    <JanelaDeCadastro rotulo="Nova pasta" botao={{ variant: "ghost", size: "sm", className: "w-full justify-start" }}>
      {(fechar) => <FormDoDocumento action={action} onSucesso={fechar} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

function FormDoDocumento({ action, onSucesso, onCancelar }: { action: Acao; onSucesso: () => void; onCancelar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await action(titulo);
          if ("error" in r) setErro(r.error);
          else onSucesso();
        });
      }}
    >
      <CampoForm label="Nome da pasta" htmlFor="manual-documento-titulo" required helper="As páginas entram depois, pelo “+ Página” da pasta, na árvore.">
        <Input id="manual-documento-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </CampoForm>
      <FormFooter pending={pendente} pendingLabel="Criando…" submitLabel="Criar pasta" onCancel={onCancelar} erro={erro} />
    </form>
  );
}
