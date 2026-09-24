/**
 * VIVA Eventos · coleta agendada do relatório de mídia.
 *
 * Roda de madrugada (horário no netlify.toml) e deixa o cache pronto para os
 * períodos que as pessoas costumam abrir: os últimos 30 dias, os últimos 7 e o
 * mês corrente. Assim o relatório abre instantâneo, e um problema de API
 * aparece no log da madrugada em vez de na frente de quem foi consultar.
 *
 * Não recebe requisição de ninguém: o Netlify a invoca pelo agendamento. Pode
 * ser disparada à mão pelo painel, em Functions, para testar.
 */

const { montarRelatorio, hojeBR } = require('./lib/dados');

exports.handler = async function () {
  const hoje = hojeBR(0);
  const periodos = [
    { de: hojeBR(-30), ate: hoje, nome: 'últimos 30 dias' },
    { de: hojeBR(-7), ate: hoje, nome: 'últimos 7 dias' },
    { de: hoje.slice(0, 8) + '01', ate: hoje, nome: 'mês corrente' }
  ];

  const loja = await armazem();
  const resultado = [];

  for (const p of periodos) {
    try {
      const dados = await montarRelatorio(p.de, p.ate);
      if (loja) await loja.setJSON(`relatorio-${p.de}-${p.ate}.json`, dados);
      resultado.push(`${p.nome}: ${dados.total.leads} leads, R$ ${dados.total.gasto}`);
    } catch (err) {
      /* Um período que falha não pode derrubar os outros. */
      console.error(`coleta falhou em ${p.nome}:`, err.message);
      resultado.push(`${p.nome}: ERRO ${err.message}`);
    }
  }

  console.log('coleta concluída |', resultado.join(' | '));
  return { statusCode: 200, body: resultado.join('\n') };
};

async function armazem() {
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('relatorios');
  } catch (err) {
    console.error('Blobs indisponível:', err.message);
    return null;
  }
}
