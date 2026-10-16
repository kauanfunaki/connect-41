// Enquanto a conversa escolhida chega (14/10/2026): o esqueleto é só do painel
// da direita, no formato dele — barra, cabeçalho, mensagens, caixa de
// escrever. A lista à esquerda é do layout e fica onde está; antes, um
// esqueleto de página inteira piscava a cada conversa aberta.
export default function LoadingConversa() {
  return (
    <section
      aria-busy="true"
      aria-label="Abrindo a conversa"
      className="flex-1 min-h-0 flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border shrink-0">
        <div className="c41-skeleton w-8 h-8 rounded-md" />
        <div className="c41-skeleton w-8 h-8 rounded-md ml-3" />
        <div className="c41-skeleton w-8 h-8 rounded-md" />
        <div className="c41-skeleton w-40 h-3 ml-auto" />
      </div>
      <div className="shrink-0 border-b border-border-soft px-4 sm:px-5 py-3 space-y-2">
        <div className="c41-skeleton w-48 h-5" />
        <div className="c41-skeleton w-72 max-w-full h-3.5" />
      </div>
      <div className="shrink-0 flex gap-3 px-4 sm:px-5 h-10 items-center border-b border-border">
        <div className="c41-skeleton w-24 h-3.5" />
        <div className="c41-skeleton w-28 h-3.5" />
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-end gap-2 px-4 sm:px-5 py-3 overflow-hidden">
        <div className="c41-skeleton self-start w-[55%] h-12 rounded-lg" />
        <div className="c41-skeleton self-end w-[45%] h-10 rounded-lg" />
        <div className="c41-skeleton self-start w-[60%] h-16 rounded-lg" />
        <div className="c41-skeleton self-end w-[35%] h-10 rounded-lg" />
      </div>
      <div className="shrink-0 border-t border-border-soft px-3 sm:px-4 pt-2.5 pb-3">
        <div className="c41-skeleton h-[6.5rem] rounded-lg" />
      </div>
    </section>
  );
}
