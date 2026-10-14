"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { FormSection } from "@/components/ui/FormSection";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { formatCnpj } from "@/lib/format";
import { plural } from "@/lib/exclusaoConfirmada";
import type { EmpresaParaVincular, ResultadoDoVinculo } from "@/app/(app)/clientes/actions";

type Props = {
  cliente: { id: string; nome: string; raizLabel: string | null };
  /** As empresas que estão no cliente hoje. */
  empresas: { id: string; nome: string; cnpj: string | null }[];
  /** As outras empresas do escritório — as opções do "Adicionar". */
  opcoes: EmpresaParaVincular[];
  /** Ids das opções cuja raiz de CNPJ é a do cliente. */
  sugeridas: string[];
  /**
   * Quantos acessos do portal ainda guardam este cliente. Desde 14/10/2026 não
   * entra na tela: o portal não depende mais do cliente. Sai na etapa 3.
   */
  acessos?: number;
  vincularAction: (clienteId: string, companyIds: string[]) => Promise<ResultadoDoVinculo>;
  desvincularAction: (clienteId: string, companyId: string) => Promise<{ erro: string } | { ok: true }>;
};

function textoDoResultado(r: { vinculadas: number; movidas: number }): string {
  if (r.vinculadas === 0) return "Nada mudou: as empresas já estavam neste cliente.";
  const base = `${plural(r.vinculadas, "empresa adicionada", "empresas adicionadas")} ao cliente.`;
  if (r.movidas === 0) return base;
  if (r.vinculadas === 1) return `${base} Ela saiu do cliente em que estava.`;
  return r.movidas === 1
    ? `${base} Uma delas saiu do cliente em que estava.`
    : `${base} ${r.movidas} delas saíram do cliente em que estavam.`;
}

/**
 * As empresas do cliente, na tela de edição (13/10/2026).
 *
 * Até aqui, a única porta para pôr uma empresa num cliente era o "Cliente e
 * matriz" do cadastro da empresa — e quem cuidava do cliente (o caso da IRRIGA
 * FOUR) não achava como. Desde 14/10/2026 o cliente não decide mais o que o
 * portal mostra: o acesso é ligado direto às empresas, na ficha de cada uma.
 */
export function EmpresasDoCliente({ cliente, empresas, opcoes, sugeridas, vincularAction, desvincularAction }: Props) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [pendente, startTransition] = useTransition();
  const [escolhida, setEscolhida] = useState("");
  // Troca a `key` do seletor depois de adicionar: ele guarda a escolha por
  // dentro, e precisa voltar vazio.
  const [rodada, setRodada] = useState(0);

  const porId = new Map(opcoes.map((o) => [o.id, o]));
  const alvo = escolhida ? porId.get(escolhida) : undefined;
  const sugestoes = sugeridas.map((id) => porId.get(id)).filter((o): o is EmpresaParaVincular => !!o);

  const opcoesDoSeletor: Opcao[] = opcoes.map((o) => ({
    value: o.id,
    label: o.nome,
    descricao: [o.cnpj ? formatCnpj(o.cnpj) : null, o.clienteAtual ? `hoje no cliente ${o.clienteAtual}` : null]
      .filter(Boolean)
      .join(" · "),
    busca: o.cnpj?.replace(/\D/g, ""),
  }));

  function vincular(ids: string[]) {
    startTransition(async () => {
      const r = await vincularAction(cliente.id, ids).catch(() => ({ erro: "Não foi possível adicionar. Tente de novo." }));
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success(textoDoResultado(r));
      setEscolhida("");
      setRodada((n) => n + 1);
    });
  }

  function desvincular(e: { id: string; nome: string }) {
    requestConfirm(
      {
        title: `Tirar ${e.nome} deste cliente?`,
        description: "A empresa continua cadastrada, sem cliente. Quem tem acesso a ela no portal continua vendo.",
        confirmLabel: "Tirar do cliente",
        destructive: true,
      },
      async () => {
        const r = await desvincularAction(cliente.id, e.id);
        if ("erro" in r) throw new Error(r.erro);
        toast.success(`${e.nome} saiu do cliente.`);
      }
    );
  }

  const movidasNaSugestao = sugestoes.filter((s) => s.clienteAtual).length;
  // Desde 14/10/2026 o cliente só agrupa as empresas no Connect: o portal se
  // configura na ficha de cada empresa.
  const descricao =
    "O cliente agrupa as empresas de um mesmo dono no Connect. Quem vê cada empresa no portal se define na ficha dela, em “Acesso ao portal”.";

  return (
    <FormSection title={`Empresas do cliente (${empresas.length})`} descricao={descricao}>
      {empresas.length === 0 ? (
        <p className="text-ui text-fg-muted">
          Nenhuma empresa neste cliente ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {empresas.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <Building2 size={14} className="flex-shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link href={`/empresas/${e.id}`} className="block truncate text-ui text-fg hover:underline" title={e.nome}>
                  {e.nome}
                </Link>
                {e.cnpj && <span className="block text-micro text-fg-muted tnum">{formatCnpj(e.cnpj)}</span>}
              </div>
              <Button variant="ghost" size="xs" disabled={pendente} onClick={() => desvincular(e)}>
                <X size={12} /> Tirar do cliente
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sugestoes.length > 0 && (
        <Aviso tom="info">
          <p>
            {sugestoes.length === 1
              ? `Pela raiz do CNPJ (${cliente.raizLabel}), esta empresa parece ser deste cliente:`
              : `Pela raiz do CNPJ (${cliente.raizLabel}), estas ${sugestoes.length} empresas parecem ser deste cliente:`}
          </p>
          <ul className="mt-1 list-disc pl-5 text-fg-secondary">
            {sugestoes.map((s) => (
              <li key={s.id}>
                {s.nome}
                {s.clienteAtual && <span className="text-fg-muted"> — hoje no cliente {s.clienteAtual}</span>}
              </li>
            ))}
          </ul>
          {movidasNaSugestao > 0 && (
            <p className="mt-1 text-fg-secondary">
              {movidasNaSugestao === 1
                ? "A que está em outro cliente sai de lá."
                : `As ${movidasNaSugestao} que estão em outro cliente saem de lá.`}
            </p>
          )}
          <div className="mt-2">
            <Button variant="secondary" size="sm" disabled={pendente} onClick={() => vincular(sugestoes.map((s) => s.id))}>
              <Plus size={14} /> {sugestoes.length === 1 ? "Adicionar ao cliente" : `Adicionar as ${sugestoes.length}`}
            </Button>
          </div>
        </Aviso>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="empresa-para-vincular" className="text-label font-medium leading-5 text-fg">
          Adicionar empresa
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              key={rodada}
              id="empresa-para-vincular"
              name="empresa-para-vincular"
              options={opcoesDoSeletor}
              placeholder="Buscar por nome ou CNPJ…"
              onChange={setEscolhida}
            />
          </div>
          <Button variant="secondary" disabled={!alvo || pendente} onClick={() => alvo && vincular([alvo.id])}>
            <Plus size={14} /> Adicionar
          </Button>
        </div>
        {alvo?.clienteAtual && (
          <Aviso tom="atencao">
            {alvo.nome} hoje é do cliente {alvo.clienteAtual}. Ao adicionar aqui, ela sai de lá. O portal não muda: quem
            tem acesso a ela continua vendo.
          </Aviso>
        )}
      </div>
      {dialog}
    </FormSection>
  );
}
