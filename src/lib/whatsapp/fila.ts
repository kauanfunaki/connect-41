// Uma mensagem por vez em cada conversa.
//
// Cada mensagem chega num webhook próprio, e até 30/09 cada uma era atendida
// na hora, em paralelo. Quem mandava duas seguidas ("kkkk", "kkkkk") recebia
// duas apresentações: as duas viam a conversa sem nenhuma resposta ainda.
//
// A fila é em memória porque o Connect roda num processo só (um container no
// EasyPanel). Com mais de uma instância, ela precisaria ir para o banco — e é
// só aqui que isso muda.

const filas = new Map<string, Promise<unknown>>();

/**
 * Roda `trabalho` depois de tudo o que já está na fila desta `chave`. Um
 * trabalho que falha não trava os seguintes.
 */
export function naFila<T>(chave: string, trabalho: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  const atual = anterior.then(trabalho, trabalho);
  const fim = atual.then(
    () => undefined,
    () => undefined
  );
  filas.set(chave, fim);
  // Sem trabalho pendurado, a chave sai do mapa — senão ele cresceria com cada
  // número que já escreveu.
  void fim.then(() => {
    if (filas.get(chave) === fim) filas.delete(chave);
  });
  return atual;
}

/** Quantas conversas têm trabalho na fila agora. Só para teste. */
export function conversasNaFila(): number {
  return filas.size;
}

export function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
