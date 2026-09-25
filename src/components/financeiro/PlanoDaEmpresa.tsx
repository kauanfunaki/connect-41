"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  criarCategoriaDaEmpresa,
  atualizarCategoriaDaEmpresa,
  esconderDoPadraoNaEmpresa,
  linhaDaDreNaEmpresa,
} from "@/app/(app)/cadastros-financeiros/actions";

export type OpcaoDeLinha = { code: string; label: string };

function OpcoesDeLinha({ linhas, vazio }: { linhas: OpcaoDeLinha[]; vazio: string }) {
  return (
    <>
      <option value="">{vazio}</option>
      {linhas.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </>
  );
}

export function NovaCategoriaDaEmpresa({ companyId, linhas, grupos }: { companyId: string; linhas: OpcaoDeLinha[]; grupos: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus size={13} /> Categoria só desta empresa
      </Button>
    );
  }

  return (
    <Card className="p-4 mb-4 w-full">
      <form
        className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          setErro(null);
          startTransition(async () => {
            const r = await criarCategoriaDaEmpresa(dados);
            if ("error" in r) setErro(r.error);
            else setAberto(false);
          });
        }}
      >
        <input type="hidden" name="companyId" value={companyId} />
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary md:col-span-2">
          <span className="font-medium">Nome</span>
          <Input name="nome" maxLength={120} required placeholder="Ex.: Serviço de terceiro - Galvanização" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">Tipo</span>
          <Select name="kind" required defaultValue="PAGAR">
            <option value="PAGAR">Despesa (a pagar)</option>
            <option value="RECEBER">Receita (a receber)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
          <span className="font-medium">Grupo do plano</span>
          <Input name="grupoDoPlano" list="grupos-do-plano" maxLength={120} placeholder="Ex.: CMV / CSV" />
          <datalist id="grupos-do-plano">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-fg-secondary md:col-span-2">
          <span className="font-medium">Linha da DRE</span>
          <Select name="linhaDre" defaultValue="">
            <OpcoesDeLinha linhas={linhas} vazio="Ainda não classificada" />
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

/**
 * A linha da DRE de uma categoria nesta empresa, trocada direto na lista. Na
 * do padrão, "Como no padrão" desfaz a exceção.
 */
export function LinhaDaDre({
  companyId,
  categoryId,
  valor,
  linhas,
  rotuloDoPadrao,
  desabilitado,
}: {
  companyId: string;
  categoryId: string;
  valor: string;
  linhas: OpcaoDeLinha[];
  /** Só nas categorias do padrão: o que vale quando a empresa não muda. */
  rotuloDoPadrao?: string;
  desabilitado?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-0.5 min-w-[200px]">
      <Select
        aria-label="Linha da DRE"
        className="h-8 text-[12px]"
        defaultValue={valor}
        disabled={desabilitado || pendente}
        onChange={(e) => {
          const novo = e.target.value;
          setErro(null);
          startTransition(async () => {
            const r = await linhaDaDreNaEmpresa(companyId, categoryId, novo);
            if ("error" in r) setErro(r.error);
          });
        }}
      >
        <OpcoesDeLinha linhas={linhas} vazio={rotuloDoPadrao ? `Como no padrão (${rotuloDoPadrao})` : "Ainda não classificada"} />
      </Select>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}

export function EsconderDoPadrao({ companyId, categoryId, oculta }: { companyId: string; categoryId: string; oculta: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="linkMuted"
        size="xs"
        className="text-[11px]"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            setErro(null);
            const r = await esconderDoPadraoNaEmpresa(companyId, categoryId, !oculta);
            if ("error" in r) setErro(r.error);
          })
        }
      >
        {oculta ? "Usar nesta empresa" : "Não usar nesta empresa"}
      </Button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </span>
  );
}

export function EditarCategoriaDaEmpresa({
  categoria,
  linhas,
}: {
  categoria: { id: string; nome: string; grupo: string | null; linha: string; ativa: boolean };
  linhas: OpcaoDeLinha[];
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
          const r = await atualizarCategoriaDaEmpresa(dados);
          if ("error" in r) setErro(r.error);
          else setAberto(false);
        });
      }}
    >
      <input type="hidden" name="id" value={categoria.id} />
      <Input name="nome" aria-label="Nome" defaultValue={categoria.nome} maxLength={120} required />
      <Input name="grupoDoPlano" aria-label="Grupo do plano" defaultValue={categoria.grupo ?? ""} maxLength={120} placeholder="Grupo do plano" />
      <Select name="linhaDre" aria-label="Linha da DRE" defaultValue={categoria.linha}>
        <OpcoesDeLinha linhas={linhas} vazio="Ainda não classificada" />
      </Select>
      <Select name="ativa" aria-label="Situação" defaultValue={categoria.ativa ? "sim" : "nao"}>
        <option value="sim">Ativa</option>
        <option value="nao">Inativa — some dos seletores, continua nos relatórios</option>
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
