/**
 * Uma seção das telas de configuração (escolha 1B dos Ajustes de 15/10,
 * 20/10/2026): à esquerda o título e o que a seção faz, à direita os campos.
 * Era o desenho só de "Sua conta" (o enquadramento das configurações do
 * HubStrom, que o Kauan trouxe como referência em 30/09); as telas de
 * formulário das configurações (Empresa, Cálculo de rescisão) ficavam numa
 * coluna de 720px presa à esquerda, ou com os campos esticados na largura
 * toda.
 *
 * Em tela estreita as duas colunas empilham. `id` é o destino de um link para
 * o meio da tela (o "Horário da Agenda" do início das configurações).
 */
export function SecaoDeConfiguracao({
  titulo,
  descricao,
  icone,
  id,
  children,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  icone?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-x-10 gap-y-4 py-8 border-t border-border first-of-type:border-t-0 first-of-type:pt-2"
    >
      <div className="flex items-start gap-3.5">
        {icone && (
          <span className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-hover text-fg-secondary [&>svg]:w-[18px] [&>svg]:h-[18px]">
            {icone}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="font-display text-section font-semibold text-fg leading-tight">{titulo}</h2>
          {descricao && <p className="text-helper text-fg-muted mt-1 leading-relaxed max-w-[42ch]">{descricao}</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
