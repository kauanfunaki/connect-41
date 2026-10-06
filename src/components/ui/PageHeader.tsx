type Props = {
  /** Normalmente string. Aceita ReactNode porque em algumas telas o título é
   *  o próprio nome da pessoa/candidato envolvido em <Link>. */
  title: React.ReactNode;
  /** ReactNode, não string: a maioria dos subtítulos do app interpola
   *  contagem e pluralização ("{n} ações registradas neste workspace"). */
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  /** Linha de selos e datas embaixo do título (situação, prazo, "aberto em")
   *  — as telas de detalhe montavam isso à mão depois do cabeçalho, a 40px do
   *  título (02/10/2026). */
  meta?: React.ReactNode;
};

export function PageHeader({ title, subtitle, action, meta }: Props) {
  // Quando título e ações não cabem lado a lado, as ações descem para a linha
  // de baixo. Sem o `flex-wrap`, ações largas espremiam o título numa coluna
  // estreita e a página ganhava rolagem lateral (visto em /processos, 30/09).
  return (
    <div className="flex flex-wrap items-end justify-between mb-7 gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-[18rem]">
        {/* O traço na cor do setor é a assinatura da tela (polimento de 30/09):
            diz de quem ela é sem ocupar uma linha de texto. Fora de setor, e no
            portal, é o azul da marca. */}
        <span aria-hidden className="block h-[3px] w-7 rounded-full bg-[var(--c41-setor)] mb-3" />
        <h1 className="text-[length:var(--fs-display)] font-bold text-fg tracking-[-0.02em] leading-tight">{title}</h1>
        {/* Subtítulo em 14px e no cinza do texto de apoio, não no "mudo" (revisão
            de 05/10: o Kauan achava títulos e descrições apagados demais). */}
        {subtitle && <p className="text-[length:var(--fs-label)] text-fg-secondary mt-2 max-w-[78ch] leading-relaxed">{subtitle}</p>}
        {meta && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-[length:var(--fs-helper)] text-fg-secondary">{meta}</div>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
