"use client";

import Link from "next/link";
import { Fragment } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { trilhaDasConfiguracoes, type QuemConfigura } from "@/lib/configuracoes/areas";

/**
 * "Configurações › Pessoas e acessos" no topo de toda tela de configuração —
 * e "› Usuários" nas telas de dentro (novo, editar). No início não aparece.
 *
 * Fica fora das telas, no layout: as telas não mudaram. Encosta no título da
 * tela (`[&+.c41-pagina]:pt-2` tira o respiro de cima do `PageContainer` que
 * vem logo depois).
 */
export function TrilhaDasConfiguracoes({ quem }: { quem: QuemConfigura }) {
  const pathname = usePathname();
  const aba = useSearchParams().get("aba");
  const itens = trilhaDasConfiguracoes(pathname, aba, quem);
  if (itens.length === 0) return null;

  return (
    <nav aria-label="Trilha" className="max-w-[1440px] mx-auto px-6 pt-5 [&+.c41-pagina]:pt-3">
      <ol className="flex items-center flex-wrap gap-1 text-fs-2 text-fg-muted">
        {/* Nenhum item é a tela aberta (o título dela vem logo abaixo): a área
            leva ao cartão dela no início, e a tela, à lista de onde se veio. */}
        {itens.map((item, i) => (
          <Fragment key={`${item.rotulo}-${i}`}>
            {i > 0 && (
              <li aria-hidden className="flex items-center">
                <ChevronRight size={13} />
              </li>
            )}
            <li className="min-w-0">
              {item.href ? (
                <Link href={item.href} className="hover:text-fg transition-colors">
                  {item.rotulo}
                </Link>
              ) : (
                <span>{item.rotulo}</span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
