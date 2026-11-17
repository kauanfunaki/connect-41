import { UserMinus } from "lucide-react";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import type { ExClienteResumo } from "@/lib/honorarios/regras/auditExClientes";

// Ex-clientes (pedido do Societário): empresa ainda ativa no Connect cuja pasta
// está na pasta de ex-clientes da rede fica fora da auditoria. O robô manda os
// nomes dessas pastas no fim da varredura.

/** Bloco do resumo, fechado, com a lista de quem saiu ao abrir. */
export function ResumoExClientes({ exClientes }: { exClientes: ExClienteResumo[] }) {
  if (!exClientes.length) return null;
  return (
    <BlocoRecolhivel
      className="mb-3 bg-surface"
      titulo="Ex-clientes fora da auditoria"
      resumo={exClientes.length === 1 ? "1 empresa com a pasta em Ex Clientes" : `${exClientes.length} empresas com a pasta em Ex Clientes`}
    >
      <ul className="max-h-60 space-y-0.5 overflow-y-auto text-label text-fg-muted">
        {exClientes.map((e) => (
          <li key={e.id}>
            <span className="text-fg-secondary">{e.razaoSocial}</span> {e.cnpj} · pasta “{e.pasta}”
          </li>
        ))}
      </ul>
      <p className="mt-2 text-micro text-fg-muted">
        Se alguma delas ainda é cliente, mova a pasta de volta para a raiz da rede: na próxima varredura ela volta para a auditoria.
      </p>
    </BlocoRecolhivel>
  );
}

/** Aviso na linha: tem pasta ativa e também uma em Ex Clientes (cliente que voltou ou pasta esquecida). */
export function AvisoExCliente({ pasta }: { pasta: string | null }) {
  if (!pasta) return null;
  return (
    <span
      className="mt-1 flex items-start gap-1 text-micro text-warning-fg"
      title="A empresa tem pasta ativa na raiz e também uma pasta em Ex Clientes. Confira se ela ainda é cliente."
    >
      <UserMinus size={12} className="mt-0.5 shrink-0" aria-hidden />
      Também tem pasta em Ex Clientes (“{pasta}”)
    </span>
  );
}
