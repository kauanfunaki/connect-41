"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { criarContraparte, atualizarContraparte } from "@/app/(app)/cadastros-financeiros/actions";

type Categoria = { id: string; nome: string };

export function NovaContraparte({ companyId, categorias }: { companyId: string; categorias: Categoria[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus size={13} /> Novo cadastro
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
            const r = await criarContraparte(dados);
            if ("error" in r) setErro(r.error);
            else setAberto(false);
          });
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary md:col-span-2">
          <span className="font-medium">Nome</span>
          <Input name="nome" maxLength={180} required />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">CPF ou CNPJ</span>
          <Input name="documento" inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary md:col-span-2">
          <span className="font-medium">E-mail (lembretes de cobrança)</span>
          <Input name="email" type="email" maxLength={180} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">Categoria padrão (pagar)</span>
          <Select name="defaultCategoryId" defaultValue="">
            <option value="">Nenhuma</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
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

export function EditarContraparte({
  contraparte,
  categorias,
}: {
  contraparte: { id: string; nome: string; documento: string | null; email: string | null; defaultCategoryId: string | null; ativo: boolean };
  categorias: Categoria[];
}) {
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
      className="flex flex-col gap-2 min-w-[260px]"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = await atualizarContraparte(dados);
          if ("error" in r) setErro(r.error);
          else setAberto(false);
        });
      }}
    >
      <input type="hidden" name="id" value={contraparte.id} />
      <Input compact name="nome" defaultValue={contraparte.nome} maxLength={180} required aria-label="Nome" />
      {/* Documento só se preenche: trocar o CNPJ de ficha com histórico
          desfaria o casamento com as notas — ver `atualizarContraparte`. */}
      {!contraparte.documento && <Input compact name="documento" placeholder="CPF ou CNPJ" inputMode="numeric" aria-label="Documento" />}
      <Input compact name="email" type="email" defaultValue={contraparte.email ?? ""} maxLength={180} placeholder="E-mail para cobrança" aria-label="E-mail" />
      <Select compact name="defaultCategoryId" defaultValue={contraparte.defaultCategoryId ?? ""} aria-label="Categoria padrão">
        <option value="">Sem categoria padrão</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Select>
      <Select compact name="ativo" defaultValue={contraparte.ativo ? "1" : "0"} aria-label="Situação">
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
