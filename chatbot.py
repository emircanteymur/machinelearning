import nltk
from nltk.stem import WordNetLemmatizer

nltk.download('punkt',                          quiet=True)
nltk.download('punkt_tab',                      quiet=True)
nltk.download('averaged_perceptron_tagger',     quiet=True)
nltk.download('averaged_perceptron_tagger_eng', quiet=True)
nltk.download('wordnet',                        quiet=True)

lemmatizer = WordNetLemmatizer()

_TEMP_LABEL = {
    'hot':     'above city average — likely to overpay here',
    'cool':    'below city average — good value area',
    'neutral': 'around the city average',
}

BUDGET_KEYWORDS = {
    'cheap': 'cool', 'afford': 'cool', 'affordable': 'cool',
    'budget': 'cool', 'low': 'cool', 'inexpensive': 'cool', 'value': 'cool',
    'moderate': 'neutral', 'mid': 'neutral', 'medium': 'neutral',
    'midrange': 'neutral', 'average': 'neutral',
    'luxury': 'hot', 'expensive': 'hot', 'high': 'hot',
    'premium': 'hot', 'lavish': 'hot', 'upscale': 'hot', 'pricey': 'hot',
}

COMMUNITY_KEYWORDS = {
    'international': 'high', 'expat': 'high', 'foreign': 'high',
    'diverse': 'high', 'multicultural': 'high', 'cosmopolitan': 'high', 'global': 'high',
    'local': 'low', 'spanish': 'low', 'traditional': 'low',
    'authentic': 'low', 'catalan': 'low', 'native': 'low',
}

INCOME_KEYWORDS = {
    'wealthy': 'high', 'affluent': 'high', 'rich': 'high', 'upscale': 'high',
    'prosperous': 'high', 'professional': 'high', 'well-off': 'high',
    'working': 'low', 'modest': 'low', 'humble': 'low',
    'working-class': 'low', 'blue-collar': 'low',
}

CONVERSATION_STEPS = [
    {
        'ask': (
            "What is your budget level?\n"
            "(e.g. 'cheap', 'mid-range')"
        ),
        'key': 'budget',
        'let': 'a',
        'keywords': BUDGET_KEYWORDS,
    },
    {
        'ask': (
            "Do you prefer an international community or a more local neighbourhood?\n"
            "(e.g. 'international', 'local')"
        ),
        'key': 'community',
        'let': 'n',
        'keywords': COMMUNITY_KEYWORDS,
    },
    {
        'ask': (
            "Do you prefer a wealthier area or a more working-class neighbourhood?\n"
            "(e.g. 'affluent', 'working class')"
        ),
        'key': 'income',
        'let': 'a',
        'keywords': INCOME_KEYWORDS,
    },
]


def extract(tags, words, let, keywords):
    all_words = [lemmatizer.lemmatize(w.lower(), pos=let) for w in words]
    found = []
    for word in all_words:
        if word in keywords:
            value = keywords[word]
            if value not in found:
                found.append(value)
    return found


def extract_from_message(text, let, keywords):
    words = nltk.word_tokenize(text.lower())
    tags  = nltk.pos_tag(words)
    return extract(tags, words, let, keywords)


def get_current_state(user_messages):
    """Replay history, greedily extracting any key found in each message."""
    selections = {}
    for msg in user_messages:
        text = msg['content'].strip()
        if not text:
            continue
        for step_info in CONVERSATION_STEPS:
            if step_info['key'] not in selections:
                extracted = extract_from_message(text, step_info['let'], step_info['keywords'])
                if extracted:
                    selections[step_info['key']] = extracted
    return selections


def filter_neighbourhoods(data, selections):
    results = list(data.items())

    if 'budget' in selections:
        budget_temps = selections['budget']
        results = [(name, row) for name, row in results if row.get('temp') in budget_temps]

    if not selections.get('community') and not selections.get('income'):
        return results

    scores = {}
    for name, row in results:
        scores[name] = 0

    if 'community' in selections:
        prefs = selections['community']
        if 'high' in prefs and 'low' not in prefs:
            by_community = sorted(results, key=lambda x: x[1].get('foreign_pct', 0), reverse=True)
        elif 'low' in prefs and 'high' not in prefs:
            by_community = sorted(results, key=lambda x: x[1].get('foreign_pct', 0), reverse=False)
        else:
            by_community = []
        for position, (name, row) in enumerate(by_community):
            scores[name] += position

    if 'income' in selections:
        prefs = selections['income']
        if 'high' in prefs and 'low' not in prefs:
            by_income = sorted(results, key=lambda x: x[1].get('avg_income', 0), reverse=True)
        elif 'low' in prefs and 'high' not in prefs:
            by_income = sorted(results, key=lambda x: x[1].get('avg_income', 0), reverse=False)
        else:
            by_income = []
        for position, (name, row) in enumerate(by_income):
            scores[name] += position

    results.sort(key=lambda x: scores[x[0]])
    return results


def format_neighbourhood_results(results, top_n=5):
    if not results:
        return "No neighbourhoods found matching your criteria. Try different preferences!"

    names = [name for name, _ in results[:top_n]]
    listed = '\n'.join('  • ' + n for n in names)
    return 'Based on your preferences, try looking up these neighbourhoods in the app:\n\n' + listed


def handle_message(messages, neighbourhood_data):
    user_messages = [m for m in messages if m['role'] == 'user']

    selections = get_current_state(user_messages[:-1])

    current_text = user_messages[-1]['content'].strip()

    if not current_text:
        filtered = filter_neighbourhoods(neighbourhood_data, selections)
        return format_neighbourhood_results(filtered)

    newly_found = False
    for step_info in CONVERSATION_STEPS:
        if step_info['key'] not in selections:
            extracted = extract_from_message(current_text, step_info['let'], step_info['keywords'])
            if extracted:
                selections[step_info['key']] = extracted
                newly_found = True

    missing = [s for s in CONVERSATION_STEPS if s['key'] not in selections]

    if not missing:
        filtered = filter_neighbourhoods(neighbourhood_data, selections)
        return format_neighbourhood_results(filtered)

    if newly_found:
        return missing[0]['ask']

    return 'Sorry, I didn\'t understand that. Could you try again?\n\n' + missing[0]['ask']