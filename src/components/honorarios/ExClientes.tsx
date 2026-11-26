"use client";

import { useState } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import { ForaDaLista } from "@/components/shared/CascoDaTabela";
import type { ExClienteResumo } from "@/lib/honorarios/regras/auditExClientes";

// Ex-clientes (pedido do Societário): empresa ainda ativa no Connect cuja pasta
// está na pasta de ex-clientes da rede fica fora da auditoria. O robô manda os
// nomes dessas pastas no fim da varredura.
//
// Desde 26/11/2026 (melhoria-813) é o "· 9 ex-clientes fora · Ver" da barra da
// lista, o mesmo `ForaDaLista` de /empresas, e o "Ver" abre a lista num painel
// lateral. Era um bloco recolhível de texto entre os totais e a tabela.

/** "· 9 ex-clientes fora · Ver", ao lado da contagem da lista. */
export function ExClientesFora({ exClientes }: { exClientes: ExClienteResumo[] }) {
  const [aberto, setAberto] = useState(false);
  if (!exClientes.length) return null;
  return (
    <>
      <ForaDaLista
        n={exClientes.length}
        um="ex-cliente fora"
        varios="ex-clientes fora"
        botao={
          <button type="button" onClick={() => setAberto(true)} aria-haspopup="dialog" className="font-medium text-brand hover:underline">
            Ver
          </button>
        }
      />
      <SlideOver open={aberto} onClose={() => setAberto(false)} title="Ex-clientes fora da auditoria">
        <p className="mb-4 text-label text-fg-secondary">
          {exClientes.length === 1 ? "1 empresa ativa no Connect está" : `${exClientes.length} empresas ativas no Connect estão`} com a pasta em Ex Clientes, na
          rede, e {exClientes.length === 1 ? "fica" : "ficam"} fora da auditoria.
        </p>
        <ul className="divide-y divide-border-soft text-label">
          {exClientes.map((e) => (
            <li key={e.id} className="py-2">
              <span className="block font-medium text-fg">{e.razaoSocial}</span>
              <span className="block text-micro text-fg-muted tabular-nums">
                {e.cnpj} · pasta “{e.pasta}”
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-micro text-fg-muted">
          Se alguma delas ainda é cliente, mova a pasta de volta para a raiz da rede: na próxima varredura ela volta para a auditoria.
        </p>
      </SlideOver>
    </>
  );
}
