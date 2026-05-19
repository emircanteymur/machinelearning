// ── SLIDER ───────────────────────────────────────────────────────────────────

var slider = document.getElementById('surface-slider');
var surfaceLabel = document.getElementById('surface-val');

function updateSlider() {
  var min = 10, max = 300;
  var pct = ((slider.value - min) / (max - min)) * 100 + '%';
  slider.style.background =
    'linear-gradient(to right, #c41e3a 0%, #c41e3a ' + pct + ', #e2e8f0 ' + pct + ', #e2e8f0 100%)';
  surfaceLabel.textContent = slider.value;
}

slider.addEventListener('input', updateSlider);

document.getElementById('dec').addEventListener('click', function () {
  var v = parseInt(slider.value) - 5;
  if (v >= 10) { slider.value = v; updateSlider(); }
});

document.getElementById('inc').addEventListener('click', function () {
  var v = parseInt(slider.value) + 5;
  if (v <= 300) { slider.value = v; updateSlider(); }
});

updateSlider();


// ── LOAD NEIGHBOURHOODS ───────────────────────────────────────────────────────

function loadNeighbourhoods() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/neighbourhoods');
  xhr.onload = function () {
    if (xhr.status === 200) {
      var list = JSON.parse(xhr.responseText);
      var dropdown = document.getElementById('neighbourhood');
      dropdown.innerHTML = '';
      for (var i = 0; i < list.length; i++) {
        var opt = document.createElement('option');
        opt.value = list[i];
        opt.textContent = list[i];
        dropdown.appendChild(opt);
      }
    }
  };
  xhr.send();
}


// ── PREDICT ───────────────────────────────────────────────────────────────────

function predict() {
  var button = document.getElementById('predict-btn');
  button.disabled = true;
  button.classList.add('loading');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/predict');
  xhr.setRequestHeader('Content-Type', 'application/json');

  xhr.onload = function () {
    button.disabled = false;
    button.classList.remove('loading');
    if (xhr.status === 200) {
      showResults(JSON.parse(xhr.responseText));
    } else {
      var err = JSON.parse(xhr.responseText);
      alert(err.error || 'Prediction failed');
    }
  };

  xhr.onerror = function () {
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

function formatIncome(v)  { return '€' + Math.round(v).toLocaleString(); }
function formatPercent(v) { return v + '%'; }

function showResults(data) {
  // Top row
  document.getElementById('results-title').textContent = data.neighbourhood;

  var badge = document.getElementById('temp-badge');
  badge.textContent = tempEmoji[data.temp] + ' ' + data.temp;
  badge.className = 'temp-badge temp-' + data.temp;

  // Prices
  document.getElementById('price-m2').textContent = data.price_m2 + ' €/m²';
  document.getElementById('total').textContent = '€' + data.total.toLocaleString() + '/mo';

  // Range
  document.getElementById('range-val').textContent =
    data.low.toLocaleString() + ' – ' + data.high.toLocaleString() + ' €/mo';
  document.getElementById('label-val').textContent = data.label;
  document.getElementById('range-box').className = 'range-box temp-' + data.temp;

  // Profile grid
  var grid = document.getElementById('profile-grid');
  grid.innerHTML = '';

  var stats = [
    { key: 'avg_income',      label: 'Avg. Income',    icon: '💶', type: 'income'  },
    { key: 'employed_pct',    label: 'Employment',     icon: '💼', type: 'percent' },
    { key: 'foreign_pct',     label: 'International',  icon: '🌍', type: 'percent' },
    { key: 'low_skilled_pct', label: 'Low-Skilled',    icon: '📊', type: 'percent' }
  ];

  for (var i = 0; i < stats.length; i++) {
    var s = stats[i];
    var val = data.data[s.key];
    if (val == null) continue;
    var fmt = s.type === 'income' ? formatIncome(val) : formatPercent(val);
    var card = document.createElement('div');
    card.className = 'profile-stat';
    card.innerHTML =
      '<span class="stat-icon">' + s.icon + '</span>' +
      '<span class="profile-stat-label">' + s.label + '</span>' +
      '<span class="profile-stat-value">' + fmt + '</span>';
    grid.appendChild(card);
  }

  // Show results
  document.getElementById('results-empty').style.display = 'none';
  document.getElementById('results-content').style.display = 'flex';

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── PAGE INIT ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  loadNeighbourhoods();
  document.getElementById('predict-btn').addEventListener('click', predict);
  initChat();
});


// ── CHATBOT ───────────────────────────────────────────────────────────────────

var chatHistory = [];
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
  var input = document.getElementById('chat-input');
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

  xhr.onload = function () {
    var data = JSON.parse(xhr.responseText);
    var reply = data.reply || data.error || 'Something went wrong';
    typing.textContent = reply;
    typing.classList.remove('typing');
    chatHistory.push({ role: 'assistant', content: reply });
    sendBtn.disabled = false;
    input.focus();
  };

  xhr.onerror = function () {
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
  var opened = false;

  toggle.addEventListener('click', function () {
    var isOpen = panel.classList.toggle('open');
    panel.setAttribute('aria-hidden', !isOpen);
    if (!opened && isOpen) {
      appendChatMsg('bot', WELCOME_MSG);
      opened = true;
      document.getElementById('chat-input').focus();
    }
  });

  document.getElementById('chat-send').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendChatMessage();
  });
  document.getElementById('chat-restart').addEventListener('click', resetChat);
}
