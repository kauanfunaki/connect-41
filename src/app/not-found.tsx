import Link from "next/link";
import { FileQuestion } from "lucide-react";

// 404 global — cobre rotas que não batem em nenhum segmento (fora do shell
// autenticado, ex: usuário deslogado digitando uma URL qualquer).
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="flex flex-col items-center text-center gap-3 max-w-[360px]">
        <span className="w-10 h-10 rounded-xl bg-surface-hover text-fg-muted flex items-center justify-center">
          <FileQuestion size={18} />
        </span>
        <p className="text-[14px] font-semibold text-fg">Página não encontrada.</p>
        <p className="text-[13px] text-fg-muted">
          O endereço que você tentou acessar não existe.
        </p>
        <Link
          href="/home"
          className="inline-flex items-center h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors mt-1"
        >
          Ir para o início
        </Link>
      </div>
    </div>
  );
}
