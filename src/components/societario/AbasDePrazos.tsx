import Link from "next/link";

// Exigências e Agenda são o mesmo módulo (`societario_prazos`): duas leituras
// do que tem data para cumprir. As abas deixam isso visível sem ocupar dois
// itens na sidebar.
const ABAS = [
  { chave: "exigencias", rotulo: "Exigências", href: "/societario/exigencias" },
  { chave: "agenda", rotulo: "Agenda de prazos", href: "/societario/agenda" },
] as const;

export function AbasDePrazos({ ativa }: { ativa: (typeof ABAS)[number]["chave"] }) {
  return (
    <nav className="flex gap-1 border-b border-border mb-5" aria-label="Exigências e prazos">
      {ABAS.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={a.chave === ativa ? "page" : undefined}
          className={
            a.chave === ativa
              ? "px-3 py-2 -mb-px border-b-2 border-brand text-brand text-[13px] font-medium"
              : "px-3 py-2 -mb-px border-b-2 border-transparent text-fg-secondary text-[13px] hover:text-fg"
          }
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
