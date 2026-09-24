/**
 * VIVA Eventos · núcleo do relatório de mídia.
 *
 * Busca os dois lados da história e os cruza:
 *   Meta Ads  -> quanto custou, quanta entrega, quantos cliques (por criativo
 *                e por praça)
 *   Kommo     -> quantos leads chegaram, de qual anúncio, com que qualidade e
 *                em que ponto do funil comercial estão
 *
 * O cruzamento acontece pela UTM que a landing grava no lead:
 *   utm_source   = nome da campanha   ex.: "[09/26] [LM] [CADASTRO] Expansão #2"
 *   utm_medium   = conjunto / praça   ex.: "[INTERESSES] Belém - PA"
 *   utm_campaign = criativo           ex.: "IMG01"
 *
 * Nenhum dado pessoal sai daqui. As funções de agregação devolvem apenas
 * contagens e somas: o relatório é publicado numa URL aberta, então nome,
 * telefone e anotação comercial nunca entram no resultado.
 *
 * Este arquivo não é uma função: mora em lib/ e é importado pelas funções.
 */

/* ------------------------------------------------------------------ *
 * Meta Marketing API
 * ------------------------------------------------------------------ */

/**
 * Insights por anúncio no período.
 *
 * O nível "ad" é o que permite separar por criativo; adset_name traz a praça.
 * Paginamos porque uma conta com muitos anúncios não cabe numa resposta só.
 */
async function buscarMeta(de, ate) {
  const token = process.env.META_TOKEN;
  const conta = process.env.META_AD_ACCOUNT_ID;
  if (!token || !conta) {
    throw new Error('META_TOKEN ou META_AD_ACCOUNT_ID não configurados');
  }

  /* A versão fica em variável de ambiente porque a Meta aposenta versões a
     cada ~2 anos. Se a API responder "Unsupported get request", suba este
     número em vez de mexer no código. */
  const versao = process.env.META_API_VERSION || 'v23.0';
  const act = conta.startsWith('act_') ? conta : `act_${conta}`;

  const campos = [
    'ad_name', 'adset_name', 'campaign_name',
    'spend', 'impressions', 'reach',
    'inline_link_clicks', 'actions'
  ].join(',');

  let url = `https://graph.facebook.com/${versao}/${act}/insights` +
    `?level=ad&fields=${campos}` +
    `&time_range=${encodeURIComponent(JSON.stringify({ since: de, until: ate }))}` +
    `&time_increment=all_days&limit=500&access_token=${encodeURIComponent(token)}`;

  const linhas = [];
  /* Teto de páginas: uma paginação quebrada não pode rodar para sempre dentro
     de uma função com tempo limitado. */
  for (let pagina = 0; pagina < 20 && url; pagina++) {
    const r = await fetch(url);
    const corpo = await r.json();
    if (!r.ok) {
      const msg = corpo && corpo.error ? corpo.error.message : `HTTP ${r.status}`;
      throw new Error(`Meta: ${msg}`);
    }
    linhas.push(...(corpo.data || []));
    url = corpo.paging && corpo.paging.next ? corpo.paging.next : null;
  }

  return linhas.map(function (l) {
    return {
      criativo: l.ad_name || 'sem nome',
      praca: limparPraca(l.adset_name),
      campanha: l.campaign_name || '',
      gasto: Number(l.spend || 0),
      impressoes: Number(l.impressions || 0),
      alcance: Number(l.reach || 0),
      cliques: Number(l.inline_link_clicks || 0),
      visitas: extrairAcao(l.actions, 'landing_page_view')
    };
  });
}

/* As ações vêm como lista de {action_type, value}; só algumas interessam. */
function extrairAcao(acoes, tipo) {
  if (!Array.isArray(acoes)) return 0;
  const achou = acoes.find(function (a) { return a.action_type === tipo; });
  return achou ? Number(achou.value || 0) : 0;
}

/* "[INTERESSES] Belém - PA" vira "Belém - PA": o prefixo é convenção de
   nomenclatura da conta e só polui o relatório. */
function limparPraca(nome) {
  return String(nome || 'sem praça').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
}

/* ------------------------------------------------------------------ *
 * Kommo
 * ------------------------------------------------------------------ */

/**
 * Leads criados no período, com campos personalizados e etapa.
 *
 * O filtro created_at usa timestamp Unix em segundos. O "ate" recebe o fim do
 * dia para incluir quem se candidatou à noite.
 */
async function buscarKommo(de, ate) {
  const subdominio = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_TOKEN;
  if (!subdominio || !token) {
    throw new Error('KOMMO_SUBDOMAIN ou KOMMO_TOKEN não configurados');
  }

  const base = `https://${subdominio}.kommo.com/api/v4`;
  const cabecalho = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8'
  };

  const desde = Math.floor(new Date(`${de}T00:00:00-03:00`).getTime() / 1000);
  const ateTs = Math.floor(new Date(`${ate}T23:59:59-03:00`).getTime() / 1000);

  const etapas = await buscarEtapas(base, cabecalho);

  const leads = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const url = `${base}/leads?limit=250&page=${pagina}` +
      `&filter[created_at][from]=${desde}&filter[created_at][to]=${ateTs}`;
    const r = await fetch(url, { headers: cabecalho });

    /* 204 é a resposta do Kommo para "acabou a lista", não um erro. */
    if (r.status === 204) break;
    if (!r.ok) throw new Error(`Kommo: HTTP ${r.status}`);

    const corpo = await r.json();
    const lote = (corpo._embedded && corpo._embedded.leads) || [];
    if (!lote.length) break;
    leads.push(...lote);
    if (!(corpo._links && corpo._links.next)) break;
  }

  return leads.map(function (l) {
    const campos = mapearCampos(l.custom_fields_values);
    return {
      /* Nada que identifique a pessoa: só o que o relatório agrega. */
      criativo: campos['UTM campaign'] || 'sem utm',
      praca: limparPraca(campos['UTM medium']),
      campanha: campos['UTM source'] || '',
      status: campos['Status da candidatura'] || 'sem status',
      classe: primeiraLetraClasse(campos['Classificação do lead']),
      pontos: Number(campos['Pontuação'] || 0),
      capital: campos['Capital próprio'] || '',
      cidade: campos['Cidade'] || '',
      /* Um lead sem UTM nao veio das campanhas: e entrada manual, indicacao
         ou outro funil. Ele existe no CRM do periodo, mas contá-lo como
         resultado de midia barateia o custo por lead artificialmente. */
      atribuido: Boolean(campos['UTM campaign'] || campos['UTM source']),
      etapa: etapas[l.status_id] || 'sem etapa',
      perdido: l.status_id === 143 || /perdid|closed\s*-?\s*lost/i.test(etapas[l.status_id] || '')
    };
  });
}

/* Os campos personalizados vêm como lista; o relatório pensa por nome. */
function mapearCampos(lista) {
  const fora = {};
  (lista || []).forEach(function (c) {
    const v = c.values && c.values[0];
    if (!v) return;
    fora[c.field_name] = v.value !== undefined ? v.value : v.enum_code;
  });
  return fora;
}

/* "A · Prioridade máxima" vira "A". Quem não tem classificação (contato direto
   por WhatsApp, por exemplo) entra como "WA". */
function primeiraLetraClasse(texto) {
  const t = String(texto || '').trim();
  if (!t) return 'WA';
  const m = t.match(/^([ABCD])\b/);
  return m ? m[1] : 'WA';
}

/* Mapa de status_id para nome de etapa, de todos os funis da conta. */
async function buscarEtapas(base, cabecalho) {
  const r = await fetch(`${base}/leads/pipelines`, { headers: cabecalho });
  if (!r.ok) return {};
  const corpo = await r.json();
  const funis = (corpo._embedded && corpo._embedded.pipelines) || [];
  const mapa = {};
  funis.forEach(function (f) {
    const st = (f._embedded && f._embedded.statuses) || [];
    st.forEach(function (s) { mapa[s.id] = s.name; });
  });
  return mapa;
}

/* ------------------------------------------------------------------ *
 * Cruzamento
 * ------------------------------------------------------------------ */

/**
 * Junta os dois lados e devolve só agregados.
 *
 * A chave de junção é o par criativo + praça, que é o que a UTM carrega e o
 * que o Meta expõe em ad_name + adset_name.
 */
function agregar(meta, todosOsLeads, de, ate) {
  const total = somar(meta);

  /* O relatorio mede o que a midia trouxe. Os demais ficam num contador
     separado, para ninguem achar que sumiram. */
  const leads = todosOsLeads.filter(function (l) { return l.atribuido; });
  const semAtribuicao = todosOsLeads.length - leads.length;

  const porCriativo = agrupar(meta, leads, 'criativo');
  const porPraca = agrupar(meta, leads, 'praca');

  const completos = leads.filter(function (l) { return /completo/i.test(l.status); });
  const classeA = leads.filter(function (l) { return l.classe === 'A'; });
  const classeAB = leads.filter(function (l) { return l.classe === 'A' || l.classe === 'B'; });
  const perdidos = leads.filter(function (l) { return l.perdido; });

  return {
    periodo: { de: de, ate: ate, dias: diasEntre(de, ate) },
    gerado_em: new Date().toISOString(),

    total: {
      gasto: arred(total.gasto),
      impressoes: total.impressoes,
      alcance: total.alcance,
      cliques: total.cliques,
      visitas: total.visitas,
      leads: leads.length,
      leads_sem_atribuicao: semAtribuicao,
      completos: completos.length,
      classe_a: classeA.length,
      classe_ab: classeAB.length,
      perdidos: perdidos.length,
      ctr: pct(total.cliques, total.impressoes),
      cpc: divisao(total.gasto, total.cliques),
      cpm: total.impressoes ? arred(total.gasto / total.impressoes * 1000) : 0,
      custo_lead: divisao(total.gasto, leads.length),
      custo_completo: divisao(total.gasto, completos.length),
      custo_classe_a: divisao(total.gasto, classeA.length),
      conversao_visita_lead: pct(leads.length, total.visitas)
    },

    criativos: porCriativo,
    pracas: porPraca,
    classificacao: contar(leads, 'classe'),
    etapas: contar(leads, 'etapa'),
    status: contar(leads, 'status'),
    capital: contar(completos, 'capital'),
    /* Cidade declarada por praça anunciada: é o cruzamento que revela demanda
       fora do alvo, como Vitória apareceu em setembro. */
    cidades_por_praca: cidadesPorPraca(leads)
  };
}

function agrupar(meta, leads, chave) {
  const nomes = new Set();
  meta.forEach(function (m) { nomes.add(m[chave]); });
  leads.forEach(function (l) { nomes.add(l[chave]); });

  return Array.from(nomes).map(function (nome) {
    const m = somar(meta.filter(function (x) { return x[chave] === nome; }));
    const meus = leads.filter(function (x) { return x[chave] === nome; });
    const a = meus.filter(function (x) { return x.classe === 'A'; }).length;
    return {
      nome: nome,
      gasto: arred(m.gasto),
      impressoes: m.impressoes,
      cliques: m.cliques,
      visitas: m.visitas,
      ctr: pct(m.cliques, m.impressoes),
      leads: meus.length,
      completos: meus.filter(function (x) { return /completo/i.test(x.status); }).length,
      classe_a: a,
      classe_ab: meus.filter(function (x) { return x.classe === 'A' || x.classe === 'B'; }).length,
      custo_lead: divisao(m.gasto, meus.length),
      custo_classe_a: divisao(m.gasto, a)
    };
  }).sort(function (x, y) { return y.gasto - x.gasto; });
}

function cidadesPorPraca(leads) {
  const fora = {};
  leads.forEach(function (l) {
    const p = l.praca || 'sem praça';
    const c = (l.cidade || 'não informada').trim();
    fora[p] = fora[p] || {};
    fora[p][c] = (fora[p][c] || 0) + 1;
  });
  return fora;
}

function somar(linhas) {
  return linhas.reduce(function (s, l) {
    s.gasto += l.gasto; s.impressoes += l.impressoes;
    s.alcance += l.alcance; s.cliques += l.cliques; s.visitas += l.visitas;
    return s;
  }, { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, visitas: 0 });
}

function contar(lista, chave) {
  const fora = {};
  lista.forEach(function (l) {
    const v = l[chave] || 'não informado';
    fora[v] = (fora[v] || 0) + 1;
  });
  return fora;
}

/* Divisões por zero aparecem o tempo todo aqui (criativo sem lead, praça sem
   clique). Devolver 0 evita NaN e Infinity no JSON. */
function divisao(a, b) { return b ? arred(a / b) : 0; }
function pct(a, b) { return b ? arred(a / b * 100) : 0; }
function arred(n) { return Math.round(n * 100) / 100; }

function diasEntre(de, ate) {
  const ms = new Date(ate + 'T00:00:00Z') - new Date(de + 'T00:00:00Z');
  return Math.round(ms / 86400000) + 1;
}

/* ------------------------------------------------------------------ *
 * Período
 * ------------------------------------------------------------------ */

/** AAAA-MM-DD no fuso de Brasília, que é o fuso em que a operação pensa. */
function hojeBR(deslocamentoDias) {
  const agora = new Date(Date.now() - 3 * 3600 * 1000);
  if (deslocamentoDias) agora.setUTCDate(agora.getUTCDate() + deslocamentoDias);
  return agora.toISOString().slice(0, 10);
}

/** Valida AAAA-MM-DD e recusa o resto, para não repassar lixo às APIs. */
function dataValida(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(new Date(s + 'T00:00:00Z').getTime());
}

async function montarRelatorio(de, ate) {
  /* Em paralelo: são duas APIs independentes e a função tem tempo limitado. */
  const [meta, leads] = await Promise.all([buscarMeta(de, ate), buscarKommo(de, ate)]);
  return agregar(meta, leads, de, ate);
}

module.exports = {
  montarRelatorio: montarRelatorio,
  buscarMeta: buscarMeta,
  buscarKommo: buscarKommo,
  agregar: agregar,
  hojeBR: hojeBR,
  dataValida: dataValida
};
