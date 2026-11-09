"""Tabelas Unicode do Python usadas pelo porte do Contábil Core (09/11/2026).

O JavaScript não expõe a classe de combinação (`unicodedata.combining`) nem o valor de um dígito
Unicode (`unicodedata.decimal`). O original usa os dois: o primeiro para tirar acento
(`core/texto.py`), o segundo porque `\\d` e `Decimal()` do Python aceitam qualquer dígito Unicode.
Este script grava as duas tabelas, em faixas, a partir do `unicodedata` do Python que o roda.

Uso:
    python -I scripts/contabil-core/gerar-tabelas-unicode.py src/lib/contabil-core/motor/unicodePython.ts
"""
import sys
import unicodedata
from pathlib import Path


def faixas(pontos):
    out = []
    for p in pontos:
        if out and out[-1][1] == p - 1:
            out[-1][1] = p
        else:
            out.append([p, p])
    return out


combinantes = faixas(c for c in range(0x110000) if unicodedata.combining(chr(c)))
zeros = [c for c in range(0x110000) if unicodedata.decimal(chr(c), None) == 0]


def lista(itens, por_linha=8):
    linhas = []
    for i in range(0, len(itens), por_linha):
        linhas.append("  " + " ".join(itens[i : i + por_linha]))
    return "\n".join(linhas)


ts = f"""// Gerado por scripts/contabil-core/gerar-tabelas-unicode.py (Python {sys.version.split()[0]}, Unicode {unicodedata.unidata_version}).
// Não editar à mão.

/** Faixas [início, fim] dos caracteres com `unicodedata.combining(c) != 0`. */
export const COMBINANTES: readonly (readonly [number, number])[] = [
{lista([f"[0x{a:x}, 0x{b:x}]," for a, b in combinantes])}
];

/** Ponto de código do dígito zero de cada bloco de dígitos decimais (`unicodedata.decimal(c) == 0`). */
export const ZEROS: readonly number[] = [
{lista([f"0x{z:x}," for z in zeros], 10)}
];
"""
Path(sys.argv[1]).write_text(ts, encoding="utf-8")
print(f"{len(combinantes)} faixas de combinantes, {len(zeros)} blocos de dígitos")
