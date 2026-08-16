"""
The ten autonomous agents (course requirement 2.d).

Each agent has a stored `personality` on its user row, and that string is what
drives everything it writes — the requirement asks for personalities that
"drive interactions across the platform", not just decoration on a profile.

Every agent carries its own openers, topics and reply styles. Two agents given
the same subject produce visibly different text, which is the point: a feed
where every bot sounds identical is not a simulation of anything.
"""

AGENTS = [
    {
        'handle': 'tech_optimist',
        'name': 'Ariel Tech-Optimist',
        'personality': 'The Tech Optimist — believes every problem has an engineering solution and is genuinely excited about new tools.',
        'bio': 'Tomorrow is going to be better, and it will probably be built in a weekend.',
        'topics': ['a new framework', 'automated deployments', 'edge computing', 'open source', 'developer tooling', 'type systems'],
        'openers': [
            'Just tried {topic} and honestly, this changes things.',
            '{topic} is quietly becoming the best part of my week.',
            'People underrate {topic}. Give it six months.',
            'Spent the evening with {topic} and came away optimistic.',
        ],
        'replies': [
            'This is exactly the kind of thing that gets better every year.',
            'Optimistic take: the tooling for this will be trivial soon.',
            'Love this. The ceiling here is much higher than people think.',
            'Great write-up — this is the direction things are heading.',
        ],
    },
    {
        'handle': 'grumpy_skeptic',
        'name': 'Noa Grumpy-Skeptic',
        'personality': 'The Grumpy Skeptic — has seen this idea fail three times before and will say so, bluntly but never cruelly.',
        'bio': 'It worked on your laptop. That is not the same as working.',
        'topics': ['another rewrite', 'microservices', 'the new framework', 'this migration', 'yet another abstraction', 'the roadmap'],
        'openers': [
            'We tried {topic} in 2019. It did not go well.',
            '{topic} solves a problem most teams do not have.',
            'Remind me why {topic} is worth the complexity?',
            'Every few years {topic} comes back with a new name.',
        ],
        'replies': [
            'What happens when this needs to scale past one machine?',
            'I would like to see the numbers before I believe this.',
            'This works until the first edge case. Then what?',
            'Reasonable, but the maintenance cost is doing a lot of hiding here.',
        ],
    },
    {
        'handle': 'fact_checker',
        'name': 'Ronen Fact-Checker',
        'personality': 'The Helpful Fact-Checker — asks for sources politely and corrects mistakes without scoring points.',
        'bio': 'Happy to be wrong. Just show me where.',
        'topics': ['a claim I saw today', 'these benchmark numbers', 'that statistic', 'a widely repeated myth', 'the original paper'],
        'openers': [
            'Worth checking {topic} — the original source says something narrower.',
            'I looked into {topic}. The real figure is more modest.',
            '{topic} keeps getting repeated. The evidence is thinner than it sounds.',
            'Quick correction on {topic}, with the caveat that I might be out of date.',
        ],
        'replies': [
            'Do you have a source for this? Genuinely asking.',
            'Mostly right — one small correction on the second point.',
            'This matches what I found, with one caveat about the sample size.',
            'Careful with that number; it comes from a study of nine people.',
        ],
    },
    {
        'handle': 'design_purist',
        'name': 'Maya Design-Purist',
        'personality': 'The Design Purist — cares about spacing, contrast and typography, and notices when nobody else does.',
        'bio': 'The whitespace is not empty. It is doing work.',
        'topics': ['this layout', 'a type scale', 'contrast ratios', 'the spacing system', 'iconography', 'empty states'],
        'openers': [
            'Nobody talks about {topic} and it is half the experience.',
            'Fixed {topic} today. The whole page feels calmer.',
            '{topic} is where most interfaces quietly fall apart.',
            'Small thing that is not small: {topic}.',
        ],
        'replies': [
            'The idea is good. The spacing is fighting you though.',
            'Consider the contrast here — it will fail on a sunny day.',
            'This reads well. Nice restraint with the type sizes.',
            'One suggestion: give this more room to breathe.',
        ],
    },
    {
        'handle': 'data_nerd',
        'name': 'Omri Data-Nerd',
        'personality': 'The Data Nerd — answers opinions with measurements and is suspicious of anything unquantified.',
        'bio': 'If it is not measured, it is a feeling.',
        'topics': ['query performance', 'a p99 latency spike', 'index selectivity', 'cache hit rates', 'this A/B result'],
        'openers': [
            'Measured {topic} this week. The result surprised me.',
            'Everyone guesses about {topic}. I finally profiled it.',
            '{topic}: the median lies, the p99 tells the truth.',
            'Spent an hour on {topic} and found the bottleneck was elsewhere.',
        ],
        'replies': [
            'Did you measure this, or is it a hunch?',
            'The median hides the tail here. What does p99 look like?',
            'Good result. What was the sample size?',
            'This matches my numbers, roughly.',
        ],
    },
    {
        'handle': 'newcomer',
        'name': 'Tal Newcomer',
        'personality': 'The Enthusiastic Newcomer — three months into learning, asks the questions everyone else is too proud to ask.',
        'bio': 'Learning in public. Corrections welcome.',
        'topics': ['closures', 'async and await', 'SQL joins', 'git rebase', 'the event loop', 'foreign keys'],
        'openers': [
            'Finally understood {topic} today and I am unreasonably happy about it.',
            'Can someone explain {topic} like I have been awake for two hours?',
            'Week three of {topic}. It is starting to click.',
            'Wrote my first thing using {topic}. It even works.',
        ],
        'replies': [
            'This helped, thank you. I had been stuck on exactly this.',
            'Beginner question: why is this better than the obvious approach?',
            'Saving this. Makes much more sense than the docs.',
            'Wait, so does that mean the order matters here?',
        ],
    },
    {
        'handle': 'security_hawk',
        'name': 'Dana Security-Hawk',
        'personality': 'The Security Hawk — reads every feature as an attack surface and says so before it ships.',
        'bio': 'Threat modelling is just pessimism with a document.',
        'topics': ['this login flow', 'session handling', 'file uploads', 'that API endpoint', 'password storage', 'CORS config'],
        'openers': [
            'Reviewed {topic}. Two things worry me.',
            '{topic} is the part attackers will look at first.',
            'Friendly reminder that {topic} is not validated on the server.',
            'Threat model for {topic}: what happens if the client lies?',
        ],
        'replies': [
            'What stops a client from just sending a different id here?',
            'Is this validated on the server too, or only in the form?',
            'Good, as long as the check is not only in the UI.',
            'This is the right call. The UI check alone was never enough.',
        ],
    },
    {
        'handle': 'product_pragmatist',
        'name': 'Yael Pragmatist',
        'personality': 'The Product Pragmatist — asks who the user is and whether this actually helps them.',
        'bio': 'Shipping something adequate beats perfecting something nobody asked for.',
        'topics': ['this feature', 'the backlog', 'a rewrite proposal', 'user feedback', 'scope creep'],
        'openers': [
            'Before we build {topic}, who exactly asked for it?',
            '{topic} sounds great. What does it cost the user?',
            'Cut {topic} from the release and nobody noticed. Instructive.',
            'The smallest useful version of {topic} would ship this week.',
        ],
        'replies': [
            'What does the user get from this that they did not have before?',
            'Could half of this ship now and the rest later?',
            'Solid. This is the version that actually gets used.',
            'Worth asking whether this is a real problem or an interesting one.',
        ],
    },
    {
        'handle': 'night_owl',
        'name': 'Gil Night-Owl',
        'personality': 'The Night Owl — writes at 2am, wanders between topics, warm and a little rambling.',
        'bio': 'Best ideas arrive after midnight. So do the worst ones.',
        'topics': ['a bug that only appears at night', 'refactoring at 2am', 'the quiet hours', 'an idea I cannot drop', 'coffee arithmetic'],
        'openers': [
            'It is late and I am still thinking about {topic}.',
            '{topic} made much more sense an hour ago.',
            'Cannot sleep. {topic} it is.',
            'Everyone is asleep, so I am telling you about {topic}.',
        ],
        'replies': [
            'Read this twice. Second time it made more sense.',
            'This is the kind of thing I think about at 3am.',
            'Adding this to the list of things to try tomorrow. Or tonight.',
            'Nice. Quiet hours are the good hours.',
        ],
    },
    {
        'handle': 'archivist',
        'name': 'Shira Archivist',
        'personality': 'The Archivist — remembers how things used to work and explains why they became what they are.',
        'bio': 'Nothing in software is new. It just has a different name now.',
        'topics': ['a pattern from the nineties', 'why this API looks strange', 'an old standard', 'the reason for this default', 'a deprecated feature'],
        'openers': [
            'The reason {topic} looks odd is a decision made in 1998.',
            '{topic} used to be the recommended approach. Then it was not.',
            'Some history on {topic}, since it explains the weirdness.',
            'Every strange default has a story. {topic} has a good one.',
        ],
        'replies': [
            'This is the third time this idea has come around.',
            'The original version of this had the same problem.',
            'Worth knowing that this was deliberate, not an accident.',
            'There is a good reason it works this way, and it is historical.',
        ],
    },
]

BY_HANDLE = {agent['handle']: agent for agent in AGENTS}


def for_personality(personality):
    """Find the agent definition whose personality string matches a user row."""
    for agent in AGENTS:
        if agent['personality'] == personality:
            return agent
    return None
