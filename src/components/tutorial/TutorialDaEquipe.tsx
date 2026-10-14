import { Suspense } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { montarTutorialDaEquipe, tutorialDaEquipeAbreSozinho } from "@/lib/tutorial/servidor";
import { TutorialDoPrimeiroAcesso } from "@/components/tutorial/TutorialDoPrimeiroAcesso";
import { concluirTutorialDaEquipe } from "@/app/(app)/tutorial-actions";

/**
 * O tutorial do primeiro acesso da equipe (13/10/2026), montado no layout do
 * app. Abre uma vez para o Colaborador e o Gestor de setor; administrador
 * pula. Para quem já viu, custa uma leitura pela chave e não manda nada para
 * a tela.
 *
 * Em `Suspense`, para a leitura não segurar o resto do app — e qualquer erro
 * vira "não abre": o tutorial nunca derruba uma tela.
 */
export function TutorialDaEquipe() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

async function tutorialParaAbrir() {
  try {
    const ctx = await getAuthContext();
    if (!(await tutorialDaEquipeAbreSozinho(ctx))) return null;
    return await montarTutorialDaEquipe(ctx);
  } catch (err) {
    console.error("[tutorial] equipe", err);
    return null;
  }
}

async function Conteudo() {
  const tutorial = await tutorialParaAbrir();
  if (!tutorial) return null;
  return <TutorialDoPrimeiroAcesso tutorial={tutorial} concluir={concluirTutorialDaEquipe} />;
}
