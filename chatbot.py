import nltk
from nltk.stem import WordNetLemmatizer

nltk.download('punkt',                          quiet=True)
nltk.download('punkt_tab',                      quiet=True)
nltk.download('averaged_perceptron_tagger',     quiet=True)
nltk.download('averaged_perceptron_tagger_eng', quiet=True)
nltk.download('wordnet',                        quiet=True)

lemmatizer = WordNetLemmatizer()

_TEMP_LABEL = {
    'hot':     'above city average, likely to overpay here',
    'cool':    'below city average, good value area',
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

# Sentinel value stored in selections when a user skips a step
_SKIP = '__skip__'

SKIP_KEYWORDS = {
    'skip', 'any', 'either', 'both', 'whatever', 'idc',
    'anything', 'indifferent', 'pass', 'next', 'none',
}

SKIP_PHRASES = {
    'no preference', 'dont care', "don't care",
    'doesnt matter', "doesn't matter", 'no matter',
}


def is_skip(text):
    lowered = text.lower().strip()
    if any(phrase in lowered for phrase in SKIP_PHRASES):
        return True
    tokens = set(nltk.word_tokenize(lowered))
    return bool(tokens & SKIP_KEYWORDS)


CONVERSATION_STEPS = [
    {
        'ask': (
            "What kind of budget are you thinking about?\n"
            "You can say things like cheap, mid-range, luxury, or just say skip."
        ),
        'key': 'budget',
        'let': 'a',
        'keywords': BUDGET_KEYWORDS,
    },
    {
        'ask': (
            "Would you rather live somewhere more international, "
            "or somewhere that feels more local?\n"
            "You can also say skip if you don’t mind either."
        ),
        'key': 'community',
        'let': 'n',
        'keywords': COMMUNITY_KEYWORDS,
    },
    {
        'ask': (
            "Do you prefer a more affluent area, "
            "or somewhere more working-class and down-to-earth?\n"
            "Or just say skip."
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
    selections = {}

    for msg in user_messages:
        text = msg['content'].strip()

        if not text:
            continue

        for step_info in CONVERSATION_STEPS:

            if step_info['key'] not in selections:
                if is_skip(text):
                    selections[step_info['key']] = _SKIP
                    break

                extracted = extract_from_message(
                    text,
                    step_info['let'],
                    step_info['keywords']
                )

                if extracted:
                    selections[step_info['key']] = extracted

    return selections


def filter_neighbourhoods(data, selections):
    results = list(data.items())

    if 'budget' in selections and selections['budget'] != _SKIP:
        budget_temps = selections['budget']

        results = [
            (name, row)
            for name, row in results
            if row.get('temp') in budget_temps
        ]

    community_sel = selections.get('community')
    income_sel    = selections.get('income')

    if not community_sel and not income_sel:
        return results

    if community_sel == _SKIP and income_sel == _SKIP:
        return results

    scores = {name: 0 for name, _ in results}

    if community_sel and community_sel != _SKIP:

        prefs = community_sel

        if 'high' in prefs and 'low' not in prefs:
            by_community = sorted(
                results,
                key=lambda x: x[1].get('foreign_pct', 0),
                reverse=True
            )

        elif 'low' in prefs and 'high' not in prefs:
            by_community = sorted(
                results,
                key=lambda x: x[1].get('foreign_pct', 0),
                reverse=False
            )

        else:
            by_community = []

        for position, (name, _) in enumerate(by_community):
            scores[name] += position

    if income_sel and income_sel != _SKIP:

        prefs = income_sel

        if 'high' in prefs and 'low' not in prefs:
            by_income = sorted(
                results,
                key=lambda x: x[1].get('avg_income', 0),
                reverse=True
            )

        elif 'low' in prefs and 'high' not in prefs:
            by_income = sorted(
                results,
                key=lambda x: x[1].get('avg_income', 0),
                reverse=False
            )

        else:
            by_income = []

        for position, (name, _) in enumerate(by_income):
            scores[name] += position

    results.sort(key=lambda x: scores[x[0]])

    return results


def format_neighbourhood_results(results, top_n=5):

    if not results:
        return (
            "I couldn't find any neighbourhoods that match those preferences.\n"
            "Try changing a few answers and see what comes up."
        )

    names = [name for name, _ in results[:top_n]]

    listed = '\n'.join('  • ' + n for n in names)

    return (
        "Here are a few neighbourhoods you might like based on what you told me:\n\n"
        + listed
    )


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

            # Check skip first
            if is_skip(current_text):
                selections[step_info['key']] = _SKIP
                newly_found = True
                break

            extracted = extract_from_message(
                current_text,
                step_info['let'],
                step_info['keywords']
            )

            if extracted:
                selections[step_info['key']] = extracted
                newly_found = True

    missing = [
        s for s in CONVERSATION_STEPS
        if s['key'] not in selections
    ]

    if not missing:
        filtered = filter_neighbourhoods(neighbourhood_data, selections)

        return format_neighbourhood_results(filtered)

    if newly_found:
        return missing[0]['ask']

    return (
        "Sorry, I didn't quite get that.\n\n"
        + missing[0]['ask']
    )