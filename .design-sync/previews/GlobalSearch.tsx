import { GlobalSearch } from 'connect-41';

// Busca global do topbar — self-contained (sem props), busca via fetch interno.
// Em ambiente estático a chamada de rede falha silenciosamente (catch vazio no
// componente real), então o preview mostra o campo vazio/fechado — suficiente
// pra avaliar estilo do input e do dropdown de resultados (ver conventions.md).
export function Default() {
  return (
    <div style={{ maxWidth: 340, padding: 16 }}>
      <GlobalSearch />
    </div>
  );
}
