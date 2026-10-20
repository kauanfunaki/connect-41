"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Check } from "lucide-react";
import { conferirContasEmLote, definirCentroDeCusto } from "@/lib/financeiro/acoes";
import { FORM_DAS_CONTAS } from "@/lib/financeiro/contas";
import { JanelaDaBaixaEmLote } from "./JanelaDaBaixaEmLote";

type Empresa = { id: string; nome: string; centros: { id: string; nome: string }[] };

function caixas(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${FORM_DAS_CONTAS}"]`));
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
 * O que se faz com as contas marcadas na tabela: pagar (ou receber) todas de
 * uma vez — a baixa em lote da fila do BPO, 19/10 —, conferir as provisórias
 * (escolha 12A, 20/10: o "Conferir" saiu da linha) e, quando a empresa usa
 * centro de custo, definir o centro delas.
 *
 * As caixas ficam nas linhas da tabela (componente de servidor) e se associam a
 * este formulário pelo atributo `form` — assim a tabela não vira componente de
 * cliente inteira, com as trezentas linhas e as ações de cada uma, só para ter
 * seleção. Os centros vêm agrupados por empresa: a lista mistura empresas, e o
 * servidor recusa centro de uma empresa em conta de outra.
 *
 * Desde o redesign de 30/09 é a barra de seleção em massa do Connect: só
 * aparece com conta marcada. A janela do lote fica fora do formulário: aberta
 * dentro dele, o envio da janela subiria (pelo React, mesmo no portal) até o
 * envio do centro.
 */
export function AcoesEmLoteDasContas({
  empresas,
  comCentro,
  aPagar,
  hojeISO,
}: {
  empresas: Empresa[];
  /** Mostra o "definir centro de custo" — só quando a lista tem empresa com centro. */
  comCentro: boolean;
  aPagar: boolean;
  hojeISO: string;
}) {
  const [centroId, setCentroId] = useState("");
  const [pendente, startTransition] = useTransition();
  const [lote, setLote] = useState<string[] | null>(null);
  const [conferindo, startConferir] = useTransition();
  const { marcadas } = useContasMarcadas();
  const toast = useToast();

  function conferirMarcadas() {
    const ids = caixas().filter((c) => c.checked).map((c) => c.value);
    if (ids.length === 0) return;
    startConferir(async () => {
      const r = await conferirContasEmLote(ids);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      marcarTodas(false);
      const feitas = `${r.conferidas} ${r.conferidas === 1 ? "conta conferida" : "contas conferidas"}`;
      const fora = r.puladas > 0 ? ` — ${r.puladas} não ${r.puladas === 1 ? "estava" : "estavam"} a conferir.` : ".";
      toast.success(feitas + fora);
    });
  }
  const comCentros = empresas.filter((e) => e.centros.length > 0);

  return (
    <>
      <form
        id={FORM_DAS_CONTAS}
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
          <Button type="button" size="sm" onClick={() => setLote(caixas().filter((c) => c.checked).map((c) => c.value))}>
            {aPagar ? "Pagar marcadas" : "Receber marcadas"}
          </Button>
          <Button type="button" size="sm" variant="secondary" loading={conferindo} loadingLabel="Conferindo…" onClick={conferirMarcadas}>
            <Check size={14} /> Conferir marcadas
          </Button>
          {comCentro && (
            <>
              <div className="hidden sm:block w-px h-5 bg-border flex-shrink-0" />
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
              <Button type="submit" size="sm" variant="secondary" loading={pendente} loadingLabel="Aplicando…">
                Definir centro de custo
              </Button>
            </>
          )}
        </BulkActionBar>
      </form>
      {lote && (
        <JanelaDaBaixaEmLote
          ids={lote}
          hojeISO={hojeISO}
          aPagar={aPagar}
          onFechar={() => setLote(null)}
          onBaixadas={(resumo) => {
            setLote(null);
            marcarTodas(false);
            toast.success(resumo);
          }}
        />
      )}
    </>
  );
}
