"use client";

// O de-para da Domínio de uma empresa, num formulário só (fila do BPO, 21/10):
// o código Matriz/Filial e a conta contábil de cada cadastro que as baixas do
// mês usam. A conta é o código reduzido da Domínio; em branco, fica sem.

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FormFooter } from "@/components/ui/FormFooter";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { salvarDeParaDaDominio } from "@/app/(app)/lancamentos/dominio/actions";

export type GrupoDoDePara = {
  /** O prefixo do campo: "cat:", "banco:" ou "cp:". */
  prefixo: string;
  titulo: string;
  ajuda: string;
  itens: { id: string; nome: string; detalhe?: string | null; conta: string; faltaNoMes: boolean }[];
};

export function DeParaDaDominio({
  companyId,
  codigoFilial,
  grupos,
  podeEditar,
}: {
  companyId: string;
  codigoFilial: string;
  grupos: GrupoDoDePara[];
  podeEditar: boolean;
}) {
  const toast = useToast();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = await salvarDeParaDaDominio(dados);
          if ("error" in r) setErro(r.error);
          else toast.success("De-para salvo.");
        });
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <Card className="p-4">
        <CampoForm
          label="Código Matriz/Filial na Domínio"
          htmlFor="dominio-filial"
          helper="Vai em toda linha da planilha. É o mesmo do SPED Generator: “113” e a filial com dois dígitos (matriz 11301)."
        >
          <Input id="dominio-filial" name="codigoFilial" defaultValue={codigoFilial} inputMode="numeric" maxLength={20} className="max-w-[200px]" disabled={!podeEditar} />
        </CampoForm>
      </Card>
      {grupos.map((g) => (
        <Card key={g.prefixo} className="p-4 flex flex-col gap-3">
          <div>
            <h3 className="text-card-title font-semibold text-fg">{g.titulo}</h3>
            <p className="text-helper text-fg-muted">{g.ajuda}</p>
          </div>
          {g.itens.length === 0 ? (
            <p className="text-fs-2 text-fg-muted">Nenhum neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-ui">
                <thead>
                  <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium text-left">Cadastro</th>
                    <th className="py-2 font-medium text-left w-[180px]">Conta na Domínio</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((i) => {
                    const campo = `${g.prefixo}${i.id}`;
                    return (
                      <tr key={i.id} className="border-b border-border-soft align-middle">
                        <td className="py-2 pr-3">
                          <label htmlFor={campo} className="text-fg">
                            {i.nome}
                          </label>
                          {i.detalhe && <span className="block text-micro text-fg-muted">{i.detalhe}</span>}
                          {i.faltaNoMes && <span className="block text-micro text-warning-fg">Sem conta: as baixas do mês com ela ficam fora do arquivo.</span>}
                        </td>
                        <td className="py-2">
                          <input type="hidden" name={`rotulo:${campo}`} value={i.nome} />
                          <Input id={campo} name={campo} defaultValue={i.conta} inputMode="numeric" maxLength={10} placeholder="ex.: 341" compact disabled={!podeEditar} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ))}
      {podeEditar && <FormFooter pending={pendente} pendingLabel="Salvando…" submitLabel="Salvar de-para" erro={erro} />}
    </form>
  );
}
