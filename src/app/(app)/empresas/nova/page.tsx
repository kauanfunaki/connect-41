import Link from "next/link";
import { EmpresaForm } from "@/components/empresas/EmpresaForm";
import { criarEmpresa } from "../actions";

export default function NovaEmpresaPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/empresas"
          className="text-[13px] text-fg-muted hover:text-fg transition-colors"
        >
          Empresas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova Empresa</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Nova Empresa
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <EmpresaForm action={criarEmpresa} cancelHref="/empresas" />
      </div>
    </div>
  );
}
