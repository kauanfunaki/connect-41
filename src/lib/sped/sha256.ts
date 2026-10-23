// SHA-256 incremental (FIPS 180-4), em TypeScript puro (23/10/2026).
//
// Por que existe: o envio em partes (API-CONNECT §14.4) manda no `concluir` o
// SHA-256 do arquivo inteiro — até 500 MiB —, calculado no navegador enquanto
// as partes saem. O Web Crypto (`crypto.subtle.digest`) não é incremental: só
// digere um buffer inteiro, e pôr 500 MiB na memória da aba não serve. Nenhuma
// dependência do `package.json` faz isto (`fast-sha256` só aparece como
// dependência transitiva, e não se importa o que não se declara); o algoritmo
// é curto e os testes o conferem contra o `crypto` do Node, bloco a bloco.
//
// O SHA-256 de cada parte (`X-Parte-SHA256`) continua no Web Crypto: 8 MiB
// cabem na memória.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export class Sha256 {
  private h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  private w = new Uint32Array(64);
  private bloco = new Uint8Array(64);
  private noBloco = 0;
  private total = 0;
  private fechado = false;

  /** Acrescenta bytes; pode ser chamado quantas vezes for, com pedaços de qualquer tamanho. */
  update(dados: Uint8Array): this {
    if (this.fechado) throw new Error("SHA-256 já finalizado");
    this.total += dados.length;
    let i = 0;
    if (this.noBloco > 0) {
      const falta = Math.min(64 - this.noBloco, dados.length);
      this.bloco.set(dados.subarray(0, falta), this.noBloco);
      this.noBloco += falta;
      i = falta;
      if (this.noBloco === 64) { this.comprimir(this.bloco, 0); this.noBloco = 0; }
    }
    for (; i + 64 <= dados.length; i += 64) this.comprimir(dados, i);
    if (i < dados.length) { this.bloco.set(dados.subarray(i), 0); this.noBloco = dados.length - i; }
    return this;
  }

  /** O resumo em hexadecimal minúsculo (64 caracteres). Depois disso o objeto não aceita mais bytes. */
  hex(): string {
    if (!this.fechado) {
      this.fechado = true;
      const bits = this.total * 8;
      const fim = new Uint8Array(this.noBloco < 56 ? 64 : 128);
      fim.set(this.bloco.subarray(0, this.noBloco));
      fim[this.noBloco] = 0x80;
      const v = new DataView(fim.buffer);
      // Comprimento em bits, big-endian, em 64 bits (arquivos bem abaixo de 2^53).
      v.setUint32(fim.length - 8, Math.floor(bits / 0x100000000));
      v.setUint32(fim.length - 4, bits >>> 0);
      for (let i = 0; i < fim.length; i += 64) this.comprimir(fim, i);
    }
    return Array.from(this.h, (x) => x.toString(16).padStart(8, "0")).join("");
  }

  private comprimir(d: Uint8Array, o: number) {
    const w = this.w;
    for (let t = 0; t < 16; t++) w[t] = (d[o + 4 * t] << 24) | (d[o + 4 * t + 1] << 16) | (d[o + 4 * t + 2] << 8) | d[o + 4 * t + 3];
    for (let t = 16; t < 64; t++) {
      const a = w[t - 15], b = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    const h = this.h;
    let a = h[0], b = h[1], c = h[2], e = h[4], f = h[5], g = h[6], x = h[7], dd = h[3];
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (x + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      x = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += dd; h[4] += e; h[5] += f; h[6] += g; h[7] += x;
  }
}

/** Atalho para um buffer inteiro (testes e partes pequenas). */
export const sha256Hex = (dados: Uint8Array) => new Sha256().update(dados).hex();
