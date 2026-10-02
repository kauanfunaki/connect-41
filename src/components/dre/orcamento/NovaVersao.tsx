"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { criarVersao } from "@/app/(app)/dre/orcamento/actions";
import { FormFooter } from "@/components/ui/FormFooter";

type VersaoDeOrigem = { id: string; nome: string; ano: number; aprovada: boolean };

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
        <Plus size={14} /> Nova versão
      </Button>
    );
  }

  return (
    // Sem `mb-4` próprio: a página já embrulha o formulário com o respiro.
    <Card className="p-4 w-full">
      <form
        className="flex flex-col gap-4"
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
        <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
          <CampoForm label={`Nome da versão (${ano})`} htmlFor="versao-nome" required>
            <Input id="versao-nome" name="nome" maxLength={80} required defaultValue={jaTemVersao ? "" : "Original"} placeholder="Ex.: Revisão de junho" />
          </CampoForm>
          <CampoForm label="Partir de" htmlFor="versao-origem">
            <Select id="versao-origem" name="origem" value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}>
              <option value="vazia">Grade vazia</option>
              <option value="copia" disabled={versoes.length === 0}>
                Outra versão, com reajuste
              </option>
              <option value="realizado">Realizado de um ano, com reajuste</option>
            </Select>
          </CampoForm>
          {origem === "copia" && (
            <CampoForm label="Versão de origem" htmlFor="versao-origem-id" required>
              <Select id="versao-origem-id" name="versaoOrigemId" required defaultValue="">
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
            </CampoForm>
          )}
          {origem === "realizado" && (
            <CampoForm label="Ano do realizado" htmlFor="versao-ano-origem" required helper="A DRE econômica de cada mês daquele ano, grupo a grupo.">
              <Input id="versao-ano-origem" name="anoOrigem" type="number" min={2000} max={2100} defaultValue={ano - 1} required />
            </CampoForm>
          )}
          {origem !== "vazia" && (
            <CampoForm label="Reajuste" htmlFor="versao-reajuste" helper="Aplicado em cada célula, arredondado em centavos.">
              <Input id="versao-reajuste" name="reajuste" inputMode="decimal" suffix="%" placeholder="0" />
            </CampoForm>
          )}
        </FieldGrid>
        {/* Rodapé padrão: Cancelar antes do primário, os dois em 36px e à
            direita; o erro fica à esquerda, na mesma linha. */}
        <FormFooter
          pending={pendente}
          pendingLabel="Criando…"
          submitLabel="Criar versão"
          onCancel={() => setAberto(false)}
          erro={erro}
        />
      </form>
    </Card>
  );
}
