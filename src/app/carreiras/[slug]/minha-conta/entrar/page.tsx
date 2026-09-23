import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { Entrar } from "@/components/carreiras/ContaDoCandidato";

export const dynamic = "force-dynamic";

// Sem Referer: o endereço desta página leva o token do link.
export const metadata: Metadata = { title: "Entrar — minhas candidaturas", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * Onde o link do e-mail cai. **Não entra sozinho**: pede um clique. Leitor de
 * e-mail corporativo abre os links da mensagem para checar segurança, e um link
 * de uso único gasto por ele deixaria o candidato sem conseguir entrar.
 */
export default async function EntrarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { slug } = await params;
  const { t } = await searchParams;
  const tenant = await getPrisma().tenant.findUnique({ where: { slug }, select: { name: true, active: true } });
  if (!tenant || !tenant.active) notFound();

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-md mx-auto">
        <header className="mb-6 text-center">
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Minhas candidaturas</h1>
          <p className="text-[13px] text-fg-muted mt-1">{tenant.name}</p>
        </header>
        <Card className="p-5">
          {t ? (
            <Entrar slug={slug} token={t} />
          ) : (
            <p className="text-[13px] text-fg">
              Link incompleto.{" "}
              <Link href={`/carreiras/${slug}/minha-conta`} className="text-brand hover:underline">
                Peça um novo
              </Link>
              .
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
