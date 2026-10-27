/**
 * VIVA Eventos · devolve à Meta a qualificação dos leads de expansão.
 *
 * O Kommo chama esta função (webhook "etapa do lead alterada") sempre que um
 * card muda de etapa. Quando o lead atravessa a etapa de MQL ou a de SQL do
 * funil de expansão, a função manda o evento para a API de Conversões da Meta,
 * que liga a qualificação ao anúncio que trouxe a pessoa. É isso que permite
 * ver no Gerenciador o custo por MQL e por SQL, e não só por lead.
 *
 * As fronteiras vêm dos próprios nomes das etapas: a que tem "MQL" no nome
 * ("[mQL - OPERADOR]") e a que tem "SQL" ("[SQL - OPERADOR]"). Um lead que
 * pula direto para depois do SQL gera os dois eventos; um lead que vai para
 * "perdido" não gera nenhum.
 *
 * Variáveis de ambiente (Netlify > Site settings > Environment variables):
 *   META_CAPI_TOKEN       token da API de Conversões, gerado no Gerenciador
 *                         de Eventos (conjunto de dados > Configurações)
 *   META_PIXEL_ID         (opcional) id do conjunto de dados. Padrão: o pixel
 *                         da landing
 *   META_TEST_EVENT_CODE  (temporária) código da aba "Eventos de teste", do
 *                         canal "Offline" (o do canal "Site" é outro, e com
 *                         ele o evento de CRM não aparece). Com ele os eventos
 *                         vão só para o teste. Apague depois.
 *   KOMMO_WEBHOOK_SEGREDO texto aleatório que vai no fim da URL do webhook
 *                         (?segredo=...). Sem ele a função recusa a chamada:
 *                         a URL é pública e qualquer um poderia inventar MQL.
 *   KOMMO_SUBDOMAIN, KOMMO_TOKEN: as mesmas da function kommo. Não há filtro
 *                         de funil: vale todo funil da conta com etapa de MQL
 *                         ou de SQL (ver o laço do handler)
 */

const crypto = require('crypto');

const PIXEL_PADRAO = '1256090053167879';

/* Etapas fixas de todo funil do Kommo. */
const GANHO = 142;
const PERDIDO = 143;

/* Sobrevive entre invocações quentes: o funil quase nunca muda. */
const cacheFunis = {};

exports.handler = async function (event) {
  const consulta = event.queryStringParameters || {};
  const diagnosticando = event.httpMethod === 'GET' && consulta.diagnostico === '1';

  if (event.httpMethod !== 'POST' && !diagnosticando) {
    return resposta(405, { ok: false, error: 'Use POST' });
  }

  const segredo = process.env.KOMMO_WEBHOOK_SEGREDO;
  if (!segredo || consulta.segredo !== segredo) {
    return resposta(403, { ok: false, error: 'Segredo inválido' });
  }

  const subdominio = process.env.KOMMO_SUBDOMAIN;
  const tokenKommo = process.env.KOMMO_TOKEN;
  const tokenMeta = process.env.META_CAPI_TOKEN;
  if (!subdominio || !tokenKommo || !tokenMeta) {
    console.error('KOMMO_SUBDOMAIN, KOMMO_TOKEN ou META_CAPI_TOKEN não configurados');
    // 200 de propósito: o Kommo desliga webhook que responde erro seguidas vezes.
    return resposta(200, { ok: false, error: 'Integração não configurada' });
  }

  const base = `https://${subdominio}.kommo.com/api/v4`;
  const cabecalho = {
    Authorization: `Bearer ${tokenKommo}`,
    'Content-Type': 'application/json; charset=utf-8'
  };

  const funilExpansao = process.env.KOMMO_PIPELINE_ID
    ? Number(process.env.KOMMO_PIPELINE_ID)
    : null;

  /* Reenvio manual: ?diagnostico=1&reenviar=<id do lead>&evento=MQL|SQL.
     Serve para lead que cruzou a etapa antes da integração estar no ar, e
     para ver a resposta crua da Meta quando um evento não aparece. */
  if (diagnosticando && consulta.reenviar) {
    const nome = consulta.evento === 'SQL' ? 'SQL' : 'MQL';
    try {
      const lead = await lerLead(base, cabecalho, Number(consulta.reenviar));
      const evento = montarEvento(nome, lead);
      /* &teste=CODIGO usa outro código de teste só nesta chamada. O código
         muda por canal no Gerenciador, e evento de CRM só aparece com o do
         canal "Offline". */
      const envio = await enviarMeta(tokenMeta, [evento], consulta.teste);
      return resposta(200, {
        ok: true,
        evento: nome,
        teste: consulta.teste || Boolean(process.env.META_TEST_EVENT_CODE),
        /* Só quais identificadores foram, nunca os valores. */
        identificadores: Object.keys(evento.user_data),
        meta: envio
      });
    } catch (err) {
      return resposta(200, { ok: false, error: String(err) });
    }
  }

  if (diagnosticando) {
    return resposta(200, await diagnostico(base, cabecalho, funilExpansao));
  }

  const mudancas = lerWebhook(event);
  console.log('Webhook recebido:', JSON.stringify(mudancas));

  const resultado = [];

  for (const m of mudancas) {
    /* Qualquer funil da conta que tenha etapa de MQL e de SQL. A conta é a de
       expansão, mas o lead não fica num funil só: entra no "1. FUNIL EXP 26"
       e, depois da triagem, é movido para o funil de operador ou de
       investidor, que é onde ficam as etapas de MQL e SQL. Funil sem essas
       etapas não gera evento (fronteirasCruzadas devolve lista vazia). */
    try {
      const funil = await lerFunil(base, cabecalho, m.funil);
      const eventos = fronteirasCruzadas(funil, m.de, m.para);
      if (!eventos.length) continue;

      const lead = await lerLead(base, cabecalho, m.lead);
      if (!lead) continue;

      const envio = await enviarMeta(tokenMeta, eventos.map(function (nome) {
        return montarEvento(nome, lead);
      }));

      /* No log vai só o id do lead e o que a Meta respondeu: nada de telefone
         ou nome, que os logs do Netlify ficam visíveis para toda a equipe. */
      console.log('Lead', m.lead, eventos.join('+'), JSON.stringify(envio));
      resultado.push({ lead: m.lead, eventos: eventos, meta: envio });
    } catch (err) {
      console.error('Lead', m.lead, 'não enviado:', err);
      resultado.push({ lead: m.lead, erro: String(err) });
    }
  }

  return resposta(200, { ok: true, enviados: resultado });
};

/* ============================================================
 * Diagnóstico
 * GET ?diagnostico=1&segredo=... responde, sem dado pessoal nenhum: se o
 * Kommo tem o webhook cadastrado, quais etapas contam como MQL e SQL, e as
 * últimas mudanças de etapa do funil com o evento que cada uma geraria.
 * É o que dá para ver sem abrir os logs do Netlify.
 * ============================================================ */
async function diagnostico(base, cabecalho, funilExpansao) {
  const saida = {
    ok: true,
    variaveis: {
      META_CAPI_TOKEN: Boolean(process.env.META_CAPI_TOKEN),
      META_TEST_EVENT_CODE: Boolean(process.env.META_TEST_EVENT_CODE),
      KOMMO_PIPELINE_ID: funilExpansao
    }
  };

  try {
    const r = await fetch(`${base}/webhooks`, { headers: cabecalho });
    if (r.status === 204) {
      saida.webhooks = [];
    } else if (r.ok) {
      const corpo = await r.json();
      saida.webhooks = ((corpo._embedded && corpo._embedded.webhooks) || []).map(function (w) {
        return {
          /* A senha não volta na resposta, só se ela confere. */
          destino: String(w.destination || '').replace(/segredo=[^&]*/, 'segredo=***'),
          senha_confere: String(w.destination || '').indexOf('segredo=' + process.env.KOMMO_WEBHOOK_SEGREDO) !== -1,
          eventos: w.settings,
          desativado: w.disabled
        };
      });
    } else {
      saida.webhooks = `Kommo não listou os webhooks: HTTP ${r.status}`;
    }
  } catch (err) {
    saida.webhooks = String(err);
  }

  try {
    const r = await fetch(`${base}/leads/pipelines`, { headers: cabecalho });
    const corpo = await r.json();
    const lista = (corpo._embedded && corpo._embedded.pipelines) || [];
    saida.funis = [];
    for (const f of lista) {
      const funil = await lerFunil(base, cabecalho, f.id);
      saida.funis.push({
        id: f.id,
        nome: f.name,
        gera_eventos: funil.mql !== null || funil.sql !== null,
        mql: funil.nomeMql,
        sql: funil.nomeSql
      });

      /* Quem está hoje em SQL ou depois (só id e etapa), para achar um lead
         e reenviar o evento à mão. 142 e 143 são ganho e perda. */
      if (funil.sql === null) continue;
      const etapasSql = funil.etapas.filter(function (e) {
        return e.sort >= funil.sql && e.id !== 142 && e.id !== 143;
      });
      if (!etapasSql.length) continue;
      const filtro = etapasSql.map(function (e, i) {
        return `filter[statuses][${i}][pipeline_id]=${f.id}&filter[statuses][${i}][status_id]=${e.id}`;
      }).join('&');
      const l = await fetch(`${base}/leads?${filtro}&limit=50`, { headers: cabecalho });
      if (!l.ok || l.status === 204) continue;
      const leads = ((await l.json())._embedded || {}).leads || [];
      saida.em_sql = (saida.em_sql || []).concat(leads.map(function (lead) {
        return { lead: lead.id, funil: f.name, etapa: funil.nomes[lead.status_id] };
      }));
    }

    const ev = await fetch(`${base}/events?filter[type]=lead_status_changed&limit=15`, { headers: cabecalho });
    if (ev.ok && ev.status !== 204) {
      const lote = await ev.json();
      const eventos = (lote._embedded && lote._embedded.events) || [];
      saida.ultimas_mudancas = [];
      for (const e of eventos) {
        const antes = etapaDoEvento(e.value_before);
        const depois = etapaDoEvento(e.value_after);
        if (!depois.funil) continue;
        const funil = await lerFunil(base, cabecalho, depois.funil);
        saida.ultimas_mudancas.push({
          lead: e.entity_id,
          quando: new Date(e.created_at * 1000).toISOString(),
          de: funil.nomes[antes.etapa] || antes.etapa,
          para: funil.nomes[depois.etapa] || depois.etapa,
          geraria: fronteirasCruzadas(funil, antes.etapa, depois.etapa)
        });
      }
    } else {
      saida.ultimas_mudancas = `HTTP ${ev.status}`;
    }
  } catch (err) {
    saida.funis = String(err);
  }

  return saida;
}

function etapaDoEvento(valor) {
  const item = (valor || [])[0] || {};
  const s = item.lead_status || {};
  return { etapa: Number(s.id) || null, funil: Number(s.pipeline_id) || null };
}

/* ============================================================
 * Webhook do Kommo
 * O corpo chega como formulário (x-www-form-urlencoded), com chaves do tipo
 * leads[status][0][id], leads[status][0][status_id] e
 * leads[status][0][old_status_id]. Um mesmo aviso pode trazer vários leads.
 * ============================================================ */
function lerWebhook(event) {
  const cru = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const params = new URLSearchParams(cru);

  const porIndice = {};
  params.forEach(function (valor, chave) {
    const achado = chave.match(/^leads\[status\]\[(\d+)\]\[(\w+)\]$/);
    if (!achado) return;
    porIndice[achado[1]] = porIndice[achado[1]] || {};
    porIndice[achado[1]][achado[2]] = valor;
  });

  return Object.keys(porIndice).map(function (i) {
    const l = porIndice[i];
    return {
      lead: Number(l.id),
      funil: Number(l.pipeline_id),
      para: Number(l.status_id),
      de: Number(l.old_status_id) || null
    };
  }).filter(function (m) { return m.lead && m.para; });
}

/* ============================================================
 * Funil
 * ============================================================ */
async function lerFunil(base, cabecalho, funilId) {
  if (cacheFunis[funilId]) return cacheFunis[funilId];

  const r = await fetch(`${base}/leads/pipelines/${funilId}`, { headers: cabecalho });
  if (!r.ok) throw new Error(`Kommo não leu o funil ${funilId}: HTTP ${r.status}`);

  const corpo = await r.json();
  const etapas = (corpo._embedded && corpo._embedded.statuses) || [];

  const ordem = {};
  const nomes = {};
  etapas.forEach(function (e) {
    ordem[e.id] = e.sort;
    nomes[e.id] = e.name;
  });

  /* Mais de uma etapa pode ter MQL no nome (a 5 e a 6 têm): a fronteira é a
     primeira delas na ordem do funil. */
  const primeira = function (sigla) {
    return etapas
      .filter(function (e) { return new RegExp('\\b' + sigla + '\\b').test(normalizar(e.name)); })
      .sort(function (a, b) { return a.sort - b.sort; })[0];
  };
  const mql = primeira('MQL');
  const sql = primeira('SQL');
  return (cacheFunis[funilId] = {
    etapas: etapas,
    ordem: ordem,
    nomes: nomes,
    mql: mql ? mql.sort : null,
    sql: sql ? sql.sort : null,
    nomeMql: mql ? mql.name : null,
    nomeSql: sql ? sql.name : null
  });
}

/* Quais fronteiras o lead atravessou para a frente nesta mudança. Pela ordem
   das etapas, e não pelo id, para pegar quem pula etapa: um lead que sai da 4
   direto para a 7 atravessou as duas. */
function fronteirasCruzadas(funil, de, para) {
  if (para === PERDIDO) return [];

  const destino = funil.ordem[para];
  if (destino === undefined) return [];

  /* Origem fora deste funil (lead recém-criado ou vindo de outro funil)
     conta como começo do caminho. */
  const origem = de && funil.ordem[de] !== undefined && de !== PERDIDO && de !== GANHO
    ? funil.ordem[de]
    : -Infinity;

  const eventos = [];
  if (funil.mql !== null && origem < funil.mql && destino >= funil.mql) eventos.push('MQL');
  if (funil.sql !== null && origem < funil.sql && destino >= funil.sql) eventos.push('SQL');
  return eventos;
}

/* ============================================================
 * Lead
 * ============================================================ */
async function lerLead(base, cabecalho, leadId) {
  const r = await fetch(`${base}/leads/${leadId}?with=contacts`, { headers: cabecalho });
  if (!r.ok) throw new Error(`Kommo não leu o lead: HTTP ${r.status}`);
  const lead = await r.json();

  const campos = {};
  (lead.custom_fields_values || []).forEach(function (c) {
    const v = c.values && c.values[0];
    if (v) campos[c.field_name] = v.value;
  });

  const dados = {
    id: lead.id,
    criado: lead.created_at,
    fbc: campos['Meta fbc'] || '',
    fbp: campos['Meta fbp'] || '',
    cidade: campos['Cidade'] || '',
    telefone: campos['Telefone'] || '',
    nome: ''
  };

  const contatos = (lead._embedded && lead._embedded.contacts) || [];
  if (contatos.length) {
    const c = await fetch(`${base}/contacts/${contatos[0].id}`, { headers: cabecalho });
    if (c.ok) {
      const contato = await c.json();
      dados.nome = contato.first_name || contato.name || '';
      const fone = (contato.custom_fields_values || []).find(function (f) {
        return f.field_code === 'PHONE';
      });
      if (fone && fone.values && fone.values[0]) dados.telefone = fone.values[0].value;
    }
  }

  /* Leads anteriores a esta integração não têm o campo "Meta fbc", mas o
     fbclid ficou na nota da candidatura. A hora do clique vira a de criação
     do lead, que é minutos depois: para a Meta, basta. */
  if (!dados.fbc) {
    const fbclid = await fbclidDaNota(base, cabecalho, leadId);
    if (fbclid) dados.fbc = `fb.1.${dados.criado * 1000}.${fbclid}`;
  }

  return dados;
}

async function fbclidDaNota(base, cabecalho, leadId) {
  try {
    const r = await fetch(`${base}/leads/${leadId}/notes?limit=50`, { headers: cabecalho });
    if (!r.ok) return '';
    const corpo = await r.json();
    const notas = (corpo._embedded && corpo._embedded.notes) || [];
    for (const n of notas) {
      const texto = (n.params && n.params.text) || '';
      const achado = texto.match(/^fbclid: (\S+)$/m);
      if (achado) return achado[1];
    }
  } catch (err) {
    console.error('Erro ao ler as notas do lead', leadId, err);
  }
  return '';
}

/* ============================================================
 * Meta
 * ============================================================ */
function montarEvento(nome, lead) {
  const usuario = {
    /* O id do lead no Kommo, para a Meta reconhecer o mesmo lead entre o MQL
       e o SQL. */
    external_id: [hash(String(lead.id))],
    country: [hash('br')]
  };

  const telefone = telefoneMeta(lead.telefone);
  if (telefone) usuario.ph = [hash(telefone)];

  const primeiroNome = textoMeta(String(lead.nome).split(/\s+/)[0]);
  if (primeiroNome) usuario.fn = [hash(primeiroNome)];

  const cidade = textoMeta(lead.cidade);
  if (cidade) usuario.ct = [hash(cidade)];

  /* fbc e fbp vão como vieram: a Meta não aceita esses dois com hash. */
  if (lead.fbc) usuario.fbc = lead.fbc;
  if (lead.fbp) usuario.fbp = lead.fbp;

  return {
    event_name: nome,
    event_time: Math.floor(Date.now() / 1000),
    /* Mesmo id para o mesmo lead e evento: se o card voltar e avançar de
       novo, a Meta descarta a repetição. */
    event_id: `kommo-${lead.id}-${nome}`,
    action_source: 'system_generated',
    user_data: usuario,
    custom_data: {
      event_source: 'crm',
      lead_event_source: 'Kommo'
    }
  };
}

async function enviarMeta(token, eventos, codigoTeste) {
  const pixel = process.env.META_PIXEL_ID || PIXEL_PADRAO;
  const versao = process.env.META_API_VERSION || 'v23.0';

  const corpo = { data: eventos, access_token: token };
  const teste = codigoTeste || process.env.META_TEST_EVENT_CODE;
  if (teste) corpo.test_event_code = teste;

  const r = await fetch(`https://graph.facebook.com/${versao}/${pixel}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });

  const resposta = await r.json().catch(function () { return {}; });
  if (!r.ok) {
    throw new Error(`Meta recusou: HTTP ${r.status} ${JSON.stringify(resposta.error || resposta).slice(0, 300)}`);
  }
  return {
    recebidos: resposta.events_received,
    avisos: resposta.messages && resposta.messages.length ? resposta.messages : undefined,
    rastreio: resposta.fbtrace_id
  };
}

/* A Meta quer o telefone só com dígitos e com o código do país: 5532988677558.
   O Kommo guarda "+55 32 98867-7558", que é o formato da function kommo. */
function telefoneMeta(bruto) {
  let d = String(bruto || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? d : '';
}

/* Nome e cidade em minúsculas, sem acento, espaço nem pontuação, como a Meta
   pede antes do hash: "São João del-Rei" vira "saojoaodelrei". */
function textoMeta(texto) {
  return normalizar(texto || '').toLowerCase().replace(/[^a-z]/g, '');
}

function hash(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

/* Mesma normalização da function kommo: sem acento e em maiúsculas. */
function normalizar(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function resposta(statusCode, corpo) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(corpo)
  };
}
