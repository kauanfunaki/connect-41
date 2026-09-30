import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { AbasDaGestao } from "@/components/gestao/AbasDaGestao";
import { contextoDaGestao } from "@/lib/gestao/acesso";

// A Gestão (29/09/2026): as telas do painel 41-gestao trazidas para o Connect —
// painel de todos os setores, alertas e carga dos coordenadores. A precificação
// (Valora) já estava aqui e não se repete.
export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const subtitulo =
    g.recorte === "todos"
      ? "Todos os setores num lugar: o que começou, o que anda, o que parou e o que terminou."
      : `Os setores que você coordena: ${g.setores.map((s) => s.label).join(", ")}.`;
  return (
    <PageContainer>
      <PageHeader title="Gestão" subtitle={subtitulo} />
      {/* A aba já traz o próprio respiro embaixo (`AbasDeLink`). */}
      <Suspense>
        <AbasDaGestao />
      </Suspense>
      {children}
    </PageContainer>
  );
}
