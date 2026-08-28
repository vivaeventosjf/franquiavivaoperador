/* ============================================================
 * VIVA Eventos · Candidatura de sócio-operador
 * Formulário de 8 etapas que qualifica o lead, sugere a
 * composição societária e envia para planilha + CRM.
 * Constantes de contato e integração vêm de config.js.
 * ============================================================ */
(function () {
  'use strict';

  /* ============================================================
   * Perfis (o valor é gravado na planilha, então não mude sem
   * ajustar os relatórios do time de expansão)
   * ============================================================ */
  var P_VEND_FORM = 'Vendedor(a) de empresa de formatura';
  var P_VEND_FOTO = 'Vendedor(a) de empresa de fotografia';
  var P_DONO_FORM = 'Dono(a) de empresa de formatura';
  var P_DONO_FOTO = 'Dono(a) de empresa de fotografia';
  var P_FORNEC = 'Dono(a) de fornecedora de eventos, salão ou buffet';
  var P_CERIM = 'Dono(a) de cerimonial, corporativo ou produtora de shows';
  var P_VEND_FORA = 'Vendedor(a) de outro mercado (fora de eventos)';
  var P_INVEST = 'Quero investir, mas não quero operar';

  /* ============================================================
   * Perguntas
   * ============================================================ */
  var QUESTIONS = [
    {
      id: 'perfil',
      type: 'choice',
      label: 'Qual dessas frases descreve você hoje?',
      hint: 'Essa resposta define o caminho das próximas perguntas.',
      options: [
        {
          val: P_VEND_FORM,
          score: 40,
          feedback: {
            title: 'É exatamente quem estamos procurando.',
            body: 'Você já senta com comissão, já conduz assembleia e já sabe o tamanho do contrato. Falta só <span class="hl">o contrato ser seu</span>.'
          }
        },
        {
          val: P_VEND_FOTO,
          score: 38,
          feedback: {
            title: 'Perfil prioritário.',
            body: 'Você disputa a mesma sala e os mesmos decisores, mas hoje captura <span class="hl">uma fatia pequena</span> do orçamento da turma. Operando uma unidade VIVA, você entra no centro do jogo.'
          }
        },
        {
          val: P_DONO_FORM,
          score: 34,
          feedback: {
            title: 'Dá pra trocar de patamar sem começar do zero.',
            body: 'A sua estrutura e a sua carteira continuam valendo. O que muda é a marca, o método e o poder de compra que passam a estar do seu lado.'
          }
        },
        {
          val: P_DONO_FOTO,
          score: 32,
          feedback: {
            title: 'Você já está dentro da formatura.',
            body: 'Só que como coadjuvante, dependendo de indicação. A unidade VIVA te coloca no controle da cadeia inteira.'
          }
        },
        { val: P_FORNEC, score: 26 },
        { val: P_CERIM, score: 16 },
        { val: P_VEND_FORA, score: 12 },
        {
          val: P_INVEST,
          score: 0,
          feedback: {
            title: 'Entendido, vamos encurtar o caminho.',
            body: 'Vamos pular as perguntas de operação e te direcionar para o modelo de <span class="hl">investidor não operador</span>.'
          }
        }
      ]
    },
    {
      id: 'experiencia',
      type: 'choice',
      onlyOperador: true,
      label: 'Qual o seu histórico no mercado de formaturas?',
      hint: 'Vale experiência em formatura ou em fotografia de formatura.',
      options: [
        { val: 'Nunca vendi formatura', score: 2 },
        { val: 'Menos de 2 anos no mercado', score: 7 },
        { val: 'De 2 a 5 anos, fechando turmas com regularidade', score: 14 },
        {
          val: 'Mais de 5 anos, com carteira e reputação na minha praça',
          score: 20,
          feedback: {
            title: 'Isso é ativo, não currículo.',
            body: 'Cinco anos de praça significam relacionamento com faculdade, comissão e fornecedor. É <span class="hl">o que o dinheiro sozinho não compra</span>.'
          }
        }
      ]
    },
    {
      id: 'papel',
      type: 'choice',
      onlyOperador: true,
      label: 'Você é mais porta pra fora ou porta pra dentro?',
      hint: 'Porta pra fora é prospecção e fechamento. Porta pra dentro é pós-venda, produção e relacionamento com a turma.',
      options: [
        { val: 'Porta pra fora: vendas e fechamento', score: 14 },
        { val: 'Porta pra dentro: pós-venda e operação', score: 10 },
        {
          val: 'Faço as duas coisas',
          score: 16,
          feedback: {
            title: 'Raro e valioso.',
            body: 'Quem transita nas duas frentes entende a unidade inteira. Isso pesa muito na aprovação.'
          }
        }
      ]
    },
    {
      id: 'capital',
      type: 'choice',
      label: 'Quanto de capital próprio você consegue colocar hoje?',
      hint: 'Responda sem medo. Nessas unidades o investidor já cobre a maior parte — isso aqui só ajuda a desenhar a sociedade.',
      options: [
        {
          val: 'Nada agora, entro só com trabalho',
          score: 4,
          feedback: {
            title: 'Isso não te elimina.',
            body: 'Existem composições em que o operador entra <span class="hl">sem capital</span>, remunerado por pró-labore e participação. O que não pode faltar é experiência e dedicação.'
          }
        },
        { val: 'Até R$ 20 mil', score: 8 },
        { val: 'De R$ 20 mil a R$ 50 mil', score: 12 },
        { val: 'De R$ 50 mil a R$ 100 mil', score: 15 },
        {
          val: 'Acima de R$ 100 mil',
          score: 18,
          feedback: {
            title: 'Com esse capital você tem mais opções.',
            body: 'Dá pra desenhar uma sociedade com participação maior e menos diluição.'
          }
        }
      ]
    },
    {
      id: 'dedicacao',
      type: 'choice',
      onlyOperador: true,
      label: 'Como e quando você entraria na operação?',
      options: [
        { val: 'Dedicação integral, começando imediatamente', score: 20 },
        { val: 'Integral, depois de uma transição de até 90 dias', score: 15 },
        { val: 'Integral, mas só daqui a 6 meses ou mais', score: 8 },
        {
          val: 'Meio período, mantendo meu trabalho atual',
          score: 2,
          feedback: {
            title: 'Vamos ser honestos aqui.',
            body: 'Unidade VIVA não roda nas horas vagas. Você pode seguir respondendo, mas a aprovação exige <span class="hl">dedicação integral</span> do operador.'
          }
        }
      ]
    },
    {
      id: 'praca',
      type: 'text',
      label: 'Em qual cidade você quer operar?',
      hint: 'Cidade e estado. Vamos checar se a praça está aberta no mapa de expansão.',
      placeholder: 'Ex: Maceió — AL'
    },
    {
      id: 'nome',
      type: 'text',
      label: 'Como a gente te chama?',
      placeholder: 'Seu nome completo'
    },
    {
      id: 'whatsapp',
      type: 'phone',
      label: 'Por último: qual o seu WhatsApp?',
      hint: 'É por aqui que o time de expansão vai te procurar. Nada de ligação surpresa.',
      placeholder: '(00) 00000-0000'
    }
  ];

  /* ============================================================
   * Estado
   * ============================================================ */
  var answers = {};
  var current = 0;
  var finished = false;
  var elCount, elBar, elBody, elFoot, elCard;

  /* ============================================================
   * Helpers
   * ============================================================ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ehInvestidor() { return answers.perfil === P_INVEST; }

  /* Quem só quer investir não responde as perguntas de operação. */
  function activeQuestions() {
    if (!ehInvestidor()) return QUESTIONS;
    return QUESTIONS.filter(function (q) { return !q.onlyOperador; });
  }

  function total() { return activeQuestions().length; }
  function questionAt(i) { return activeQuestions()[i]; }

  function isAnswered(q) {
    var v = answers[q.id];
    if (q.type === 'phone') {
      return typeof v === 'string' && v.replace(/\D/g, '').length >= 10;
    }
    if (q.type === 'text') {
      return typeof v === 'string' && v.trim().length >= 2;
    }
    return typeof v === 'string' && v.trim().length > 0;
  }

  function maskPhone(value) {
    var d = value.replace(/\D/g, '').slice(0, 11);
    if (d.length === 0) return '';
    if (d.length <= 2) return '(' + d;
    var split = d.length > 10 ? 7 : 6;
    if (d.length <= split) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, split) + '-' + d.slice(split);
  }

  function primeiroNome() {
    return (answers.nome || '').trim().split(/\s+/)[0] || '';
  }

  function optionOf(q, val) {
    if (!q.options) return null;
    for (var i = 0; i < q.options.length; i++) {
      if (q.options[i].val === val) return q.options[i];
    }
    return null;
  }

  /* ============================================================
   * Pontuação e classificação
   * ============================================================ */
  function pontos() {
    var soma = 0;
    activeQuestions().forEach(function (q) {
      var opt = optionOf(q, answers[q.id]);
      if (opt && typeof opt.score === 'number') soma += opt.score;
    });
    return soma;
  }

  function classificar() {
    if (ehInvestidor()) return 'Investidor (não operador)';
    /* Nota máxima possível: 40 + 20 + 16 + 18 + 20 = 114 */
    var p = pontos();
    if (p >= 82) return 'A · Prioridade máxima';
    if (p >= 62) return 'B · Alta';
    if (p >= 42) return 'C · Média';
    return 'D · Fora do perfil prioritário';
  }

  /* Sugere a composição societária (as combinações oficiais da expansão). */
  function composicao() {
    if (ehInvestidor()) {
      return {
        chip: 'Investidor não operador',
        titulo: 'A sua entrada é pelo capital, não pela operação.',
        texto: 'A VIVA estrutura o time operador, você acompanha os resultados. O time vai te apresentar as praças com operador já aprovado esperando capital.'
      };
    }

    var posVenda = answers.papel === 'Porta pra dentro: pós-venda e operação';
    var ambas = answers.papel === 'Faço as duas coisas';
    var capitalAlto = answers.capital === 'De R$ 50 mil a R$ 100 mil' ||
      answers.capital === 'Acima de R$ 100 mil';

    if (ambas) {
      return {
        chip: 'Operação completa + investidor',
        titulo: 'Você cobre as duas frentes da unidade.',
        texto: 'Vendas e pós-venda na mesma cabeça é o perfil mais disputado da expansão. O investidor completa o capital e a VIVA ajuda a montar o time abaixo de você.'
      };
    }
    if (posVenda) {
      return capitalAlto ? {
        chip: 'Sócio de pós-venda + gerente de vendas',
        titulo: 'Você assume a porta pra dentro, com capital próprio.',
        texto: 'Com o seu capital, a unidade dispensa aporte externo e a VIVA estrutura com você a contratação da frente comercial.'
      } : {
        chip: 'Sócio de pós-venda + investidor + gerente de vendas',
        titulo: 'Você assume a porta pra dentro da unidade.',
        texto: 'O investidor entra com o capital e a VIVA estrutura com você a contratação da frente comercial.'
      };
    }
    return {
      chip: 'Sócio de vendas + investidor + gerente de pós-venda',
      titulo: 'É exatamente a vaga que está aberta.',
      texto: 'Você assume a frente comercial, o investidor entra com o capital e a VIVA ajuda a montar a gerência de pós-venda da unidade.'
    };
  }

  /* ============================================================
   * Progresso
   * ============================================================ */
  function updateProgress() {
    var t = total();
    if (finished) {
      elCount.textContent = 'CANDIDATURA ENVIADA';
      elBar.style.width = '100%';
      return;
    }
    elCount.textContent = 'PERGUNTA ' + (current + 1) + ' DE ' + t;
    var pct = (current / t) * 100;
    if (current === 0) pct = Math.max(pct, 4);
    elBar.style.width = pct + '%';
  }

  /* ============================================================
   * Render
   * ============================================================ */
  function render(direction) {
    if (finished) return;

    var q = questionAt(current);
    var html = '<h3 class="quiz-q">' + escapeHtml(q.label) + '</h3>';
    if (q.hint) html += '<p class="quiz-hint">' + escapeHtml(q.hint) + '</p>';

    if (q.type === 'text' || q.type === 'phone') {
      var val = answers[q.id] ? escapeHtml(answers[q.id]) : '';
      var inputType = q.type === 'phone' ? 'tel' : 'text';
      var inputMode = q.type === 'phone' ? ' inputmode="tel"' : '';
      html +=
        '<input class="quiz-input" type="' + inputType + '"' + inputMode +
        ' id="quizField" placeholder="' + escapeHtml(q.placeholder || '') +
        '" value="' + val + '" autocomplete="off">';
    } else {
      html += '<div class="quiz-options">';
      q.options.forEach(function (opt, i) {
        var sel = answers[q.id] === opt.val ? ' selected' : '';
        html +=
          '<button type="button" class="quiz-opt' + sel + '" data-idx="' + i + '">' +
          '<span class="radio"></span><span>' + escapeHtml(opt.val) + '</span></button>';
      });
      html += '</div><div class="quiz-feedback-slot"></div>';
    }

    elBody.innerHTML = html;

    elBody.classList.remove('quiz-anim', 'quiz-anim-back');
    void elBody.offsetWidth;
    elBody.classList.add(direction === 'back' ? 'quiz-anim-back' : 'quiz-anim');

    bindBody(q);
    renderFeedback(q);
    renderFooter();
    updateProgress();

    var field = document.getElementById('quizField');
    if (field && current > 0) {
      try { field.focus({ preventScroll: true }); } catch (e) { /* navegador antigo */ }
    }
  }

  function bindBody(q) {
    if (q.type === 'text' || q.type === 'phone') {
      var field = document.getElementById('quizField');
      if (!field) return;

      field.addEventListener('input', function () {
        answers[q.id] = q.type === 'phone' ? (field.value = maskPhone(field.value)) : field.value;
        updateNextState();
      });

      field.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (isAnswered(q)) next();
      });
      return;
    }

    Array.prototype.forEach.call(elBody.querySelectorAll('.quiz-opt'), function (btn) {
      btn.addEventListener('click', function () {
        selectOption(q, parseInt(btn.getAttribute('data-idx'), 10));
      });
    });
  }

  function selectOption(q, idx) {
    var opt = q.options[idx];
    answers[q.id] = opt.val;

    Array.prototype.forEach.call(elBody.querySelectorAll('.quiz-opt'), function (btn) {
      btn.classList.toggle('selected', parseInt(btn.getAttribute('data-idx'), 10) === idx);
    });

    renderFeedback(q);
    updateNextState();
    updateProgress();
  }

  function renderFeedback(q) {
    if (q.type !== 'choice') return;
    var slot = elBody.querySelector('.quiz-feedback-slot');
    if (!slot) return;

    var opt = optionOf(q, answers[q.id]);
    slot.innerHTML = (opt && opt.feedback)
      ? '<div class="quiz-feedback"><div class="fb-title">' + opt.feedback.title +
        '</div><div class="fb-body">' + opt.feedback.body + '</div></div>'
      : '';
  }

  /* ============================================================
   * Rodapé
   * ============================================================ */
  function renderFooter() {
    var q = questionAt(current);
    var hasBack = current > 0;
    var isLast = current === total() - 1;

    var html = hasBack ? '<button type="button" class="quiz-back">← Voltar</button>' : '';
    html += '<button type="button" class="quiz-next"' + (isAnswered(q) ? '' : ' disabled') + '>' +
      (isLast ? 'Enviar candidatura →' : 'Próxima →') + '</button>';

    elFoot.className = hasBack ? 'quiz-foot' : 'quiz-foot only-next';
    elFoot.innerHTML = html;

    var backBtn = elFoot.querySelector('.quiz-back');
    if (backBtn) backBtn.addEventListener('click', back);

    var nextBtn = elFoot.querySelector('.quiz-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        if (!nextBtn.disabled) next();
      });
    }
  }

  function updateNextState() {
    var nextBtn = elFoot.querySelector('.quiz-next');
    if (nextBtn) nextBtn.disabled = !isAnswered(questionAt(current));
  }

  /* ============================================================
   * Navegação
   * ============================================================ */
  function next() {
    if (!isAnswered(questionAt(current))) return;
    if (current === total() - 1) { finish(); return; }
    current++;
    render('next');
  }

  function back() {
    if (current === 0) return;
    current--;
    render('back');
  }

  /* ============================================================
   * Tela final
   * ============================================================ */
  function finish() {
    finished = true;
    submitLead();

    var comp = composicao();
    var nome = primeiroNome();
    var classe = classificar();
    var frio = classe.charAt(0) === 'D';

    var wa = 'https://wa.me/' + (typeof WHATS !== 'undefined' ? WHATS : '') +
      '?text=' + encodeURIComponent(mensagemWhats());

    var checkSvg = '<div class="check"><svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5"/></svg></div>';
    var html = '<div class="quiz-done">' + checkSvg;

    if (frio) {
      html +=
        '<h3>Recebemos, ' + escapeHtml(nome) + '. <span class="marker">obrigado.</span></h3>' +
        '<p>Pelo que você respondeu, o seu perfil ainda não é o prioritário desta chamada, ' +
        'que busca operadores com experiência de vendas no mercado de formaturas e dedicação integral. ' +
        'A sua candidatura fica no nosso banco e, se a sua praça abrir para outro formato, o time te procura.</p>' +
        '<p>Enquanto isso, vale conhecer a rede por dentro:</p>' +
        '<div class="quiz-final-cta">' +
        '<a class="btn btn-primary btn-lg" href="' + escapeHtml(typeof FRANQUIAS_URL !== 'undefined' ? FRANQUIAS_URL : '#') + '" target="_blank" rel="noopener">Ver o site de franquias</a>' +
        '<a class="btn btn-ghost btn-lg" href="' + escapeHtml(typeof DEPOIMENTOS_URL !== 'undefined' ? DEPOIMENTOS_URL : '#') + '" target="_blank" rel="noopener">Ler os depoimentos</a>' +
        '</div>';
    } else {
      html +=
        '<span class="quiz-stage-chip">Composição sugerida: <b>' + escapeHtml(comp.chip) + '</b></span>' +
        '<h3 style="margin-top:20px">' + escapeHtml(comp.titulo) + '</h3>' +
        '<p>' + escapeHtml(comp.texto) + '</p>' +
        '<p><strong>' + escapeHtml(nome) + '</strong>, a sua candidatura para <strong>' +
        escapeHtml(answers.praca || 'a sua praça') + '</strong> chegou ao time de expansão. ' +
        'Vamos checar a disponibilidade da praça e te chamar no WhatsApp que você deixou.</p>' +
        '<div class="quiz-next-steps">' +
        '<h4>O que acontece agora</h4><ul>' +
        '<li><b>1</b><span>Triagem do seu perfil e da sua cidade — até 48h úteis.</span></li>' +
        '<li><b>2</b><span>Conversa de alinhamento sobre modelo e sociedade.</span></li>' +
        '<li><b>3</b><span>Apresentação dos números, do contrato e da COF.</span></li>' +
        '</ul></div>' +
        '<div class="quiz-final-cta">' +
        '<a class="btn btn-primary btn-lg" href="' + wa + '" target="_blank" rel="noopener">Adiantar a conversa no WhatsApp</a>' +
        '<a class="btn btn-ghost btn-lg" href="#estrutura">Rever o que a VIVA entrega</a>' +
        '</div>';
    }

    html += '</div>';

    elBody.innerHTML = html;
    elBody.classList.remove('quiz-anim', 'quiz-anim-back');
    void elBody.offsetWidth;
    elBody.classList.add('quiz-anim');
    elFoot.innerHTML = '';
    elFoot.className = 'quiz-foot';
    updateProgress();

    if (elCard && elCard.scrollIntoView) {
      elCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    /* Ganchos de conversão (Meta Pixel / GA4), se existirem na página. */
    try { if (typeof fbq === 'function') fbq('track', 'Lead'); } catch (err) { /* sem pixel */ }
    try {
      if (window.dataLayer && window.dataLayer.push) {
        window.dataLayer.push({
          event: 'candidatura_operador',
          perfil: answers.perfil,
          classificacao: classe,
          pontos: pontos()
        });
      }
    } catch (err) { /* sem GTM */ }
  }

  function mensagemWhats() {
    return 'Oi! Acabei de me candidatar a sócio-operador da VIVA.\n' +
      'Nome: ' + (answers.nome || '') + '\n' +
      'Perfil: ' + (answers.perfil || '') + '\n' +
      'Praça: ' + (answers.praca || '') + '\n' +
      'Entrada: ' + (answers.dedicacao || '');
  }

  /* ============================================================
   * Envio (planilha + CRM)
   * ============================================================ */
  var enviado = false;

  function payload(status) {
    return {
      status: status,
      classificacao: classificar(),
      pontos: pontos(),
      composicao: composicao().chip,
      perfil: answers.perfil || '',
      experiencia: answers.experiencia || '',
      papel: answers.papel || '',
      capital: answers.capital || '',
      dedicacao: answers.dedicacao || '',
      praca: answers.praca || '',
      nome: answers.nome || '',
      whatsapp: answers.whatsapp || '',
      origem: window.location.href
    };
  }

  function post(url, body) {
    if (!url) return;
    try {
      fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body
      });
    } catch (e) { /* silencioso: não trava o fluxo */ }
  }

  function submitLead() {
    if (enviado) return;
    enviado = true;
    var body = JSON.stringify(payload('Completo'));
    post(typeof SHEET_URL !== 'undefined' ? SHEET_URL : '', body);
    post(typeof CRM_URL !== 'undefined' ? CRM_URL : '', body);
  }

  /* Lead parcial: saiu no meio, mas já deixou WhatsApp válido. */
  function submitParcial() {
    if (enviado) return;
    if ((answers.whatsapp || '').replace(/\D/g, '').length < 10) return;
    enviado = true;

    var body = JSON.stringify(payload('Parcial (abandonou)'));
    var sheet = typeof SHEET_URL !== 'undefined' ? SHEET_URL : '';
    var crm = typeof CRM_URL !== 'undefined' ? CRM_URL : '';

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
        if (sheet) navigator.sendBeacon(sheet, blob);
        if (crm) navigator.sendBeacon(crm, blob);
        return;
      }
    } catch (e) { /* cai no fetch abaixo */ }

    post(sheet, body);
    post(crm, body);
  }

  /* ============================================================
   * Init
   * ============================================================ */
  function init() {
    elCard = document.getElementById('quizCard');
    elCount = document.getElementById('quizCount');
    elBar = document.getElementById('quizBar');
    elBody = document.getElementById('quizBody');
    elFoot = document.getElementById('quizFoot');
    if (!elCount || !elBar || !elBody || !elFoot) return;

    render('next');
    window.addEventListener('pagehide', submitParcial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
