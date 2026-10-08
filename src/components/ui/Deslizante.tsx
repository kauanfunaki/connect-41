type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "min" | "max"> & {
  value: number;
  min: number;
  max: number;
};

/**
 * Controle deslizante do Connect (08/10/2026) — o zoom do recorte de imagem
 * era o `<input type="range">` cru, com o trilho cinza e a bolinha do sistema.
 *
 * Continua o `range` nativo por baixo (setas, Page Up/Down, Home/End e o
 * leitor de tela dizendo o valor); o desenho vem de `.c41-deslizante` no
 * globals.css: trilho fino, a parte percorrida no azul 41 e o polegar
 * branco com borda azul. A parte percorrida sai do `--progresso`, calculado
 * aqui (o Firefox tem o `::-moz-range-progress` e nem precisa dele).
 */
export function Deslizante({ value, min, max, className = "", style, ...rest }: Props) {
  const fracao = max > min ? (value - min) / (max - min) : 0;
  const progresso = `${Math.min(Math.max(fracao, 0), 1) * 100}%`;
  return (
    <input
      type="range"
      value={value}
      min={min}
      max={max}
      className={`c41-deslizante ${className}`.trim()}
      style={{ ...style, "--progresso": progresso } as React.CSSProperties}
      {...rest}
    />
  );
}
