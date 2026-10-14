"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { ExclusaoConfirmada, ListaDaExclusao } from "@/components/ui/ExclusaoConfirmada";
import { plural } from "@/lib/exclusaoConfirmada";
import { formatCnpj } from "@/lib/format";
import type { ResumoDoClienteParaExcluir } from "@/app/(app)/clientes/actions";

export type AcoesDeExclusaoDoCliente = {
  resumoAction: (id: string) => Promise<{ erro: string } | ResumoDoClienteParaExcluir>;
  excluirAction: (id: string, confirmacao: string) => Promise<{ erro: string } | { ok: true }>;
};

type Estado = {
  cliente: { id: string; nome: string };
  resumo: ResumoDoClienteParaExcluir | null;
  erroDoResumo: string | null;
  erro: string | null;
};

/**
 * A exclusão de verdade de um cliente (13/10/2026), para a lista e para a
 * tela de edição: `abrir(cliente)` busca o que está ligado a ele e monta a
 * janela; `dialogo` vai uma vez na árvore, como o `useConfirm`.
 *
 * - Sem empresa e sem acesso do portal: só o cliente sai.
 * - Com eles: a janela lista as empresas e os acessos — desde 14/10/2026 os
 *   dois continuam: as empresas sem cliente, e os acessos ligados às empresas
 *   deles, como já estavam (o cliente não decide mais o que o portal mostra).
 */
export function useExclusaoDeCliente({ resumoAction, excluirAction }: AcoesDeExclusaoDoCliente, aoExcluir?: () => void) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [excluindo, startExcluir] = useTransition();
  const toast = useToast();

  // A contagem vem no clique, não num efeito: a action chega por prop e muda
  // de identidade a cada revalidação.
  function abrir(cliente: { id: string; nome: string }) {
    setEstado({ cliente, resumo: null, erroDoResumo: null, erro: null });
    resumoAction(cliente.id)
      .catch(() => ({ erro: "Não foi possível conferir o que está ligado a este cliente. Tente de novo." }))
      .then((r) =>
        setEstado((atual) =>
          atual && atual.cliente.id === cliente.id
            ? "erro" in r
              ? { ...atual, erroDoResumo: r.erro }
              : { ...atual, resumo: r }
            : atual
        )
      );
  }

  function confirmar(digitado: string) {
    if (!estado?.resumo) return;
    const { cliente } = estado;
    startExcluir(async () => {
      const r = await excluirAction(cliente.id, digitado).catch(() => ({
        erro: "Não foi possível excluir. Tente de novo.",
      }));
      if ("erro" in r) {
        setEstado((atual) => (atual ? { ...atual, erro: r.erro } : atual));
        return;
      }
      toast.success(`Cliente ${cliente.nome} excluído.`);
      setEstado(null);
      aoExcluir?.();
    });
  }

  const resumo = estado?.resumo ?? null;
  const acessos = resumo?.acessos.length ?? 0;
  const empresas = resumo?.empresas.length ?? 0;

  const dialogo = estado && (
    <ExclusaoConfirmada
      key={estado.cliente.id}
      titulo={`Excluir o cliente ${estado.cliente.nome}?`}
      descricao="O cliente é apagado de vez. A raiz do CNPJ dele fica livre para outro cadastro."
      nome={estado.cliente.nome}
      rotuloDoBotao="Excluir cliente"
      carregando={!resumo && !estado.erroDoResumo}
      indisponivel={!!estado.erroDoResumo}
      pending={excluindo}
      erro={estado.erroDoResumo ?? estado.erro}
      onConfirm={confirmar}
      onCancel={() => {
        if (!excluindo) setEstado(null);
      }}
    >
      {resumo &&
        (acessos === 0 && empresas === 0 ? (
          <Aviso tom="neutro">Este cliente não tem empresas nem acessos do portal. Só ele é apagado.</Aviso>
        ) : (
          <>
            {empresas > 0 && (
              <div className="space-y-1.5">
                <ListaDaExclusao titulo={`${plural(empresas, "empresa", "empresas")} deste cliente:`} itens={resumo.empresas.map((e) => e.nome)} />
                <p className="text-helper text-fg-muted">
                  {empresas === 1 ? "A empresa continua cadastrada, sem cliente." : `As ${empresas} empresas continuam cadastradas, sem cliente.`}
                </p>
              </div>
            )}
            {acessos > 0 && (
              <div className="space-y-1.5">
                <ListaDaExclusao
                  titulo={`${acessos === 1 ? "O acesso do portal continua" : `Os ${acessos} acessos do portal continuam`}:`}
                  itens={resumo.acessos.map((a) => `${a.nome} (${a.email})${a.ativo ? "" : " — desativado"}`)}
                />
                <p className="text-helper text-fg-muted">
                  O acesso é ligado direto às empresas, na ficha de cada uma (“Acesso ao portal”): excluir o cliente não muda o
                  que a pessoa vê no portal.
                </p>
              </div>
            )}
          </>
        ))}
      {resumo?.raiz && (
        <p className="text-helper text-fg-muted">
          Os documentos fiscais da raiz {formatCnpj(resumo.raiz)} continuam sendo buscados no SPED: a lista de raízes do SPED
          não depende mais do cliente.
        </p>
      )}
      {resumo && resumo.comunicados > 0 && (
        <p className="text-helper text-fg-muted">
          {resumo.comunicados === 1 ? "O comunicado enviado" : `Os ${resumo.comunicados} comunicados enviados`} a este
          cliente {resumo.comunicados === 1 ? "continua" : "continuam"} no portal de quem tem acesso às empresas dele.
        </p>
      )}
    </ExclusaoConfirmada>
  );

  return { abrir, dialogo };
}

/** O "Excluir cliente" da tela de edição: volta para a lista ao terminar. */
export function BotaoExcluirCliente({ cliente, ...acoes }: { cliente: { id: string; nome: string } } & AcoesDeExclusaoDoCliente) {
  const router = useRouter();
  const { abrir, dialogo } = useExclusaoDeCliente(acoes, () => router.push("/clientes"));
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => abrir(cliente)}>
        <Trash2 size={14} /> Excluir cliente
      </Button>
      {dialogo}
    </>
  );
}
