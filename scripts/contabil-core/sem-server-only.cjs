// Preload para rodar os ensaios do Contábil Core fora do Next (09/11/2026).
//
// Os serviços começam com `import "server-only"`, que o Next resolve sozinho e que não existe como
// pacote fora dele. Aqui o nome passa a apontar para este próprio arquivo, que não faz nada.
//   npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-servicos.ts

const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido === "server-only") return __filename;
  return original.call(this, pedido, ...resto);
};
