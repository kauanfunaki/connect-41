import Link from "next/link";
import { FileQuestion } from "lucide-react";

// 404 dentro do shell autenticado — cobre notFound() disparado por
// ids/rotas inválidas dentro de (app) (ex: /empresas/xxxxx inexistente).
export default function AppNotFound() {
  return (
    <div className="p-6 max-w-[1440px] mx-auto">
      <div className="bg-surface border border-border rounded-2xl p-10 flex flex-col items-center text-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-surface-hover text-fg-muted flex items-center justify-center">
          <FileQuestion size={18} />
        </span>
        <p className="text-[14px] font-semibold text-fg">Página não encontrada.</p>
        <p className="text-[13px] text-fg-muted max-w-[360px]">
          O registro ou a rota que você tentou abrir não existe ou foi removido.
        </p>
        <Link
          href="/home"
          className="inline-flex items-center h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors mt-1"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
