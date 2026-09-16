"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { criarVersao } from "@/app/(app)/dre/orcamento/actions";

type VersaoDeOrigem = { id: string; nome: string; ano: number; aprovada: boolean };

function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span className="font-medium">{rotulo}</span>
      {children}
      {dica && <span className="text-[11px] text-fg-muted">{dica}</span>}
    </label>
  );
}

/**
 * Cria uma versão do ano: vazia, cópia de outra versão com reajuste, ou o
 * realizado de um ano anterior com reajuste. Depois de criar, a tela abre a
 * versão nova — é nela que a pessoa vai mexer.
 */
export function NovaVersao({
  companyId,
  ano,
  versoes,
  jaTemVersao,
}: {
  companyId: string;
  ano: number;
  /** Versões da empresa em qualquer ano, para copiar. */
  versoes: VersaoDeOrigem[];
  jaTemVersao: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [origem, setOrigem] = useState<"vazia" | "copia" | "realizado">("vazia");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus size={13} /> Nova versão
      </Button>
    );
  }

  return (
    <Card className="p-4 mb-4 w-full">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await criarVersao(dados);
            if ("error" in r) {
              setErro(r.error);
              return;
            }
            setAberto(false);
            router.push(`/dre/orcamento?empresa=${companyId}&ano=${ano}&versao=${r.budgetId}`);
          });
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="ano" value={ano} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-start">
          <Campo rotulo={`Nome da versão (${ano})`}>
            <Input name="nome" maxLength={80} required defaultValue={jaTemVersao ? "" : "Original"} placeholder="Ex.: Revisão de junho" />
          </Campo>
          <Campo rotulo="Partir de">
            <Select name="origem" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
              <option value="vazia">Grade vazia</option>
              <option value="copia" disabled={versoes.length === 0}>
                Outra versão, com reajuste
              </option>
              <option value="realizado">Realizado de um ano, com reajuste</option>
            </Select>
          </Campo>
          {origem === "copia" && (
            <Campo rotulo="Versão de origem">
              <Select name="versaoOrigemId" required defaultValue="">
                <option value="" disabled>
                  Escolha…
                </option>
                {versoes.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.ano} · {v.nome}
                    {v.aprovada ? " (aprovada)" : ""}
                  </option>
                ))}
              </Select>
            </Campo>
          )}
          {origem === "realizado" && (
            <Campo rotulo="Ano do realizado" dica="A DRE econômica de cada mês daquele ano, grupo a grupo.">
              <Input name="anoOrigem" type="number" min={2000} max={2100} defaultValue={ano - 1} required />
            </Campo>
          )}
          {origem !== "vazia" && (
            <Campo rotulo="Reajuste" dica="Aplicado em cada célula, arredondado em centavos.">
              <Input name="reajuste" inputMode="decimal" suffix="%" placeholder="0" />
            </Campo>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "Criando…" : "Criar versão"}
          </Button>
          <Button variant="linkMuted" size="xs" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      </form>
    </Card>
  );
}
