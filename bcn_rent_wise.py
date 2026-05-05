import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.preprocessing import LabelEncoder
import joblib
import warnings
warnings.filterwarnings('ignore')

# ── 1. load ──────────────────────────────────────────────────────────────────

def load_csv(path):
    for enc in ['utf-8-sig', 'latin-1', 'cp1252']:
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception:
            continue
    raise ValueError(f"could not read {path}")

socio_raw = load_csv('csv/ist-14075-15023-mun.csv')
rental_raw = load_csv('csv/Statistical table.csv')

print("socio columns  :", list(socio_raw.columns))
print("rental columns :", list(rental_raw.columns[:5]), "...")

# ── 2. clean socio (long → wide) ─────────────────────────────────────────────

socio_raw.columns = ['year', 'municipality', 'neighbourhood', 'concept', 'status', 'value']

socio = socio_raw[socio_raw['neighbourhood'] != 'total'].copy()

socio['value'] = socio['value'].astype(str).str.strip()
socio['value'] = socio['value'].replace(['..', '', ' '], np.nan)
socio['value'] = pd.to_numeric(socio['value'], errors='coerce')

socio_wide = socio.pivot_table(
    index=['year', 'neighbourhood'],
    columns='concept',
    values='value',
    aggfunc='first'
).reset_index()
socio_wide.columns.name = None

def find_col(df, keyword):
    matches = [c for c in df.columns if keyword.lower() in c.lower()]
    return matches[0] if matches else None

col_map = {}
mappings = {
    'avg_income':       'average income per person',
    'employed_pct':     'employed population',
    'foreign_pct':      'foreign population from low',
    'low_skilled_pct':  'low-skilled workers',
    'low_studies_pct':  'population with low studies',
    'young_no_edu_pct': 'young population without',
}
for new_name, keyword in mappings.items():
    original = find_col(socio_wide, keyword)
    if original:
        col_map[original] = new_name

socio_wide = socio_wide.rename(columns=col_map)
print("\nsocio features found:", [c for c in mappings.keys() if c in socio_wide.columns])

# ── 3. clean rental (wide → long) ────────────────────────────────────────────

rental = rental_raw[rental_raw['Location type'] == 'Barri'].copy()

year_cols = [c for c in rental.columns if str(c).isdigit()]
rental_long = rental.melt(
    id_vars=['Territory'],
    value_vars=year_cols,
    var_name='year',
    value_name='price_m2'
)
rental_long['year'] = rental_long['year'].astype(int)
rental_long['price_m2'] = rental_long['price_m2'].replace('-', np.nan)
rental_long['price_m2'] = pd.to_numeric(rental_long['price_m2'], errors='coerce')
rental_long = rental_long.dropna(subset=['price_m2'])

name_fixes = {
    'el Poble Sec - AEI Parc Montjuïc':             'el Poble Sec',
    'el Poble Sec - AEI Parc MontjuÃ¯c':            'el Poble Sec',
    'la Marina del Prat Vermell - AEI Zona Franca':  'la Marina del Prat Vermell',
    'Sants - Badal':                                 'Sants-Badal',
    'Sant Gervasi - la Bonanova':                    'Sant Gervasi-la Bonanova',
    'Sant Gervasi - Galvany':                        'Sant Gervasi-Galvany',
}
rental_long['neighbourhood'] = rental_long['Territory'].replace(name_fixes)
rental_long = rental_long[rental_long['year'].between(2015, 2023)]

# ── 4. merge ──────────────────────────────────────────────────────────────────

df = pd.merge(
    rental_long[['neighbourhood', 'year', 'price_m2']],
    socio_wide,
    on=['neighbourhood', 'year'],
    how='inner'
)

print(f"\nmerged shape    : {df.shape}")
print(f"neighbourhoods  : {df['neighbourhood'].nunique()}")
print(f"years covered   : {sorted(df['year'].unique())}")

rental_hoods = set(rental_long['neighbourhood'].unique())
socio_hoods  = set(socio_wide['neighbourhood'].unique())
unmatched = rental_hoods - socio_hoods
if unmatched:
    print(f"unmatched from rental: {unmatched}")

# ── 5. eda ───────────────────────────────────────────────────────────────────

print("\n── basic stats ──")
print(df[['price_m2', 'avg_income', 'employed_pct', 'foreign_pct', 'low_skilled_pct']].describe().round(2))
print(f"\nnull counts:\n{df.isnull().sum()}")

# ── 6. cleaning ───────────────────────────────────────────────────────────────

features = ['avg_income', 'employed_pct', 'foreign_pct', 'low_skilled_pct']

df_clean = df.dropna(subset=features + ['price_m2']).copy()
print(f"\nrows after dropping nulls: {len(df_clean)}")

q1, q3 = df_clean['price_m2'].quantile([0.25, 0.75])
iqr = q3 - q1
before = len(df_clean)
df_clean = df_clean[df_clean['price_m2'].between(q1 - 1.5*iqr, q3 + 1.5*iqr)]
print(f"rows after outlier removal: {len(df_clean)}  (removed {before - len(df_clean)})")

# ── 7. encode & split ────────────────────────────────────────────────────────

le = LabelEncoder()
df_clean['neighbourhood_enc'] = le.fit_transform(df_clean['neighbourhood'])

X = df_clean[features + ['year', 'neighbourhood_enc']]
y = df_clean['price_m2']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
print(f"\ntrain: {len(X_train)} rows  |  test: {len(X_test)} rows")

# ── 8. train ─────────────────────────────────────────────────────────────────

model = RandomForestRegressor(
    n_estimators=100,
    criterion='squared_error',   # matches iris example's use of criterion param
    max_depth=None,
    min_samples_leaf=2,
    random_state=1               # kept consistent with iris example
)
model.fit(X_train, y_train)

# ── 9. evaluate ───────────────────────────────────────────────────────────────

y_pred = model.predict(X_test)
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2   = r2_score(y_test, y_pred)

# overfitting check (from iris example pattern)
r2_train = r2_score(y_train, model.predict(X_train))

print(f"\n── results ──")
print(f"rmse        : {rmse:.3f} €/m²")
print(f"r² (test)   : {r2:.3f}")
print(f"r² (train)  : {r2_train:.3f}")
print(f"mismatched samples: {(abs(y_test - y_pred) > 1.0).sum()}")

# feature importance (RF bonus over linear regression)
importances = pd.Series(model.feature_importances_, index=X.columns)
print(f"\nfeature importances:\n{importances.sort_values(ascending=False).round(3)}")

results = pd.DataFrame({
    'neighbourhood': df_clean.loc[y_test.index, 'neighbourhood'].values,
    'year':          df_clean.loc[y_test.index, 'year'].values,
    'actual':        y_test.values.round(2),
    'predicted':     y_pred.round(2),
    'error':         (y_pred - y_test.values).round(2),
})
print(f"\nsample predictions:\n{results.head(10).to_string(index=False)}")

# ── 10. demo prediction function ─────────────────────────────────────────────

def predict_price(neighbourhood, year, avg_income, employed_pct, foreign_pct, low_skilled_pct):
    """return predicted price per m² for a neighbourhood"""
    if neighbourhood not in le.classes_:
        raise ValueError(f"unknown neighbourhood. available: {list(le.classes_)}")
    enc = le.transform([neighbourhood])[0]
    X_new = pd.DataFrame(
        [[avg_income, employed_pct, foreign_pct, low_skilled_pct, year, enc]],
        columns=features + ['year', 'neighbourhood_enc']
    )
    return round(model.predict(X_new)[0], 2)

demo = df_clean[df_clean['year'] == 2023].iloc[0]
price = predict_price(
    demo['neighbourhood'], 2023,
    demo['avg_income'], demo['employed_pct'],
    demo['foreign_pct'], demo['low_skilled_pct']
)
print(f"\ndemo prediction for '{demo['neighbourhood']}' in 2023:")
print(f"  predicted : {price} €/m²")
print(f"  actual    : {demo['price_m2']} €/m²")

# ── 11. save ──────────────────────────────────────────────────────────────────

joblib.dump(model,    'model.pkl')
joblib.dump(le,       'label_encoder.pkl')
joblib.dump(features, 'features.pkl')

city_avg        = df_clean.groupby('year')['price_m2'].mean().to_dict()
latest_year     = df_clean['year'].max()
city_avg_latest = city_avg[latest_year]

latest_df = df_clean[df_clean['year'] == latest_year].set_index('neighbourhood')[features]

neighbourhood_data = {}

for name, row in latest_df.iterrows():
    enc = le.transform([name])[0]
    row_values = [row[f] for f in features] + [latest_year, enc]
    X_nb = pd.DataFrame([row_values], columns=features + ['year', 'neighbourhood_enc'])

    price_m2 = round(float(model.predict(X_nb)[0]), 1)
    ratio    = price_m2 / city_avg_latest
    temp     = 'hot' if ratio > 1.10 else 'cool' if ratio < 0.90 else 'neutral'

    neighbourhood_data[name] = {
        **{f: row[f] for f in features},
        'price_m2': price_m2,
        'temp':     temp,
    }

joblib.dump(neighbourhood_data, 'neighbourhood_data.pkl')
joblib.dump(city_avg,           'city_avg.pkl')

print(f"\nmodel saved → model.pkl, label_encoder.pkl, features.pkl")
print(f"app data saved → neighbourhood_data.pkl ({len(neighbourhood_data)} neighbourhoods)")
print(f"city averages saved → city_avg.pkl")