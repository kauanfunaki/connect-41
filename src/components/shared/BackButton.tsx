"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type Props = {
  className?: string;
  /**
   * Destino fixo — "← Leads", "← Conversas" (07/10/2026). Quem chega pelo link
   * de um e-mail não tem para onde o `router.back()` voltar; com `href` o
   * botão vira link, no mesmo desenho. Sem `href`, segue voltando no histórico.
   */
  href?: string;
  /** O texto — padrão "Voltar". Com `href`, o nome da lista ("Leads"). */
  rotulo?: string;
};

// router.back() em vez de Link pra voltar de verdade na navegação do browser —
// preserva estado que só existe na entrada de histórico anterior (ex: aba
// selecionada em ?tab= na ficha de Empresa/Pessoa), diferente de um Link fixo
// que sempre abriria a aba padrão.
//
// A área de clique passa de ~20px para 40px de altura (07/10/2026) por um
// pseudo-elemento, sem mudar o layout de quem já usa — no celular, o "Voltar"
// era um alvo do tamanho do texto. Um desenho só para os quatro "voltar" do app.
export function BackButton({ className = "", href, rotulo = "Voltar" }: Props) {
  const router = useRouter();
  const cls = `relative inline-flex items-center gap-1.5 text-ui text-fg-muted hover:text-fg transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 after:content-[''] ${className}`.trim();
  const conteudo = (
    <>
      <ArrowLeft size={14} />
      {rotulo}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => router.back()} className={cls}>
      {conteudo}
    </button>
  );
}
