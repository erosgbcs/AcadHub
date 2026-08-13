import json
import io
import zipfile
import xml.etree.ElementTree as ET
import re
import random
import time
import asyncio
import hashlib
from collections import Counter
from typing import List, Dict, Optional, Any

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pypdf
import aiohttp

# spaCy for robust NLP (install with: pip install spacy && python -m spacy download en_core_web_sm)
try:
    import spacy
    NLP = spacy.load("en_core_web_sm")
except Exception:
    NLP = None
    print("Warning: spaCy model not available. Falling back to regex heuristics (lower accuracy).")

# ------------------------------
# App Initialization
# ------------------------------
app = FastAPI(title="AcademicHub API Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------
# Pydantic Models for JSON Input
# ------------------------------
class ReviewRequest(BaseModel):
    notes: str = ""
    num_flashcards: int = 12
    quiz_types: Dict[str, int] = {"identification": 5}
    use_internet: bool = False
    enrich_count: int = 5

class AIReviewRequest(BaseModel):
    api_key: str
    provider: str = "gemini"
    notes: str = ""
    num_flashcards: int = 10
    num_quiz: int = 7

# ------------------------------
# Utility Patterns and Constants
# ------------------------------
SENTENCE_PATTERN = re.compile(r'(?<!\d)[.!?](?!\d)')
WORD_PATTERN = re.compile(r'[a-zA-Z]+')
CAPITALIZED_PHRASE = re.compile(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b')
TECH_TERM = re.compile(r'\b[A-Za-z]+[#+]\b')
STOP_WORDS = frozenset({
    'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in',
    'with', 'to', 'for', 'of', 'from', 'by', 'as', 'be', 'was', 'are', 'been',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'we', 'you',
    'he', 'she', 'his', 'her', 'their', 'our', 'my', 'your', 'has', 'have',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'can', 'shall', 'not', 'no', 'so', 'if', 'then', 'than', 'too',
    'very', 'just', 'about', 'also', 'into', 'onto', 'upon', 'within',
    'without', 'because', 'each', 'all', 'some', 'any', 'every', 'both',
    'few', 'more', 'most', 'other', 'such', 'only', 'own', 'same', 'new',
    'good', 'great', 'big', 'small', 'large', 'long', 'short', 'high', 'low',
    'different', 'important', 'many', 'much', 'using', 'use', 'used', 'uses'
})

# ------------------------------
# File Extraction Functions
# ------------------------------
def extract_docx_text(file_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            with z.open("word/document.xml") as f:
                tree = ET.parse(f)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs = []
                for p in tree.iterfind('.//w:p', ns):
                    texts = [t.text for t in p.iterfind('.//w:t', ns) if t.text]
                    if texts:
                        paragraphs.append(''.join(texts))
                return '\n'.join(paragraphs)
    except Exception:
        raise HTTPException(400, "DOCX read error")

def extract_rtf_text(file_bytes):
    try:
        text = file_bytes.decode('utf-8', errors='ignore')
        text = re.sub(r'\\[a-z]+\-?\d* ?', '', text)
        text = re.sub(r'[{}]', '', text)
        text = re.sub(r'\\\'[0-9a-fA-F]{2}', ' ', text)
        return text
    except Exception:
        raise HTTPException(400, "RTF read error")

def extract_md_text(file_bytes):
    return file_bytes.decode('utf-8', errors='ignore')

def extract_html_text(file_bytes):
    try:
        html = file_bytes.decode('utf-8', errors='ignore')
        html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL)
        html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.DOTALL)
        html = re.sub(r'<[^>]+>', ' ', html)
        html = html.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
        return html
    except Exception:
        raise HTTPException(400, "HTML read error")

def extract_text_fast(file_bytes, fname):
    fname = fname.lower()
    if fname.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        return '\n'.join(page.extract_text() or "" for page in reader.pages)
    elif fname.endswith(".docx"):
        return extract_docx_text(file_bytes)
    elif fname.endswith(".txt"):
        return file_bytes.decode("utf-8", "ignore")
    elif fname.endswith(".md"):
        return extract_md_text(file_bytes)
    elif fname.endswith(".rtf"):
        return extract_rtf_text(file_bytes)
    elif fname.endswith((".html", ".htm")):
        return extract_html_text(file_bytes)
    else:
        raise HTTPException(400, "Unsupported file type")

# ------------------------------
# Text Preprocessing & NLP Helpers
# ------------------------------
def smart_sentences(text):
    """Sentence splitting with spaCy if available, otherwise regex fallback."""
    if NLP is not None:
        doc = NLP(text)
        return [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 20]
    # Fallback to regex
    text = re.sub(r'(Dr|Mr|Mrs|Ms|Prof|etc|vs|e\.g|i\.e)\.', r'\1<DOT>', text)
    sents = SENTENCE_PATTERN.split(text)
    return [s.strip().replace('<DOT>', '.') for s in sents if len(s.strip()) > 20]

def extract_key_phrases(text, top_n=15):
    """Extract key phrases using spaCy noun chunks + named entities, or regex fallback."""
    if NLP is not None:
        doc = NLP(text)
        phrases = []
        # Noun chunks
        for chunk in doc.noun_chunks:
            words = [token.text for token in chunk if not token.is_stop and not token.is_punct]
            if len(words) >= 1 and (len(words) >= 2 or chunk.root.pos_ in ("PROPN", "NOUN")):
                phrase = " ".join(words).strip()
                if phrase and phrase.lower() not in STOP_WORDS:
                    phrases.append(phrase)
        # Named entities
        for ent in doc.ents:
            if ent.label_ in ("PERSON", "ORG", "PRODUCT", "GPE", "EVENT", "WORK_OF_ART", "TECHNOLOGY"):
                phrases.append(ent.text)
        # Frequency weighting
        phrase_counts = Counter(phrases)
        weighted = [(p, c * (len(p.split()) ** 2)) for p, c in phrase_counts.items() if len(p) > 2]
        weighted.sort(key=lambda x: x[1], reverse=True)
        final = []
        for phrase, _ in weighted:
            if not any(phrase != other and phrase in other for other in final):
                final.append(phrase)
            if len(final) >= top_n:
                break
        return final

    # Regex fallback (original method)
    phrases = []
    cap_phrases = CAPITALIZED_PHRASE.findall(text)
    for phrase in cap_phrases:
        if len(phrase.split()) >= 2 and phrase.lower() not in STOP_WORDS:
            phrases.append(phrase)
    tech_terms = TECH_TERM.findall(text)
    phrases.extend(tech_terms)
    words = WORD_PATTERN.findall(text)
    for i in range(len(words) - 1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            bigram = f"{words[i]} {words[i+1]}"
            if len(bigram.split()) == 2 and bigram.lower() not in STOP_WORDS:
                phrases.append(bigram)
    phrase_counts = Counter(phrases)
    weighted = [(p, c * (len(p.split()) ** 2)) for p, c in phrase_counts.items() if len(p) > 2]
    weighted.sort(key=lambda x: x[1], reverse=True)
    final = []
    for phrase, _ in weighted:
        if not any(phrase != other and phrase in other for other in final):
            final.append(phrase)
        if len(final) >= top_n:
            break
    if len(final) < top_n:
        singles = [w for w in words if w not in STOP_WORDS and len(w) > 5 and w[0].isupper()]
        for w, c in Counter(singles).most_common():
            if w not in final and not any(w in p for p in final):
                final.append(w)
            if len(final) >= top_n:
                break
    return final

def find_definition_sentence(text, phrase):
    """Find a sentence that likely defines the phrase, using definitional patterns."""
    sents = smart_sentences(text)
    # First pass: explicit definition
    for sent in sents:
        if phrase.lower() in sent.lower() and re.search(r'\b(?:is|are|was|were|refers to|means|defined as)\b', sent, re.IGNORECASE):
            return sent[:300]
    # Second pass: appositive or parenthetical
    for sent in sents:
        if phrase.lower() in sent.lower() and re.search(r'\([^)]*\)|,.*,', sent):
            return sent[:300]
    # Third pass: first mention
    for sent in sents:
        if phrase.lower() in sent.lower():
            return sent[:300]
    return f"Related to {phrase}"

def summarize_text(text, max_sentences=5):
    sents = smart_sentences(text)
    if len(sents) <= max_sentences:
        return sents

    # Tokenize sentences into sets of meaningful words
    word_sets = []
    for sent in sents:
        if NLP is not None:
            doc = NLP(sent.lower())
            words = {token.text for token in doc if not token.is_stop and not token.is_punct}
        else:
            words = set(WORD_PATTERN.findall(sent.lower()))
            words = {w for w in words if w not in STOP_WORDS}
        word_sets.append(words)

    n = len(sents)
    similarity = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i+1, n):
            if not word_sets[i] or not word_sets[j]:
                continue
            common = word_sets[i] & word_sets[j]
            union = word_sets[i] | word_sets[j]
            if union:
                sim = len(common) / len(union)
                similarity[i][j] = sim
                similarity[j][i] = sim

    scores = [1.0] * n
    damping = 0.85
    for _ in range(10):
        new_scores = [1.0 - damping] * n
        for i in range(n):
            for j in range(n):
                if i != j and similarity[i][j] > 0:
                    new_scores[i] += damping * similarity[i][j] * scores[j]
        scores = new_scores

    ranked = sorted(range(n), key=lambda i: scores[i], reverse=True)
    top_indices = sorted(ranked[:max_sentences])
    return [sents[i] for i in top_indices]

# ------------------------------
# Internet Enrichment (Wikipedia)
# ------------------------------
enrichment_cache: Dict[str, str] = {}

async def fetch_wikipedia_summary(term: str, session: aiohttp.ClientSession) -> Optional[str]:
    if term in enrichment_cache:
        return enrichment_cache[term]
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{term.replace(' ', '_')}"
    try:
        async with session.get(url, timeout=5) as resp:
            if resp.status == 200:
                data = await resp.json()
                extract = data.get('extract', '')
                if extract:
                    result = f"{term}: {extract[:300]}"
                    enrichment_cache[term] = result
                    return result
    except Exception:
        pass
    return None

async def fetch_wikipedia_search(term: str, session: aiohttp.ClientSession) -> Optional[str]:
    search_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={term}&format=json&utf8=1&srlimit=1"
    try:
        async with session.get(search_url, timeout=5) as resp:
            if resp.status == 200:
                data = await resp.json()
                results = data.get('query', {}).get('search', [])
                if results:
                    snippet = results[0].get('snippet', '')
                    snippet = re.sub(r'<[^>]+>', '', snippet)
                    if snippet:
                        result = f"{term}: {snippet[:300]}"
                        enrichment_cache[term] = result
                        return result
    except Exception:
        pass
    return None

async def enrich_with_internet(key_phrases: List[str], enrich_count: int = 5) -> str:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_wikipedia_summary(phrase, session) for phrase in key_phrases[:enrich_count]]
        results = await asyncio.gather(*tasks)

        fallback_tasks = []
        fallback_indices = []
        for i, res in enumerate(results):
            if res is None:
                fallback_tasks.append(fetch_wikipedia_search(key_phrases[i], session))
                fallback_indices.append(i)
        fallback_results = await asyncio.gather(*fallback_tasks)

        for idx, res in zip(fallback_indices, fallback_results):
            if res:
                results[idx] = res

        summaries = [r for r in results if r]
        return "\n".join(summaries)

# ------------------------------
# Entity Extraction (spaCy NER if available)
# ------------------------------
def extract_persons(text):
    if NLP is not None:
        doc = NLP(text)
        return list(set(ent.text for ent in doc.ents if ent.label_ == "PERSON"))
    # Fallback regex method (with improved filtering)
    words = WORD_PATTERN.findall(text)
    persons = set()
    non_person = {
        'rendering', 'pipeline', 'definition', 'high', 'android', 'ios', 'app',
        'store', 'asset', 'game', 'engine', 'cut', 'pro', 'final', 'mac', 'os',
        'x', 'windows', 'machine', 'learning', 'deep', 'neural', 'network',
        'data', 'science', 'computer', 'vision', 'natural', 'language',
        'processing', 'artificial', 'intelligence'
    }
    for i in range(len(words) - 1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            full = f"{words[i]} {words[i+1]}"
            if not any(w.lower() in STOP_WORDS for w in full.split()):
                if not any(w.lower() in non_person for w in full.split()):
                    persons.add(full)
    return list(persons)

def extract_locations(text):
    if NLP is not None:
        doc = NLP(text)
        return list(set(ent.text for ent in doc.ents if ent.label_ in ("GPE", "LOC")))
    # Fallback regex method
    locs = set()
    loc_patterns = [
        r'\b(?:in|at|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|street|road|avenue|country|state|province|district)',
        r'\b([A-Z][a-z]+)\s+(?:headquarters|office|center|lab|studio)'
    ]
    for pat in loc_patterns:
        for m in re.finditer(pat, text):
            candidate = m.group(1).strip()
            if candidate.lower() not in {
                'january', 'february', 'march', 'april', 'may', 'june', 'july',
                'august', 'september', 'october', 'november', 'december',
                'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
                'saturday', 'sunday', 'apple', 'microsoft', 'google', 'unity',
                'unreal'
            }:
                locs.add(candidate)
    return list(locs)[:10]

def extract_dates(text):
    if NLP is not None:
        doc = NLP(text)
        dates = list(set(ent.text for ent in doc.ents if ent.label_ == "DATE"))
        if dates:
            return dates
    # Fallback regex
    return re.findall(
        r'\b(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b',
        text
    )

def extract_reason_sentences(text):
    sents = smart_sentences(text)
    return [s for s in sents if any(w in s.lower() for w in ['because', 'due to', 'reason', 'cause', 'lead to', 'result in'])]

def extract_method_sentences(text):
    sents = smart_sentences(text)
    return [s for s in sents if any(w in s.lower() for w in ['how', 'method', 'process', 'steps', 'procedure', 'way', 'by'])]

# ------------------------------
# Question Generation Helpers (keep only high-accuracy types)
# ------------------------------
def deduplicate_options(options, correct):
    """Remove duplicates and keep exactly 4 options."""
    unique = []
    for opt in options:
        if opt not in unique and opt != correct:
            unique.append(opt)
    distractors = unique[:3]
    while len(distractors) < 3:
        distractors.append("None of the above")
    return [correct] + distractors

def generate_what_questions(phrases, text, n):
    questions = []
    for phrase in phrases[:n]:
        def_sent = find_definition_sentence(text, phrase)
        other_defs = [find_definition_sentence(text, p) for p in phrases if p != phrase][:3]
        while len(other_defs) < 3:
            other_defs.append("None of the above")
        options = deduplicate_options([def_sent] + other_defs, def_sent)
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "what",
            "question": f"What is {phrase}?",
            "options": options,
            "answer": def_sent,
            "explanation": f"The description of {phrase}."
        })
    return questions

def generate_who_questions(persons, sents, n):
    questions = []
    for person in persons[:n]:
        related = [s for s in sents if person.lower() in s.lower()]
        if not related:
            continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if person.lower() not in s.lower()][:3]
        while len(other_sents) < 3:
            other_sents.append("None of the above")
        options = deduplicate_options([correct] + other_sents, correct)
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "who",
            "question": f"Who is {person}?",
            "options": options,
            "answer": correct,
            "explanation": f"About {person}."
        })
    return questions

def generate_where_questions(locations, sents, n):
    questions = []
    for loc in locations[:n]:
        related = [s for s in sents if loc.lower() in s.lower()]
        if not related:
            continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if loc.lower() not in s.lower()][:3]
        while len(other_sents) < 3:
            other_sents.append("None of the above")
        options = deduplicate_options([correct] + other_sents, correct)
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "where",
            "question": f"Where is {loc}?",
            "options": options,
            "answer": correct,
            "explanation": f"About {loc}."
        })
    return questions

def generate_when_questions(dates, sents, n):
    questions = []
    for date in dates[:n]:
        related = [s for s in sents if date in s]
        if not related:
            continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if date not in s][:3]
        while len(other_sents) < 3:
            other_sents.append("None of the above")
        options = deduplicate_options([correct] + other_sents, correct)
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "when",
            "question": "When did this occur?",
            "options": options,
            "answer": correct,
            "explanation": f"This sentence contains the date {date}."
        })
    return questions

# Removed: why, how, which, whose, matching, ordering, fillmultiple

# ------------------------------
# Enumeration Helper
# ------------------------------
def extract_enumeration_points(sentences, max_points=3):
    points = []
    for sent in sentences:
        parts = re.split(r'[;,]\s*|\band\b', sent)
        for part in parts:
            part = part.strip()
            if len(part) > 10 and part not in points:
                points.append(part)
    return points[:max_points]

# ------------------------------
# AI Provider Functions
# ------------------------------
def call_gemini(prompt, key):
    import urllib.request
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    data = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as r:
        response = json.loads(r.read())
        return json.loads(response["candidates"][0]["content"]["parts"][0]["text"])

def call_deepseek(prompt, key):
    import urllib.request
    url = "https://api.deepseek.com/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {key}"}
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Return JSON only."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as r:
        response = json.loads(r.read())
        return json.loads(response["choices"][0]["message"]["content"])

# ------------------------------
# Core Generation Function
# ------------------------------
def generate_reviewer_content(text, num_flashcards, quiz_types, use_internet=False):
    if not text.strip():
        raise ValueError("No text provided.")

    start = time.time()
    sents = smart_sentences(text)
    phrases = extract_key_phrases(text, top_n=max(num_flashcards, 25))

    summary = summarize_text(text, max_sentences=5)

    # Flashcards
    flashcards = []
    used_defs = set()
    multi = [p for p in phrases if len(p.split()) >= 2]
    single = [p for p in phrases if len(p.split()) == 1]
    for phrase in multi + single:
        if len(flashcards) >= num_flashcards:
            break
        def_sent = find_definition_sentence(text, phrase)
        if def_sent in used_defs:
            continue
        flashcards.append({
            "id": len(flashcards) + 1,
            "term": phrase.strip(),
            "definition": def_sent
        })
        used_defs.add(def_sent)

    # Quiz generation (only high-accuracy types)
    quiz = []
    # True/False
    tf_count = quiz_types.get("truefalse", 0)
    for i in range(tf_count):
        sent = random.choice(sents) if sents else ""
        if not sent:
            break
        phrase_in = next((p for p in phrases if p.lower() in sent.lower()), None)
        if phrase_in and len(phrases) > 1 and i < tf_count // 2:
            other = [p for p in phrases if p.lower() != phrase_in.lower()]
            if other:
                false_phrase = random.choice(other)
                false_sent = re.sub(re.escape(phrase_in), false_phrase, sent, flags=re.IGNORECASE)
                q_text = false_sent[:200]
                correct = "False"
            else:
                q_text = sent[:200]
                correct = "True"
        else:
            q_text = sent[:200]
            correct = "True"
        quiz.append({
            "id": len(quiz) + 1,
            "type": "truefalse",
            "question": f'True or False: "{q_text}"',
            "options": ["True", "False"],
            "answer": correct,
            "explanation": f"The statement is {correct.lower()}."
        })

    # Identification
    id_count = quiz_types.get("identification", 0)
    for _ in range(id_count):
        sent = random.choice(sents) if sents else ""
        if not sent:
            break
        phrase_in = next((p for p in phrases if p.lower() in sent.lower()), None)
        if phrase_in:
            blanked = sent.replace(phrase_in, "________")
            correct = phrase_in
        else:
            words = [w for w in WORD_PATTERN.findall(sent) if w.lower() not in STOP_WORDS and len(w) > 4]
            if not words:
                continue
            correct = random.choice(words)
            blanked = re.sub(r'\b' + re.escape(correct) + r'\b', '________', sent)
        pool = [p for p in phrases if p.lower() != correct.lower()]
        if len(pool) >= 3:
            distractors = random.sample(pool, 3)
        else:
            distractors = pool + ["None of the above"] * (3 - len(pool))
        options = deduplicate_options([correct] + distractors, correct)
        random.shuffle(options)
        quiz.append({
            "id": len(quiz) + 1,
            "type": "identification",
            "question": f'Fill in the blank: "{blanked}"',
            "options": options,
            "answer": correct,
            "explanation": f"The missing term is '{correct}'."
        })

    # Enumeration
    enum_count = quiz_types.get("enumeration", 0)
    if enum_count > 0:
        enum_concepts = [p for p in phrases if len(p.split()) >= 2] or phrases
        for _ in range(enum_count):
            concept = random.choice(enum_concepts)
            related = [s for s in sents if concept.lower() in s.lower()]
            if not related:
                continue
            points = extract_enumeration_points(related)
            if not points:
                continue
            answer = "; ".join(points)
            if len(points) < 3:
                question = f"List the key point(s) about {concept} (only {len(points)} found)."
            else:
                question = f"List three key points about {concept}."
            quiz.append({
                "id": len(quiz) + 1,
                "type": "enumeration",
                "question": question,
                "options": [],
                "answer": answer,
                "explanation": f"Points about {concept}."
            })

    # Multiple Choice
    mc_count = quiz_types.get("multiplechoice", 0)
    if mc_count > 0:
        for _ in range(mc_count):
            if not phrases:
                break
            phrase = random.choice(phrases)
            def_sent = find_definition_sentence(text, phrase)
            pool = [find_definition_sentence(text, p) for p in phrases if p != phrase][:3]
            while len(pool) < 3:
                pool.append("None of the above")
            options = deduplicate_options([def_sent] + pool, def_sent)
            random.shuffle(options)
            quiz.append({
                "id": len(quiz) + 1,
                "type": "multiplechoice",
                "question": f"What is {phrase}?",
                "options": options,
                "answer": def_sent,
                "explanation": f"The definition of {phrase}."
            })

    # WH-questions (only what, who, where, when)
    persons = extract_persons(text)
    locations = extract_locations(text)
    dates = extract_dates(text)

    quiz.extend(generate_what_questions(phrases, text, quiz_types.get("what", 0)))
    quiz.extend(generate_who_questions(persons, sents, quiz_types.get("who", 0)))
    quiz.extend(generate_where_questions(locations, sents, quiz_types.get("where", 0)))
    quiz.extend(generate_when_questions(dates, sents, quiz_types.get("when", 0)))

    elapsed = round(time.time() - start, 2)
    return {
        "summary": summary,
        "flashcards": flashcards,
        "quiz": quiz,
        "metadata": {
            "method": "accuracy_v6",
            "length": len(text),
            "time": elapsed,
            "num_sentences": len(sents),
            "num_phrases": len(phrases)
        }
    }

# ------------------------------
# Caching
# ------------------------------
cache = {}

def get_cache_key(text, quiz_types, num_flashcards, use_internet, enrich_count):
    return hashlib.md5(f"{text}{json.dumps(quiz_types)}{num_flashcards}{use_internet}{enrich_count}".encode()).hexdigest()

# ------------------------------
# API Endpoints
# ------------------------------
@app.get("/")
def root():
    return {"status": "online", "system": "AcademicHub Core API"}

@app.get("/api/health")
def health():
    return {"service": "AcademicHub Engine", "status": "healthy"}

@app.post("/api/generate-reviewer-local")
async def gen_local(
    notes: str = Form(""),
    file: UploadFile = File(None),
    num_flashcards: int = Form(12),
    quiz_types: str = Form('{"identification":5}'),
    use_internet: bool = Form(False),
    enrich_count: int = Form(5)
):
    text = notes.strip() if notes else ""
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or a file.")

    if use_internet:
        phrases = extract_key_phrases(text, top_n=25)
        extra = await enrich_with_internet(phrases, enrich_count=enrich_count)
        if extra:
            text += "\n\n--- Additional Context from Wikipedia ---\n" + extra

    try:
        qt = json.loads(quiz_types)
    except:
        qt = {"identification": 5}

    cache_key = get_cache_key(text, qt, num_flashcards, use_internet, enrich_count)
    if cache_key in cache:
        return JSONResponse(content=cache[cache_key])

    result = generate_reviewer_content(text, num_flashcards, qt, use_internet=False)
    if len(cache) > 100:
        cache.pop(next(iter(cache)))
    cache[cache_key] = result
    return JSONResponse(content=result)

@app.post("/api/reviewer")
async def generate_reviewer_json(request: ReviewRequest):
    text = request.notes.strip()
    if not text:
        raise HTTPException(400, "No notes provided.")
    if request.use_internet:
        phrases = extract_key_phrases(text, top_n=25)
        extra = await enrich_with_internet(phrases, enrich_count=request.enrich_count)
        if extra:
            text += "\n\n--- Additional Context from Wikipedia ---\n" + extra
    result = generate_reviewer_content(text, request.num_flashcards, request.quiz_types)
    return JSONResponse(content=result)

@app.post("/api/summary")
async def summary_endpoint(notes: str = Form(""), file: UploadFile = File(None)):
    text = notes.strip()
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "No text provided.")
    summary = summarize_text(text)
    return JSONResponse(content={"summary": summary})

@app.post("/api/flashcards")
async def flashcards_endpoint(
    notes: str = Form(""),
    file: UploadFile = File(None),
    num_flashcards: int = Form(10)
):
    text = notes.strip()
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "No text provided.")
    phrases = extract_key_phrases(text, top_n=num_flashcards)
    flashcards = []
    used_defs = set()
    for phrase in phrases:
        if len(flashcards) >= num_flashcards:
            break
        def_sent = find_definition_sentence(text, phrase)
        if def_sent in used_defs:
            continue
        flashcards.append({
            "id": len(flashcards) + 1,
            "term": phrase,
            "definition": def_sent
        })
        used_defs.add(def_sent)
    return JSONResponse(content={"flashcards": flashcards})

@app.post("/api/quiz")
async def quiz_endpoint(
    notes: str = Form(""),
    file: UploadFile = File(None),
    quiz_types: str = Form('{"identification":5}')
):
    text = notes.strip()
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "No text provided.")
    try:
        qt = json.loads(quiz_types)
    except:
        qt = {"identification": 5}
    result = generate_reviewer_content(text, num_flashcards=0, quiz_types=qt)
    return JSONResponse(content={"quiz": result["quiz"]})

@app.post("/api/enrich")
async def enrich_endpoint(
    notes: str = Form(""),
    file: UploadFile = File(None),
    enrich_count: int = Form(5)
):
    text = notes.strip()
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "No text provided.")
    phrases = extract_key_phrases(text, top_n=25)
    enriched = await enrich_with_internet(phrases, enrich_count=enrich_count)
    if enriched:
        combined = text + "\n\n--- Additional Context from Wikipedia ---\n" + enriched
    else:
        combined = text
    return JSONResponse(content={"enriched_text": combined})

@app.post("/api/generate-reviewer")
def gen_ai(api_key: str = Form(...), provider: str = Form("gemini"), notes: str = Form(""), file: UploadFile = File(None)):
    if not api_key.strip():
        raise HTTPException(400, "API key required.")
    text = notes.strip() if notes else ""
    if file:
        fb = file.file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or file.")

    prompt = (
        f"Analyze the following notes and return JSON with: "
        f"summary (5 points), flashcards (10 items with term/definition), "
        f"quiz (7 questions with options/answer/explanation). "
        f"Notes: {text[:6000]}"
    )
    try:
        if provider == "deepseek":
            return call_deepseek(prompt, api_key)
        return call_gemini(prompt, api_key)
    except Exception as e:
        raise HTTPException(500, f"AI provider error: {str(e)}")
@app.post("/api/generate-test")
async def generate_test_endpoint(
    notes: str = Form(""),
    file: UploadFile = File(None),
    difficulty: str = Form("medium"),
    use_internet: bool = Form(False)
):
    text = notes.strip() if notes else ""
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or a file.")

    # Optional: enrich with Wikipedia (same as reviewer)
    if use_internet:
        phrases = extract_key_phrases(text, top_n=25)
        extra = await enrich_with_internet(phrases, enrich_count=5)
        if extra:
            text += "\n\n--- Additional Context from Wikipedia ---\n" + extra

    # Define question counts and types based on difficulty
    if difficulty == "easy":
        question_count = 8
        quiz_types = {
            "truefalse": 3,
            "identification": 2,
            "multiplechoice": 3
        }
    elif difficulty == "hard":
        question_count = 26
        quiz_types = {
            "truefalse": 5,
            "identification": 8,
            "multiplechoice": 8,
            "what": 3,
            "who": 1,
            "where": 1
        }
    else:  # medium (default)
        question_count = 15
        quiz_types = {
            "truefalse": 4,
            "identification": 4,
            "multiplechoice": 4,
            "what": 2,
            "who": 1
        }

    # Generate a pool of questions using the existing content generator
    result = generate_reviewer_content(
        text,
        num_flashcards=0,
        quiz_types=quiz_types,
        use_internet=False  # already enriched above
    )

    questions = result.get("quiz", [])

    # If we generated more than needed, randomly select the required number
    if len(questions) > question_count:
        questions = random.sample(questions, question_count)

    return JSONResponse(content={"questions": questions})


# ------------------------------
# Run Instructions
# ------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)