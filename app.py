import streamlit as st
import joblib
import numpy as np
import pandas as pd

# ── load saved artifacts ──────────────────────────────────────────────────────

@st.cache_resource
def load_artifacts():
    model             = joblib.load('model.pkl')
    le                = joblib.load('label_encoder.pkl')
    features          = joblib.load('features.pkl')
    neighbourhood_data = joblib.load('neighbourhood_data.pkl')
    city_avg          = joblib.load('city_avg.pkl')
    return model, le, features, neighbourhood_data, city_avg

model, le, features, neighbourhood_data, city_avg = load_artifacts()

neighbourhoods = sorted(neighbourhood_data.keys())
latest_year = max(city_avg.keys())

# ── ui ───────────────────────────────────────────────────────────────────────

st.title("bcn rent wise")
st.caption("predict fair rental prices in barcelona by neighbourhood")

st.divider()

neighbourhood = st.selectbox("neighbourhood", neighbourhoods)
surface = st.number_input("surface area (m²)", min_value=10, max_value=300, value=60, step=5)

st.divider()

if st.button("predict price", type="primary"):
    row = neighbourhood_data[neighbourhood]
    enc = le.transform([neighbourhood])[0]

    X_new = pd.DataFrame(
        [[row[f] for f in features] + [latest_year, enc]],
        columns=features + ['year', 'neighbourhood_enc']
    )

    price_m2 = model.predict(X_new)[0]
    total    = price_m2 * surface

    # price range ±8%
    low  = total * 0.92
    high = total * 1.08

    # market temperature vs city average
    city_mean = city_avg[latest_year]
    ratio = price_m2 / city_mean

    if ratio > 1.10:
        temp, color, emoji = "hot 🔥",    "red",    "above average — likely to overpay here"
    elif ratio < 0.90:
        temp, color, emoji = "cool ❄️",   "blue",   "below average — good value area"
    else:
        temp, color, emoji = "neutral ⚖️", "orange", "around the city average"

    # results
    st.subheader(f"predicted price for {neighbourhood}")

    col1, col2, col3 = st.columns(3)
    col1.metric("price per m²",    f"{price_m2:.1f} €/m²")
    col2.metric("estimated total", f"{total:.0f} €/month")
    col3.metric("market temp",     temp)

    st.info(f"**price range:** {low:.0f} – {high:.0f} €/month  \n**{emoji}**")

    # show the socioeconomic data used
    with st.expander("data used for this prediction"):
        st.write(pd.DataFrame([row], index=[neighbourhood]).T.rename(columns={neighbourhood: "value"}))
