// ── SLIDER SETUP ──────────────────────────────────────────────────────────────

// Get the slider element and the label that shows the current number
var slider = document.getElementById('surface-slider');
var surfaceLabel = document.getElementById('surface-val');

// Updates the slider's coloured fill and the number badge whenever the value changes
function updateSlider() {
  var min = 10;
  var max = 300;
  // Work out how far along the slider the handle is as a percentage
  var percentage = ((slider.value - min) / (max - min)) * 100;
  var pct = percentage + '%';
  // Paint the left side red and the right side grey to show the filled portion
  slider.style.background = 'linear-gradient(to right, #c41e3a 0%, #c41e3a ' + pct + ', #e2e8f0 ' + pct + ', #e2e8f0 100%)';
  // Also update the number shown next to the label
  surfaceLabel.textContent = slider.value;
}

// Call updateSlider every time the user drags the handle
slider.addEventListener('input', function () {
  updateSlider();
});

// The minus button decreases the value by 5, but won't go below 10
document.getElementById('dec').addEventListener('click', function () {
  var newValue = parseInt(slider.value) - 5;
  if (newValue >= 10) {
    slider.value = newValue;
    updateSlider();
  }
});

// The plus button increases the value by 5, but won't go above 300
document.getElementById('inc').addEventListener('click', function () {
  var newValue = parseInt(slider.value) + 5;
  if (newValue <= 300) {
    slider.value = newValue;
    updateSlider();
  }
});

// Run once on page load so the slider looks correct straight away
updateSlider();


// ── LOAD NEIGHBOURHOODS ───────────────────────────────────────────────────────

// Fetches the list of neighbourhood names from the server and fills the dropdown
function loadNeighbourhoods() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/neighbourhoods');
  // This function runs when the server replies
  xhr.onload = function () {
    if (xhr.status === 200) {
      // Convert the JSON text the server sent into a JavaScript array
      var neighbourhoods = JSON.parse(xhr.responseText);
      var dropdown = document.getElementById('neighbourhood');
      dropdown.innerHTML = ''; // clear the placeholder option
      // Create one <option> element for each neighbourhood and add it to the dropdown
      for (var i = 0; i < neighbourhoods.length; i++) {
        var option = document.createElement('option');
        option.value = neighbourhoods[i];
        option.textContent = neighbourhoods[i];
        dropdown.appendChild(option);
      }
    }
  };
  xhr.send();
}


// ── PREDICT ───────────────────────────────────────────────────────────────────

// Reads the user's chosen neighbourhood and surface area, sends them to the
// server, and calls showResults() with the prediction that comes back
function predict() {
  var button = document.getElementById('predict-btn');
  // Disable the button while the request is in flight so the user can't click twice
  button.disabled = true;
  button.classList.add('loading');

  var selectedNeighbourhood = document.getElementById('neighbourhood').value;
  var selectedSurface = parseInt(slider.value);

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/predict');
  xhr.setRequestHeader('Content-Type', 'application/json'); // tell the server we're sending JSON

  // Runs when the server replies (success or error)
  xhr.onload = function () {
    if (xhr.status === 200) {
      var data = JSON.parse(xhr.responseText);
      showResults(data); // hand the result to the display function
    } else {
      // The server replied with an error message, so show it to the user
      var errorData = JSON.parse(xhr.responseText);
      alert(errorData.error || 'prediction failed');
    }
    // Re-enable the button either way
    button.disabled = false;
    button.classList.remove('loading');
  };

  // Runs if the network itself failed (e.g. server not started)
  xhr.onerror = function () {
    alert('network error — is the server running?');
    button.disabled = false;
    button.classList.remove('loading');
  };

  // Send the user's choices as a JSON string in the request body
  xhr.send(JSON.stringify({
    neighbourhood: selectedNeighbourhood,
    surface: selectedSurface
  }));
}

var tempEmoji = {
  hot:     '🔥',
  cool:    '❄️',
  neutral: '⚖️'
};

function formatIncome(v) {
  return '€' + Math.round(v).toLocaleString();
}

function formatPercent(v) {
  return v + '%';
}

// Takes the prediction object from the server and fills in all the result fields on the page
function showResults(data) {
  // Update the heading above the results card
  document.getElementById('results-title').textContent = 'predicted price for ' + data.neighbourhood;

  // Fill in the three main metric values
  document.getElementById('price-m2').textContent = data.price_m2 + ' €/m²';
  document.getElementById('total').textContent = data.total.toLocaleString() + ' €/mo';

  // Set the market temperature text and colour class (hot / cool / neutral)
  var tempValueEl = document.getElementById('temp');
  tempValueEl.textContent = tempEmoji[data.temp] + ' ' + data.temp;
  tempValueEl.className = 'metric-value temp-' + data.temp;

  // Also colour the temperature card's background to match
  var tempCardEl = document.getElementById('temp-card');
  tempCardEl.className = 'metric ' + data.temp;

  // Show the price range and label in the info box
  document.getElementById('range-val').textContent =
    data.low.toLocaleString() + ' – ' + data.high.toLocaleString() + ' €/month';
  document.getElementById('label-val').textContent = data.label;

  var rangeBox = document.getElementById('range-box');
  rangeBox.className = 'info-box ' + data.temp;

  var grid = document.getElementById('profile-grid');
  grid.innerHTML = '';

  // These are the four stats we want to show in the grid
  var stats = [
    { key: 'avg_income',      label: 'avg. income / person', type: 'income'  },
    { key: 'employed_pct',    label: 'employment rate',       type: 'percent' },
    { key: 'foreign_pct',     label: 'foreign population',    type: 'percent' },
    { key: 'low_skilled_pct', label: 'low-skilled workers',   type: 'percent' }
  ];

  for (var i = 0; i < stats.length; i++) {
    var stat = stats[i];
    var value = data.data[stat.key];
    if (value == null) { continue; } // skip if the server didn't send this stat

    // Format the value depending on whether it's money or a percentage
    var formattedValue;
    if (stat.type === 'income') {
      formattedValue = formatIncome(value);
    } else {
      formattedValue = formatPercent(value);
    }

    // Create a small card with a label and value and add it to the grid
    var card = document.createElement('div');
    card.className = 'profile-stat';

    var labelEl = document.createElement('span');
    labelEl.className = 'profile-stat-label';
    labelEl.textContent = stat.label;

    var valueEl = document.createElement('span');
    valueEl.className = 'profile-stat-value';
    valueEl.textContent = formattedValue;

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    grid.appendChild(card);
  }

  // Make the results section visible and scroll it into view smoothly
  var resultsSection = document.getElementById('results');
  resultsSection.classList.add('visible');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ── PAGE LOAD ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  loadNeighbourhoods();
  document.getElementById('predict-btn').addEventListener('click', predict);
  initChat();
});


// ── CHATBOT ───────────────────────────────────────────────────────────────────

var chatHistory = [];

var WELCOME_MSG = 'Hi! I can suggest Barcelona neighbourhoods based on your needs. ' +
  'Tell me your budget (e.g. €800/month for 60 m²), and any preferences like ' +
  'affordable areas, international community, or quieter streets.';

function appendChatMsg(role, text) {
  var el = document.createElement('div');
  el.className = 'chat-msg ' + (role === 'user' ? 'user' : 'bot');
  el.textContent = text;
  var box = document.getElementById('chat-messages');
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  return el;
}

// Reads the text the user typed, sends it to the server, and displays the reply
function sendChatMessage() {
  var input = document.getElementById('chat-input');
  var sendBtn = document.getElementById('chat-send');
  var text = input.value.trim();
  if (!text) { return; }

  input.value = '';
  appendChatMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  sendBtn.disabled = true;

  var typing = appendChatMsg('bot', '…');
  typing.classList.add('typing');

  var xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/chat');
  xhr.setRequestHeader('Content-Type', 'application/json');

  // Replace the "…" bubble with the actual reply when the server responds
  xhr.onload = function () {
    var data = JSON.parse(xhr.responseText);
    var reply = data.reply || data.error || 'something went wrong';
    typing.textContent = reply;
    typing.classList.remove('typing');
    chatHistory.push({ role: 'assistant', content: reply }); // save reply to history
    sendBtn.disabled = false;
    input.focus();
  };

  // Show an error message in the chat bubble if the network failed
  xhr.onerror = function () {
    typing.textContent = 'network error — is the server running?';
    typing.classList.remove('typing');
    sendBtn.disabled = false;
    input.focus();
  };

  xhr.send(JSON.stringify({ messages: chatHistory }));
}

// Sets up the chat toggle button, send button, and Enter-key shortcut
function initChat() {
  var toggle = document.getElementById('chat-toggle');
  var panel = document.getElementById('chat-panel');
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
    if (e.key === 'Enter') { sendChatMessage(); }
  });
}
