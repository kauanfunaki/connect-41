"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { PreviaDaReceita, SocioState } from "@/app/(app)/empresas/[id]/socios/actions";

type Linha = { nome: string; qualificacao: string | null; entrada: string | null; documento: string | null };

const data = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : null);

function Lista({ titulo, linhas, vazio }: { titulo: string; linhas: Linha[]; vazio: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-fg-muted">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-[12.5px] text-fg-muted">{vazio}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border border-border rounded-md">
          {linhas.map((l) => (
            <li key={`${l.nome}-${l.documento}`} className="px-3 py-2 flex flex-col gap-0.5">
              <span className="text-[13px] text-fg break-words">{l.nome}</span>
              <span className="text-[11.5px] text-fg-muted">
                {[l.qualificacao, l.documento, l.entrada ? `desde ${data(l.entrada)}` : null].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * "Buscar na Receita": mostra o que o quadro público de sócios traz antes de
 * gravar. Nada entra sem o clique em importar, e ninguém sai sozinho — quem
 * está no Connect e sumiu da Receita só aparece como aviso.
 */
export function BuscarSociosNaReceita({
  companyId,
  previa,
  importar,
}: {
  companyId: string;
  previa: (companyId: string) => Promise<PreviaDaReceita>;
  importar: (companyId: string) => Promise<SocioState>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [resultado, setResultado] = useState<PreviaDaReceita | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function buscar() {
    setAberto(true);
    setResultado(null);
    setErro(null);
    startTransition(async () => setResultado(await previa(companyId)));
  }

  function gravar() {
    setErro(null);
    startTransition(async () => {
      const r = await importar(companyId);
      if (r?.error) setErro(r.error);
      else {
        setAberto(false);
        router.refresh();
      }
    });
  }

  const novos = resultado?.ok ? resultado.novos.length : 0;
  const completar = resultado?.ok ? resultado.jaCadastrados.length : 0;

  return (
    <>
      <Button variant="secondary" onClick={buscar}>
        <Landmark size={14} /> Buscar na Receita
      </Button>
      <Modal open={aberto} onClose={() => !pendente && setAberto(false)} title="Sócios na Receita" maxWidth="max-w-lg">
        <div className="p-5 flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold text-fg">Sócios na Receita</h2>
          {!resultado ? (
            <p className="text-[13px] text-fg-muted">Consultando o CNPJ na Receita…</p>
          ) : !resultado.ok ? (
            <p className="text-[13px] text-danger">{resultado.erro}</p>
          ) : (
            <>
              <p className="text-[12.5px] text-fg-secondary">
                A Receita informa quem é sócio, o papel e a data de entrada. Participação, quotas e endereço vêm do
                contrato social e continuam sendo preenchidos à mão.
              </p>
              <Lista titulo={`Entram (${novos})`} linhas={resultado.novos} vazio="Nenhum sócio novo." />
              <Lista
                titulo={`Já cadastrados (${completar})`}
                linhas={resultado.jaCadastrados}
                vazio="Nenhum dos cadastrados aparece na Receita."
              />
              {resultado.foraDaReceita.length > 0 && (
                <section className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning-bg px-3 py-2">
                  <span className="text-[12.5px] font-medium text-warning">Não aparecem mais na Receita</span>
                  <span className="text-[12.5px] text-fg">{resultado.foraDaReceita.map((f) => f.nome).join(", ")}</span>
                  <span className="text-[11.5px] text-fg-muted">
                    Provável saída. Nada muda sozinho: registre a saída com a data do distrato ou da alteração.
                  </span>
                </section>
              )}
            </>
          )}
          {erro && <p className="text-[12.5px] text-danger">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={pendente} onClick={() => setAberto(false)}>
              Fechar
            </Button>
            {resultado?.ok && (novos > 0 || completar > 0) && (
              <Button disabled={pendente} onClick={gravar}>
                {pendente
                  ? "Importando…"
                  : novos > 0
                    ? `Importar ${novos} ${novos === 1 ? "sócio" : "sócios"}`
                    : "Completar os cadastrados"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
