"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";

export type CampoDaBusca = {
  /** Nome do parâmetro na URL. */
  chave: string;
  rotulo: string;
  /** Rótulo do "sem filtro". */
  vazio: string;
  valor: string;
  opcoes: { value: string; label: string }[];
};

/**
 * A busca e os filtros do 41 Carreiras (14/10/2026): um formulário GET só,
 * com a busca por texto e os filtros juntos — tudo vira a URL, a lista é
 * filtrada no servidor e o link pode ser compartilhado.
 *
 * Sem JavaScript, o formulário é enviado pelo navegador (busca e filtros já
 * escolhidos vão juntos). Com ele, a escolha num filtro já busca, e a URL sai
 * sem os campos vazios. Os seletores são os do Connect, não os do navegador
 * (pedido do Kauan, 08/10/2026).
 */
export function BuscaDoPortal({ acao, busca, campos }: { acao: string; busca: string; campos: CampoDaBusca[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function buscar(form: HTMLFormElement) {
    const q = new URLSearchParams();
    for (const [chave, valor] of new FormData(form)) {
      if (typeof valor === "string" && valor.trim()) q.set(chave, valor.trim());
    }
    const s = q.toString();
    iniciar(() => router.push(s ? `${acao}?${s}` : acao, { scroll: false }));
  }

  return (
    <form
      method="get"
      action={acao}
      role="search"
      aria-label="Buscar vagas"
      aria-busy={pendente || undefined}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        buscar(e.currentTarget);
      }}
      onChange={(e) => {
        // Só os filtros buscam na hora; o texto espera o Enter ou o botão.
        if (e.target instanceof HTMLSelectElement) buscar(e.currentTarget);
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="q" className="sr-only">
          Buscar vaga
        </label>
        <CampoDeBusca id="q" name="q" defaultValue={busca} placeholder="Cargo, empresa ou cidade" className="min-w-0 flex-1" />
        <Button type="submit" variant="primary" disabled={pendente}>
          <Search size={14} /> Buscar
        </Button>
      </div>
      {campos.length > 0 && (
        <div className="grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4">
          {campos.map((c) => (
            <CampoForm key={c.chave} label={c.rotulo} htmlFor={`filtro-${c.chave}`}>
              <Select id={`filtro-${c.chave}`} name={c.chave} defaultValue={c.valor} className="w-full">
                <option value="">{c.vazio}</option>
                {c.opcoes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </CampoForm>
          ))}
        </div>
      )}
    </form>
  );
}
