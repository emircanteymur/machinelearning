import os
from flask import Flask, render_template, jsonify, request
import joblib
from chatbot import handle_message

app = Flask(__name__)

neighbourhood_data = joblib.load('neighbourhood_data.pkl')
city_avg           = joblib.load('city_avg.pkl')

neighbourhoods = sorted(neighbourhood_data.keys())
latest_year    = max(city_avg.keys())

_TEMP_LABEL = {
    'hot':     'above city average — likely to overpay here',
    'cool':    'below city average — good value area',
    'neutral': 'around the city average',
}

_SOCIO_KEYS = ('avg_income', 'employed_pct', 'foreign_pct', 'low_skilled_pct')


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/neighbourhoods')
def get_neighbourhoods():
    return jsonify(neighbourhoods)

@app.route('/api/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'no data'}), 400

    neighbourhood = data.get('neighbourhood')
    surface = data.get('surface', 60)

    if neighbourhood not in neighbourhood_data:
        return jsonify({'error': 'unknown neighbourhood'}), 400

    surface = float(surface)
    if not (10 <= surface <= 300):
        return jsonify({'error': 'surface must be between 10 and 300'}), 400

    row      = neighbourhood_data[neighbourhood]
    price_m2 = row.get('price_m2')
    if price_m2 is None:
        return jsonify({'error': 'no price data available for this neighbourhood'}), 422
    temp     = row.get('temp', 'neutral')
    total    = price_m2 * surface
    low, high = total * 0.92, total * 1.08

    display_data = {}
    for k in _SOCIO_KEYS:
        if k in row:
            display_data[k] = round(float(row[k]), 2)

    return jsonify({
        'neighbourhood': neighbourhood,
        'price_m2':      price_m2,
        'total':         int(round(total)),
        'low':           int(round(low)),
        'high':          int(round(high)),
        'temp':          temp,
        'label':         _TEMP_LABEL[temp],
        'data':          display_data,
    })

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'no data'}), 400

    messages = data.get('messages', [])
    if not messages:
        return jsonify({'error': 'no messages'}), 400

    reply = handle_message(messages, neighbourhood_data)
    return jsonify({'reply': reply})

if __name__ == '__main__':
    app.run(debug=True)
