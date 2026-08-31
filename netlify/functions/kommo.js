/**
 * VIVA Eventos · ponte entre o formulário da landing e o Kommo.
 *
 * O token do Kommo NUNCA vai para o navegador: ele fica nas variáveis de
 * ambiente do Netlify e só é usado aqui, no servidor.
 *
 * Variáveis de ambiente necessárias (Netlify > Site settings > Environment):
 *   KOMMO_SUBDOMAIN   ex.: vivaeventos          (sem .kommo.com)
 *   KOMMO_TOKEN       token de longa duração da integração privada
 *   KOMMO_PIPELINE_ID (opcional) id do funil de destino
 *   KOMMO_STATUS_ID   (opcional) id da etapa de destino dentro do funil
 *   KOMMO_TAG         (opcional) etiqueta aplicada ao lead. Padrão: "Landing operador"
 */

const TAG_PADRAO = 'Landing operador';

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return resposta(405, { ok: false, error: 'Use POST' });
  }

  const subdominio = process.env.KOMMO_SUBDOMAIN;
  const token = process.env.KOMMO_TOKEN;
  if (!subdominio || !token) {
    console.error('KOMMO_SUBDOMAIN ou KOMMO_TOKEN não configurados');
    // 200 de propósito: a landing não deve travar se o CRM estiver fora do ar.
    return resposta(200, { ok: false, error: 'Integração não configurada' });
  }

  let dados;
  try {
    dados = JSON.parse(event.body || '{}');
  } catch (err) {
    return resposta(400, { ok: false, error: 'JSON inválido' });
  }

  const base = `https://${subdominio}.kommo.com/api/v4`;
  const cabecalho = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const nome = (dados.nome || '').trim() || 'Candidato sem nome';
  const telefone = (dados.whatsapp || '').trim();
  const praca = (dados.praca || '').trim();

  const lead = {
    name: `Operador · ${nome}${praca ? ' · ' + praca : ''}`,
    _embedded: {
      tags: [{ name: process.env.KOMMO_TAG || TAG_PADRAO }],
      contacts: [
        {
          first_name: nome,
          custom_fields_values: telefone
            ? [{ field_code: 'PHONE', values: [{ value: telefone, enum_code: 'WORK' }] }]
            : undefined
        }
      ]
    }
  };

  if (process.env.KOMMO_PIPELINE_ID) {
    lead.pipeline_id = Number(process.env.KOMMO_PIPELINE_ID);
  }
  if (process.env.KOMMO_STATUS_ID) {
    lead.status_id = Number(process.env.KOMMO_STATUS_ID);
  }

  try {
    const criacao = await fetch(`${base}/leads/complex`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([lead])
    });

    const corpo = await criacao.text();
    if (!criacao.ok) {
      console.error('Kommo recusou o lead:', criacao.status, corpo);
      return resposta(200, { ok: false, status: criacao.status, error: corpo.slice(0, 500) });
    }

    const criado = JSON.parse(corpo);
    const leadId = Array.isArray(criado) && criado[0] && criado[0].id;
    if (!leadId) {
      return resposta(200, { ok: true, aviso: 'Lead criado, mas sem id na resposta' });
    }

    // As respostas do formulário viram uma nota no lead, sem depender de
    // campos personalizados criados na mão dentro do Kommo.
    const nota = await fetch(`${base}/leads/${leadId}/notes`, {
      method: 'POST',
      headers: cabecalho,
      body: JSON.stringify([
        {
          note_type: 'common',
          params: { text: montarNota(dados) }
        }
      ])
    });

    if (!nota.ok) {
      console.error('Nota não gravada:', nota.status, await nota.text());
    }

    return resposta(200, { ok: true, lead_id: leadId });
  } catch (err) {
    console.error('Falha ao falar com o Kommo:', err);
    return resposta(200, { ok: false, error: String(err) });
  }
};

function montarNota(d) {
  const linhas = [
    ['Status', d.status],
    ['Classificação', d.classificacao],
    ['Pontos', d.pontos],
    ['Composição sugerida', d.composicao],
    ['Perfil', d.perfil],
    ['Histórico no mercado', d.experiencia],
    ['Capital próprio', d.capital],
    ['Praça', d.praca],
    ['Nome', d.nome],
    ['WhatsApp', d.whatsapp],
    ['Origem', d.origem]
  ];

  return linhas
    .filter(function (l) { return l[1] !== undefined && l[1] !== null && l[1] !== ''; })
    .map(function (l) { return l[0] + ': ' + l[1]; })
    .join('\n');
}

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function resposta(statusCode, corpo) {
  return {
    statusCode,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors()),
    body: JSON.stringify(corpo)
  };
}
