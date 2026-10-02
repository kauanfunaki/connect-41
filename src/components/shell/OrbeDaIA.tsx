/**
 * O orbe da IA (02/10/2026): azul 41 girando com a cor do setor do agente —
 * a mesma identidade no botão do canto, no cabeçalho, na resposta e nas
 * boas-vindas. A cor vem de `--orbe-b`, posta por quem está em volta.
 */
export function OrbeDaIA({ tamanho = 28, className = "" }: { tamanho?: number; className?: string }) {
  return <span aria-hidden className={`c41-orbe inline-block flex-shrink-0 ${className}`.trim()} style={{ width: tamanho, height: tamanho }} />;
}
