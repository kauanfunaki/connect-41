import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { IconeDaArea } from "@/components/configuracoes/IconeDaArea";
import { getAuthContext } from "@/lib/auth/context";
import { areasVisiveis, podeAbrirInicio, type AreaDeConfiguracao } from "@/lib/configuracoes/areas";
import { quemConfigura } from "@/lib/configuracoes/quem";

// O início das configurações (escolha "Organização · A" do Kauan, 14/10/2026):
// um cartão por área, com as telas dela. Eram até 22 cartões do mesmo tamanho
// em cinco grupos — "Feriados", que se mexe uma vez por ano, pesava o mesmo
// que "Usuários". As telas e os endereços continuam os mesmos; o catálogo das
// áreas (e quem abre cada tela) mora em `lib/configuracoes/areas`.
export default async function AdminPage() {
  const ctx = await getAuthContext();
  const quem = await quemConfigura(ctx);
  if (!podeAbrirInicio(quem)) notFound();

  const areas = areasVisiveis(quem);
  const comuns = areas.filter((a) => !a.soDaPlataforma);
  const daPlataforma = areas.filter((a) => a.soDaPlataforma);

  return (
    <PageContainer>
      <PageHeader
        title="Configurações"
        subtitle="O que vale para todo o escritório, separado por assunto. O menu leva de uma tela a outra sem voltar aqui."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {comuns.map((area) => (
          <CartaoDaArea key={area.chave} area={area} />
        ))}
      </div>

      {/* Só a 41 Tech: num cartão tracejado, à parte das áreas do escritório. */}
      {daPlataforma.map((area) => (
        <section
          key={area.chave}
          id={`area-${area.chave}`}
          aria-labelledby={`titulo-area-${area.chave}`}
          className="scroll-mt-6 mt-6 rounded-lg border border-dashed border-border-strong bg-surface px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-3"
        >
          <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-brand-subtle text-brand flex-shrink-0">
            <IconeDaArea icone={area.icone} size={18} />
          </span>
          <div className="min-w-0">
            <h2 id={`titulo-area-${area.chave}`} className="text-fs-4 font-semibold text-fg">
              {area.rotulo}
            </h2>
            <p className="text-fs-2 text-fg-muted">{area.resumo}</p>
          </div>
          <ul className="flex flex-wrap gap-2 sm:ml-auto">
            {area.telas.map((t) => (
              <li key={t.chave}>
                <Link
                  href={t.href}
                  title={t.descricao}
                  className="inline-flex items-center h-8 px-3 rounded-full border border-border-strong bg-surface text-fs-2 font-medium text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                >
                  {t.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageContainer>
  );
}

/** Uma área: o que ela junta e a lista das telas, cada uma com a frase do que faz. */
function CartaoDaArea({ area }: { area: AreaDeConfiguracao }) {
  return (
    <section
      id={`area-${area.chave}`}
      aria-labelledby={`titulo-area-${area.chave}`}
      className="scroll-mt-6 bg-surface border border-border rounded-lg shadow-xs p-5 flex flex-col gap-3"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex w-10 h-10 rounded-lg items-center justify-center bg-brand-subtle text-brand flex-shrink-0">
          <IconeDaArea icone={area.icone} size={20} />
        </span>
        <div className="min-w-0">
          <h2 id={`titulo-area-${area.chave}`} className="text-fs-4 font-semibold text-fg">
            {area.rotulo}
          </h2>
          <p className="text-fs-2 text-fg-muted">{area.resumo}</p>
        </div>
      </div>
      <ul className="border-t border-border -mx-2">
        {area.telas.map((t) => (
          <li key={t.chave} className="border-b border-border last:border-b-0">
            <Link
              href={t.href}
              className="group flex items-center gap-3 px-2 py-2.5 rounded-md hover:bg-surface-hover transition-colors"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-ui font-medium text-fg">{t.rotulo}</span>
                <span className="block text-fs-2 text-fg-muted leading-snug mt-0.5">{t.descricao}</span>
              </span>
              <ChevronRight size={16} className="text-fg-muted flex-shrink-0 group-hover:text-fg transition-colors" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
