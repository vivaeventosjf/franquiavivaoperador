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
 *   META_TEST_EVENT_CODE  (temporária) código da aba "Eventos de teste". Com
 *                         ele os eventos aparecem só no teste. Apague depois.
 *   KOMMO_WEBHOOK_SEGREDO texto aleatório que vai no fim da URL do webhook
 *                         (?segredo=...). Sem ele a função recusa a chamada:
 *                         a URL é pública e qualquer um poderia inventar MQL.
 *   KOMMO_SUBDOMAIN, KOMMO_TOKEN, KOMMO_PIPELINE_ID: as mesmas da function
 *                         kommo
 */

const crypto = require('crypto');

const PIXEL_PADRAO = '1256090053167879';

/* Etapas fixas de todo funil do Kommo. */
const GANHO = 142;
const PERDIDO = 143;

/* Sobrevive entre invocações quentes: o funil quase nunca muda. */
const cacheFunis = {};

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return resposta(405, { ok: false, error: 'Use POST' });
  }

  const segredo = process.env.KOMMO_WEBHOOK_SEGREDO;
  const recebido = (event.queryStringParameters || {}).segredo;
  if (!segredo || recebido !== segredo) {
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

  const mudancas = lerWebhook(event);
  const funilExpansao = process.env.KOMMO_PIPELINE_ID
    ? Number(process.env.KOMMO_PIPELINE_ID)
    : null;

  const resultado = [];

  for (const m of mudancas) {
    /* Só o funil de expansão. Outros funis da conta ficam de fora. */
    if (funilExpansao && m.funil !== funilExpansao) continue;

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
  etapas.forEach(function (e) { ordem[e.id] = e.sort; });

  const mql = etapas.find(function (e) { return /\bMQL\b/.test(normalizar(e.name)); });
  const sql = etapas.find(function (e) { return /\bSQL\b/.test(normalizar(e.name)); });
  if (!mql || !sql) {
    console.error('Etapas de MQL ou SQL não encontradas no funil', funilId);
  }

  return (cacheFunis[funilId] = {
    ordem: ordem,
    mql: mql ? mql.sort : null,
    sql: sql ? sql.sort : null
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

async function enviarMeta(token, eventos) {
  const pixel = process.env.META_PIXEL_ID || PIXEL_PADRAO;
  const versao = process.env.META_API_VERSION || 'v23.0';

  const corpo = { data: eventos, access_token: token };
  if (process.env.META_TEST_EVENT_CODE) corpo.test_event_code = process.env.META_TEST_EVENT_CODE;

  const r = await fetch(`https://graph.facebook.com/${versao}/${pixel}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });

  const resposta = await r.json().catch(function () { return {}; });
  if (!r.ok) {
    throw new Error(`Meta recusou: HTTP ${r.status} ${JSON.stringify(resposta.error || resposta).slice(0, 300)}`);
  }
  return { recebidos: resposta.events_received };
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
