"use client";

import { useRouter } from "next/navigation";
import { SlideOver } from "@/components/ui/SlideOver";

/**
 * O painel ao lado dos cadastros simples (escolha 2B dos Ajustes de 15/10,
 * 20/10/2026): criar e editar uma tag, um assunto ou uma categoria abre aqui,
 * à direita, com a lista à vista atrás. Era uma página só para o formulário,
 * num cartão de 720px encostado à esquerda, e a lista sumia.
 *
 * O painel mora no endereço (`?novo=1`, `?editar=<id>`): a página da lista
 * o desenha quando o endereço pede, e fechar volta ao endereço da lista.
 * Salvar já fazia isso — a action redireciona para a lista —, então os
 * formulários não mudam. Os endereços antigos (/novo e /[id]/editar)
 * redirecionam para cá.
 */
export function PainelDeCadastro({
  titulo,
  voltarPara,
  largo = false,
  children,
}: {
  titulo: string;
  /** O endereço da lista, sem o painel. */
  voltarPara: string;
  /** Para o formulário que pede espaço: o usuário, com os setores em pílulas (3A). */
  largo?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <SlideOver
      open
      onClose={() => router.push(voltarPara, { scroll: false })}
      title={titulo}
      width={largo ? "max-w-2xl" : "max-w-lg"}
      fundo="leve"
    >
      {children}
    </SlideOver>
  );
}
