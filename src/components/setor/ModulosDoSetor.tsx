import { LayoutGrid } from "lucide-react";
import { Icone, ModuleIcon } from "@/components/shared/ModuleIcon";
import { BotaoFixarTela } from "@/components/setor/BotaoFixarTela";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Card } from "@/components/ui/Card";
import { agruparModulos, ICONE_DO_GRUPO, slugDoGrupo, type GrupoDeModulo } from "@/lib/module-catalog";
import { areaDoGrupoDeTelas, areaDoModulo } from "@/lib/aparencia/gruposDaEquipe";

export type ModuloDoSetor = { code: string; label: string; description: string };

/**
 * Os módulos de um setor em cartões, agrupados.
 *
 * Uma implementação só para a tela com todas as telas do setor (`/setor/bpo/telas`) e para a
 * filtrada por grupo (`/setor/bpo/grupo/contas`), que é onde a sidebar cai ao
 * clicar no grupo: duas telas parecidas escritas duas vezes é como uma delas
 * envelhece sozinha.
 *
 * As abas em cima existem para trocar de grupo sem voltar à sidebar, e para o
 * filtro ficar visível — tela filtrada sem dizer que está filtrada é tela que
 * parece ter perdido conteúdo.
 */
export function ModulosDoSetor({
  code,
  modulos,
  grupoAtivo = null,
  fixadas = [],
}: {
  code: string;
  modulos: ModuloDoSetor[];
  grupoAtivo?: GrupoDeModulo | null;
  /** Códigos já fixados na sidebar por quem está olhando. */
  fixadas?: string[];
}) {
  const fixada = new Set(fixadas);
  const grupos = agruparModulos(modulos);
  const visiveis = grupoAtivo ? grupos.filter((g) => g.grupo === grupoAtivo) : grupos;

  return (
    <>
      {grupos.length > 1 && (
        <AbasDeLink
          ativa={grupoAtivo ?? "tudo"}
          abas={[
            { chave: "tudo", rotulo: "Tudo", href: `/setor/${code}/telas`, icone: <LayoutGrid /> },
            ...grupos.map((g) => ({
              chave: g.grupo,
              rotulo: g.grupo,
              icone: <Icone nome={ICONE_DO_GRUPO[g.grupo]} />,
              contagem: g.itens.length,
              href: `/setor/${code}/grupo/${slugDoGrupo(g.grupo)}`,
            })),
          ]}
        />
      )}

      <div className="flex flex-col gap-7">
        {visiveis.map(({ grupo, itens }) => (
          <section key={grupo}>
            {/* Com um grupo só na tela o título do grupo repetiria o subtítulo da
                página, que já diz o nome dele. */}
            {visiveis.length > 1 && (
              <h2 data-grupo={areaDoGrupoDeTelas(itens.map((m) => m.code)) ?? "marca"} className="c41-rotulo mb-2.5 flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm bg-grupo" />
                {grupo}
              </h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {itens.map((m) => (
                // O alfinete é irmão do link, e não filho: botão dentro de <a>
                // é inválido e o clique abriria a tela junto. O cartão é o
                // cartão-atalho do app (`Card href`): borda azul, sobe 2px.
                // Cada cartão na cor da área da tela (29/10/2026): o filete no
                // topo e o ícone, como o item dela no menu e a página da área.
                <div key={m.code} className="group relative" data-grupo={areaDoModulo(m.code) ?? "marca"}>
                  <Card href={`/setor/${code}/${m.code}`} className="relative h-full overflow-hidden p-4 pr-11">
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-grupo" />
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 bg-grupo/12 text-grupo transition-colors group-hover:bg-grupo/20">
                        <ModuleIcon code={m.code} size={17} />
                      </span>
                      <p className="text-fs-4 font-semibold text-fg leading-tight">{m.label}</p>
                    </div>
                    <p className="text-fs-2 text-fg-muted mt-2 leading-relaxed">{m.description}</p>
                  </Card>
                  <div className="absolute top-3 right-3">
                    <BotaoFixarTela code={m.code} fixada={fixada.has(m.code)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
