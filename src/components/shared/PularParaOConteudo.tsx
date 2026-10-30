/**
 * "Pular para o conteúdo" — o primeiro Tab da tela (auditoria de UX,
 * 30/10/2026). Sem ele, quem usa teclado passava pela busca, por 15 a 25 itens
 * do menu e pelos controles do topo antes de chegar à tela, em toda navegação.
 * Invisível até receber o foco. O alvo é o `<main id="conteudo">` do casco.
 */
export function PularParaOConteudo() {
  return (
    <a
      href="#conteudo"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:border focus:border-border-strong focus:bg-surface-elevated focus:px-4 focus:py-2.5 focus:text-label focus:font-semibold focus:text-fg focus:shadow-lg"
    >
      Pular para o conteúdo
    </a>
  );
}
