// Download de um texto gerado na tela (Markdown do relatório, CSV da transição),
// no padrão do Connect (components/fiscal/previa/SpedGerados.tsx). Só no navegador.

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/markdown;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV com BOM (para o Excel ler os acentos), separador ";" e aspas escapadas. */
export function baixarCsv(nome: string, linhas: (string | number)[][]): void {
  const texto = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(";")).join("\n");
  baixarArquivo(nome, "﻿" + texto, "text/csv;charset=utf-8");
}
