# BCN Rent Wise — Line by Line Explanation

This document explains every line of the project code.  
No prior knowledge assumed.

---

## What the project does (big picture)

We have two datasets:
- Rental prices per neighbourhood in Barcelona (€/m²), per year
- Socioeconomic data per neighbourhood (income, employment, etc.), per year

We merge them, train a machine learning model to learn the relationship between socioeconomic conditions and rent prices, then build a web app where a user picks a neighbourhood and gets a predicted rent price.

---

## FILE 1: `bcn_rent_wise.py` — Training Script

This file does all the data work and trains the model. You run it once.

---

### Imports

```python
import pandas as pd
```
`pandas` is a library for working with tables of data (like Excel, but in Python). We use it to load, clean, and merge our CSV files.

```python
import numpy as np
```
`numpy` is a math library. We use it for things like `np.nan` (a special value meaning "no data") and `np.sqrt` (square root).

```python
from sklearn.linear_model import LinearRegression
```
`sklearn` (scikit-learn) is the machine learning library. `LinearRegression` is the model we use — it learns a formula like `price = a × income + b × employment + ...`

```python
from sklearn.model_selection import train_test_split
```
This splits our data into two parts: one for training the model, one for testing how accurate it is.

```python
from sklearn.metrics import mean_squared_error, r2_score
```
These are functions to measure how good our model is. `mean_squared_error` measures average error, `r2_score` measures how well the model explains the data (0 = useless, 1 = perfect).

```python
from sklearn.preprocessing import LabelEncoder
```
Machine learning models only understand numbers, not text. `LabelEncoder` converts neighbourhood names like "el Raval" into numbers like 42.

```python
import joblib
```
`joblib` saves Python objects to disk as `.pkl` files so we can load them later without retraining.

```python
import warnings
warnings.filterwarnings('ignore')
```
Some libraries print harmless warnings that clutter the output. This silences them.

---

### Section 1 — Loading the CSVs

```python
def load_csv(path):
```
We define a function called `load_csv` that takes a file path as input.

```python
    for enc in ['utf-8-sig', 'latin-1', 'cp1252']:
```
CSV files can be encoded (saved) in different formats. We try three common ones in order. `utf-8-sig` handles the "BOM" character that Excel sometimes adds to the start of files.

```python
        try:
            return pd.read_csv(path, encoding=enc)
        except Exception:
            continue
```
We try to read the file with the current encoding. If it fails (raises an error), we `continue` to the next encoding. If it succeeds, we `return` the loaded table immediately.

```python
    raise ValueError(f"could not read {path}")
```
If none of the three encodings worked, we stop the program with an error message.

```python
socio_raw = load_csv('csv/ist-14075-15023-mun.csv')
rental_raw = load_csv('csv/Statistical table.csv')
```
Load both CSV files using our function. `socio_raw` = socioeconomic data, `rental_raw` = rental prices.

```python
print("socio columns  :", list(socio_raw.columns))
print("rental columns :", list(rental_raw.columns[:5]), "...")
```
Print the column names so we can see what we loaded. `[:5]` means "just the first 5 columns" (the rental file has many year columns).

---

### Section 2 — Cleaning the Socioeconomic Data (long → wide)

The socio CSV is in "long" format: each row is one measurement (one neighbourhood, one year, one concept). We need "wide" format: one row per neighbourhood per year, with all concepts as columns.

```python
socio_raw.columns = ['year', 'municipality', 'neighbourhood', 'concept', 'status', 'value']
```
The original column names are messy. We rename them to clean, simple names.

```python
socio = socio_raw[socio_raw['neighbourhood'] != 'total'].copy()
```
The dataset includes summary rows where neighbourhood = "total" (city-wide totals). We remove these — we only want individual neighbourhood rows. `.copy()` creates a separate copy so changes don't affect the original.

```python
socio['value'] = socio['value'].astype(str).str.strip()
```
Convert the value column to text (string) and remove leading/trailing spaces. Some values might be " 14.3 " instead of "14.3".

```python
socio['value'] = socio['value'].replace(['..', '', ' '], np.nan)
```
In the dataset, missing values are written as `..` (two dots), empty string, or a space. We replace all of these with `np.nan`, which is Python's standard way of saying "no data".

```python
socio['value'] = pd.to_numeric(socio['value'], errors='coerce')
```
Convert the value column from text to numbers. `errors='coerce'` means: if a value can't be converted to a number, make it `NaN` instead of crashing.

```python
socio_wide = socio.pivot_table(
    index=['year', 'neighbourhood'],
    columns='concept',
    values='value',
    aggfunc='first'
).reset_index()
```
This is the long→wide transformation. `pivot_table` reshapes the data so that each unique value in the `concept` column becomes its own column. `index` defines what each row represents (one row per year+neighbourhood combination). `aggfunc='first'` handles duplicates by taking the first value. `.reset_index()` turns the year and neighbourhood back into regular columns.

```python
socio_wide.columns.name = None
```
After pivot, pandas adds a label to the column axis. We remove it to keep things clean.

```python
def find_col(df, keyword):
    matches = [c for c in df.columns if keyword.lower() in c.lower()]
    return matches[0] if matches else None
```
A helper function that finds a column by keyword. For example, searching "average income" will find the column named "Average income per person (€)" even if the name has special characters or different capitalization. This protects us from encoding differences in column names.

```python
col_map = {}
mappings = {
    'avg_income':       'average income per person',
    'employed_pct':     'employed population',
    'foreign_pct':      'foreign population from low',
    'low_skilled_pct':  'low-skilled workers',
    'low_studies_pct':  'population with low studies',
    'young_no_edu_pct': 'young population without',
}
```
We define a dictionary mapping our clean short names (left) to keywords we search for in the actual column names (right).

```python
for new_name, keyword in mappings.items():
    original = find_col(socio_wide, keyword)
    if original:
        col_map[original] = new_name
```
For each mapping, we find the actual column name using `find_col`, then add it to `col_map` as `{actual_name: short_name}`.

```python
socio_wide = socio_wide.rename(columns=col_map)
```
Rename all matched columns using the map we just built.

```python
print("\nsocio features found:", [c for c in mappings.keys() if c in socio_wide.columns])
```
Print which features were successfully found and renamed (as a sanity check).

---

### Section 3 — Cleaning the Rental Data (wide → long)

The rental CSV is in "wide" format: each row is a neighbourhood, and each year is its own column. We need "long" format: one row per neighbourhood per year.

```python
rental = rental_raw[rental_raw['Location type'] == 'Barri'].copy()
```
The rental file has rows for the whole city, districts, and neighbourhoods. `Barri` is Catalan for "neighbourhood". We keep only neighbourhood-level rows.

```python
year_cols = [c for c in rental.columns if str(c).isdigit()]
```
Find all columns that are just a number (e.g. "2015", "2016", ..., "2025"). These are the year columns.

```python
rental_long = rental.melt(
    id_vars=['Territory'],
    value_vars=year_cols,
    var_name='year',
    value_name='price_m2'
)
```
`melt` is the wide→long transformation. It takes all the year columns and stacks them into two columns: `year` and `price_m2`. `id_vars` specifies which columns to keep as-is (the neighbourhood name).

```python
rental_long['year'] = rental_long['year'].astype(int)
```
The year column is currently text ("2015"). Convert it to an integer (2015).

```python
rental_long['price_m2'] = rental_long['price_m2'].replace('-', np.nan)
rental_long['price_m2'] = pd.to_numeric(rental_long['price_m2'], errors='coerce')
rental_long = rental_long.dropna(subset=['price_m2'])
```
The rental data uses "-" for missing values. Replace with `NaN`, convert to numeric, then drop rows where price is missing.

```python
name_fixes = {
    'el Poble Sec - AEI Parc Montjuïc': 'el Poble Sec',
    'el Poble Sec - AEI Parc MontjuÃ¯c':    'el Poble Sec',
    'la Marina del Prat Vermell - AEI Zona Franca': 'la Marina del Prat Vermell',
    'Sants - Badal':              'Sants-Badal',
    'Sant Gervasi - la Bonanova': 'Sant Gervasi-la Bonanova',
    'Sant Gervasi - Galvany':     'Sant Gervasi-Galvany',
}
rental_long['neighbourhood'] = rental_long['Territory'].replace(name_fixes)
```
The two datasets use slightly different neighbourhood names. For example, one says "Sants - Badal" (with spaces around the dash) and the other says "Sants-Badal". We fix them to match. `replace` swaps any matching value in the dictionary.

```python
rental_long = rental_long[rental_long['year'].between(2015, 2023)]
```
Keep only years 2015–2023, because the socio data only covers those years. `.between(a, b)` is inclusive on both ends.

---

### Section 4 — Merging

```python
df = pd.merge(
    rental_long[['neighbourhood', 'year', 'price_m2']],
    socio_wide,
    on=['neighbourhood', 'year'],
    how='inner'
)
```
Combine the two tables. `on=['neighbourhood', 'year']` means rows are matched when both neighbourhood AND year are the same. `how='inner'` means we only keep rows that exist in both datasets (if a neighbourhood is in one but not the other, it's dropped).

```python
print(f"\nmerged shape    : {df.shape}")
print(f"neighbourhoods  : {df['neighbourhood'].nunique()}")
print(f"years covered   : {sorted(df['year'].unique())}")
```
Print the shape of the merged table (rows × columns), how many unique neighbourhoods, and which years are present.

```python
rental_hoods = set(rental_long['neighbourhood'].unique())
socio_hoods  = set(socio_wide['neighbourhood'].unique())
unmatched = rental_hoods - socio_hoods
if unmatched:
    print(f"unmatched from rental: {unmatched}")
```
Find neighbourhoods that exist in the rental data but NOT in the socio data (so we know what got dropped in the merge).

---

### Section 5 — Exploratory Data Analysis

```python
print(df[['price_m2', 'avg_income', 'employed_pct', 'foreign_pct', 'low_skilled_pct']].describe().round(2))
```
`.describe()` prints summary statistics: count, mean, min, max, standard deviation, and quartiles for each column. This gives us a quick overview of the data distribution.

```python
print(f"\nnull counts:\n{df.isnull().sum()}")
```
Count how many missing values exist in each column.

---

### Section 6 — Cleaning

```python
features = ['avg_income', 'employed_pct', 'foreign_pct', 'low_skilled_pct']
```
Define which columns we'll use as input features for the model. These are the socioeconomic indicators we believe influence rent prices.

```python
df_clean = df.dropna(subset=features + ['price_m2']).copy()
```
Drop any rows where any of the 4 features OR the price is missing. We can't train on incomplete data.

```python
q1, q3 = df_clean['price_m2'].quantile([0.25, 0.75])
iqr = q3 - q1
```
Calculate the 25th percentile (Q1) and 75th percentile (Q3) of prices. The IQR (Interquartile Range) is the distance between them — it represents the "middle 50%" of the data.

```python
before = len(df_clean)
df_clean = df_clean[df_clean['price_m2'].between(q1 - 1.5*iqr, q3 + 1.5*iqr)]
print(f"rows after outlier removal: {len(df_clean)}  (removed {before - len(df_clean)})")
```
Remove rows where the price is unusually high or low (more than 1.5 × IQR beyond Q1 or Q3). This is the standard IQR outlier removal method. Outliers can distort the model's learning.

---

### Section 7 — Encoding and Splitting

```python
le = LabelEncoder()
df_clean['neighbourhood_enc'] = le.fit_transform(df_clean['neighbourhood'])
```
Convert neighbourhood names to numbers. `fit_transform` learns the mapping (e.g. "el Raval" → 42) and applies it in one step. We add the result as a new column.

```python
X = df_clean[features + ['year', 'neighbourhood_enc']]
y = df_clean['price_m2']
```
`X` is the input matrix (what the model receives). `y` is the target (what the model tries to predict). We include year and the encoded neighbourhood as extra features so the model knows when and where.

```python
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)
```
Split 80% of data for training, 20% for testing. `random_state=42` makes the split reproducible — anyone running the code gets the same split.

---

### Section 8 — Training

```python
model = LinearRegression()
model.fit(X_train, y_train)
```
Create the model and train it. `fit` finds the best coefficients (weights) for the formula `price = w1×income + w2×employment + w3×foreign + w4×low_skilled + w5×year + w6×neighbourhood + bias`.

---

### Section 9 — Evaluation

```python
y_pred = model.predict(X_test)
```
Use the trained model to make predictions on the test set (data it has never seen).

```python
rmse = np.sqrt(mean_squared_error(y_test, y_pred))
r2   = r2_score(y_test, y_pred)
```
`RMSE` (Root Mean Squared Error): average error in €/m². Lower is better.  
`R²`: how much of the price variation the model explains. 0.65 means the model explains 65% of the variation.

```python
results = pd.DataFrame({
    'neighbourhood': df_clean.loc[y_test.index, 'neighbourhood'].values,
    'year':          df_clean.loc[y_test.index, 'year'].values,
    'actual':        y_test.values.round(2),
    'predicted':     y_pred.round(2),
    'error':         (y_pred - y_test.values).round(2),
})
print(results.head(10).to_string(index=False))
```
Build a table comparing actual vs predicted prices for the first 10 test rows. `y_test.index` gives us the original row positions so we can look up the neighbourhood names.

---

### Section 10 — Demo Prediction

```python
def predict_price(neighbourhood, year, avg_income, employed_pct, foreign_pct, low_skilled_pct):
```
A reusable function to predict price for any neighbourhood given its socioeconomic data.

```python
    if neighbourhood not in le.classes_:
        raise ValueError(f"unknown neighbourhood. available: {list(le.classes_)}")
```
Check that the neighbourhood exists in our encoder. If not, stop with a helpful error.

```python
    enc = le.transform([neighbourhood])[0]
```
Convert the neighbourhood name to its number. Note the `[0]` — `transform` returns a list, we take the first (and only) element.

```python
    X_new = pd.DataFrame(
        [[avg_income, employed_pct, foreign_pct, low_skilled_pct, year, enc]],
        columns=features + ['year', 'neighbourhood_enc']
    )
    return round(model.predict(X_new)[0], 2)
```
Build a one-row DataFrame in the exact same format the model was trained on, then predict. `.round(2)` gives 2 decimal places.

```python
demo = df_clean[df_clean['year'] == 2023].iloc[0]
price = predict_price(demo['neighbourhood'], 2023, ...)
```
Pick the first 2023 row and run a demo prediction so we can visually verify the model is working.

---

### Section 11 — Saving Artifacts

```python
joblib.dump(model,    'model.pkl')
joblib.dump(le,       'label_encoder.pkl')
joblib.dump(features, 'features.pkl')
```
Save the trained model, the label encoder, and the features list to disk. The app needs all three to make predictions.

```python
latest_year = df_clean['year'].max()
neighbourhood_data = (
    df_clean[df_clean['year'] == latest_year]
    .set_index('neighbourhood')[features]
    .to_dict(orient='index')
)
joblib.dump(neighbourhood_data, 'neighbourhood_data.pkl')
```
For each neighbourhood, save its most recent (2023) socioeconomic data. The app uses this so the user doesn't have to manually enter income, employment rates, etc. — it looks them up automatically.

```python
city_avg = df_clean.groupby('year')['price_m2'].mean().to_dict()
joblib.dump(city_avg, 'city_avg.pkl')
```
Calculate the average rent price across all neighbourhoods for each year. The app uses the 2023 average to determine if a neighbourhood is above or below the city average ("market temperature").

---

## FILE 2: `app.py` — Streamlit Web App

This file creates the web interface. You run it with `python3 -m streamlit run app.py`.

---

```python
import streamlit as st
```
`streamlit` is the library that turns Python code into a web app. Every `st.something()` call creates a UI element.

```python
import joblib
import numpy as np
import pandas as pd
```
Same libraries as before. We need them to load the saved model and build prediction inputs.

---

### Loading Artifacts

```python
@st.cache_resource
def load_artifacts():
```
`@st.cache_resource` is a decorator — it tells Streamlit to run this function only once and reuse the result every time the page refreshes. Without it, the model would reload from disk on every user interaction, making the app slow.

```python
    model             = joblib.load('model.pkl')
    le                = joblib.load('label_encoder.pkl')
    features          = joblib.load('features.pkl')
    neighbourhood_data = joblib.load('neighbourhood_data.pkl')
    city_avg          = joblib.load('city_avg.pkl')
    return model, le, features, neighbourhood_data, city_avg
```
Load all 5 saved artifacts from disk and return them.

```python
model, le, features, neighbourhood_data, city_avg = load_artifacts()
```
Call the function and unpack the 5 returned values into separate variables.

```python
neighbourhoods = sorted(neighbourhood_data.keys())
latest_year = max(city_avg.keys())
```
Get a sorted list of all neighbourhood names (for the dropdown). Get the most recent year available (2023).

---

### UI Layout

```python
st.title("bcn rent wise")
st.caption("predict fair rental prices in barcelona by neighbourhood")
st.divider()
```
`st.title` shows a large heading. `st.caption` shows small grey text below it. `st.divider` draws a horizontal line.

```python
neighbourhood = st.selectbox("neighbourhood", neighbourhoods)
```
Creates a dropdown menu. The user's selection is stored in the `neighbourhood` variable.

```python
surface = st.number_input("surface area (m²)", min_value=10, max_value=300, value=60, step=5)
```
Creates a number input field. Default value is 60, minimum is 10, maximum is 300, and it increments by 5 when the user clicks the arrows.

```python
st.divider()
```
Another horizontal line for visual separation.

---

### Prediction Logic

```python
if st.button("predict price", type="primary"):
```
Creates a button. Everything indented below only runs when the user clicks the button. `type="primary"` makes it blue.

```python
    row = neighbourhood_data[neighbourhood]
```
Look up the 2023 socioeconomic data for the selected neighbourhood. `row` is a dictionary like `{'avg_income': 18500, 'employed_pct': 62.3, ...}`.

```python
    enc = le.transform([neighbourhood])[0]
```
Convert the neighbourhood name to its number using the saved label encoder.

```python
    X_new = pd.DataFrame(
        [[row[f] for f in features] + [latest_year, enc]],
        columns=features + ['year', 'neighbourhood_enc']
    )
```
Build the input for the model. `[row[f] for f in features]` loops through the 4 feature names and grabs their values. We add the year (2023) and the encoded neighbourhood number. The result is a one-row DataFrame identical in structure to what the model was trained on.

```python
    price_m2 = model.predict(X_new)[0]
    total    = price_m2 * surface
```
Run the prediction. `[0]` gets the single number out of the returned array. Multiply by surface area to get the monthly total.

```python
    low  = total * 0.92
    high = total * 1.08
```
Calculate a ±8% price range. Models aren't perfectly precise, so showing a range is more honest than a single number.

```python
    city_mean = city_avg[latest_year]
    ratio = price_m2 / city_mean
```
Get the city-wide average price for 2023. Calculate how the predicted price compares to it (e.g. ratio = 1.2 means 20% above average).

```python
    if ratio > 1.10:
        temp, color, emoji = "hot 🔥",    "red",    "above average — likely to overpay here"
    elif ratio < 0.90:
        temp, color, emoji = "cool ❄️",   "blue",   "below average — good value area"
    else:
        temp, color, emoji = "neutral ⚖️", "orange", "around the city average"
```
Assign a "market temperature" label based on the ratio. More than 10% above average = hot market. More than 10% below = cool. Otherwise neutral.

```python
    st.subheader(f"predicted price for {neighbourhood}")
```
Show a heading with the selected neighbourhood name.

```python
    col1, col2, col3 = st.columns(3)
    col1.metric("price per m²",    f"{price_m2:.1f} €/m²")
    col2.metric("estimated total", f"{total:.0f} €/month")
    col3.metric("market temp",     temp)
```
Create 3 side-by-side columns and put a metric card in each. `:.1f` formats to 1 decimal place, `:.0f` formats to 0 decimal places (rounds to whole number).

```python
    st.info(f"**price range:** {low:.0f} – {high:.0f} €/month  \n**{emoji}**")
```
Show an info box with the price range and the market temperature message. `**text**` makes it bold in markdown.

```python
    with st.expander("data used for this prediction"):
        st.write(pd.DataFrame([row], index=[neighbourhood]).T.rename(columns={neighbourhood: "value"}))
```
An expandable section (collapsed by default) that shows the raw socioeconomic data used. `.T` transposes the table (flips rows and columns) so features appear as rows instead of columns, which is easier to read.

---

## How it all fits together

```
bcn_rent_wise.py  →  trains model  →  saves .pkl files
                                             ↓
app.py            →  loads .pkl files  →  serves predictions to user
```

You only run `bcn_rent_wise.py` once (or when you want to retrain). The app reads the saved files every time it starts.
