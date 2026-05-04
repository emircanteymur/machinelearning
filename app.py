from flask import Flask, render_template, jsonify, request
import joblib
import pandas as pd

app = Flask(__name__)


model             = joblib.load('model.pkl')
le                = joblib.load('label_encoder.pkl')
features          = joblib.load('features.pkl')
neighbourhood_data = joblib.load('neighbourhood_data.pkl')
city_avg          = joblib.load('city_avg.pkl')

neighbourhoods = sorted(neighbourhood_data.keys())
latest_year    = max(city_avg.keys())

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
    surface       = data.get('surface', 60)

    if neighbourhood not in neighbourhood_data:
        return jsonify({'error': 'unknown neighbourhood'}), 400

    surface = float(surface)
    if not (10 <= surface <= 300):
        return jsonify({'error': 'surface must be between 10 and 300'}), 400

    row     = neighbourhood_data[neighbourhood]
    enc     = le.transform([neighbourhood])[0]
    X_new   = pd.DataFrame(
        [[row[f] for f in features] + [latest_year, enc]],
        columns=features + ['year', 'neighbourhood_enc']
    )

    price_m2  = float(model.predict(X_new)[0])
    total     = price_m2 * surface
    low, high = total * 0.92, total * 1.08

    ratio = price_m2 / city_avg[latest_year]
    if ratio > 1.10:
        temp, label = 'hot',     'above city average — likely to overpay here'
    elif ratio < 0.90:
        temp, label = 'cool',    'below city average — good value area'
    else:
        temp, label = 'neutral', 'around the city average'

    display_data = {k: round(float(v), 2) for k, v in row.items()}

    return jsonify({
        'neighbourhood': neighbourhood,
        'price_m2':      round(price_m2, 1),
        'total':         int(round(total)),
        'low':           int(round(low)),
        'high':          int(round(high)),
        'temp':          temp,
        'label':         label,
        'data':          display_data,
    })

if __name__ == '__main__':
    app.run(debug=True)
