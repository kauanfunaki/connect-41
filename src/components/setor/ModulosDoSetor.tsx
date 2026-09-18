import Link from "next/link";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { BotaoFixarTela } from "@/components/setor/BotaoFixarTela";
import { AbasDeLink } from "@/components/financeiro/FiltroDePeriodo";
import { agruparModulos, slugDoGrupo, type GrupoDeModulo } from "@/lib/module-catalog";

export type ModuloDoSetor = { code: string; label: string; description: string };

/**
 * Os módulos de um setor em cartões, agrupados.
 *
 * Uma implementação só para a tela do setor inteira (`/setor/bpo`) e para a
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
  cor,
  grupoAtivo = null,
  fixadas = [],
}: {
  code: string;
  modulos: ModuloDoSetor[];
  /** Cor do setor, do cadastro — pinta o ícone de cada cartão. */
  cor: string;
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
            { chave: "tudo", rotulo: "Tudo", href: `/setor/${code}` },
            ...grupos.map((g) => ({
              chave: g.grupo,
              rotulo: `${g.grupo} · ${g.itens.length}`,
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
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mb-2.5">{grupo}</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {itens.map((m) => (
                // O alfinete é irmão do link, e não filho: botão dentro de <a>
                // é inválido e o clique abriria a tela junto.
                <div key={m.code} className="group relative">
                  <Link
                    href={`/setor/${code}/${m.code}`}
                    className="block h-full bg-surface border border-border rounded-lg p-4 pr-11 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="inline-flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0"
                        style={{ background: `${cor}1A`, color: cor }}
                      >
                        <ModuleIcon code={m.code} size={17} />
                      </span>
                      <p className="text-[14px] font-semibold text-fg leading-tight">{m.label}</p>
                    </div>
                    <p className="text-[12.5px] text-fg-muted mt-2 leading-relaxed">{m.description}</p>
                  </Link>
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
