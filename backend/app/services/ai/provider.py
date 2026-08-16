"""
The AI layer, behind one interface.

The course lecture on shipping Gen AI makes the point that the model call is
about ten percent of the work — the rest is context, guardrails, fallbacks and
evaluation. That is exactly how this is built: everything around the generation
step is real, and the generation step itself is swappable.

`LocalProvider` is the default and needs no API key, no network and no budget.
It is template-driven, so its output is limited but always available, always
fast and always free — which is the "fall back" path the lecture describes,
promoted to the default.

Adding a hosted model later means writing one more subclass and setting
AI_PROVIDER in .env. Nothing that calls this file changes.
"""
import random
import re

from app.services.ai import sentiment
from app.services.ai.personalities import for_personality


class AIProvider:
    """What every provider must be able to do."""

    def generate_post(self, personality, seed=None):
        raise NotImplementedError

    def generate_comment(self, personality, post, seed=None):
        raise NotImplementedError

    def suggest_comments(self, post, count=3):
        raise NotImplementedError

    def autocorrect(self, text):
        raise NotImplementedError

    def analyze_sentiment(self, text):
        return sentiment.analyze(text)


class LocalProvider(AIProvider):
    """Rule- and template-based. No network, no key, no cost."""

    # Ordinary typing mistakes. Kept short on purpose: this is a writing aid,
    # not a spell checker, and a wrong "correction" is worse than none.
    CORRECTIONS = {
        'teh': 'the', 'adn': 'and', 'recieve': 'receive', 'occured': 'occurred',
        'seperate': 'separate', 'definately': 'definitely', 'wich': 'which',
        'thier': 'their', 'alot': 'a lot', 'untill': 'until', 'begining': 'beginning',
        'succesful': 'successful', 'accomodate': 'accommodate', 'occurence': 'occurrence',
        'neccessary': 'necessary', 'existance': 'existence', 'independant': 'independent',
        'enviroment': 'environment', 'developement': 'development', 'lenght': 'length',
        'widht': 'width', 'retreive': 'retrieve', 'succesfully': 'successfully',
        'dont': "don't", 'cant': "can't", 'wont': "won't", 'isnt': "isn't",
        'doesnt': "doesn't", 'didnt': "didn't", 'im': "I'm", 'ive': "I've",
    }

    PROMPT_STARTERS = [
        'Something I learned this week',
        'A small thing that made my day better',
        'An opinion I have changed my mind about',
        'The bug that took me longest to find',
        'A tool I would not give up',
        'Something obvious that took me years to notice',
    ]

    def _rng(self, seed):
        # A seeded generator makes tests deterministic without freezing the
        # behaviour of the real thing.
        return random.Random(seed) if seed is not None else random

    # ------------------------------------------------------------ agents ----
    def generate_post(self, personality, seed=None):
        rng = self._rng(seed)
        agent = for_personality(personality)

        if not agent:
            starter = rng.choice(self.PROMPT_STARTERS)
            return {'title': starter, 'body': f'<p>{starter}.</p>'}

        topic = rng.choice(agent['topics'])
        opener = rng.choice(agent['openers']).format(topic=topic)
        follow_up = rng.choice(agent['replies'])

        # The title is the opening line, trimmed — it is already a sentence
        # written in this agent's voice.
        title = opener.rstrip('.')
        if len(title) > 120:
            title = title[:117] + '...'

        return {
            'title': title,
            'body': f'<p>{opener}</p><p>{follow_up}</p>',
        }

    def generate_comment(self, personality, post, seed=None):
        rng = self._rng(seed)
        agent = for_personality(personality)
        if not agent:
            return 'Interesting post.'
        return rng.choice(agent['replies'])

    # ------------------------------------------------------------ humans ----
    def suggest_comments(self, post, count=3):
        """
        Draft replies a person can pick from (requirement 2.c).

        The suggestions are shaped by the post's own tone, so a critical post
        does not get three cheerful replies.
        """
        title = (post or {}).get('title', 'this')
        tone = self.analyze_sentiment(
            f"{title} {(post or {}).get('body', '')}"
        )['score']

        if tone > 0.2:
            pool = [
                'This is a good point, thanks for writing it up.',
                'Agreed — the second part especially.',
                'Saving this one. Useful.',
                'Nice. Have you tried taking it further?',
            ]
        elif tone < -0.2:
            pool = [
                'That sounds frustrating. What did you end up doing?',
                'I have hit this too. Curious how you worked around it.',
                'Fair criticism. What would you do instead?',
                'What would need to change for this to work?',
            ]
        else:
            pool = [
                'Interesting — could you say more about this?',
                'How did you approach this?',
                'Thanks for sharing. What surprised you most?',
                'Good read. What would you do differently next time?',
            ]

        return pool[:count]

    def autocorrect(self, text):
        """
        Fix common typos, preserving case and reporting every change.

        Nothing is applied silently: the caller shows the corrected text and the
        list of changes, and the person decides.
        """
        if not text:
            return {'corrected': text or '', 'changes': []}

        changes = []

        def replace(match):
            word = match.group(0)
            fixed = self.CORRECTIONS.get(word.lower())
            if not fixed:
                return word
            # Match the original capitalisation rather than flattening it.
            if word.isupper():
                fixed = fixed.upper()
            elif word[0].isupper():
                fixed = fixed[0].upper() + fixed[1:]
            changes.append({'from': word, 'to': fixed})
            return fixed

        corrected = re.sub(r"\b[A-Za-z']+\b", replace, text)

        # Two spaces between sentences, and a missing space after punctuation.
        corrected = re.sub(r'\s{2,}', ' ', corrected)
        corrected = re.sub(r'([.!?,])([A-Za-z])', r'\1 \2', corrected)

        return {'corrected': corrected, 'changes': changes}


_PROVIDERS = {'local': LocalProvider}


def get_provider(name='local'):
    """
    Resolve the configured provider, falling back to the local one.

    An unknown name is not an error the user should see at request time — the
    app keeps working with reduced capability, which is the whole point of
    having a fallback.
    """
    return _PROVIDERS.get((name or 'local').lower(), LocalProvider)()
