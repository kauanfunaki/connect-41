type Props = {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
};

// Campo padrão do sistema: label + required + helper/error + o controle em si
// (Input/Select/Textarea, que já cuidam de disabled/readonly/error visualmente —
// aqui só repassamos a mensagem de erro/helper abaixo do controle).
export function CampoForm({ label, htmlFor, required = false, helper, error, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[length:var(--fs-label)] font-medium text-fg">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger">{error}</p>
      ) : helper ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted">{helper}</p>
      ) : null}
    </div>
  );
}
