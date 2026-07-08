// Skeleton exibido enquanto a ficha da pessoa (várias queries) carrega — feedback
// imediato em conexão lenta, em vez de tela em branco.
export default function LoadingPessoa() {
  return (
    <div className="p-6 max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-40 bg-surface-2 rounded mb-6" />

      <div className="flex items-center gap-3 mb-6">
        <div className="h-6 w-56 bg-surface-2 rounded" />
        <div className="h-5 w-20 bg-surface-2 rounded-full" />
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-surface border border-border rounded-lg p-5 mb-4">
          <div className="h-4 w-32 bg-surface-2 rounded mb-4" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {[0, 1, 2, 3].map((j) => (
              <div key={j}>
                <div className="h-2.5 w-20 bg-surface-2 rounded mb-2" />
                <div className="h-3.5 w-36 bg-surface-2 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
