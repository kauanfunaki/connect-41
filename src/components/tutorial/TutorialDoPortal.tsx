import { Suspense } from "react";
import { sessaoAtivaDoPortal } from "@/app/(portal)/usuario";
import { montarTutorialDoPortal, tutorialDoPortalAbreSozinho } from "@/lib/tutorial/servidor";
import { TutorialDoPrimeiroAcesso } from "@/components/tutorial/TutorialDoPrimeiroAcesso";
import { concluirTutorialDoPortal } from "@/app/(portal)/portal/tutorial-actions";

/**
 * O tutorial do primeiro acesso do cliente ao portal (13/10/2026), montado no
 * layout da área do cliente. Abre uma vez por acesso; os passos seguem os
 * módulos ligados no escritório, como o menu.
 *
 * Em `Suspense`, e qualquer erro vira "não abre": o tutorial nunca derruba o
 * portal.
 */
export function TutorialDoPortal() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

async function tutorialParaAbrir() {
  try {
    const sessao = await sessaoAtivaDoPortal();
    if (!sessao || !(await tutorialDoPortalAbreSozinho(sessao))) return null;
    return await montarTutorialDoPortal(sessao);
  } catch (err) {
    console.error("[tutorial] portal", err);
    return null;
  }
}

async function Conteudo() {
  const tutorial = await tutorialParaAbrir();
  if (!tutorial) return null;
  return <TutorialDoPrimeiroAcesso tutorial={tutorial} concluir={concluirTutorialDoPortal} />;
}
