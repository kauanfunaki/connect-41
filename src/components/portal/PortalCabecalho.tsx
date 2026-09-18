import Link from "next/link";
import { LogOut } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { sairDoPortal } from "@/app/(portal)/portal/login/actions";

type Item = { chave: string; rotulo: string; href: string; modulo: string | null };

// Cada tela aparece só se o módulo que a sustenta está ligado no tenant. O
// acervo fiscal não tem gate de módulo no portal desde que nasceu, e segue sem.
const ITENS: Item[] = [
  { chave: "documentos", rotulo: "Documentos fiscais", href: "/portal", modulo: null },
  { chave: "dre", rotulo: "DRE", href: "/portal/dre", modulo: "bpo_dre" },
  { chave: "fluxo", rotulo: "Fluxo de caixa", href: "/portal/fluxo-de-caixa", modulo: "bpo_fluxo_caixa" },
  { chave: "pagar", rotulo: "Contas a pagar", href: "/portal/pagar", modulo: "bpo_contas_pagar" },
  { chave: "receber", rotulo: "Contas a receber", href: "/portal/receber", modulo: "bpo_contas_receber" },
  { chave: "relatorios", rotulo: "Relatório", href: "/portal/relatorios", modulo: "bpo_fluxo_caixa" },
  { chave: "pendencias", rotulo: "Pendências", href: "/portal/pendencias", modulo: "bpo_pendencias" },
  { chave: "comunicacao", rotulo: "Conversa", href: "/portal/comunicacao", modulo: "bpo_comunicacao" },
  { chave: "aprovacoes", rotulo: "Aprovações", href: "/portal/aprovacoes", modulo: "bpo_aprovacoes" },
  { chave: "cobranca", rotulo: "Cobrança", href: "/portal/cobranca", modulo: "bpo_cobranca" },
];

export function PortalNav({ ativo, modulos }: { ativo: string; modulos: Set<string> }) {
  const visiveis = ITENS.filter((i) => i.modulo === null || modulos.has(i.modulo));
  if (visiveis.length <= 1) return null;
  return (
    <nav className="flex flex-wrap gap-1.5 mb-6" aria-label="Portal">
      {visiveis.map((i) => (
        <Link
          key={i.chave}
          href={i.href}
          aria-current={i.chave === ativo ? "page" : undefined}
          className={
            i.chave === ativo
              ? "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
              : "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
          }
        >
          {i.rotulo}
        </Link>
      ))}
    </nav>
  );
}

/** Título, grupo, sair e navegação — o topo de toda tela financeira do portal. */
export function PortalCabecalho({
  titulo,
  descricao,
  grupoNome,
  ativo,
  modulos,
  somenteLeitura = true,
}: {
  titulo: string;
  descricao: string;
  grupoNome: string | null;
  ativo: string;
  modulos: Set<string>;
  /** Pendências e aprovações são as telas em que o cliente escreve — lá o "Só leitura" mentiria. */
  somenteLeitura?: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <PageHeader title={titulo} />
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            {grupoNome ?? "Suas empresas"} · {descricao}
            {somenteLeitura && " Só leitura."}
          </p>
        </div>
        <form action={sairDoPortal}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-[length:var(--fs-button)] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
          >
            <LogOut size={15} /> Sair
          </button>
        </form>
      </div>
      <PortalNav ativo={ativo} modulos={modulos} />
    </>
  );
}
