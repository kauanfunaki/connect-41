import Link from "next/link";
import { notFound } from "next/navigation";
import { CampoForm } from "@/components/admin/CampoForm";
import { criarCampo } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";

export default async function NovoCampoPage() {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();

  const { options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/campos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Campos Customizados
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Campo</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Campo</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <CampoForm action={criarCampo} cancelHref="/admin/campos" sectorOptions={sectorOptions} />
      </div>
    </div>
  );
}
