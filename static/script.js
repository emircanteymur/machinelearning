// ─── SLIDER SETUP ─────────────────────────────────────────────────────────────
// The range slider lets the user pick a surface area between 10 and 300 m².
// We also keep the coloured fill and the number badge in sync with the handle.

const slider       = document.getElementById('surface-slider');
const surfaceLabel = document.getElementById('surface-val');  // the "60 m²" badge in the label

function updateSlider() {
  // Work out what percentage of the way across the slider the handle is.
  // This drives a CSS custom property (--pct) that colours the filled track.
  const min        = 10;
  const max        = 300;
  const percentage = ((slider.value - min) / (max - min)) * 100;

  slider.style.setProperty('--pct', percentage + '%');

  // Also update the badge that shows the current number next to the label
  surfaceLabel.textContent = slider.value;
}

// Run updateSlider whenever the user drags the handle
slider.addEventListener('input', function () {
  updateSlider();
});

// The − button decreases the value by 5, but never below the minimum of 10
document.getElementById('dec').addEventListener('click', function () {
  const newValue = parseInt(slider.value) - 5;
  if (newValue >= 10) {
    slider.value = newValue;
    updateSlider();
  }
});

// The + button increases the value by 5, but never above the maximum of 300
document.getElementById('inc').addEventListener('click', function () {
  const newValue = parseInt(slider.value) + 5;
  if (newValue <= 300) {
    slider.value = newValue;
    updateSlider();
  }
});

// Call once on page load so the slider fill is correct from the start
updateSlider();


// ─── LOAD NEIGHBOURHOODS ───────────────────────────────────────────────────────
// Ask the server for the full list of neighbourhood names and fill the dropdown.
// We use 'async' so we can write 'await' inside instead of nesting .then() calls.

async function loadNeighbourhoods() {
  // fetch() sends an HTTP GET request to our Flask route
  const response = await fetch('/api/neighbourhoods');

  // .json() reads the response body and converts it from a JSON string to a JS array
  const neighbourhoods = await response.json();

  const dropdown = document.getElementById('neighbourhood');
  dropdown.innerHTML = '';  // remove the "loading…" placeholder option

  // Create one <option> element for each neighbourhood and add it to the dropdown
  for (let i = 0; i < neighbourhoods.length; i++) {
    const option       = document.createElement('option');
    option.value       = neighbourhoods[i];
    option.textContent = neighbourhoods[i];
    dropdown.appendChild(option);
  }
}


// ─── PREDICT ──────────────────────────────────────────────────────────────────
// Called when the user clicks "predict price".
// Sends the user's choices to the server and waits for a prediction back.

async function predict() {
  const button = document.getElementById('predict-btn');

  // Disable the button while the request is in flight so the user can't click twice
  button.disabled = true;
  button.classList.add('loading');  // the CSS uses this class to show the spinner

  // Read what the user has currently selected
  const selectedNeighbourhood = document.getElementById('neighbourhood').value;
  const selectedSurface       = parseInt(slider.value);

  // try/catch/finally lets us handle errors gracefully:
  //   try   – run the code we want
  //   catch – if anything goes wrong, run this instead of crashing
  //   finally – always run this at the end, success or failure
  try {
    // Send a POST request with the user's choices in the body as JSON
    const response = await fetch('/api/predict', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',  // tells the server the body is JSON text
      },
      body: JSON.stringify({
        neighbourhood: selectedNeighbourhood,
        surface:       selectedSurface,
      }),
    });

    // If the server replied with an error (e.g. bad input), show the message
    if (!response.ok) {
      const errorData = await response.json();
      alert(errorData.error || 'prediction failed');
      return;  // stop here — don't try to display results
    }

    // Parse the successful reply and hand it to showResults()
    const data = await response.json();
    showResults(data);

  } catch (error) {
    // This runs if the network itself failed (server not started, no connection, etc.)
    console.error(error);
    alert('network error — is the server running?');

  } finally {
    // Re-enable the button whether the request succeeded or failed
    button.disabled = false;
    button.classList.remove('loading');
  }
}


// ─── SHOW RESULTS ─────────────────────────────────────────────────────────────
// Takes the JSON object that the server returned and updates the results card.

// Each market temperature has an emoji we show next to the word
const tempEmoji = {
  hot:     '🔥',
  cool:    '❄️',
  neutral: '⚖️',
};

const profileStats = [
  { key: 'avg_income',      label: 'avg. income / person',  format: v => '€' + Math.round(v).toLocaleString() },
  { key: 'employed_pct',    label: 'employment rate',       format: v => v + '%' },
  { key: 'foreign_pct',     label: 'foreign population',    format: v => v + '%' },
  { key: 'low_skilled_pct', label: 'low-skilled workers',   format: v => v + '%' },
];

function showResults(data) {

  // ── title above the results ──────────────────────────────────────────────
  document.getElementById('results-title').textContent =
    'predicted price for ' + data.neighbourhood;

  // ── the three metric cards ───────────────────────────────────────────────
  document.getElementById('price-m2').textContent =
    data.price_m2 + ' €/m²';

  // toLocaleString() adds thousand-separator commas: 1500 → "1,500"
  document.getElementById('total').textContent =
    data.total.toLocaleString() + ' €/mo';

  // The temperature card needs both its text and its colour class updated
  const tempValueEl      = document.getElementById('temp');
  tempValueEl.textContent = tempEmoji[data.temp] + ' ' + data.temp;
  tempValueEl.className   = 'metric-value temp-' + data.temp;  // e.g. "metric-value temp-hot"

  // Also colour the card's background (the CSS has rules for .metric.hot etc.)
  const tempCardEl     = document.getElementById('temp-card');
  tempCardEl.className = 'metric ' + data.temp;

  // ── price range info box ─────────────────────────────────────────────────
  document.getElementById('range-val').textContent =
    data.low.toLocaleString() + ' – ' + data.high.toLocaleString() + ' €/month';

  document.getElementById('label-val').textContent = data.label;

  // Match the box colour to the temperature as well
  const rangeBox     = document.getElementById('range-box');
  rangeBox.className = 'info-box ' + data.temp;

  // ── neighbourhood profile grid ───────────────────────────────────────────
  const grid = document.getElementById('profile-grid');
  grid.innerHTML = '';

  for (const stat of profileStats) {
    const value = data.data[stat.key];
    if (value == null) continue;

    const card       = document.createElement('div');
    card.className   = 'profile-stat';

    const labelEl    = document.createElement('span');
    labelEl.className   = 'profile-stat-label';
    labelEl.textContent = stat.label;

    const valueEl    = document.createElement('span');
    valueEl.className   = 'profile-stat-value';
    valueEl.textContent = stat.format(value);

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    grid.appendChild(card);
  }

  // ── animate the results card into view ───────────────────────────────────
  // Adding the 'visible' class triggers a CSS transition (opacity + slide up)
  const resultsSection = document.getElementById('results');
  resultsSection.classList.add('visible');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


// ─── PAGE LOAD ────────────────────────────────────────────────────────────────
// DOMContentLoaded fires once the browser has finished building the page.
// We wait for it so that getElementById() calls above can actually find elements.

document.addEventListener('DOMContentLoaded', function () {
  loadNeighbourhoods();  // fill the dropdown straight away

  // Attach the predict function to the button's click event
  document.getElementById('predict-btn').addEventListener('click', predict);
});
