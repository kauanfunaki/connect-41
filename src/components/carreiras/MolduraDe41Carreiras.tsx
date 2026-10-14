import type { ReactNode } from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LogoDoEscritorio } from "@/components/publico/LogoDoEscritorio";
import { MARCA_41_CARREIRAS, type PortalDoTenant } from "@/lib/carreiras/enderecoDeCarreiras";

// O topo e o rodapé das páginas do 41 Carreiras (14/10/2026): o hub, a vaga e
// a conta do candidato, quando o escritório é o da 41. A marca é a da 41, não
// a do Connect — sem o logo nem a Lígia. O miolo de cada página é o mesmo do
// portal de qualquer escritório.

/**
 * "41 Carreiras": o logo do escritório da 41 (quando cadastrado) e o nome; sem
 * logo, o "41" num selo e "Carreiras" ao lado. Com logo, o nome vai inteiro —
 * se a imagem não carregar, ela some (LogoDoEscritorio) e a marca continua.
 */
export function MarcaDe41Carreiras({ logo }: { logo: string | null }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      {logo ? (
        <LogoDoEscritorio src={logo} alt="" className="h-8 w-auto max-w-[112px] object-contain" />
      ) : (
        <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-fg font-display text-fs-4 font-bold tracking-[-0.02em] text-canvas">
          41
        </span>
      )}
      <span className="font-display text-fs-6 font-semibold tracking-[-0.01em] text-fg">{logo ? MARCA_41_CARREIRAS.nome : "Carreiras"}</span>
    </span>
  );
}

/**
 * A moldura de uma página do portal: para a 41, o topo e o rodapé do 41
 * Carreiras; para os outros escritórios, a de sempre (só o respiro).
 */
export function MolduraDoPortal({ portal, logo, children }: { portal: PortalDoTenant; logo: string | null; children: ReactNode }) {
  if (!portal.da41) return <div className="min-h-screen py-10 px-4">{children}</div>;
  return (
    <MolduraDe41Carreiras logo={logo} inicio={portal.rotas.lista} conta={portal.rotas.conta}>
      {children}
    </MolduraDe41Carreiras>
  );
}

export function MolduraDe41Carreiras({
  logo,
  inicio,
  conta,
  children,
}: {
  logo: string | null;
  /** A lista de vagas (o hub). */
  inicio: string;
  /** A conta do candidato. */
  conta: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href={inicio} aria-label={`${MARCA_41_CARREIRAS.nome}: vagas abertas`} className="flex-none rounded-md">
            <MarcaDe41Carreiras logo={logo} />
          </Link>
          <Button href={conta} variant="ghost" size="sm" className="-mr-2">
            <UserRound size={14} /> Minhas candidaturas
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:py-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-6 text-fs-2 text-fg-muted">
          <p>
            {MARCA_41_CARREIRAS.nome} · vagas em empresas clientes da{" "}
            <span className="font-medium text-fg-secondary">{MARCA_41_CARREIRAS.escritorio}</span>
          </p>
          <Link href={conta} className="rounded-sm text-fg-secondary hover:text-fg hover:underline">
            Acompanhar minhas candidaturas
          </Link>
        </div>
      </footer>
    </div>
  );
}
