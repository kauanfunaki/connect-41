type Props = {
  color: string;
  label: string;
  className?: string;
};

// Padrão de status do Connect 41: ponto de cor + rótulo, sem pílula/fundo tintado
// (ver decisão de design registrada no projeto — "status por ponto + rótulo, não pílula").
//
// O papel, pela regra da escolha 2A do Kauan (08/10/2026): ATIVO/INATIVO de um
// cadastro — usuário, setor, acesso do portal, assunto, workspace. Ativo em
// `var(--c41-success)`, inativo em `var(--c41-fg-muted)` (o cinza do que saiu
// de cena). Situação de uma linha ("Vencida", "Em análise") é o `Selo`;
// categoria em destaque é o `Badge` — ver o comentário do `Selo`.
export function StatusDot({ color, label, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-fs-2 text-fg-secondary ${className}`.trim()}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}
