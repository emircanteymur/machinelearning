/* ── LANDING PAGE ──────────────────────────────────────────── */

function heroSearch(e) { if (e.key === 'Enter') heroSearchBtn(); }
function heroSearchBtn() {
  var v = document.getElementById('hero-search-input').value.trim().toLowerCase();
  if (!v) return;
  if (v.includes('barcelona') || v.includes('bcn')) { window.location.href = '/barcelona'; return; }
  // Any other city — show tooltip above the search bar
  var tip = document.getElementById('search-tooltip');
  if (!tip) return;
  tip.classList.add('visible');
  clearTimeout(window._searchTipTimer);
  window._searchTipTimer = setTimeout(function() { tip.classList.remove('visible'); }, 2500);
}

var _activeTooltip = null;

function showComingSoon(wrapper) {
  var tip = wrapper.querySelector('.city-tooltip');
  if (!tip) return;

  if (_activeTooltip && _activeTooltip !== tip) {
    _activeTooltip.classList.remove('visible');
  }

  tip.classList.add('visible');
  _activeTooltip = tip;

  clearTimeout(wrapper._tipTimer);
  wrapper._tipTimer = setTimeout(function() {
    tip.classList.remove('visible');
    _activeTooltip = null;
  }, 2500);
}


/* ── BARCELONA PAGE ────────────────────────────────────────── */

/* Tabs */
function switchTab(name, btn) {
  document.querySelectorAll('.tab-pane').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
  document.getElementById('tab-' + name).classList.add('active');
  if (btn) btn.classList.add('active');
}

/* Slider */
var slider, surfaceLabel;

function initSlider() {
  slider = document.getElementById('surface-slider');
  surfaceLabel = document.getElementById('surface-val');
  if (!slider) return;
  slider.addEventListener('input', updateSlider);
  document.getElementById('dec').addEventListener('click', function() {
    var v = parseInt(slider.value) - 5;
    if (v >= 10) { slider.value = v; updateSlider(); }
  });
  document.getElementById('inc').addEventListener('click', function() {
    var v = parseInt(slider.value) + 5;
    if (v <= 300) { slider.value = v; updateSlider(); }
  });
  updateSlider();
}

function updateSlider() {
  var min = 10, max = 300;
  var pct = ((slider.value - min) / (max - min)) * 100 + '%';
  slider.style.background =
    'linear-gradient(to right, #c9a84c 0%, #c9a84c ' + pct + ', #e2d8c8 ' + pct + ', #e2d8c8 100%)';
  surfaceLabel.textContent = slider.value;
}

/* Load neighbourhoods into all dropdowns on the Barcelona page */
function loadNeighbourhoods() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/neighbourhoods');
  xhr.onload = function() {
    if (xhr.status !== 200) return;
    var list = JSON.parse(xhr.responseText);

    ['neighbourhood', 'cmp-1', 'cmp-2', 'cmp-3'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = '';
      if (id === 'cmp-3') {
        var none = document.createElement('option');
        none.value = ''; none.textContent = '— None —';
        el.appendChild(none);
      } else {
        var def = document.createElement('option');
        def.value = ''; def.disabled = true; def.selected = true;
        def.textContent = 'Choose neighbourhood…';
        el.appendChild(def);
      }
      list.forEach(function(n) {
        var opt = document.createElement('option');
        opt.value = n; opt.textContent = n;
        el.appendChild(opt);
      });
    });

    initSlider();
    var predictBtn = document.getElementById('predict-btn');
    if (predictBtn) predictBtn.addEventListener('click', predict);
  };
  xhr.send();
}

/* ── TOOLTIP HELPER ────────────────────────────────────────── */
function showTooltip(id) {
  var tip = document.getElementById(id);
  if (!tip) return;
  tip.classList.add('visible');
  clearTimeout(tip._timer);
  tip._timer = setTimeout(function() { tip.classList.remove('visible'); }, 2500);
}

/* Predict */
function predict() {
  var neighbourhood = document.getElementById('neighbourhood').value;
  if (!neighbourhood) { showTooltip('predict-tooltip'); return; }

  var button = document.getElementById('predict-btn');
  button.disabled = true;
  button.classList.add('loading');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/predict');
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function() {
    button.disabled = false;
    button.classList.remove('loading');
    if (xhr.status === 200) { showResults(JSON.parse(xhr.responseText)); }
    else { alert(JSON.parse(xhr.responseText).error || 'Prediction failed'); }
  };
  xhr.onerror = function() {
    button.disabled = false;
    button.classList.remove('loading');
    alert('Network error — is the server running?');
  };

  xhr.send(JSON.stringify({
    neighbourhood: document.getElementById('neighbourhood').value,
    surface: parseInt(slider.value)
  }));
}

var tempEmoji = { hot: '🔥', cool: '❄️', neutral: '⚖️' };

function showResults(data) {
  document.getElementById('results-title').textContent = data.neighbourhood;

  var badge = document.getElementById('temp-badge');
  badge.textContent = tempEmoji[data.temp] + ' ' + data.temp;
  badge.className = 'temp-badge temp-' + data.temp;

  document.getElementById('price-m2').textContent = data.price_m2 + ' €/m²';
  document.getElementById('total').textContent = '€' + data.total.toLocaleString() + '/mo';
  document.getElementById('range-val').textContent = data.low.toLocaleString() + ' – ' + data.high.toLocaleString() + ' €/mo';
  document.getElementById('label-val').textContent = data.label;
  document.getElementById('range-box').className = 'range-box temp-' + data.temp;

  var grid = document.getElementById('profile-grid');
  grid.innerHTML = '';

  var stats = [
    { key: 'avg_income',      label: 'Avg. Income',   icon: '💶', type: 'income'  },
    { key: 'employed_pct',    label: 'Employment',    icon: '💼', type: 'percent' },
    { key: 'foreign_pct',     label: 'International', icon: '🌍', type: 'percent' },
    { key: 'low_skilled_pct', label: 'Low-Skilled',   icon: '📊', type: 'percent' }
  ];

  stats.forEach(function(s) {
    var val = data.data[s.key];
    if (val == null) return;
    var fmt = s.type === 'income' ? '€' + Math.round(val).toLocaleString() : val + '%';
    var card = document.createElement('div');
    card.className = 'profile-stat';
    card.innerHTML =
      '<span class="stat-icon">' + s.icon + '</span>' +
      '<span class="profile-stat-label">' + s.label + '</span>' +
      '<span class="profile-stat-value">' + fmt + '</span>';
    grid.appendChild(card);
  });

  document.getElementById('results-empty').style.display = 'none';
  document.getElementById('results-content').style.display = 'flex';
  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


/* ── COMPARE ───────────────────────────────────────────────── */

function runCompare() {
  var n1 = document.getElementById('cmp-1').value;
  var n2 = document.getElementById('cmp-2').value;
  var n3 = document.getElementById('cmp-3').value;

  if (!n1) { showTooltip('cmp-1-tooltip'); return; }
  if (!n2) { showTooltip('cmp-2-tooltip'); return; }
  if (n1 === n2 || (n3 && (n3 === n1 || n3 === n2))) {
    showTooltip('cmp-1-tooltip');
    showTooltip('cmp-2-tooltip');
    return;
  }

  var targets = [n1, n2];
  if (n3) targets.push(n3);

  document.getElementById('compare-results').classList.remove('visible');
  document.getElementById('compare-loading').classList.add('visible');

  var promises = targets.map(function(n) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/predict');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        if (xhr.status === 200) resolve(JSON.parse(xhr.responseText));
        else reject(JSON.parse(xhr.responseText).error);
      };
      xhr.onerror = reject;
      xhr.send(JSON.stringify({ neighbourhood: n, surface: 60 }));
    });
  });

  Promise.all(promises).then(function(results) {
    document.getElementById('compare-loading').classList.remove('visible');
    renderCompareTable(results);
    document.getElementById('compare-results').classList.add('visible');
  }).catch(function(err) {
    document.getElementById('compare-loading').classList.remove('visible');
    alert('Error: ' + err);
  });
}

function renderCompareTable(results) {
  var thead = document.getElementById('cmp-thead');
  var tbody = document.getElementById('cmp-tbody');

  var hRow = '<tr><th>Metric</th>';
  results.forEach(function(r) { hRow += '<th class="col-header">' + r.neighbourhood + '</th>'; });
  thead.innerHTML = hRow + '</tr>';

  var rows = [
    { label: 'Price / m²',      key: 'price_m2', fmt: function(v) { return v + ' €/m²'; },                    better: 'min' },
    { label: 'Monthly (60m²)',  key: 'total',    fmt: function(v) { return '€' + v.toLocaleString(); },        better: 'min' },
    { label: 'Market Signal',   key: 'temp',     fmt: function(v) { return {hot:'🔥 Hot',cool:'❄️ Cool',neutral:'⚖️ Neutral'}[v]; }, better: null },
    { label: 'Avg. Income',     key: null, custom: function(r) { return r.data.avg_income; },      fmt: function(v) { return v != null ? '€' + Math.round(v).toLocaleString() : '—'; }, better: 'max' },
    { label: 'Employment %',    key: null, custom: function(r) { return r.data.employed_pct; },    fmt: function(v) { return v != null ? v + '%' : '—'; }, better: 'max' },
    { label: 'International %', key: null, custom: function(r) { return r.data.foreign_pct; },     fmt: function(v) { return v != null ? v + '%' : '—'; }, better: null },
    { label: 'Low-Skilled %',   key: null, custom: function(r) { return r.data.low_skilled_pct; }, fmt: function(v) { return v != null ? v + '%' : '—'; }, better: 'min' },
  ];

  var html = '';
  rows.forEach(function(row) {
    var vals = results.map(function(r) { return row.custom ? row.custom(r) : r[row.key]; });
    var numerics = vals.filter(function(v) { return v != null && typeof v === 'number'; });
    var bestVal = null, worstVal = null;
    if (row.better && numerics.length > 1) {
      bestVal  = row.better === 'min' ? Math.min.apply(null, numerics) : Math.max.apply(null, numerics);
      worstVal = row.better === 'min' ? Math.max.apply(null, numerics) : Math.min.apply(null, numerics);
    }
    html += '<tr><td>' + row.label + '</td>';
    vals.forEach(function(v) {
      var cls = 'val-cell';
      if (bestVal !== null && v === bestVal) cls += ' val-best';
      else if (worstVal !== null && v === worstVal) cls += ' val-worst';
      html += '<td class="' + cls + '">' + row.fmt(v) + '</td>';
    });
    html += '</tr>';
  });
  tbody.innerHTML = html;
}


/* ── CHATBOT ───────────────────────────────────────────────── */

var chatHistory = [];
var chatOpened  = false;
var WELCOME_MSG = "Hey! I'm your Barcelona neighbourhood advisor. Share your budget and the kind of vibe you're after, and I'll point you to the best fit. Type 'skip' at any point if a question doesn't apply to you.";

function appendChatMsg(role, text) {
  var el = document.createElement('div');
  el.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
  el.textContent = text;
  var box = document.getElementById('chat-messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

function sendChatMessage() {
  var input   = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var text = input.value.trim();
  if (!text) return;

  input.value = '';
  appendChatMsg('user', text);
  chatHistory.push({ role: 'user', content: text });
  document.getElementById('chat-restart').classList.add('active');
  sendBtn.disabled = true;

  var typing = appendChatMsg('bot', '…');
  typing.classList.add('typing');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/chat');
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    var data  = JSON.parse(xhr.responseText);
    var reply = data.reply || data.error || 'Something went wrong';
    typing.textContent = reply;
    typing.classList.remove('typing');
    chatHistory.push({ role: 'assistant', content: reply });
    sendBtn.disabled = false;
    input.focus();
  };
  xhr.onerror = function() {
    typing.textContent = 'Network error — is the server running?';
    typing.classList.remove('typing');
    sendBtn.disabled = false;
    input.focus();
  };
  xhr.send(JSON.stringify({ messages: chatHistory }));
}

function resetChat() {
  chatHistory = [];
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('chat-restart').classList.remove('active');
  appendChatMsg('bot', WELCOME_MSG);
}

function initChat() {
  var toggle = document.getElementById('chat-toggle');
  var panel  = document.getElementById('chat-panel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', function() {
    var isOpen = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', !isOpen);
    if (!chatOpened && isOpen) {
      appendChatMsg('bot', WELCOME_MSG);
      chatOpened = true;
      document.getElementById('chat-input').focus();
    }
  });

  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendChatMessage();
  });
  document.getElementById('chat-restart').addEventListener('click', resetChat);
}


/* ── INIT ──────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function() {
  // Barcelona page only
  if (document.getElementById('tab-predict')) {
    loadNeighbourhoods();
  }
  // Chat exists on Barcelona page only
  initChat();
});