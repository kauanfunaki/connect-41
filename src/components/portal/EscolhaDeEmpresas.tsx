"use client";

import { useState } from "react";
import { Building2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { formatCnpj } from "@/lib/format";

/** Uma empresa que pode ser ligada ao acesso. */
export type EmpresaParaEscolher = {
  id: string;
  nome: string;
  cnpj: string | null;
  /** Quantas filiais ela tem — com alguma, aparece o "incluir filiais". */
  filiais: number;
  /** A matriz, quando ela própria é filial. */
  matrizNome: string | null;
  /** Inativa ou cancelada: pode ser ligada, mas a tela avisa. */
  foraDeOperacao: boolean;
};

/** O que vai para a action, no campo `empresas` (JSON). */
export type EscolhaDeEmpresa = { companyId: string; incluiFiliais: boolean };

type Props = {
  id: string;
  empresas: EmpresaParaEscolher[];
  valor: EscolhaDeEmpresa[];
  onChange: (valor: EscolhaDeEmpresa[]) => void;
};

/**
 * As empresas de um acesso do portal (14/10/2026): escolha de várias, com
 * busca por nome ou CNPJ, e o "incluir filiais" em cada empresa que tem filial
 * (marcado por padrão — decisão do Kauan, 13/10). Com as filiais, a filial
 * cadastrada depois aparece sozinha para o acesso.
 *
 * O valor viaja num `<input type="hidden" name="empresas">` com o JSON, lido
 * por `lerEmpresas` nas actions de Administração › Portal do cliente.
 */
export function EscolhaDeEmpresas({ id, empresas, valor, onChange }: Props) {
  // O seletor guarda a escolha por dentro: troca a `key` para ele voltar vazio.
  const [rodada, setRodada] = useState(0);
  const porId = new Map(empresas.map((e) => [e.id, e]));
  const escolhidas = new Set(valor.map((v) => v.companyId));

  const opcoes: Opcao[] = empresas
    .filter((e) => !escolhidas.has(e.id))
    .map((e) => ({
      value: e.id,
      label: e.nome,
      descricao: [
        e.cnpj ? formatCnpj(e.cnpj) : null,
        e.matrizNome ? `filial de ${e.matrizNome}` : null,
        e.filiais > 0 ? `${e.filiais} ${e.filiais === 1 ? "filial" : "filiais"}` : null,
        e.foraDeOperacao ? "fora de operação" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      busca: e.cnpj?.replace(/\D/g, ""),
    }));

  function adicionar(companyId: string) {
    if (!companyId || escolhidas.has(companyId)) return;
    onChange([...valor, { companyId, incluiFiliais: true }]);
    setRodada((n) => n + 1);
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="empresas" value={JSON.stringify(valor)} />
      {valor.length === 0 ? (
        <p className="text-helper text-fg-muted">Nenhuma empresa escolhida ainda. Sem empresa, o acesso não vê nada no portal.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {valor.map((v) => {
            const e = porId.get(v.companyId);
            const nome = e?.nome ?? "Empresa";
            return (
              <li key={v.companyId} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2">
                <Building2 size={14} className="mt-0.5 flex-shrink-0 text-fg-muted" aria-hidden />
                <div className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-ui text-fg" title={nome}>
                    {nome}
                  </span>
                  <span className="block text-micro text-fg-muted tnum">
                    {[e?.cnpj ? formatCnpj(e.cnpj) : null, e?.matrizNome ? `filial de ${e.matrizNome}` : null, e?.foraDeOperacao ? "fora de operação" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {e && e.filiais > 0 && (
                    <div className="mt-1.5">
                      <Checkbox
                        id={`${id}-filiais-${v.companyId}`}
                        checked={v.incluiFiliais}
                        onChange={(ev) =>
                          onChange(valor.map((x) => (x.companyId === v.companyId ? { ...x, incluiFiliais: ev.target.checked } : x)))
                        }
                        label={`Incluir ${e.filiais === 1 ? "a filial" : `as ${e.filiais} filiais`}`}
                      />
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  aria-label={`Tirar ${nome}`}
                  onClick={() => onChange(valor.filter((x) => x.companyId !== v.companyId))}
                >
                  <X size={12} /> Tirar
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <SearchableSelect
        key={rodada}
        id={id}
        name={`${id}-busca`}
        options={opcoes}
        avatar
        placeholder="Adicionar empresa: busque por nome ou CNPJ…"
        onChange={adicionar}
      />
    </div>
  );
}
