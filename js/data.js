// DADOS DE DEMONSTRAÇÃO — em produção vêm da API (ver README).
// status: previsto | autorizado | banca_definida | edital_aberto | encerrado
(function () {
  const TODAS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
  const c = (nome, nivel, area, salario, vagas) => ({ nome, nivel, area, salario, vagas });

  const base = [
    // ---------- FEDERAIS ----------
    { id: "f1", orgao: "Polícia Federal", sigla: "PF", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cebraspe", status: "edital_aberto", publicado: "2026-11-10", inscricoesAte: "2026-12-12",
      cargos: [c("Agente de Polícia Federal","Superior","Policial",14164,630), c("Escrivão de Polícia Federal","Superior","Policial",14164,160), c("Delegado de Polícia Federal","Superior","Policial",26800,120), c("Papiloscopista","Superior","Policial",14164,40)] },
    { id: "f2", orgao: "Receita Federal do Brasil", sigla: "RFB", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "FGV", status: "autorizado", publicado: "2026-11-18",
      cargos: [c("Auditor-Fiscal da Receita Federal","Superior","Fiscal",22921,230), c("Analista-Tributário","Superior","Fiscal",13000,470)] },
    { id: "f3", orgao: "Banco Central do Brasil", sigla: "BACEN", esfera: "federal", tipo: "publico", ufs: ["DF","SP","RJ","MG","RS","PR","PE","BA","CE","PA"], banca: null, status: "previsto", publicado: "2026-10-30",
      cargos: [c("Analista do Banco Central","Superior","Bancária",20924,100), c("Técnico do Banco Central","Médio","Bancária",8000,50)] },
    { id: "f4", orgao: "Tribunal de Contas da União", sigla: "TCU", esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "edital_aberto", publicado: "2026-11-03", inscricoesAte: "2026-12-02",
      cargos: [c("Auditor Federal de Controle Externo","Superior","Controle",26158,40), c("Auditor - TI","Superior","TI",26158,10)] },
    { id: "f5", orgao: "INSS", sigla: "INSS", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cebraspe", status: "banca_definida", publicado: "2026-11-12",
      cargos: [c("Técnico do Seguro Social","Médio","Previdência",5905,1000), c("Analista do Seguro Social","Superior","Previdência",8500,200)] },
    { id: "f6", orgao: "Polícia Rodoviária Federal", sigla: "PRF", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cebraspe", status: "edital_aberto", publicado: "2026-11-20", inscricoesAte: "2026-12-20",
      cargos: [c("Policial Rodoviário Federal","Superior","Policial",11000,1500)] },
    { id: "f7", orgao: "Senado Federal", sigla: "Senado", esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "FGV", status: "previsto", publicado: "2026-09-14",
      cargos: [c("Consultor Legislativo","Superior","Legislativa",33000,30), c("Analista Legislativo","Superior","Legislativa",25000,40), c("Policial Legislativo","Médio","Policial",18000,20)] },
    { id: "f8", orgao: "Tribunal Regional Federal da 1ª Região", sigla: "TRF1", esfera: "federal", tipo: "publico", ufs: ["DF","GO","MT","BA","PA","AM","MA","PI","TO","AC","AP","RO","RR"], banca: "FCC", status: "edital_aberto", publicado: "2026-11-05", inscricoesAte: "2026-12-04",
      cargos: [c("Analista Judiciário - Área Judiciária","Superior","Tribunais",13994,80), c("Técnico Judiciário - Área Administrativa","Médio","Tribunais",8529,150), c("Analista Judiciário - TI","Superior","TI",13994,20)] },
    { id: "f9", orgao: "Caixa Econômica Federal", sigla: "Caixa", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cesgranrio", status: "edital_aberto", publicado: "2026-11-15", inscricoesAte: "2026-12-08",
      cargos: [c("Técnico Bancário Novo","Médio","Bancária",3762,2000), c("Técnico Bancário - TI","Médio","TI",3762,300)] },
    { id: "f10", orgao: "Banco do Brasil", sigla: "BB", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cesgranrio", status: "encerrado", publicado: "2026-08-01",
      cargos: [c("Escriturário - Agente Comercial","Médio","Bancária",3622,4000), c("Escriturário - Agente de Tecnologia","Médio","TI",3622,1000)] },
    { id: "f11", orgao: "Polícia Federal - Administrativo", sigla: "PF Adm", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "Cebraspe", status: "autorizado", publicado: "2026-11-21",
      cargos: [c("Agente Administrativo","Médio","Administrativa",6000,600)] },
    { id: "f12", orgao: "CGU - Controladoria-Geral da União", sigla: "CGU", esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "FGV", status: "previsto", publicado: "2026-10-02",
      cargos: [c("Auditor Federal de Finanças e Controle","Superior","Controle",21000,150)] },
    { id: "f13", orgao: "Ministério Público da União", sigla: "MPU", esfera: "federal", tipo: "publico", ufs: TODAS, banca: "FGV", status: "banca_definida", publicado: "2026-11-01",
      cargos: [c("Analista do MPU - Direito","Superior","Jurídica",13994,100), c("Técnico do MPU","Médio","Tribunais",8529,200)] },

    // ---------- ESTADUAIS ----------
    { id: "e1", orgao: "Polícia Civil do Distrito Federal", sigla: "PCDF", esfera: "estadual", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "edital_aberto", publicado: "2026-11-08", inscricoesAte: "2026-12-10",
      cargos: [c("Agente de Polícia","Superior","Policial",13700,1000), c("Delegado de Polícia","Superior","Policial",23500,150)] },
    { id: "e2", orgao: "Secretaria de Fazenda do DF", sigla: "SEFAZ-DF", esfera: "estadual", tipo: "publico", ufs: ["DF"], banca: "FGV", status: "autorizado", publicado: "2026-11-11",
      cargos: [c("Auditor Fiscal da Receita do DF","Superior","Fiscal",24000,50)] },
    { id: "e3", orgao: "Tribunal de Justiça do DF e Territórios", sigla: "TJDFT", esfera: "estadual", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "previsto", publicado: "2026-10-20",
      cargos: [c("Analista Judiciário","Superior","Tribunais",13994,60), c("Técnico Judiciário","Médio","Tribunais",8529,120)] },
    { id: "e4", orgao: "SEEDF - Secretaria de Educação do DF", sigla: "SEEDF", esfera: "estadual", tipo: "publico", ufs: ["DF"], banca: "Quadrix", status: "edital_aberto", publicado: "2026-11-14", inscricoesAte: "2026-12-15",
      cargos: [c("Professor de Educação Básica","Superior","Educação",5900,3000)] },
    { id: "e5", orgao: "Polícia Militar de São Paulo", sigla: "PM-SP", esfera: "estadual", tipo: "publico", ufs: ["SP"], banca: "Vunesp", status: "edital_aberto", publicado: "2026-11-02", inscricoesAte: "2026-12-01",
      cargos: [c("Soldado PM de 2ª Classe","Médio","Policial",4852,2700)] },
    { id: "e6", orgao: "SEFAZ São Paulo", sigla: "SEFAZ-SP", esfera: "estadual", tipo: "publico", ufs: ["SP"], banca: "FCC", status: "banca_definida", publicado: "2026-10-28",
      cargos: [c("Auditor Fiscal da Receita Estadual","Superior","Fiscal",22000,300)] },
    { id: "e7", orgao: "Tribunal de Justiça de São Paulo", sigla: "TJ-SP", esfera: "estadual", tipo: "publico", ufs: ["SP"], banca: "Vunesp", status: "edital_aberto", publicado: "2026-11-17", inscricoesAte: "2026-12-18",
      cargos: [c("Escrevente Técnico Judiciário","Médio","Tribunais",6043,400)] },
    { id: "e8", orgao: "Polícia Civil do Rio de Janeiro", sigla: "PC-RJ", esfera: "estadual", tipo: "publico", ufs: ["RJ"], banca: "FGV", status: "autorizado", publicado: "2026-11-09",
      cargos: [c("Inspetor de Polícia","Superior","Policial",9500,500), c("Delegado","Superior","Policial",21000,40)] },
    { id: "e9", orgao: "SEFAZ Minas Gerais", sigla: "SEF-MG", esfera: "estadual", tipo: "publico", ufs: ["MG"], banca: "FGV", status: "edital_aberto", publicado: "2026-11-06", inscricoesAte: "2026-12-06",
      cargos: [c("Auditor Fiscal da Receita Estadual","Superior","Fiscal",21000,100)] },
    { id: "e10", orgao: "Polícia Civil de Goiás", sigla: "PC-GO", esfera: "estadual", tipo: "publico", ufs: ["GO"], banca: "Cebraspe", status: "previsto", publicado: "2026-10-12",
      cargos: [c("Agente de Polícia","Superior","Policial",7800,600)] },
    { id: "e11", orgao: "Secretaria de Saúde da Bahia", sigla: "SESAB", esfera: "estadual", tipo: "publico", ufs: ["BA"], banca: "Instituto AOCP", status: "edital_aberto", publicado: "2026-11-13", inscricoesAte: "2026-12-14",
      cargos: [c("Enfermeiro","Superior","Saúde",5200,400), c("Médico","Superior","Saúde",14000,250), c("Técnico de Enfermagem","Médio","Saúde",3100,800)] },
    { id: "e12", orgao: "Polícia Civil do Paraná", sigla: "PC-PR", esfera: "estadual", tipo: "publico", ufs: ["PR"], banca: "IBFC", status: "edital_aberto", publicado: "2026-11-19", inscricoesAte: "2026-12-22",
      cargos: [c("Investigador de Polícia","Superior","Policial",8900,400)] },
    { id: "e13", orgao: "SEFAZ Rio Grande do Sul", sigla: "SEFAZ-RS", esfera: "estadual", tipo: "publico", ufs: ["RS"], banca: "Fundatec", status: "autorizado", publicado: "2026-11-04",
      cargos: [c("Auditor Fiscal da Receita Estadual","Superior","Fiscal",29000,40)] },
    { id: "e14", orgao: "Polícia Civil do Ceará", sigla: "PC-CE", esfera: "estadual", tipo: "publico", ufs: ["CE"], banca: "IDECAN", status: "edital_aberto", publicado: "2026-11-16", inscricoesAte: "2026-12-11",
      cargos: [c("Inspetor de Polícia Civil","Superior","Policial",6300,600)] },
    { id: "e15", orgao: "Tribunal de Justiça de Pernambuco", sigla: "TJ-PE", esfera: "estadual", tipo: "publico", ufs: ["PE"], banca: "FGV", status: "edital_aberto", publicado: "2026-11-07", inscricoesAte: "2026-12-05",
      cargos: [c("Analista Judiciário","Superior","Tribunais",9800,80), c("Técnico Judiciário","Médio","Tribunais",5600,200)] },
    { id: "e16", orgao: "Polícia Civil do Amazonas", sigla: "PC-AM", esfera: "estadual", tipo: "publico", ufs: ["AM"], banca: "FGV", status: "previsto", publicado: "2026-09-25",
      cargos: [c("Investigador de Polícia","Superior","Policial",7700,300)] },
    { id: "e17", orgao: "Secretaria de Educação do Pará", sigla: "SEDUC-PA", esfera: "estadual", tipo: "publico", ufs: ["PA"], banca: "Cebraspe", status: "edital_aberto", publicado: "2026-11-12", inscricoesAte: "2026-12-09",
      cargos: [c("Professor Classe I","Superior","Educação",4600,2500)] },
    { id: "e18", orgao: "Polícia Militar de Santa Catarina", sigla: "PM-SC", esfera: "estadual", tipo: "publico", ufs: ["SC"], banca: "Fepese", status: "edital_aberto", publicado: "2026-11-18", inscricoesAte: "2026-12-16",
      cargos: [c("Soldado","Superior","Policial",7200,500)] },

    // ---------- PRIVADOS / PROCESSOS SELETIVOS ----------
    { id: "p1", orgao: "Petrobras", sigla: "Petrobras", esfera: "estatal", tipo: "privado", ufs: ["RJ","SP","BA","ES","RN","AM"], banca: "Cesgranrio", status: "edital_aberto", publicado: "2026-11-11", inscricoesAte: "2026-12-03",
      cargos: [c("Profissional Petrobras Jr - Engenharia","Superior","Engenharia",11700,300), c("Técnico de Operação Jr","Médio","Engenharia",6200,500)] },
    { id: "p2", orgao: "Correios", sigla: "Correios", esfera: "estatal", tipo: "privado", ufs: TODAS, banca: "IBFC", status: "previsto", publicado: "2026-10-15",
      cargos: [c("Agente de Correios - Carteiro","Médio","Administrativa",2500,3000), c("Analista de Correios","Superior","Administrativa",6800,200)] },
    { id: "p3", orgao: "SESI/SENAI São Paulo", sigla: "SESI-SP", esfera: "sistema_s", tipo: "privado", ufs: ["SP"], banca: "Própria", status: "edital_aberto", publicado: "2026-11-19", inscricoesAte: "2026-11-30",
      cargos: [c("Instrutor de Formação Profissional","Médio","Educação",4200,80), c("Professor de Educação Básica","Superior","Educação",5100,60)] },
    { id: "p4", orgao: "Hospital Israelita (Processo Seletivo)", sigla: "HIAE", esfera: "privada", tipo: "privado", ufs: ["SP"], banca: "Própria", status: "edital_aberto", publicado: "2026-11-21", inscricoesAte: "2026-12-05",
      cargos: [c("Enfermeiro Assistencial","Superior","Saúde",7200,120)] },
    { id: "p5", orgao: "Serpro", sigla: "Serpro", esfera: "estatal", tipo: "privado", ufs: ["DF","SP","RJ","RS","PE","CE","MG","PR","BA","SC"], banca: "Cebraspe", status: "autorizado", publicado: "2026-11-14",
      cargos: [c("Analista - Desenvolvimento de Sistemas","Superior","TI",10600,300)] },
    { id: "p6", orgao: "BNDES", sigla: "BNDES", esfera: "estatal", tipo: "privado", ufs: ["RJ"], banca: "Cesgranrio", status: "banca_definida", publicado: "2026-11-02",
      cargos: [c("Profissional Básico - Economia","Superior","Bancária",20900,80), c("Profissional Básico - TI","Superior","TI",20900,30)] },
    { id: "p7", orgao: "SENAC Bahia", sigla: "SENAC-BA", esfera: "sistema_s", tipo: "privado", ufs: ["BA"], banca: "Própria", status: "edital_aberto", publicado: "2026-11-20", inscricoesAte: "2026-12-04",
      cargos: [c("Instrutor de Educação Profissional","Médio","Educação",3300,40)] },
  ];

  // ultimoEdital = referência manual (conferir). Órgãos monitorados como ALVO — inclusive os que estão sem edital há anos.
  // sinais = o que o radar checa todo dia (Diário Oficial, LDO/autorizações, contratação de banca, site do órgão).
  const ALVOS = [
    { sigla: "ABIN", nome: "Agência Brasileira de Inteligência", area: "Inteligência", nivel: "Superior", salarioRef: 17500, ultimoEdital: 2018,
      etapa: 1, sinais: [
        { data: "2026-11-19", fonte: "Diário Oficial da União", texto: "Portaria do GSI cita 'recomposição do quadro de Oficiais de Inteligência'" },
        { data: "2026-10-03", fonte: "Ministério da Gestão (MGI)", texto: "ABIN aparece na lista de pedidos de concurso para 2027" },
        { data: "2026-08-22", fonte: "Imprensa", texto: "Diretor-geral afirma que quadro está 40% abaixo do ideal" } ] },
    { sigla: "BACEN", nome: "Banco Central do Brasil", area: "Bancária", nivel: "Superior", salarioRef: 20924, ultimoEdital: 2024, etapa: 1, sinais: [] },
    { sigla: "PF", nome: "Polícia Federal", area: "Policial", nivel: "Superior", salarioRef: 14164, ultimoEdital: 2025, etapa: 0, sinais: [] },
    { sigla: "RFB", nome: "Receita Federal", area: "Fiscal", nivel: "Superior", salarioRef: 22921, ultimoEdital: 2022, etapa: 2, sinais: [] },
    { sigla: "Itamaraty", nome: "Instituto Rio Branco", area: "Diplomacia", nivel: "Superior", salarioRef: 22558, ultimoEdital: 2025, etapa: 0, sinais: [] },
    { sigla: "TCU", nome: "Tribunal de Contas da União", area: "Controle", nivel: "Superior", salarioRef: 26158, ultimoEdital: 2025, etapa: 0, sinais: [] },
    { sigla: "Senado", nome: "Senado Federal", area: "Legislativa", nivel: "Superior", salarioRef: 33000, ultimoEdital: 2022, etapa: 1, sinais: [] },
    { sigla: "CGU", nome: "Controladoria-Geral da União", area: "Controle", nivel: "Superior", salarioRef: 21000, ultimoEdital: 2022, etapa: 1, sinais: [] },
    { sigla: "PRF", nome: "Polícia Rodoviária Federal", area: "Policial", nivel: "Superior", salarioRef: 11000, ultimoEdital: 2021, etapa: 0, sinais: [] },
  ];
  // Áreas "vizinhas" usadas para achar concursos parecidos com o alvo
  const AREAS_SIMILARES = {
    "Inteligência": ["Policial", "Controle", "Fiscal", "Diplomacia", "TI"],
    "Policial": ["Inteligência", "Controle"],
    "Fiscal": ["Controle", "Bancária"],
    "Controle": ["Fiscal", "Tribunais", "Legislativa"],
    "Bancária": ["Fiscal", "Controle"],
    "Tribunais": ["Jurídica", "Controle"],
    "Legislativa": ["Controle", "Tribunais"],
    "Diplomacia": ["Inteligência", "Legislativa"],
  };

  // Pool usado para SIMULAR a chegada de editais em tempo real no protótipo
  const FEED_SIMULADO = [
    { id: "rt1", orgao: "Polícia Civil do Distrito Federal", sigla: "PCDF Escrivão", esfera: "estadual", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "edital_aberto", inscricoesAte: "2026-12-28",
      cargos: [c("Escrivão de Polícia","Superior","Policial",13700,300)] },
    { id: "rt2", orgao: "Ministério da Defesa - Analista de Inteligência", sigla: "MD", esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "Cebraspe", status: "autorizado",
      cargos: [c("Analista de Inteligência","Superior","Inteligência",15000,60)] },
    { id: "rt3", orgao: "SEFAZ Goiás", sigla: "SEFAZ-GO", esfera: "estadual", tipo: "publico", ufs: ["GO"], banca: "FGV", status: "edital_aberto", inscricoesAte: "2026-12-30",
      cargos: [c("Auditor Fiscal","Superior","Fiscal",23000,90)] },
    { id: "rt4", orgao: "Câmara dos Deputados", sigla: "Câmara", esfera: "federal", tipo: "publico", ufs: ["DF"], banca: "FGV", status: "banca_definida",
      cargos: [c("Analista Legislativo","Superior","Legislativa",28000,50), c("Policial Legislativo","Superior","Policial",24000,30)] },
    { id: "rt5", orgao: "Polícia Militar de Minas Gerais", sigla: "PM-MG", esfera: "estadual", tipo: "publico", ufs: ["MG"], banca: "Própria", status: "edital_aberto", inscricoesAte: "2027-01-10",
      cargos: [c("Soldado","Superior","Policial",5400,1200)] },
  ];

  window.CONCURSOS_BASE = base;
  window.ALVOS = ALVOS;
  window.AREAS_SIMILARES = AREAS_SIMILARES;
  window.FEED_SIMULADO = FEED_SIMULADO;
  window.UF_INFO = {
    "11":["RO","Rondônia"],"12":["AC","Acre"],"13":["AM","Amazonas"],"14":["RR","Roraima"],"15":["PA","Pará"],"16":["AP","Amapá"],"17":["TO","Tocantins"],
    "21":["MA","Maranhão"],"22":["PI","Piauí"],"23":["CE","Ceará"],"24":["RN","Rio Grande do Norte"],"25":["PB","Paraíba"],"26":["PE","Pernambuco"],"27":["AL","Alagoas"],"28":["SE","Sergipe"],"29":["BA","Bahia"],
    "31":["MG","Minas Gerais"],"32":["ES","Espírito Santo"],"33":["RJ","Rio de Janeiro"],"35":["SP","São Paulo"],
    "41":["PR","Paraná"],"42":["SC","Santa Catarina"],"43":["RS","Rio Grande do Sul"],
    "50":["MS","Mato Grosso do Sul"],"51":["MT","Mato Grosso"],"52":["GO","Goiás"],"53":["DF","Distrito Federal"],
  };
})();
