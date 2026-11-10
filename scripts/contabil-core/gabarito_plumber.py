"""Gabarito do agrupamento do pdfplumber (Fase 4, 10/11/2026).

Gera páginas de caracteres inventados (linhas com desnível, colunas, espaços, ligaduras, texto
girado, caracteres fora de ordem) e grava o que o pdfplumber 0.11 faz com elas: `extract_words`
(com e sem `return_chars`) e o texto da página (`Page.extract_text`, que é o `chars_to_textmap` com
`presorted=True`). O porte é `src/lib/contabil-core/pdf/plumber.ts`.

Uso (com pdfplumber instalado):
    python -I scripts/contabil-core/gabarito_plumber.py <saida.json>
"""
import json
import random
import sys

from pdfplumber.utils.text import chars_to_textmap, extract_words

aleatorio = random.Random(41)


def char(text, x0, top, largura=5.0, altura=8.0, upright=True):
    return {
        "text": text, "x0": x0, "x1": x0 + largura, "top": top, "bottom": top + altura,
        "doctop": top, "upright": upright, "size": altura, "height": altura, "width": largura,
        "fontname": "F1",
    }


def linha(texto, x0, top, passo=5.0, jitter=0.0):
    out, x = [], x0
    for c in texto:
        out.append(char(c, round(x, 3), round(top + aleatorio.uniform(-jitter, jitter), 3), largura=passo - 0.2))
        x += passo
    return out


paginas = []
# 1. Extrato simples: data, histórico, valor e saldo em colunas, com espaços reais.
p = []
for i, (data, hist, valor, saldo) in enumerate([
    ("01/02/2026", "PIX RECEBIDO ALFA", "1.234,56", "10.000,00"),
    ("01/02/2026", "TARIFA", "-9,90", "9.990,10"),
    ("02/02/2026", "TED ENVIADA BETA LTDA", "-500,00", "9.490,10"),
]):
    top = 100 + i * 14
    p += linha(data, 30, top) + linha(hist, 100, top, jitter=0.4) + linha(valor, 300, top) + linha(saldo, 380, top)
paginas.append(p)
# 2. Fora de ordem, desnível perto da tolerância, ligadura e espaço em branco não ASCII.
p = linha("ﬁnal ﬂuxo", 40, 50) + linha("LINHA A", 40, 70) + linha("COLADA", 40, 72.9) + linha("SEPARADA", 40, 76.2)
p += [char(" ", 200, 70), char("X", 205, 70), char("Y", 209.5, 70), char("Z", 213.0, 70.5)]
aleatorio.shuffle(p)
paginas.append(p)
# 3. Texto girado no meio do texto em pé (grupos consecutivos por `upright`).
p = linha("CABECALHO", 30, 20)
p += [char(c, 500, 100 + k * 6, upright=False) for k, c in enumerate("VERTICAL")]
p += linha("RODAPE 10,00", 30, 700)
paginas.append(p)
# 4. Lacuna exatamente na tolerância (3 pontos) e um pouco acima.
p = [char("A", 10, 10), char("B", 18, 10), char("C", 26.0001, 10), char("D", 31.0001 + 3.0, 10)]
p += [char("E", 10, 30), char("F", 9, 30)]  # x0 menor que o anterior: começa palavra nova
paginas.append(p)
# 5. Aleatória grande.
p = []
for i in range(400):
    p.append(char(aleatorio.choice("ABCDEFGHIJ0123456789 ,.-/"), round(aleatorio.uniform(0, 500), 2), round(aleatorio.uniform(0, 300), 2), largura=round(aleatorio.uniform(2, 7), 2)))
paginas.append(p)
paginas.append([])

saida = []
for chars in paginas:
    texto = chars_to_textmap(chars, presorted=True, layout_bbox=(0, 0, 600, 800), layout_width=600, layout_height=800).as_string if chars else ""
    saida.append({
        "chars": chars,
        "texto": texto,
        "palavras": extract_words(chars),
        "palavras_com_chars": [{**w, "chars": [c["text"] for c in w["chars"]]} for w in extract_words(chars, return_chars=True)],
    })
with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    json.dump(saida, f, ensure_ascii=False)
print(len(saida), "páginas")
