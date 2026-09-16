// "AAAA-MM-DD" para "dd/mm/aaaa" por texto. A chave já é o dia civil de São
// Paulo; passar por `Date` para formatar reintroduziria o fuso do navegador.
export function dataCurta(key: string): string {
  const [a, m, d] = key.split("-");
  return `${d}/${m}/${a}`;
}
