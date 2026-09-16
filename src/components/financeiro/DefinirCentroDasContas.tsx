"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { definirCentroDeCusto } from "@/lib/financeiro/acoes";
import { FORM_DO_CENTRO } from "@/lib/financeiro/centroDeCusto";

type Empresa = { id: string; nome: string; centros: { id: string; nome: string }[] };

/**
 * A barra que define o centro de custo das contas marcadas na tabela.
 *
 * As caixas ficam nas linhas da tabela (componente de servidor) e se associam a
 * este formulário pelo atributo `form` — assim a tabela não vira componente de
 * cliente inteira, com as trezentas linhas e as ações de cada uma, só para ter
 * seleção. Os centros vêm agrupados por empresa: a lista mistura empresas, e o
 * servidor recusa centro de uma empresa em conta de outra.
 */
export function DefinirCentroDasContas({ empresas }: { empresas: Empresa[] }) {
  const [centroId, setCentroId] = useState("");
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const comCentros = empresas.filter((e) => e.centros.length > 0);

  function caixas(): HTMLInputElement[] {
    return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${FORM_DO_CENTRO}"]`));
  }

  return (
    <form
      id={FORM_DO_CENTRO}
      className="flex flex-wrap items-center gap-2 mb-3"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const marcadas = dados.getAll("entryIds").length;
        setMensagem(null);
        if (marcadas === 0) {
          setMensagem({ tipo: "erro", texto: "Marque as contas na tabela." });
          return;
        }
        startTransition(async () => {
          const r = await definirCentroDeCusto(dados);
          if (r && "error" in r) {
            setMensagem({ tipo: "erro", texto: r.error });
            return;
          }
          for (const c of caixas()) c.checked = false;
          setMensagem({ tipo: "ok", texto: `Centro ${centroId ? "definido" : "retirado"} em ${marcadas} ${marcadas === 1 ? "conta" : "contas"}.` });
        });
      }}
    >
      <span className="text-[12px] text-fg-secondary">Centro de custo das contas marcadas:</span>
      <Select compact name="costCenterId" value={centroId} onChange={(e) => setCentroId(e.target.value)} className="w-64 max-w-full" aria-label="Centro de custo">
        <option value="">Sem centro de custo</option>
        {comCentros.length === 1
          ? comCentros[0]!.centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))
          : comCentros.map((e) => (
              <optgroup key={e.id} label={e.nome}>
                {e.centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </optgroup>
            ))}
      </Select>
      <Button type="submit" size="sm" variant="secondary" disabled={pendente}>
        {pendente ? "Aplicando…" : "Aplicar"}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="linkMuted"
        onClick={() => {
          const todas = caixas();
          const marcar = todas.some((c) => !c.checked);
          for (const c of todas) c.checked = marcar;
        }}
      >
        Marcar/desmarcar todas
      </Button>
      {mensagem && <span className={`text-[12px] ${mensagem.tipo === "erro" ? "text-danger" : "text-success"}`}>{mensagem.texto}</span>}
    </form>
  );
}
