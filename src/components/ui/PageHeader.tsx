type Props = {
  /** Normalmente string. Aceita ReactNode porque em algumas telas o título é
   *  o próprio nome da pessoa/candidato envolvido em <Link>. */
  title: React.ReactNode;
  /** ReactNode, não string: a maioria dos subtítulos do app interpola
   *  contagem e pluralização ("{n} ações registradas neste workspace"). */
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
};

export function PageHeader({ title, subtitle, action }: Props) {
  // Quando título e ações não cabem lado a lado, as ações descem para a linha
  // de baixo. Sem o `flex-wrap`, ações largas espremiam o título numa coluna
  // estreita e a página ganhava rolagem lateral (visto em /processos, 30/09).
  return (
    <div className="flex flex-wrap items-end justify-between mb-7 gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-[18rem]">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
