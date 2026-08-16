"""
Sentiment and toxicity scoring (course requirement 2.e.iii).

This is a lexicon scorer, not a language model. It is honest about that: it
catches obvious hostility in English and nothing subtler. Sarcasm, implication,
Hebrew, and creative spelling all get past it.

That limitation is the reason the surrounding design matters more than the
scorer itself. A flag here does not delete anything — it marks content for a
human moderator to look at. A false positive costs a moderator ten seconds; a
false negative is caught by the report button. Neither outcome depends on this
file being clever.

Swapping in a real classifier means replacing analyze() and nothing else.
"""
import re

# Words that make a comment hostile towards a person. Deliberately small and
# plain: a longer list would not make this a good classifier, only a slower one.
# Only terms aimed at a PERSON belong here. "I hate this build" is frustration
# with software and must not land in the moderation queue; "I hate you" is not.
# The bare verb was in this list at first and flagged the former.
TOXIC_TERMS = {
    'idiot': 0.8, 'idiots': 0.8, 'moron': 0.8, 'morons': 0.8,
    'stupid': 0.6, 'dumb': 0.6, 'pathetic': 0.6, 'worthless': 0.7,
    'loser': 0.6, 'losers': 0.6, 'trash': 0.5, 'garbage': 0.5,
    'disgusting': 0.6, 'shut up': 0.6, 'hate you': 0.9,
    'kill yourself': 1.0, 'go die': 1.0, 'nobody likes you': 0.8,
    'you suck': 0.7, 'shut your': 0.7,
}

NEGATIVE_TERMS = {
    'bad', 'awful', 'terrible', 'horrible', 'worst', 'boring', 'useless',
    'broken', 'wrong', 'hate', 'annoying', 'ugly', 'fail', 'failed',
}

POSITIVE_TERMS = {
    'good', 'great', 'excellent', 'love', 'nice', 'wonderful', 'best',
    'helpful', 'clear', 'brilliant', 'thanks', 'thank', 'awesome', 'happy',
    'beautiful', 'useful', 'agree', 'interesting',
}

# A score at or below this is treated as toxic enough to hold for review.
TOXIC_THRESHOLD = 0.5

_WORD = re.compile(r"[a-z']+")


def _strip_html(text):
    """Posts arrive as rich-text HTML; score the words, not the markup."""
    return re.sub(r'<[^>]+>', ' ', text or '')


def analyze(text):
    """
    Score a piece of text.

    Returns:
        score      -1.0 (hostile) .. 1.0 (positive), 0.0 for neutral or empty
        is_toxic   whether it should be held for a moderator
        matches    the terms that triggered a toxic verdict, for explaining why
    """
    plain = _strip_html(text).lower()
    if not plain.strip():
        return {'score': 0.0, 'is_toxic': False, 'matches': []}

    matches = []
    toxic_weight = 0.0

    # Phrases first: "hate you" should not be scored as the milder "hate".
    for term, weight in TOXIC_TERMS.items():
        if ' ' in term and term in plain:
            matches.append(term)
            toxic_weight = max(toxic_weight, weight)

    words = _WORD.findall(plain)
    word_set = set(words)

    for term, weight in TOXIC_TERMS.items():
        if ' ' not in term and term in word_set:
            matches.append(term)
            toxic_weight = max(toxic_weight, weight)

    positive = len(word_set & POSITIVE_TERMS)
    negative = len(word_set & NEGATIVE_TERMS)

    if toxic_weight:
        # Hostility dominates: a compliment attached to an insult does not
        # cancel it out.
        score = -toxic_weight
    elif positive or negative:
        score = (positive - negative) / (positive + negative)
    else:
        score = 0.0

    # Toxicity requires an actual hostile term — NOT merely a negative score.
    #
    # This distinction matters more than it looks. "The deployment failed again
    # and it is awful" scores -1.0 on sentiment, but it is someone complaining
    # about software, not attacking a person. Treating negativity as toxicity
    # floods the moderation queue with ordinary frustration, and a queue nobody
    # can keep up with is the same as having no queue.
    is_toxic = bool(toxic_weight) and toxic_weight >= TOXIC_THRESHOLD

    return {
        'score': round(max(-1.0, min(1.0, score)), 3),
        'is_toxic': is_toxic,
        'matches': sorted(set(matches)),
    }
