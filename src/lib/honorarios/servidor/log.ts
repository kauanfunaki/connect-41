// O logger do Aditiva Pronto (winston) vira o console do servidor do Connect,
// que é o que o EasyPanel guarda.

export const logger = {
  info: (msg: string) => console.info(`[honorarios] ${msg}`),
  warn: (msg: string) => console.warn(`[honorarios] ${msg}`),
  error: (msg: string, err?: unknown) => console.error(`[honorarios] ${msg}`, err ?? ""),
};
