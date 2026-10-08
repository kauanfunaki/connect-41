"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { definirCentroDeCusto } from "@/lib/financeiro/acoes";
import { FORM_DO_CENTRO } from "@/lib/financeiro/centroDeCusto";

type Empresa = { id: string; nome: string; centros: { id: string; nome: string }[] };

function caixas(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${FORM_DO_CENTRO}"]`));
}

/**
 * Marca ou desmarca todas as contas da tabela. Mudar `checked` por código não
 * dispara `change`, e é pelo `change` que a barra e o cabeçalho se atualizam.
 */
function marcarTodas(marcar: boolean) {
  for (const c of caixas()) {
    if (c.checked === marcar) continue;
    c.checked = marcar;
    c.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** Quantas contas estão marcadas, e de quantas — acompanha as caixas das linhas. */
function useContasMarcadas(): { marcadas: number; total: number } {
  const [estado, setEstado] = useState({ marcadas: 0, total: 0 });
  useEffect(() => {
    const ler = () => {
      const todas = caixas();
      setEstado({ marcadas: todas.filter((c) => c.checked).length, total: todas.length });
    };
    ler();
    document.addEventListener("change", ler);
    return () => document.removeEventListener("change", ler);
  }, []);
  return estado;
}

/** A caixa do cabeçalho da tabela: marca todas, ou desmarca quando já estão. */
export function MarcarTodasAsContas() {
  const { marcadas, total } = useContasMarcadas();
  const todas = total > 0 && marcadas === total;
  return <Checkbox checked={todas} onChange={() => marcarTodas(!todas)} aria-label="Marcar todas as contas" />;
}

/**
 * Define o centro de custo das contas marcadas na tabela.
 *
 * As caixas ficam nas linhas da tabela (componente de servidor) e se associam a
 * este formulário pelo atributo `form` — assim a tabela não vira componente de
 * cliente inteira, com as trezentas linhas e as ações de cada uma, só para ter
 * seleção. Os centros vêm agrupados por empresa: a lista mistura empresas, e o
 * servidor recusa centro de uma empresa em conta de outra.
 *
 * Desde o redesign de 30/09 é a barra de seleção em massa do Connect: só
 * aparece com conta marcada. Antes ficava fixa acima da tabela, sempre.
 */
export function DefinirCentroDasContas({ empresas }: { empresas: Empresa[] }) {
  const [centroId, setCentroId] = useState("");
  const [pendente, startTransition] = useTransition();
  const { marcadas } = useContasMarcadas();
  const toast = useToast();
  const comCentros = empresas.filter((e) => e.centros.length > 0);

  return (
    <form
      id={FORM_DO_CENTRO}
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        const quantas = dados.getAll("entryIds").length;
        if (quantas === 0) return;
        startTransition(async () => {
          const r = await definirCentroDeCusto(dados);
          if (r && "error" in r) {
            toast.error(r.error);
            return;
          }
          marcarTodas(false);
          toast.success(`Centro ${centroId ? "definido" : "retirado"} em ${quantas} ${quantas === 1 ? "conta" : "contas"}.`);
        });
      }}
    >
      <BulkActionBar count={marcadas} onClear={() => marcarTodas(false)}>
        <Select
          compact
          name="costCenterId"
          value={centroId}
          onChange={(e) => setCentroId(e.target.value)}
          className="w-64 max-w-full"
          aria-label="Centro de custo"
        >
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
        <Button type="submit" size="sm" loading={pendente} loadingLabel="Aplicando…">
          Definir centro de custo
        </Button>
      </BulkActionBar>
    </form>
  );
}
