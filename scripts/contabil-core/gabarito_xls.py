"""Gabarito do leitor de .xls (Fase 4b, 10/11/2026).

Gera planilhas .xls inventadas e grava o que o xlrd 2.0 lê delas, para o teste do porte em
TypeScript (`src/lib/contabil-core/planilha/xls.ts`) comparar célula a célula:

- planilhas do xlwt (tipos de célula, datas com formatos embutidos e personalizados, 1904, SST
  longo com CONTINUE, acentos, várias folhas, células esparsas, fórmulas, booleanos e erros);
- BIFF8 montado à mão, para o que o xlwt não escreve: SST com string que troca de comprimida
  para UTF-16 no CONTINUE, rich text e fonético, LABEL, RSTRING, MULRK, RK nas quatro formas,
  FORMULA com STRING (e CONTINUE, SHRFMLA), DIMENSIONS fora do lugar, gráfico embutido, HLINK,
  comentário (OBJ/TXO/NOTE), formatos personalizados que o heurístico do xlrd julga;
- BIFF5 (stream "Book", cp1252), dentro do OLE2 e solto;
- OLE2 escrito aqui: mini-stream, setores fora de ordem, setor de 128 bytes, DIFAT estendido;
- arquivos inválidos (HTML, zip/xlsx, truncados, corrompidos) com a exceção do xlrd;
- `xldate_as_tuple` e `is_date_format_string` com valores variados.

Tudo é inventado: nenhum dado real vai para o git.

Uso (com xlrd, xlwt e openpyxl instalados):
    python -I scripts/contabil-core/gabarito_xls.py src/lib/contabil-core/planilha/gabarito
"""
import datetime
import io
import json
import multiprocessing
import os
import random
import struct
import sys
import types

import xlrd
import xlwt

aleatorio = random.Random(41)


# ─── Como o xlrd lê ──────────────────────────────────────────────────────────

def valor_json(v):
    if isinstance(v, float):
        return {"$f": repr(v)}
    return v


def nome_excecao(e):
    nome = type(e).__name__
    return "struct.error" if nome == "error" else nome


def ler_xlrd(conteudo):
    """O que o original faz: open_workbook, todas as folhas, ws.row(i)."""
    try:
        wb = xlrd.open_workbook(file_contents=conteudo)
        folhas = []
        for ws in wb.sheets():
            linhas = [[[c.ctype, valor_json(c.value)] for c in ws.row(i)] for i in range(ws.nrows)]
            folhas.append({"nome": ws.name, "nrows": ws.nrows, "ncols": ws.ncols, "linhas": linhas})
        return {"datemode": wb.datemode, "folhas": folhas}
    except Exception as e:  # noqa: BLE001 - o gabarito guarda a exceção que o xlrd lançar
        tb = e.__traceback__
        arquivos = []
        while tb is not None:
            arquivos.append(os.path.basename(tb.tb_frame.f_code.co_filename))
            tb = tb.tb_next
        return {"erro": {"tipo": nome_excecao(e), "mensagem": str(e)}, "_onde": arquivos}


# ─── BIFF à mão ──────────────────────────────────────────────────────────────

def reg(codigo, dados=b""):
    return struct.pack("<HH", codigo, len(dados)) + dados


def bof8(tipo):
    return reg(0x0809, struct.pack("<HHHHII", 0x0600, tipo, 0x0DBB, 0x07CC, 0x41, 0x06))


def bof5(tipo):
    return reg(0x0809, struct.pack("<HHHH", 0x0500, tipo, 0x1234, 1996))


EOF = reg(0x000A)


def xf8(formato, estilo=False):
    tipo_par = 0xFFF5 if estilo else 0x0001
    return reg(0x00E0, struct.pack("<HHHBBBBIiH", 0, formato, tipo_par, 0x20, 0, 0, 0, 0, 0, 0x20C0))


def xf5(formato, estilo=False):
    tipo_par = 0xFFF5 if estilo else 0x0001
    return reg(0x00E0, struct.pack("<HHHBBIi", 0, formato, tipo_par, 0x20, 0, 0, 0))


def uni8(texto, lenlen=2):
    """String BIFF8: tamanho, opções e caracteres (comprimida se couber em latin-1)."""
    try:
        bruto = texto.encode("latin-1")
        opcoes = 0
    except UnicodeEncodeError:
        bruto = texto.encode("utf-16-le")
        opcoes = 1
    n = len(bruto) // (2 if opcoes else 1)
    return struct.pack("<B" if lenlen == 1 else "<H", n) + bytes([opcoes]) + bruto


def formato8(chave, texto):
    return reg(0x041E, struct.pack("<H", chave) + uni8(texto))


def boundsheet8(offset, nome, tipo=0):
    return struct.pack("<iBB", offset, 0, tipo) + uni8(nome, lenlen=1)


def montar_livro(globais_antes, folhas, globais_depois=b"", bof=bof8, boundsheet=boundsheet8):
    """Globais + BOUNDSHEETs com os offsets certos + folhas. `folhas`: (nome, tipo, corpo)."""
    def globais(offsets):
        corpo = bof(0x0005) + globais_antes
        for (nome, tipo, _), off in zip(folhas, offsets):
            corpo += reg(0x0085, boundsheet(off, nome, tipo))
        return corpo + globais_depois + EOF

    tam = len(globais([0] * len(folhas)))
    offsets, pos = [], tam
    for _, _, corpo in folhas:
        offsets.append(pos)
        pos += len(corpo)
    return globais(offsets) + b"".join(c for _, _, c in folhas)


def folha8(*registros, dim=(0, 0, 0, 0)):
    r1, r2, c1, c2 = dim
    return bof8(0x0010) + reg(0x0200, struct.pack("<IIHHH", r1, r2, c1, c2, 0)) + b"".join(registros) + EOF


def numero(r, c, xf, v):
    return reg(0x0203, struct.pack("<HHHd", r, c, xf, v))


def rk(r, c, xf, bruto):
    return reg(0x027E, struct.pack("<HHHI", r, c, xf, bruto & 0xFFFFFFFF))


def labelsst(r, c, xf, i):
    return reg(0x00FD, struct.pack("<HHHi", r, c, xf, i))


def label8(r, c, xf, texto):
    return reg(0x0204, struct.pack("<HHH", r, c, xf) + uni8(texto))


def boolerr(r, c, xf, v, eh_erro):
    return reg(0x0205, struct.pack("<HHHBB", r, c, xf, v, eh_erro))


def formula(r, c, xf, resultado8):
    # resultado (8 bytes), opções, "chn" e uma fórmula mínima (=1: tInt 1)
    return reg(0x0006, struct.pack("<HHH", r, c, xf) + resultado8 + struct.pack("<HI", 0, 0) + b"\x03\x00\x1e\x01\x00")


def string8(texto):
    return reg(0x0207, uni8(texto))


GLOBAIS8_PADRAO = (
    reg(0x0042, struct.pack("<H", 1200))
    + b"".join(xf8(0, estilo=True) for _ in range(15))
    + xf8(0)
)


def xfs8(*formatos):
    """16 XFs padrão (0-15) e um XF por formato pedido, a partir do 16."""
    return b"".join(xf8(0, estilo=True) for _ in range(15)) + xf8(0) + b"".join(xf8(f) for f in formatos)


def sst(unicas, *blocos):
    """SST com o corpo já partido: o primeiro bloco vai no SST, os outros em CONTINUE."""
    primeiro = struct.pack("<ii", unicas, unicas) + blocos[0]
    return reg(0x00FC, primeiro) + b"".join(reg(0x003C, b) for b in blocos[1:])


def rk_int(i):
    return (i << 2) | 2


def rk_int100(i):
    return (i << 2) | 3


def rk_float(v, x100=False):
    alto = struct.unpack("<Q", struct.pack("<d", v))[0] >> 32
    return (alto & 0xFFFFFFFC) | (1 if x100 else 0)


# ─── OLE2 à mão ──────────────────────────────────────────────────────────────

def ole(streams, setor=512, corte=4096, fragmentar=False, difat_estendido=False, sat_extra=0):
    """Arquivo composto como o xlrd espera (dados a partir do byte 512, setor de `setor` bytes)."""
    nent = setor // 4
    setores = {}
    fat = {}
    proximo = [0]

    def alocar(n, embaralhar=False):
        ids = list(range(proximo[0], proximo[0] + n))
        proximo[0] += n
        if embaralhar and n > 2:
            # Pares trocados: a cadeia não fica contígua.
            for k in range(0, n - 1, 2):
                ids[k], ids[k + 1] = ids[k + 1], ids[k]
        return ids

    def gravar(dados, embaralhar=False):
        if not dados:
            return -2
        n = (len(dados) + setor - 1) // setor
        ids = alocar(n, embaralhar)
        for k, sid in enumerate(ids):
            setores[sid] = dados[k * setor:(k + 1) * setor].ljust(setor, b"\0")
            fat[sid] = ids[k + 1] if k + 1 < n else -2
        return ids[0]

    mini = b""
    ssat = []
    entradas = []
    for nome, dados in streams:
        if len(dados) < corte:
            inicio = len(mini) // 64 if dados else -2
            n = (len(dados) + 63) // 64
            for k in range(n):
                ssat.append(inicio + k + 1 if k + 1 < n else -2)
            mini += dados.ljust(n * 64, b"\0")
            entradas.append((nome, inicio, len(dados)))
        else:
            entradas.append((nome, gravar(dados, fragmentar), len(dados)))
    raiz_inicio = gravar(mini) if mini else -2
    ssat_bytes = b"".join(struct.pack("<i", x) for x in ssat)
    if ssat_bytes:
        ssat_bytes = ssat_bytes.ljust(((len(ssat_bytes) + setor - 1) // setor) * setor, b"\xff")
    ssat_inicio = gravar(ssat_bytes) if ssat_bytes else -2
    ssat_n = len(ssat_bytes) // setor

    def entrada(nome, tipo, esq, dir_, filho, inicio, tamanho):
        bruto = (nome + "\0").encode("utf-16-le") if nome else b""
        return (bruto.ljust(64, b"\0") + struct.pack("<HBBiii", len(bruto), tipo, 1, esq, dir_, filho)
                + b"\0" * 36 + struct.pack("<iI", inicio, tamanho) + b"\0" * 4)

    ents = [entrada("Root Entry", 5, -1, -1, 1 if entradas else -1, raiz_inicio, len(mini))]
    for k, (nome, inicio, tamanho) in enumerate(entradas):
        ents.append(entrada(nome, 2, -1, k + 2 if k + 1 < len(entradas) else -1, -1, inicio, tamanho))
    diretorio = b"".join(ents)
    por_setor = max(1, setor // 128)
    while len(diretorio) % (128 * por_setor):
        diretorio += entrada("", 0, -1, -1, -1, -1, 0)
    dir_inicio = gravar(diretorio)

    # FAT (e DIFAT) cobrindo tudo, inclusive os próprios setores da FAT.
    n_fat = 1
    while True:
        n_difat = 0
        if difat_estendido:
            n_difat = 1 + max(0, (n_fat + sat_extra - 1 - 1) // (nent - 1))
        total = proximo[0] + n_fat + sat_extra + n_difat
        if n_fat * nent >= total:
            break
        n_fat += 1
    fat_ids = alocar(n_fat)
    for sid in fat_ids:
        fat[sid] = -3
    difat_ids = alocar(n_difat) if difat_estendido else []
    for sid in difat_ids:
        fat[sid] = -4
    tabela = [fat.get(k, -1) for k in range(n_fat * nent)]
    for k, sid in enumerate(fat_ids):
        setores[sid] = b"".join(struct.pack("<i", x) for x in tabela[k * nent:(k + 1) * nent])
    if difat_estendido:
        cab_ids = fat_ids[:1] + [-1] * 108
        resto = fat_ids[1:]
        for k, sid in enumerate(difat_ids):
            pedaco = resto[k * (nent - 1):(k + 1) * (nent - 1)]
            prox = difat_ids[k + 1] if k + 1 < len(difat_ids) else -2
            setores[sid] = b"".join(struct.pack("<i", x) for x in (pedaco + [-1] * (nent - 1 - len(pedaco)) + [prox]))
        difat_inicio, difat_n = difat_ids[0], len(difat_ids)
    else:
        cab_ids = fat_ids + [-1] * (109 - len(fat_ids))
        difat_inicio, difat_n = -2, 0
    ssz = setor.bit_length() - 1
    cab = (bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + b"\0" * 16
           + struct.pack("<HHHHH", 0x3E, 3, 0xFFFE, ssz, 6) + b"\0" * 6
           + struct.pack("<iiiiiiiii", 0, n_fat, dir_inicio, 0, corte, ssat_inicio, ssat_n, difat_inicio, difat_n)
           + b"".join(struct.pack("<i", x) for x in cab_ids))
    assert len(cab) == 512, len(cab)
    return cab + b"".join(setores[k] for k in range(proximo[0]))


# ─── Planilhas do xlwt ───────────────────────────────────────────────────────

def salvar_xlwt(wb):
    f = io.BytesIO()
    wb.save(f)
    return f.getvalue()


def xlwt_tipos():
    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("Extrato Março")
    formatos = [
        "DD/MM/YYYY", "dd/mm/yyyy hh:mm:ss", "hh:mm", "[$-416]d-mmm-yy", "yyyy-mm-dd", '"Data:" dd/mm',
        "#,##0.00", "0.00%", '"R$" #,##0.00;[Red]-"R$" #,##0.00', "@", "General", "0.00E+00", "mmm/yy",
        "[h]:mm:ss", "d/m/yy h:mm", "0", "#,##0", "dd\\/mm\\/yyyy", "mm:ss.0", '_-* #,##0.00_-',
    ]
    ws.write(0, 0, "Formato")
    ws.write(0, 1, "Valor")
    data = datetime.datetime(2026, 3, 15, 14, 30, 45)
    for i, f in enumerate(formatos, start=1):
        estilo = xlwt.easyxf(num_format_str=f)
        ws.write(i, 0, f)
        ws.write(i, 1, data, estilo)
        ws.write(i, 2, 45123.5, estilo)
        ws.write(i, 3, -1234.567, estilo)
    n = len(formatos) + 2
    valores = [0, 1, -1, 1.5, 0.1, 1.23, 12345678, 2 ** 29 - 1, 2 ** 29, 2 ** 31, 2 ** 53, 1e20, 1e-5, -0.0,
               123456.789, 3.14159265358979, 1 / 3, 99999999.99, -7, 0.01, 5e-324, 1.7976931348623157e308]
    for i, v in enumerate(valores):
        ws.write(n + i, 0, v)
    n += len(valores) + 1
    ws.write(n, 0, True)
    ws.write(n, 1, False)
    ws.row(n + 1).set_cell_error(0, "#DIV/0!")
    ws.row(n + 1).set_cell_error(1, 0x2A)
    ws.row(n + 1).set_cell_error(2, "#VALUE!")
    ws.row(n + 1).set_cell_error(3, "#REF!")
    ws.write(n + 2, 0, xlwt.Formula("1+2"))
    ws.write(n + 2, 1, xlwt.Formula('"a"&"b"'))
    ws.write(n + 2, 2, xlwt.Formula("A1"))
    ws.write(n + 3, 0, "  espaços nas pontas  ")
    ws.write(n + 3, 1, "acentuação: ção ÃÉÍÕÚ ü ñ")
    ws.write(n + 3, 2, "linha1\nlinha2\ttab")
    ws.write(n + 3, 3, "")
    ws.write(n + 4, 0, "emoji 😀 e 中文 e Ω")
    ws.write(n + 4, 5, "célula afastada")
    # Branco com estilo: o xlrd sem formatting_info ignora (não conta em nrows/ncols).
    ws.write(n + 6, 9, None, xlwt.easyxf("pattern: pattern solid;"))
    return salvar_xlwt(wb)


def xlwt_sst_longo():
    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet("Longo")
    for i in range(200):
        base = f"Histórico {i:04d} " + ("ABCDEFGHIJ" * aleatorio.randint(1, 30))
        if i % 3 == 0:
            base += " Ω€"  # força UTF-16
        if i % 7 == 0:
            base += " 😀"
        ws.write(i, 0, base)
        ws.write(i, 1, i * 1.25)
    ws.write(201, 0, "X" * 9000)
    ws.write(202, 0, "Ç" * 5000 + "Ω" * 100)
    return salvar_xlwt(wb)


def xlwt_varias_folhas(dates_1904=False):
    wb = xlwt.Workbook(encoding="utf-8")
    if dates_1904:
        wb.dates_1904 = True
    a = wb.add_sheet("Clientes")
    a.write(0, 0, "Código")
    a.write(0, 1, "Razão social")
    for i in range(1, 30):
        a.write(i, 0, 1000 + i)
        a.write(i, 1, f"Empresa {chr(64 + (i % 26) + 1)} Ltda")
        a.write(i, 2, datetime.date(2025, 1 + i % 12, 1 + i % 28), xlwt.easyxf(num_format_str="dd/mm/yyyy"))
    wb.add_sheet("Vazia")
    c = wb.add_sheet("Esparsa ü")
    c.write(119, 39, "longe")
    c.write(5, 3, 7.5)
    c.write(0, 45, "coluna 45")
    d = wb.add_sheet("Datas")
    for i, (dt, f) in enumerate([
        (datetime.datetime(1900, 3, 1), "dd/mm/yyyy"),
        (datetime.datetime(1904, 1, 2), "dd/mm/yyyy"),
        (datetime.datetime(2026, 12, 31, 23, 59, 59), "dd/mm/yyyy hh:mm:ss"),
        (datetime.time(12, 0), "hh:mm"),
        (datetime.datetime(9999, 12, 31), "yyyy-mm-dd"),
    ]):
        d.write(i, 0, dt, xlwt.easyxf(num_format_str=f))
    return salvar_xlwt(wb)


# ─── BIFF8 à mão ─────────────────────────────────────────────────────────────

def biff8_sst_especial():
    # Strings do SST, uma por caso:
    # 0: "ABCDEF" começa comprimida e termina em UTF-16 no CONTINUE ("DĒF").
    # 1: rich text (2 runs) comprimida.
    # 2: fonético (10 bytes) comprimida.
    # 3: rich text + fonético em UTF-16.
    # 4: string vazia.
    # 5: rich text cujos runs começam no CONTINUE seguinte.
    # 6: fonético que atravessa o CONTINUE.
    # 7: "fim" depois do fonético atravessado.
    # 8: emoji inteiro (par de surrogates) num bloco.
    b1 = (struct.pack("<HB", 6, 0) + b"ABC")
    b2 = (b"\x01" + "DĒF".encode("utf-16-le")
          + struct.pack("<HBH", 4, 0x08, 2) + b"Rico" + struct.pack("<HHHH", 0, 1, 2, 3)
          + struct.pack("<HBi", 3, 0x04, 10) + b"Fon" + bytes(range(10))
          + struct.pack("<HBHi", 2, 0x0D, 1, 6) + "ÃΩ".encode("utf-16-le") + struct.pack("<HH", 0, 5) + b"\x07" * 6
          + struct.pack("<HB", 0, 0)
          + struct.pack("<HBH", 3, 0x08, 2) + b"RTX")
    b3 = (struct.pack("<HHHH", 0, 1, 1, 2)
          + struct.pack("<HBi", 4, 0x04, 12) + b"Fone" + b"\x09" * 5)
    b4 = (b"\x09" * 7
          + struct.pack("<HB", 3, 0) + b"fim"
          + struct.pack("<HB", 3, 1) + "😀x".encode("utf-16-le"))
    globais = GLOBAIS8_PADRAO + sst(9, b1, b2, b3, b4)
    corpo = folha8(*(labelsst(i, 0, 15, i) for i in range(9)), labelsst(9, 0, 15, -1), labelsst(9, 1, 15, -9))
    return montar_livro(globais, [("SST", 0, corpo)])


def biff8_celulas():
    globais = (reg(0x0042, struct.pack("<H", 1200)) + reg(0x0022, struct.pack("<H", 0))
               + formato8(164, "dd/mm/yyyy") + formato8(165, '#,##0.00 "dias"') + formato8(166, "[h]:mm")
               + xfs8(164, 165, 166, 14, 2) + sst(1, struct.pack("<HB", 5, 0) + b"saldo"))
    regs = [
        rk(0, 0, 15, rk_int(12345)),
        rk(0, 1, 15, rk_int(-5)),
        rk(0, 2, 15, rk_int100(123)),
        rk(0, 3, 15, rk_int100(-1)),
        rk(0, 4, 15, rk_float(0.5)),
        rk(0, 5, 15, rk_float(1234.5, x100=True)),
        rk(0, 6, 16, rk_int(45000)),
        rk(0, 7, 16, rk_int100(4500050)),
        reg(0x00BD, struct.pack("<HH", 1, 2) + b"".join(struct.pack("<HI", xf, v & 0xFFFFFFFF) for xf, v in [
            (15, rk_int(1)), (16, rk_int(44927)), (17, rk_int100(250)), (18, rk_float(0.75)), (19, rk_int(46000))])
            + struct.pack("<H", 6)),
        numero(2, 0, 15, -0.0),
        numero(2, 1, 15, float("nan")),
        numero(2, 2, 15, float("inf")),
        numero(2, 3, 16, 45000.999999),
        numero(2, 4, 20, 0.25),
        label8(3, 0, 15, "texto LABEL"),
        label8(3, 1, 15, "LABEL ünïcødé Ω"),
        label8(3, 2, 15, ""),
        reg(0x00D6, struct.pack("<HHH", 3, 3, 15) + uni8("rico") + struct.pack("<H", 2) + struct.pack("<HHHH", 0, 1, 2, 2)),
        labelsst(3, 4, 15, 0),
        boolerr(4, 0, 15, 1, 0),
        boolerr(4, 1, 15, 0, 0),
        boolerr(4, 2, 15, 0x07, 1),
        boolerr(4, 3, 15, 0x2A, 1),
        boolerr(4, 4, 15, 0x00, 1),
        formula(5, 0, 15, struct.pack("<d", 3.0)),
        formula(5, 1, 16, struct.pack("<d", 45678.25)),
        formula(5, 2, 15, bytes([1, 0, 1, 0, 0, 0, 0xFF, 0xFF])),
        formula(5, 3, 15, bytes([2, 0, 0x2A, 0, 0, 0, 0xFF, 0xFF])),
        formula(5, 4, 15, bytes([3, 0, 0, 0, 0, 0, 0xFF, 0xFF])),
        formula(5, 5, 15, bytes([0, 0, 0, 0, 0, 0, 0xFF, 0xFF])), string8("resultado"),
        formula(5, 6, 15, bytes([0, 0, 0, 0, 0, 0, 0xFF, 0xFF])),
        reg(0x04BC, struct.pack("<HHBBxBH", 5, 5, 6, 6, 1, 0)), string8("após SHRFMLA"),
        formula(5, 7, 15, bytes([0, 0, 0, 0, 0, 0, 0xFF, 0xFF])),
        reg(0x0207, struct.pack("<HB", 8, 0) + b"part"), reg(0x003C, b"\x01" + "ÍÇÃO".encode("utf-16-le")),
        formula(5, 8, 15, bytes([0, 0, 0, 0, 0, 0, 0xFF, 0xFF])), string8(""),
        # Branco e MULBLANK: ignorados sem formatting_info, mesmo longe.
        reg(0x0201, struct.pack("<HHH", 40, 40, 15)),
        reg(0x00BE, struct.pack("<HHHHH", 41, 10, 15, 15, 11)),
        # Gráfico embutido: tudo até o EOF dele é pulado.
        bof8(0x0020), numero(30, 30, 15, 1.0), EOF,
        numero(6, 9, 15, 6.5),
        reg(0x023E, struct.pack("<HHHHxxHH", 0x06B6, 0, 0, 0x40, 0, 0)),
        reg(0x00A0, struct.pack("<HH", 3, 4)),
        reg(0x0225, struct.pack("<HH", 0, 255)),
        reg(0x0055, struct.pack("<H", 8)),
    ]
    corpo = folha8(*regs, dim=(0, 7, 0, 10))
    # Folha de gráfico (BOUNDSHEET tipo 2): wb.sheets() não a inclui.
    grafico = bof8(0x0020) + numero(0, 0, 15, 1.0) + EOF
    # DIMENSIONS depois das células: o xlrd zera nrows/ncols e continua das listas que já tem.
    dims = folha8(numero(5, 5, 15, 1.0), reg(0x0200, struct.pack("<IIHHH", 0, 2, 0, 2, 0)), numero(1, 1, 15, 2.0),
                  numero(7, 2, 15, 3.0), label8(0, 8, 15, "depois"))
    return montar_livro(globais, [("Células", 0, corpo), ("Gráfico", 2, grafico), ("Dims", 0, dims)])


def biff8_formatos():
    """Formatos personalizados julgados pelo heurístico (data ou número), um XF para cada."""
    globais = reg(0x0042, struct.pack("<H", 1200))
    for k, f in enumerate(FORMATOS_TESTE):
        globais += formato8(164 + k, f)
    # Formato embutido redefinido: 14 vira número, 2 vira data.
    globais += formato8(14, "0.00") + formato8(2, "dd/mm/yy")
    globais += xfs8(*([164 + k for k in range(len(FORMATOS_TESTE))] + [14, 2, 22, 45, 49, 300]))
    # FORMAT depois dos XFs: o XF com chave desconhecida já virou 0 (General).
    globais += formato8(300, "dd/mm/yyyy")
    regs = [numero(k, 0, 16 + k, 45000.75) for k in range(len(FORMATOS_TESTE) + 6)]
    return montar_livro(globais, [("Formatos", 0, folha8(*regs))])


def biff8_1904_e_extras():
    globais = (reg(0x0042, struct.pack("<H", 1252)) + reg(0x0022, struct.pack("<H", 1))
               + reg(0x008C, struct.pack("<HH", 55, 55)) + xfs8(14, 22)
               + reg(0x005C, uni8("Usuário") + b" " * 100))
    hlink = (struct.pack("<HHHH", 0, 0, 1, 1) + bytes([0xD0, 0xC9, 0xEA, 0x79, 0xF9, 0xBA, 0xCE, 0x11, 0x8C, 0x82, 0x00,
                                                      0xAA, 0x00, 0x4B, 0xA9, 0x0B])
             + struct.pack("<Ii", 2, 0x17)
             + struct.pack("<I", 5) + "link\0".encode("utf-16-le")
             + bytes([0xE0, 0xC9, 0xEA, 0x79, 0xF9, 0xBA, 0xCE, 0x11, 0x8C, 0x82, 0x00, 0xAA, 0x00, 0x4B, 0xA9, 0x0B])
             + struct.pack("<I", 46) + "http://x.y\0".encode("utf-16-le") + b"\0" * 24)
    obj = struct.pack("<HHHHH", 0x15, 18, 0x19, 7, 0x6011) + b"\0" * 12 + struct.pack("<HH", 0, 0)
    txo = struct.pack("<HH6sHHH", 0x0212, 0, b"\0" * 6, 5, 16, 0) + b"\0" * 4
    regs = [
        numero(0, 0, 16, 0.0), numero(0, 1, 16, 1.0), numero(0, 2, 17, 45000.5), numero(1, 0, 15, 2.5),
        reg(0x01B8, hlink),
        reg(0x0800, struct.pack("<5H", 0x0800, 0, 0, 1, 1) + "dica\0".encode("utf-16-le")),
        reg(0x005D, obj), reg(0x01B6, txo), reg(0x003C, b"\x00" + b"nota!"), reg(0x003C, b"\0" * 16),
        reg(0x001C, struct.pack("<4H", 1, 0, 0, 7) + uni8("Autor") + b"\0"),
        reg(0x015F, struct.pack("<H", 1) + struct.pack("<HHHH", 0, 0, 0, 0) + struct.pack("<H", 0)),
        reg(0x0221, struct.pack("<HHBBBxxxxxH", 0, 0, 0, 0, 0, 0)),
        reg(0x0041, struct.pack("<HHHHB", 0, 1, 0, 1, 3)),
    ]
    return montar_livro(globais, [("Mac", 0, folha8(*regs))])


FORMATOS_TESTE = [
    "dd/mm/yyyy", "d-mmm-yy", "hh:mm:ss", "[h]:mm", "mm:ss.0", "#,##0.00", "0%", '"R$" #,##0.00',
    "[$R$-416] #,##0.00", "[Red]0.00", 'yyyy"年"m"月"d"日"', "\\d\\a\\y 0", "_(* #,##0_)", "General", "@",
    "0.00E+00", ";;;", '"texto"', "mmm", "dd/mm/yyyy;@", "[$-F800]dddd, mmmm dd, yyyy", '0.0 "h"', "ss",
    "yyyy-mm-dd hh:mm:ss 0", '#" dias"', "[$-416]mmmm\\ yyyy", "h:mm AM/PM", "[Blue]#,##0;[Red]-#,##0",
    "dd/mm/yy hh:mm;@", "# ?/?", "0.0", "y", "Ymd", "*-dd", "_d0", "\"d\"0", "[mm]:ss", "m/d/yy",
    "#,##0.00 \"m²\"", "mm/dd ##", "dd ## ##", "GENERAL", "general", "00000", "[$€-2] #,##0.00",
]


def biff5_livro(com_ole=True):
    """BIFF5 (Excel 95): strings de 8 bits em cp1252, sem SST."""
    def bs5(offset, nome, tipo=0):
        b = nome.encode("cp1252")
        return struct.pack("<iBBB", offset, 0, tipo, len(b)) + b

    def label5(r, c, xf, texto):
        b = texto.encode("cp1252")
        return reg(0x0204, struct.pack("<HHHH", r, c, xf, len(b)) + b)

    def formato5(chave, texto):
        b = texto.encode("cp1252")
        return reg(0x041E, struct.pack("<HB", chave, len(b)) + b)

    globais = (reg(0x0042, struct.pack("<H", 1252)) + formato5(164, "dd/mm/yyyy")
               + b"".join(xf5(0, estilo=True) for _ in range(15)) + xf5(0) + xf5(164) + xf5(14))
    corpo = (bof5(0x0010) + reg(0x0200, struct.pack("<HHHHH", 0, 3, 0, 3, 0))
             + label5(0, 0, 15, "Descrição € ç")
             + numero(0, 1, 16, 45001.0) + rk(1, 0, 17, rk_int(45002)) + rk(1, 1, 15, rk_int100(1999))
             + formula(2, 0, 15, bytes([0, 0, 0, 0, 0, 0, 0xFF, 0xFF]))
             + reg(0x0207, struct.pack("<H", 5) + "Ação!".encode("cp1252"))
             + EOF)
    stream = montar_livro(globais, [("Planilha Ç", 0, corpo)], bof=bof5, boundsheet=bs5)
    return ole([("Book", stream.ljust(4096, b"\0"))]) if com_ole else stream


# ─── Inválidos e corrompidos ─────────────────────────────────────────────────

def xlsx_bytes():
    import openpyxl
    wb = openpyxl.Workbook()
    wb.active["A1"] = "x"
    f = io.BytesIO()
    wb.save(f)
    return f.getvalue()


def zip_bytes(nomes):
    import zipfile
    f = io.BytesIO()
    with zipfile.ZipFile(f, "w") as z:
        for n in nomes:
            z.writestr(n, "conteudo")
    return f.getvalue()


def com_filepass():
    globais = GLOBAIS8_PADRAO + reg(0x002F, struct.pack("<HHH", 0, 0x1234, 0x5678))
    return montar_livro(globais, [("A", 0, folha8(numero(0, 0, 15, 1.0)))])


def sem_xf():
    globais = reg(0x0042, struct.pack("<H", 1200))
    return montar_livro(globais, [("A", 0, folha8(numero(0, 0, 0, 1.0), numero(1, 0, 3, 2.0)))])


# ─── Fuzz (em processo separado: algum caso pode travar o xlrd) ──────────────

def _ler_isolado(conteudo):
    return ler_xlrd(conteudo)


def ler_com_limite(pool_ref, conteudo, segundos=10):
    try:
        return pool_ref[0].apply_async(_ler_isolado, (conteudo,)).get(timeout=segundos)
    except multiprocessing.TimeoutError:
        pool_ref[0].terminate()
        pool_ref[0] = multiprocessing.Pool(1)
        return None


def celulas(resultado):
    return sum(f["nrows"] * f["ncols"] for f in resultado.get("folhas", []))


def aceitavel(resultado):
    """Fora do gabarito: travou, ou caiu na avaliação de fórmula de NAME (não portada)."""
    if resultado is None:
        return False
    if resultado.get("erro", {}).get("tipo") == "RecursionError":
        return False
    return "formula.py" not in resultado.get("_onde", [])


# ─── Principal ───────────────────────────────────────────────────────────────

def main():
    saida = sys.argv[1]
    os.makedirs(saida, exist_ok=True)
    casos = {}

    def caso(nome, conteudo):
        casos[nome] = conteudo

    tipos = xlwt_tipos()
    caso("xls-xlwt-tipos", tipos)
    caso("xls-xlwt-sst-longo", xlwt_sst_longo())
    caso("xls-xlwt-folhas", xlwt_varias_folhas())
    caso("xls-xlwt-1904", xlwt_varias_folhas(dates_1904=True))
    sst8 = biff8_sst_especial()
    cel8 = biff8_celulas()
    caso("xls-biff8-sst", ole([("Workbook", sst8.ljust(4096, b"\0"))]))
    caso("xls-biff8-celulas", ole([("Workbook", cel8)], fragmentar=True))
    caso("xls-biff8-formatos", ole([("Workbook", biff8_formatos())]))
    caso("xls-biff8-1904-extras", ole([("Workbook", biff8_1904_e_extras())]))
    caso("xls-biff8-solto", cel8)
    caso("xls-biff5-ole", biff5_livro())
    caso("xls-biff5-solto", biff5_livro(com_ole=False))
    caso("xls-ole-mini", ole([("\x05SummaryInformation", b"\0" * 200), ("Workbook", sst8)]))
    caso("xls-ole-setor128", ole([("Workbook", cel8.ljust(5000, b"\0"))], setor=128, corte=64))
    stream_tipos = xlrd.compdoc.CompDoc(tipos, logfile=io.StringIO()).get_named_stream("Workbook")
    caso("xls-ole-difat", ole([("Workbook", stream_tipos)], setor=128, difat_estendido=True))
    caso("xls-ole-book-e-workbook", ole([("Book", biff5_livro(False).ljust(4096, b"\0")), ("Workbook", sst8.ljust(4096, b"\0"))]))
    caso("xls-ole-sem-workbook", ole([("Outro", b"x" * 5000)]))
    caso("xls-ole-workbook-vazio", ole([("Workbook", b""), ("Book", sst8)]))
    caso("xls-html", "<html><body><table><tr><td>Relatório</td></tr></table></body></html>".encode("utf-8"))
    caso("xls-texto", b"nao e planilha")
    caso("xls-xlsx", xlsx_bytes())
    caso("xls-zip-desconhecido", zip_bytes(["a.txt"]))
    caso("xls-zip-ods", zip_bytes(["content.xml", "mimetype"]))
    caso("xls-zip-xlsb", zip_bytes(["xl/workbook.bin"]))
    caso("xls-zip-quebrado", b"PK\x03\x04" + b"\0" * 40)
    caso("xls-vazio", b"")
    caso("xls-filepass", com_filepass())
    caso("xls-sem-xf", sem_xf())
    caso("xls-ole-truncado", ole([("Workbook", sst8.ljust(4096, b"\0"))])[:1500])
    caso("xls-biff-truncado", cel8[: len(cel8) // 2])

    gabarito = {}
    for nome, conteudo in casos.items():
        with open(os.path.join(saida, nome + ".xls"), "wb") as f:
            f.write(conteudo)
        r = ler_xlrd(conteudo)
        r.pop("_onde", None)
        with open(os.path.join(saida, nome + ".json"), "w", encoding="utf-8") as f:
            json.dump(r, f, ensure_ascii=False)
        gabarito[nome] = "erro" if "erro" in r else len(r["folhas"])

    # Fuzz: bytes trocados e cortes em arquivos pequenos; o teste refaz cada variação.
    pool = [multiprocessing.Pool(1)]
    bases = ["xls-biff8-solto", "xls-biff8-sst", "xls-biff5-solto", "xls-ole-mini", "xls-biff8-1904-extras"]
    variacoes = []
    for base in bases:
        original = casos[base]
        for k in range(120):
            trocas = []
            for _ in range(aleatorio.choice([1, 1, 2, 4])):
                pos = aleatorio.randrange(len(original))
                trocas.append([pos, aleatorio.choice([0, 0xFF, aleatorio.randrange(256), original[pos] ^ 1])])
            corte = len(original) if k % 4 else aleatorio.randrange(len(original))
            conteudo = bytearray(original)
            for pos, b in trocas:
                conteudo[pos] = b
            conteudo = bytes(conteudo[:corte])
            r = ler_com_limite(pool, conteudo)
            if not aceitavel(r) or celulas(r) > 2000:
                continue
            r.pop("_onde", None)
            variacoes.append({"base": base, "trocas": trocas, "corte": corte, "resultado": r})
    pool[0].terminate()

    # xldate_as_tuple nos dois datemodes (e um inválido).
    valores = [0.0, -0.0, -1.0, -1e-9, 0.5, 0.999999, 0.9999999, 0.99999999, 1.0, 59.0, 60.0, 60.5, 61.0, 61.25,
               1462.0, 1461.0, 1000.0, 45000.0, 45000.5, 45000.999994, 45000.999995, 45000.9999999, 2958465.0,
               2958465.9999999, 2958466.0, 2957003.0, 2957004.0, 1e10, float("inf"), float("-inf"), float("nan"),
               0.000005787, 0.0000057, 36525.333333333336, 1.5e-300, 100.00000578703704, 43831.020833333336]
    datas = []
    for v in valores:
        for dm in (0, 1, 2):
            try:
                t = list(xlrd.xldate_as_tuple(v, dm))
                datas.append({"valor": {"$f": repr(v)}, "datemode": dm, "tupla": t})
            except Exception as e:  # noqa: BLE001
                datas.append({"valor": {"$f": repr(v)}, "datemode": dm,
                              "erro": {"tipo": nome_excecao(e), "mensagem": str(e)}})
    livro_falso = types.SimpleNamespace(verbosity=0, logfile=sys.stdout)
    formatos = [[f, bool(xlrd.formatting.is_date_format_string(livro_falso, f))] for f in FORMATOS_TESTE]

    with open(os.path.join(saida, "xls-extras.json"), "w", encoding="utf-8") as f:
        json.dump({"fuzz": variacoes, "xldate": datas, "formatos": formatos}, f, ensure_ascii=False)
    print(json.dumps(gabarito, ensure_ascii=False))
    print("fuzz:", len(variacoes), "xldate:", len(datas), "formatos:", len(formatos))


if __name__ == "__main__":
    main()
