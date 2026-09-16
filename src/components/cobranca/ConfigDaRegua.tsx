"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { useConfirm } from "@/components/ui/useConfirm";
import { salvarRegua, alternarEmpresaNaRegua } from "@/app/(app)/cobranca/actions";

/**
 * Liga/desliga e passos da régua. Ligar pede confirmação: a partir do próximo
 * cron, sacados de clientes passam a receber e-mail — e isso não se desfaz.
 */
export function ConfigDaRegua({ ligada, passos, podeEditar }: { ligada: boolean; passos: string; podeEditar: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  function salvar(dados: FormData) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const r = await salvarRegua(dados);
      if ("error" in r) setErro(r.error);
      else setSalvo(true);
    });
  }

  return (
    <form
      className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        if (dados.get("ligada") === "1" && !ligada) {
          requestConfirm(
            {
              title: "Ligar a régua de cobrança?",
              description: "A partir da próxima execução, sacados com e-mail e títulos vencidos nos passos recebem lembrete em nome da empresa credora.",
              confirmLabel: "Ligar",
            },
            async () => salvar(dados)
          );
          return;
        }
        salvar(dados);
      }}
    >
      <CampoForm label="Situação" htmlFor="regua-ligada">
        <Select id="regua-ligada" name="ligada" defaultValue={ligada ? "1" : "0"} disabled={!podeEditar}>
          <option value="0">Desligada</option>
          <option value="1">Ligada</option>
        </Select>
      </CampoForm>
      <CampoForm label="Passos (dias de atraso)" htmlFor="regua-passos" helper="Separados por vírgula. Padrão: 1, 7, 15, 30.">
        <Input id="regua-passos" name="passos" defaultValue={passos} disabled={!podeEditar} />
      </CampoForm>
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
          {salvo && <span className="text-[12px] text-success">Salvo.</span>}
        </div>
      )}
      {dialog}
    </form>
  );
}

/** Tirar uma empresa da régua, ou devolver. */
export function EmpresaNaRegua({
  empresas,
  companyId,
  fora,
}: {
  empresas?: { id: string; nome: string }[];
  companyId?: string;
  fora: boolean;
}) {
  const [escolhida, setEscolhida] = useState(companyId ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function alternar(id: string) {
    setErro(null);
    startTransition(async () => {
      const r = await alternarEmpresaNaRegua(id, fora);
      if ("error" in r) setErro(r.error);
      else if (empresas) setEscolhida("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {empresas && (
        <Select compact value={escolhida} onChange={(e) => setEscolhida(e.target.value)} className="w-72 max-w-full" aria-label="Empresa">
          <option value="">Escolha a empresa…</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
      )}
      <Button size="xs" variant={fora ? "secondary" : "linkMuted"} disabled={pendente || !escolhida} onClick={() => alternar(escolhida)}>
        {fora ? "Tirar da régua" : "Devolver à régua"}
      </Button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
