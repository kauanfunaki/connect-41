import { Button } from "@/components/ui/Button";
import { FileQuestion } from "lucide-react";

// 404 global — cobre rotas que não batem em nenhum segmento (fora do shell
// autenticado, ex: usuário deslogado digitando uma URL qualquer).
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {/* Mesma moldura das telas de erro (login/error, d/[token]/error): título
          de 18px e o botão sem peso próprio — o `font-medium` brigava com o
          `font-semibold` do Button, e quem ganhava dependia da ordem do CSS. */}
      <div className="max-w-md text-center flex flex-col items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-surface-hover text-fg-muted flex items-center justify-center">
          <FileQuestion size={18} />
        </span>
        <h1 className="text-fs-7 font-semibold text-fg">Página não encontrada.</h1>
        <p className="text-fs-3 text-fg-muted">
          O endereço que você tentou acessar não existe.
        </p>
        <Button href="/home" className="mt-1">
          Ir para o início
        </Button>
      </div>
    </div>
  );
}
