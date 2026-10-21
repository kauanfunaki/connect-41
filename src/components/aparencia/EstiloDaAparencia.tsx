import { cssDaAparencia, variaveisDaAparencia, type Aparencia } from "@/lib/aparencia/cores";

/**
 * As cores do escritório na página (21/10/2026): um <style> com os tokens que
 * a aparência troca, nos mesmos seletores do globals.css. Sem nada escolhido
 * não sai nada, e a tela fica exatamente como era.
 *
 * `grupos: false` é o Connect da equipe, que só leva a cor principal — e só
 * quando o escritório liga "Usar também no Connect da equipe".
 *
 * O texto vem de `cssDaAparencia`, que só monta hex de 6 dígitos e `var`/
 * `color-mix` escritos por ela: nada do banco entra cru.
 */
export function EstiloDaAparencia({ aparencia, grupos = true }: { aparencia: Aparencia; grupos?: boolean }) {
  const css = cssDaAparencia(variaveisDaAparencia(aparencia, { grupos }));
  if (!css) return null;
  return <style data-aparencia="" dangerouslySetInnerHTML={{ __html: css }} />;
}
