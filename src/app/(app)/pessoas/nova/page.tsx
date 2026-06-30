import { headers } from "next/headers";
import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { PessoaForm } from "@/components/pessoas/PessoaForm";
import { criarPessoa } from "../actions";

export default async function NovaPessoaPage() {
  const h = await headers();
  const tenantId = h.get("x-tenant-id")!;

  const prisma = getPrisma();
  const companies = await prisma.company.findMany({
    where: { tenantId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova Pessoa</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">Nova Pessoa</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <PessoaForm action={criarPessoa} cancelHref="/pessoas" companies={companies} />
      </div>
    </div>
  );
}
