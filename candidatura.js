/* ============================================================
 * VIVA Eventos · Candidatura de sócio-operador
 * Formulário de 6 etapas que qualifica o lead, sugere a
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
      id: 'nome',
      type: 'text',
      label: 'Primeiro, como a gente te chama?',
      placeholder: 'Seu nome completo'
    },
    {
      id: 'whatsapp',
      type: 'phone',
      label: 'E o seu WhatsApp?',
      hint: 'É por aqui que o time de expansão vai te procurar. Nada de ligação surpresa.',
      placeholder: '(00) 00000-0000'
    },
    {
      id: 'praca',
      type: 'text',
      label: 'Em qual cidade você quer operar?',
      hint: 'Cidade e estado. Vamos checar se a praça está aberta no mapa de expansão.',
      placeholder: 'Ex: Maceió, AL'
    },
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
            body: 'Você já senta com comissão, já apresenta proposta e já sabe o tamanho do contrato. Falta só <span class="hl">o contrato ser seu</span>.'
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
      id: 'capital',
      type: 'choice',
      label: 'Que valor você conseguiria entrar como sócio hoje?',
      hint: 'O investidor cobre a maior parte. A sua entrada é simbólica: serve para você ser sócio de verdade, não para bancar a unidade.',
      options: [
        {
          val: 'Nada agora, entro só com trabalho',
          score: 6,
          feedback: {
            title: 'Isso não te elimina.',
            body: 'Existem composições em que o operador entra <span class="hl">sem capital nenhum</span>, remunerado por pró-labore e participação. Mas se der para colocar uma parte, ainda que pequena, a sua fatia da sociedade fica maior.'
          }
        },
        {
          val: 'Até R$ 5 mil',
          score: 12,
          feedback: {
            title: 'Já resolve.',
            body: 'É esse tipo de entrada que a gente chama de <span class="hl">participação mínima</span>: pouca grana, mas pele no jogo.'
          }
        },
        { val: 'De R$ 5 mil a R$ 15 mil', score: 15 },
        { val: 'De R$ 15 mil a R$ 40 mil', score: 17 },
        {
          val: 'Acima de R$ 40 mil',
          score: 18,
          feedback: {
            title: 'Com esse valor você tem mais opções.',
            body: 'Dá pra desenhar uma sociedade com participação maior e menos diluição.'
          }
        }
      ]
    }
  ];

  /* ============================================================
   * Estado
   * ============================================================ */
  var answers = {};
  var current = 0;
  var finished = false;
  var elCount, elBar, elBody, elFoot, elCard, elStart;

  /* ============================================================
   * URLs de etapa (para GA4, Meta Pixel e metas de conversão)
   *   #formulario  -> abriu o formulário
   *   #obrigado    -> concluiu a candidatura
   * ============================================================ */
  var HASH_INICIO = '#formulario';
  var HASH_FIM = '#obrigado';

  function marcarUrl(hash) {
    try {
      if (window.history && window.history.pushState) {
        window.history.pushState({ etapa: hash }, '', hash);
      } else {
        window.location.hash = hash;
      }
    } catch (e) { /* navegador antigo: segue sem alterar a URL */ }

    try {
      if (window.dataLayer && window.dataLayer.push) {
        window.dataLayer.push({ event: 'pageview_virtual', page_path: hash });
      }
    } catch (e) { /* sem GTM */ }
  }

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

  /* ============================================================
   * Rastreamento de origem
   * Os parâmetros vêm na URL do anúncio e são guardados na sessão, para
   * sobreviverem à troca de hash (#formulario, #obrigado) e a qualquer
   * navegação interna antes do envio.
   * ============================================================ */
  var UTM_CHAVES = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'fbclid'
  ];

  function rastreamento() {
    var guardado = {};
    try {
      guardado = JSON.parse(sessionStorage.getItem('viva_rastreio') || '{}');
    } catch (e) {
      guardado = {};
    }

    try {
      var params = new URLSearchParams(window.location.search);
      UTM_CHAVES.forEach(function (chave) {
        var valor = params.get(chave);
        if (valor) guardado[chave] = valor.slice(0, 200);
      });
    } catch (e) { /* navegador antigo: segue com o que já tinha */ }

    if (!guardado.landing) {
      guardado.landing = window.location.href.split('#')[0];
    }
    if (!guardado.referrer && document.referrer) {
      guardado.referrer = document.referrer.slice(0, 300);
    }

    try {
      sessionStorage.setItem('viva_rastreio', JSON.stringify(guardado));
    } catch (e) { /* aba anônima com storage bloqueado */ }

    return guardado;
  }

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
    /* Nota máxima possível: 40 + 20 + 18 = 78 */
    var p = pontos();
    if (p >= 56) return 'A · Prioridade máxima';
    if (p >= 42) return 'B · Alta';
    if (p >= 29) return 'C · Média';
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

    var capitalAlto = answers.capital === 'De R$ 15 mil a R$ 40 mil' ||
      answers.capital === 'Acima de R$ 40 mil';

    if (capitalAlto) {
      return {
        chip: 'Sócio operador com capital próprio',
        titulo: 'Você chega com mais poder de negociação.',
        texto: 'Com a sua entrada de capital dá pra desenhar uma sociedade com participação maior e menos diluição, além da remuneração pela operação.'
      };
    }
    return {
      chip: 'Sócio operador + investidor',
      titulo: 'É exatamente a vaga que está aberta.',
      texto: 'Você assume a operação da unidade, o investidor entra com o capital e a VIVA ajuda a montar o time abaixo de você.'
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
    marcarUrl(HASH_FIM);

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
        '<h3>' + escapeHtml(comp.titulo) + '</h3>' +
        '<p>' + escapeHtml(comp.texto) + '</p>' +
        '<p><strong>Obrigado, ' + escapeHtml(nome) + '.</strong> A sua candidatura para <strong>' +
        escapeHtml(answers.praca || 'a sua praça') + '</strong> chegou ao time de expansão da VIVA.</p>' +
        '<div class="quiz-next-steps">' +
        '<h4>O que acontece agora</h4><ul>' +
        '<li><b>1</b><span>Triagem do seu perfil e da sua cidade, em até 48h úteis.</span></li>' +
        '<li><b>2</b><span>Conversa de alinhamento sobre modelo e sociedade.</span></li>' +
        '<li><b>3</b><span>Apresentação dos números, do contrato e da COF.</span></li>' +
        '</ul></div>' +
        '<p class="quiz-aviso">Nossa equipe entra em contato pelo WhatsApp <strong>' +
        escapeHtml(answers.whatsapp || '') + '</strong>. Se preferir não esperar, ' +
        'fale com a gente agora mesmo, é o caminho mais rápido.</p>' +
        '<div class="quiz-final-cta">' +
        '<a class="btn btn-wa btn-lg" href="' + wa + '" target="_blank" rel="noopener">' + iconeWhats() + ' Falar agora no WhatsApp</a>' +
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

  function iconeWhats() {
    return '<svg class="ico-wa" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 2.5c-5.24 0-9.5 4.26-9.5 9.5 0 1.68.44 3.32 1.28 4.77L2.5 21.5l4.86-1.27c1.39.76 2.96 1.16 4.55 1.16h.01c5.24 0 9.5-4.26 9.5-9.5s-4.26-9.5-9.5-9.5zm0 17.4h-.01c-1.42 0-2.81-.38-4.02-1.1l-.29-.17-2.99.78.8-2.91-.19-.3a7.87 7.87 0 01-1.21-4.2c0-4.36 3.55-7.9 7.91-7.9 2.11 0 4.09.82 5.58 2.32a7.84 7.84 0 012.31 5.59c0 4.36-3.55 7.9-7.9 7.9z"/></svg>';
  }

  function mensagemWhats() {
    return 'Oi! Acabei de me candidatar a sócio-operador da VIVA.\n' +
      'Nome: ' + (answers.nome || '') + '\n' +
      'Perfil: ' + (answers.perfil || '') + '\n' +
      'Praça: ' + (answers.praca || '');
  }

  /* ============================================================
   * Envio (planilha + CRM)
   * ============================================================ */
  var enviado = false;

  function payload(status) {
    var rastreio = rastreamento();

    return {
      status: status,
      classificacao: classificar(),
      pontos: pontos(),
      perfil: answers.perfil || '',
      experiencia: answers.experiencia || '',
      capital: answers.capital || '',
      praca: answers.praca || '',
      nome: answers.nome || '',
      whatsapp: answers.whatsapp || '',
      origem: rastreio.landing || window.location.href,
      referrer: rastreio.referrer || '',
      utm_source: rastreio.utm_source || '',
      utm_medium: rastreio.utm_medium || '',
      utm_campaign: rastreio.utm_campaign || '',
      utm_content: rastreio.utm_content || '',
      utm_term: rastreio.utm_term || '',
      gclid: rastreio.gclid || '',
      fbclid: rastreio.fbclid || ''
    };
  }

  function post(url, body) {
    if (!url) return;

    /* A Netlify Function é mesma origem e aceita JSON. O Apps Script exige
       no-cors com text/plain, senão o preflight derruba o envio. */
    var mesmaOrigem = url.charAt(0) === '/';

    try {
      fetch(url, {
        method: 'POST',
        mode: mesmaOrigem ? 'same-origin' : 'no-cors',
        keepalive: true,
        headers: {
          'Content-Type': mesmaOrigem ? 'application/json' : 'text/plain;charset=utf-8'
        },
        body: body
      }).catch(function () { /* CRM fora do ar não pode travar a landing */ });
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
   * Abertura do formulário
   * ============================================================ */
  var aberto = false;

  function abrir(comScroll) {
    if (aberto) return;
    aberto = true;

    if (elStart) elStart.hidden = true;
    if (elCard) elCard.hidden = false;

    render('next');
    marcarUrl(HASH_INICIO);

    try { if (typeof fbq === 'function') fbq('track', 'InitiateCheckout'); } catch (e) { /* sem pixel */ }

    if (comScroll && elCard && elCard.scrollIntoView) {
      elCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }


  /* ============================================================
   * Gate do WhatsApp
   * O botão flutuante não manda direto para o wa.me: primeiro
   * captura nome, WhatsApp e perfil, grava o lead e só então
   * abre a conversa. Quem já concluiu o formulário passa direto.
   * ============================================================ */
  var GATE_IDS = ['nome', 'whatsapp', 'perfil'];
  var gateAnswers = {};
  var gateIdx = 0;
  var gateEl = null;
  var gateEnviado = false;

  function gateQuestions() {
    var lista = [];
    GATE_IDS.forEach(function (id) {
      for (var i = 0; i < QUESTIONS.length; i++) {
        if (QUESTIONS[i].id === id) { lista.push(QUESTIONS[i]); return; }
      }
    });
    return lista;
  }

  function gateRespondida(q) {
    var v = gateAnswers[q.id];
    if (q.type === 'phone') return typeof v === 'string' && v.replace(/\D/g, '').length >= 10;
    if (q.type === 'text') return typeof v === 'string' && v.trim().length >= 2;
    return typeof v === 'string' && v.trim().length > 0;
  }

  function gateLink() {
    var msg = 'Oi! Vim pela página de operadores da VIVA.\n' +
      'Nome: ' + (gateAnswers.nome || '') + '\n' +
      'Perfil: ' + (gateAnswers.perfil || '');
    return 'https://wa.me/' + (typeof WHATS !== 'undefined' ? WHATS : '') +
      '?text=' + encodeURIComponent(msg);
  }

  function gateEnviar() {
    if (gateEnviado) return;
    gateEnviado = true;

    var rastreio = rastreamento();
    var body = JSON.stringify({
      status: 'WhatsApp (contato direto)',
      classificacao: 'Contato via WhatsApp',
      pontos: 0,
      perfil: gateAnswers.perfil || '',
      experiencia: '',
      capital: '',
      praca: '',
      nome: gateAnswers.nome || '',
      whatsapp: gateAnswers.whatsapp || '',
      origem: rastreio.landing || window.location.href,
      referrer: rastreio.referrer || '',
      utm_source: rastreio.utm_source || '',
      utm_medium: rastreio.utm_medium || '',
      utm_campaign: rastreio.utm_campaign || '',
      utm_content: rastreio.utm_content || '',
      utm_term: rastreio.utm_term || '',
      gclid: rastreio.gclid || '',
      fbclid: rastreio.fbclid || ''
    });
    post(typeof SHEET_URL !== 'undefined' ? SHEET_URL : '', body);
    post(typeof CRM_URL !== 'undefined' ? CRM_URL : '', body);

    try { if (typeof fbq === 'function') fbq('track', 'Contact'); } catch (e) { /* sem pixel */ }
    try {
      if (window.dataLayer && window.dataLayer.push) {
        window.dataLayer.push({ event: 'lead_whatsapp', perfil: gateAnswers.perfil });
      }
    } catch (e) { /* sem GTM */ }
  }

  function gateEsc(e) {
    if (e.key === 'Escape') gateFechar();
  }

  function gateFechar() {
    if (!gateEl) return;
    document.removeEventListener('keydown', gateEsc);
    if (gateEl.parentNode) gateEl.parentNode.removeChild(gateEl);
    gateEl = null;
  }

  function gateRender() {
    var perguntas = gateQuestions();
    var q = perguntas[gateIdx];
    var ultima = gateIdx === perguntas.length - 1;

    var html = '<h3 class="quiz-q">' + escapeHtml(q.label) + '</h3>';
    if (q.hint) html += '<p class="quiz-hint">' + escapeHtml(q.hint) + '</p>';

    if (q.type === 'text' || q.type === 'phone') {
      var val = gateAnswers[q.id] ? escapeHtml(gateAnswers[q.id]) : '';
      html += '<input class="quiz-input" type="' + (q.type === 'phone' ? 'tel' : 'text') + '"' +
        (q.type === 'phone' ? ' inputmode="tel"' : '') +
        ' id="gateField" placeholder="' + escapeHtml(q.placeholder || '') +
        '" value="' + val + '" autocomplete="off">';
    } else {
      html += '<div class="quiz-options">';
      q.options.forEach(function (opt, i) {
        html += '<button type="button" class="quiz-opt' +
          (gateAnswers[q.id] === opt.val ? ' selected' : '') +
          '" data-idx="' + i + '"><span class="radio"></span><span>' +
          escapeHtml(opt.val) + '</span></button>';
      });
      html += '</div>';
    }

    var body = gateEl.querySelector('.gate-body');
    var foot = gateEl.querySelector('.gate-foot');

    body.innerHTML = html;
    body.classList.remove('quiz-anim');
    void body.offsetWidth;
    body.classList.add('quiz-anim');

    foot.className = gateIdx > 0 ? 'quiz-foot gate-foot' : 'quiz-foot only-next gate-foot';
    foot.innerHTML =
      (gateIdx > 0 ? '<button type="button" class="quiz-back">← Voltar</button>' : '') +
      '<button type="button" class="quiz-next"' + (gateRespondida(q) ? '' : ' disabled') + '>' +
      (ultima ? 'Abrir o WhatsApp →' : 'Próxima →') + '</button>';

    var next = foot.querySelector('.quiz-next');
    var back = foot.querySelector('.quiz-back');
    if (back) back.addEventListener('click', function () { gateIdx--; gateRender(); });

    next.addEventListener('click', function () {
      if (next.disabled) return;
      if (!ultima) { gateIdx++; gateRender(); return; }
      gateEnviar();
      window.open(gateLink(), '_blank', 'noopener');
      gateFechar();
    });

    var field = body.querySelector('#gateField');
    if (field) {
      field.addEventListener('input', function () {
        gateAnswers[q.id] = q.type === 'phone' ? (field.value = maskPhone(field.value)) : field.value;
        next.disabled = !gateRespondida(q);
      });
      field.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (!next.disabled) next.click();
      });
      try { field.focus({ preventScroll: true }); } catch (e) { /* navegador antigo */ }
    }

    Array.prototype.forEach.call(body.querySelectorAll('.quiz-opt'), function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        gateAnswers[q.id] = q.options[idx].val;
        Array.prototype.forEach.call(body.querySelectorAll('.quiz-opt'), function (o) {
          o.classList.toggle('selected', parseInt(o.getAttribute('data-idx'), 10) === idx);
        });
        next.disabled = false;
      });
    });
  }

  function gateAbrir() {
    if (gateEl) return;
    gateIdx = 0;

    gateEl = document.createElement('div');
    gateEl.className = 'wa-gate';
    gateEl.innerHTML =
      '<div class="wa-gate-card" role="dialog" aria-modal="true" aria-label="Falar no WhatsApp">' +
      '<button type="button" class="wa-gate-close" aria-label="Fechar">&times;</button>' +
      '<div class="wa-gate-head">' + iconeWhats() + '<h3>Antes de abrir a conversa</h3></div>' +
      '<p class="wa-gate-sub">Três informações rápidas, para o time de expansão já chegar sabendo com quem fala.</p>' +
      '<div class="gate-body"></div><div class="quiz-foot gate-foot"></div>' +
      '</div>';

    gateEl.addEventListener('click', function (e) {
      if (e.target === gateEl) gateFechar();
    });
    gateEl.querySelector('.wa-gate-close').addEventListener('click', gateFechar);
    document.addEventListener('keydown', gateEsc);

    document.body.appendChild(gateEl);
    gateRender();
  }

  function ligarGate() {
    ['waFloat', 'ctaWhats'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', function (e) {
        /* Quem já concluiu a candidatura vai direto para a conversa. */
        if (finished || gateEnviado) return;
        e.preventDefault();
        gateAbrir();
      });
    });
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
    elStart = document.getElementById('quizStart');
    if (!elCount || !elBar || !elBody || !elFoot) return;

    var btn = document.getElementById('quizStartBtn');
    if (btn) btn.addEventListener('click', function () { abrir(true); });

    /* Sem botão de abertura na página, o formulário já entra aberto. */
    if (!elStart) {
      abrir(false);
    } else if (window.location.hash === HASH_INICIO || window.location.hash === HASH_FIM) {
      /* Link direto para o formulário abre o passo 1 sem exigir o clique. */
      abrir(true);
    }

    rastreamento();
    ligarGate();
    window.addEventListener('pagehide', submitParcial);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
