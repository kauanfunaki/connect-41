"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { criarCentroDeCusto, atualizarCentroDeCusto } from "@/app/(app)/cadastros-financeiros/actions";

export function NovoCentroDeCusto({ companyId }: { companyId: string }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus size={13} /> Novo centro de custo
      </Button>
    );
  }

  return (
    <Card className="p-4 mb-4">
      <form
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await criarCentroDeCusto(dados);
            if ("error" in r) setErro(r.error);
            else setAberto(false);
          });
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary md:col-span-2">
          <span className="font-medium">Nome</span>
          <Input name="nome" maxLength={120} required placeholder="Ex.: Loja Centro, Obra 12, Projeto X" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">Código (opcional)</span>
          <Input name="codigo" maxLength={30} placeholder="LJ-01" />
        </label>
        <div className="flex items-center gap-2 md:col-span-4">
          <Button type="submit" size="sm" disabled={pendente}>
            Cadastrar
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

export function EditarCentroDeCusto({ centro }: { centro: { id: string; nome: string; codigo: string | null; ativo: boolean } }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button variant="linkMuted" size="xs" className="text-[11px]" onClick={() => setAberto(true)}>
        Editar
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 min-w-[240px]"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = await atualizarCentroDeCusto(dados);
          if ("error" in r) setErro(r.error);
          else setAberto(false);
        });
      }}
    >
      <input type="hidden" name="id" value={centro.id} />
      <Input compact name="nome" defaultValue={centro.nome} maxLength={120} required aria-label="Nome" />
      <Input compact name="codigo" defaultValue={centro.codigo ?? ""} maxLength={30} placeholder="Código" aria-label="Código" />
      {/* Inativar e não apagar: o que já foi lançado no centro continua nele. */}
      <Select compact name="ativo" defaultValue={centro.ativo ? "1" : "0"} aria-label="Situação">
        <option value="1">Ativo</option>
        <option value="0">Inativo</option>
      </Select>
      <div className="flex items-center gap-2">
        <Button type="submit" size="xs" disabled={pendente}>
          Salvar
        </Button>
        <Button variant="linkMuted" size="xs" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </form>
  );
}
