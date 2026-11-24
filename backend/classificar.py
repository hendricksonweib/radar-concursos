"""Heurísticas para classificar um concurso coletado: área, esfera, tipo, nível, município."""
import re
import unicodedata


def norm(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


# ordem importa: a primeira área que casar vence
AREAS = [
    ("Inteligência", r"\binteligencia\b|\babin\b"),
    ("Policial", r"polici|\bguarda\b|penitenci|\bpenal\b|bombeir|delegad|investigador|escrivao|soldado|agente de seguranca|socioeducativ|\bperito\b"),
    ("Fiscal", r"fiscal|auditor|tributar|receita|fazenda|sefaz"),
    ("Controle", r"tribunal de contas|\btc[eum]\b|\bcgu\b|controladori|controle interno|controle externo"),
    ("Tribunais", r"tribunal|judiciari|\btj[a-z]{0,2}\b|\btr[tef]\b|justica|oficial de justica|cartori"),
    ("Jurídica", r"procurador|advogad|defensori|ministerio publico|\bmp[a-z]{0,2}\b|juridic|promotor|\bjuiz"),
    ("Legislativa", r"camara|assembleia|legislativ|senado"),
    ("Bancária", r"\bbanco\b|caixa economica|\bbndes\b|\bbacen\b|escriturario|bancari"),
    ("TI", r"tecnologia da informacao|\bti\b|informatica|desenvolvedor|sistemas|ciencia de dados|programador|suporte tecnico"),
    ("Saúde", r"medic|enferm|saude|hospital|farmac|odonto|dentista|fisioterap|nutricion|psicolog|agente comunitario|\bacs\b|\bace\b|biomedic|radiolog|ebserh|\bsus\b"),
    ("Educação", r"professor|educa|docente|pedagog|instrutor|escola|universidade|instituto federal|\bif[a-z]{1,4}\b|monitor|cuidador"),
    ("Assistência Social", r"assistente social|assistencia social|\bcras\b|\bcreas\b|conselheiro tutelar"),
    ("Engenharia", r"engenh|arquitet|agronom|geolog"),
    ("Previdência", r"\binss\b|previden"),
]

ESFERA_RULES = [
    ("sistema_s", r"\bses[ic]\b|\bsena[ci]\b|\bsebrae\b|\bsenar\b|\bsest\b|\bsenat\b"),
    ("estatal", r"petrobras|transpetro|correios|\bbndes\b|caixa economica|banco do brasil|banco do nordeste|banco da amazonia|\bs\.?a\.?\b|empresa|companhia|\bcia\b|serpro|dataprev|eletro|furnas|embrapa|ebserh|conab|casa da moeda|infraero|\binb\b|abdi|apex"),
    ("municipal", r"prefeitura|camara municipal|camara de vereadores|^camara de |\bsaae\b|\bsaemas?\b|autarquia municipal|instituto de previdencia (dos servidores )?(publicos )?(municipais|do municipio)|consorcio|municipio de|fundo municipal|guarda municipal"),
    ("federal", r"federal|\buniao\b|ministerio d[aoe]|\bibge\b|\binss\b|\btr[tef]\b|\bstf\b|\bstj\b|\btst\b|\bstm\b|\btse\b|exercito|marinha|aeronautica|agencia nacional|\bana[a-z]{0,3}\b|anvisa|anatel|aneel|\bancine\b|ibama|icmbio|\bcnen\b|conselho regional|conselho federal|\bcr[a-z]{1,4}\b|\bufs?[a-z]{0,4}\b|\bif[a-z]{1,4}\b|instituto federal|\babin\b|\bcgu\b|\btcu\b|\bagu\b|\bmpu\b|\bmpf\b|\bdpu\b"),
    ("privada", r"hospital|associacao|fundacao|santa casa|instituto (?!federal)|cooperativa|clinica"),
]

NIVEIS = [("Fundamental", r"fundamental|alfabetizad"), ("Médio", r"medio|tecnico"), ("Superior", r"superior|graduac")]


def area_de(*textos):
    t = norm(" ".join(textos))
    for nome, rx in AREAS:
        if re.search(rx, t):
            return nome
    return "Administrativa"


def esfera_de(orgao, secao_uf):
    t = norm(orgao)
    for nome, rx in ESFERA_RULES:
        if re.search(rx, t):
            return nome
    return "federal" if secao_uf == "NACIONAL" else "estadual"


def tipo_de(esfera):
    return "privado" if esfera in ("estatal", "sistema_s", "privada") else "publico"


def niveis_de(texto):
    t = norm(texto)
    out = [n for n, rx in NIVEIS if re.search(rx, t)]
    return out or ["Médio"]


MUN_RX = re.compile(r"(?:prefeitura(?: municipal)?|camara(?: municipal)?(?: de vereadores)?|saae|guarda municipal|municipio|previdencia[a-z ]*?|autarquia[a-z ]*?)\s+(?:de|do|da|dos|das)\s+(.+)$")
ESTANCIA_RX = re.compile(r"^(?:estancia|cidade)(?: turistica| balnearia| hidromineral| climatica)?\s+(?:de|do|da)\s+")


def municipio_de(orgao, uf, municipios_por_uf):
    """Tenta achar o código IBGE do município pelo nome do órgão ("Câmara de Boituva", "Prefeitura da Estância Turística de Itu")."""
    if not uf or uf not in municipios_por_uf:
        return None, None
    tabela = municipios_por_uf[uf]
    for trecho in [orgao] + re.split(r"\s+[-–]\s+", orgao):
        m = MUN_RX.search(norm(trecho))
        if not m:
            continue
        alvo = ESTANCIA_RX.sub("", m.group(1))
        alvo = re.sub(r"\s*[-/(]\s*[a-z]{2}\)?\s*$", "", alvo).strip()
        if alvo in tabela:
            return tabela[alvo]
        for nome, val in tabela.items():  # nome cortado/sobrando ("aparecida de goiania go")
            if alvo.startswith(nome + " "):
                return val
    return None, None


def sigla_de(orgao):
    """'ABDI - Agência Brasileira...' -> 'ABDI'; senão um nome curto."""
    partes = re.split(r"\s+[-–]\s+", orgao, maxsplit=1)
    if len(partes) == 2 and len(partes[0]) <= 16:
        return partes[0].strip()
    return orgao if len(orgao) <= 40 else orgao[:38].rstrip() + "…"


def dinheiro(txt):
    m = re.search(r"R\$\s*([\d.]+(?:,\d{1,2})?)", txt or "")
    if not m:
        return 0
    return round(float(m.group(1).replace(".", "").replace(",", ".")))


def inteiro(txt):
    m = re.search(r"([\d.]+)\s+vagas?", txt or "", re.I)
    return int(m.group(1).replace(".", "")) if m else 0
