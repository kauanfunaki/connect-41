"""PDF de extrato inventado e o que o pdfplumber lê dele (Fase 4, 10/11/2026).

Gera, com o PyMuPDF, um extrato fictício com o que costuma mudar a posição dos caracteres: fonte
padrão e de outro tamanho, espaçamento de caractere e de palavra (Tc/Tw), escala horizontal (Tz),
texto girado, matriz de texto, `q`/`Q`, formulário (Form XObject) e duas páginas, uma delas girada.
Grava o PDF e o texto e as palavras do pdfplumber, para o teste de `src/lib/contabil-core/pdf`.

Uso (com pymupdf e pdfplumber):
    python -I scripts/contabil-core/gabarito_pdf_ficticio.py <pasta de saída>
"""
import json
import sys
from pathlib import Path

import pdfplumber
import pymupdf

pasta = Path(sys.argv[1])
pasta.mkdir(parents=True, exist_ok=True)
arquivo = pasta / "extrato-ficticio.pdf"

doc = pymupdf.open()
p = doc.new_page(width=595, height=842)
p.insert_text((40, 50), "BANCO FICTICIO S.A.   Agência: 0001   Conta: 12345-6", fontname="helv", fontsize=10)
p.insert_text((40, 66), "Período: 01/01/2026 a 31/01/2026", fontname="helv", fontsize=9)
p.insert_text((40, 90), "Data       Histórico                     Valor        Saldo", fontname="hebo", fontsize=8)
linhas = [
    ("02/01/2026", "PIX RECEBIDO EMPRESA ALFA", "1.500,00", "1.500,00"),
    ("03/01/2026", "TARIFA PACOTE SERVIÇOS", "-39,90", "1.460,10"),
    ("05/01/2026", "TED ENVIADA FORNECEDOR BETA", "-700,00", "760,10"),
]
for i, (d, h, v, s) in enumerate(linhas):
    y = 106 + i * 13
    p.insert_text((40, y), d, fontname="helv", fontsize=8)
    p.insert_text((100, y), h, fontname="helv", fontsize=8)
    p.insert_text((330 - pymupdf.get_text_length(v, "helv", 8), y), v, fontname="helv", fontsize=8)
    p.insert_text((420 - pymupdf.get_text_length(s, "helv", 8), y), s, fontname="helv", fontsize=8)
p.insert_text((560, 400), "documento fictício", fontname="helv", fontsize=7, rotate=90)
p.insert_text((40, 200), "Courier 10,00", fontname="cour", fontsize=11)
# Operadores de texto à mão: Tc, Tw, Tz, TJ com ajuste, T*, ', Tm e q/Q.
xref = p.get_contents()[0]
extra = (
    b"q BT /helv 9 Tf 1 0 0 1 40 600 Tm 0.5 Tc 2 Tw (ESPACADO E LARGO) Tj ET Q\n"
    b"q BT /helv 9 Tf 120 Tz 1 0 0 1 40 585 Tm (ESCALA 120) Tj ET Q\n"
    b"q BT /helv 9 Tf 1 0 0 1 40 570 Tm [(AJUS) -300 (TADO) 120 (JUNTO)] TJ ET Q\n"
    b"q BT /helv 9 Tf 11 TL 1 0 0 1 40 555 Tm (PRIMEIRA) Tj T* (SEGUNDA) Tj (TERCEIRA) ' ET Q\n"
    b"q 1 0 0 1 20 -10 cm BT /helv 9 Tf 1 0 0 1 40 520 Tm 3 Ts (DESLOCADO) Tj ET Q\n"
)
fontes = p.get_fonts()
nome_helv = next(f[4] for f in fontes if "Helvetica" in f[3] and "Bold" not in f[3])
doc.update_stream(xref, doc.xref_stream(xref) + extra.replace(b"/helv", ("/" + nome_helv).encode()))
# Formulário: o mesmo texto desenhado dentro de um Form XObject com matriz própria.
form = pymupdf.open()
fp = form.new_page(width=200, height=60)
fp.insert_text((10, 30), "DENTRO DO FORMULARIO 99,99", fontname="helv", fontsize=8)
p.show_pdf_page(pymupdf.Rect(40, 640, 240, 700), form, 0)
# Segunda página, girada.
p2 = doc.new_page(width=595, height=842)
p2.insert_text((40, 60), "Saldo final 760,10", fontname="helv", fontsize=9)
p2.set_rotation(90)
doc.save(arquivo, garbage=3, deflate=True)

saida = []
with pdfplumber.open(arquivo) as pdf:
    for page in pdf.pages:
        saida.append({
            "texto": page.extract_text(),
            "palavras": [{k: w[k] for k in ("text", "x0", "x1", "top", "bottom", "upright")} for w in page.extract_words()],
        })
(pasta / "extrato-ficticio.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
print(arquivo, arquivo.stat().st_size, "bytes")
