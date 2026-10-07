type Props = {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: string;
  error?: string;
  /** Classes do bloco — para ocupar colunas na grade (`sm:col-span-2`). */
  className?: string;
  /**
   * Algo pequeno à direita do rótulo, na mesma linha: "Limpar", um contador,
   * um link de ajuda. Fica fora do rótulo para não entrar no nome do campo.
   */
  acao?: React.ReactNode;
  children: React.ReactNode;
};

// Campo padrão do sistema: label + required + helper/error + o controle em si
// (Input/Select/Textarea, que já cuidam de disabled/readonly/error visualmente —
// aqui só repassamos a mensagem de erro/helper abaixo do controle).
//
// Revisão de alinhamento (30/09): é o único rótulo de campo do app. Havia
// quatro outros montados à mão (12px cinza, 11px com mb-1…), e campos lado a
// lado com rótulos de tamanhos diferentes desciam em alturas diferentes.
export function CampoForm({ label, htmlFor, required = false, helper, error, className = "", acao, children }: Props) {
  const rotulo = (
    <label htmlFor={htmlFor} className="text-label font-medium leading-5 text-fg">
      {label}
      {required && <span className="text-danger"> *</span>}
    </label>
  );
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`.trim()}>
      {acao ? (
        <div className="flex items-center justify-between gap-2 min-h-5">
          {rotulo}
          <span className="flex-shrink-0 text-helper">{acao}</span>
        </div>
      ) : (
        rotulo
      )}
      {children}
      {error ? (
        <p className="text-helper font-medium text-danger">{error}</p>
      ) : helper ? (
        <p className="text-helper text-fg-muted">{helper}</p>
      ) : null}
    </div>
  );
}

/**
 * Para o que divide a linha com campos mas não tem rótulo — uma caixa de
 * marcar, o botão "Adicionar", um link. Reserva a altura do rótulo em cima e
 * centraliza o conteúdo na altura do controle (36px, ou 32px com `compacto`),
 * e assim ele cai alinhado ao Input do lado, tenha o vizinho texto de ajuda
 * embaixo ou não.
 */
export function AlinhadoAoCampo({
  children,
  compacto = false,
  className = "",
}: {
  children: React.ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${className}`.trim()}>
      {/* Só a partir de sm: no celular a grade é de uma coluna e o item desce
          sozinho — o espaço do rótulo virava 20px vazios em cima dele. */}
      <span aria-hidden className="hidden sm:block h-5" />
      <div className={`flex items-center gap-2 ${compacto ? "min-h-8" : "min-h-9"}`}>{children}</div>
    </div>
  );
}
