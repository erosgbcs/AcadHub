"""
AcademicHub API Engine – Accuracy v5 + Robust File Handling

Required packages:
    pip install fastapi uvicorn python-multipart aiohttp pypdf pdfplumber pytesseract pdf2image python-docx nltk Pillow

System dependencies:
    - Tesseract OCR (for scanned PDFs): https://github.com/tesseract-ocr/tesseract
    - Poppler (for pdf2image): Linux: sudo apt install poppler-utils,
                               macOS: brew install poppler,
                               Windows: download from http://blog.alivate.com.au/poppler-windows/
"""

import json
import io
import zipfile
import xml.etree.ElementTree as ET
import re
import random
import time
import asyncio
from collections import Counter

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import aiohttp

# ---------- PDF libraries ----------
import pypdf  # fallback
import pdfplumber
from pdf2image import convert_from_bytes
import pytesseract

# ---------- DOCX library ----------
from docx import Document

# ---------- Sentence tokenization ----------
try:
    import nltk
    nltk.download('punkt_tab', quiet=True)  # download if missing
    from nltk.tokenize import sent_tokenize
    def split_sentences(text):
        return sent_tokenize(text)
except ImportError:
    # Fallback: robust regex with many abbreviations
    SENT_SPLIT = re.compile(
        r'(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|etc|vs|e\.g|i\.e|U\.S|Ph\.D|a\.m|p\.m|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec))[.!?](?!\d)'
    )
    def split_sentences(text):
        # protect abbreviations
        text = re.sub(
            r'\b(Dr|Mr|Mrs|Ms|Prof|etc|vs|e\.g|i\.e|U\.S|Ph\.D|a\.m|p\.m)\.',
            r'\1<DOT>', text
        )
        sents = SENT_SPLIT.split(text)
        return [s.strip().replace('<DOT>', '.') for s in sents if len(s.strip()) > 10]

# ---------- FastAPI app ----------
app = FastAPI(title="AcademicHub API Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "online", "system": "AcademicHub Core API"}

@app.get("/api/health")
def health():
    return {"service": "AcademicHub Engine", "status": "healthy"}

# ---------- Constants ----------
WORD_PATTERN = re.compile(r'[a-zA-Z]+')
CAPITALIZED_PHRASE = re.compile(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b')
TECH_TERM = re.compile(r'\b[A-Za-z]+[#+]\b')
STOP_WORDS = frozenset({
    'the','is','at','which','on','a','an','and','or','but','in','with','to','for','of','from','by',
    'as','be','was','are','been','this','that','these','those','it','its','they','them','we','you',
    'he','she','his','her','their','our','my','your','has','have','had','do','does','did','will',
    'would','could','should','may','might','can','shall','not','no','so','if','then','than','too',
    'very','just','about','also','into','onto','upon','within','without','because','each','all',
    'some','any','every','both','few','more','most','other','such','only','own','same','new','good',
    'great','big','small','large','long','short','high','low','different','important','many','much'
})

# ---------- Robust PDF extraction ----------
def extract_pdf_text_robust(file_bytes):
    """
    Extract text from PDF using pdfplumber (layout-aware).
    If text seems empty/garbled, fall back to OCR via Tesseract.
    Returns cleaned text.
    """
    text = ""
    # Try pdfplumber first
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            all_text = []
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    all_text.append(page_text)
            text = "\n".join(all_text)
    except Exception:
        # pdfplumber failed, fall back to pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)

    # Determine if we need OCR
    def needs_ocr(txt):
        if len(txt.strip()) < 50:
            return True
        # If more than 50% of characters are non-alphabetic/space/digit
        alpha_count = sum(1 for c in txt if c.isalpha() or c.isspace())
        if alpha_count / max(len(txt), 1) < 0.5:
            return True
        return False

    if needs_ocr(text):
        try:
            images = convert_from_bytes(file_bytes)
            ocr_text = []
            for img in images:
                ocr_text.append(pytesseract.image_to_string(img))
            text = "\n".join(ocr_text)
        except Exception:
            # OCR not available – keep whatever we had
            pass

    # Post‑processing
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)  # fix hyphenated line breaks
    text = re.sub(r'\n{3,}', '\n\n', text)  # collapse multiple newlines
    return text.strip()

# ---------- Rich DOCX extraction ----------
def extract_docx_text_rich(file_bytes):
    """
    Extract text from .docx preserving paragraphs, tables, and noting headings/lists.
    """
    doc = Document(io.BytesIO(file_bytes))
    parts = []

    # Paragraphs
    for para in doc.paragraphs:
        style = para.style.name if para.style else ''
        text = para.text.strip()
        if not text:
            continue
        # Mark headings
        if 'heading' in style.lower():
            parts.append(f"[{style.upper()}] {text}")
        # Mark list items
        elif 'list' in style.lower() or text.startswith(('•', '-', '1.', '2.')):
            parts.append(f"• {text}")
        else:
            parts.append(text)

    # Tables
    for table in doc.tables:
        for row in table.rows:
            row_text = []
            for cell in row.cells:
                cell_text = cell.text.strip()
                if cell_text:
                    row_text.append(cell_text)
            if row_text:
                parts.append(" | ".join(row_text))

    return "\n".join(parts)

# ---------- Unified text extraction ----------
def extract_text_fast(file_bytes, filename):
    fname = filename.lower()
    if fname.endswith(".pdf"):
        return extract_pdf_text_robust(file_bytes)
    elif fname.endswith(".docx"):
        return extract_docx_text_rich(file_bytes)
    elif fname.endswith(".txt"):
        return file_bytes.decode("utf-8", "ignore")
    else:
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, or TXT.")

# ---------- Key phrase extraction ----------
def smart_sentences(text):
    return [s for s in split_sentences(text) if len(s.strip()) > 20]

def extract_key_phrases(text, top_n=15):
    phrases = []
    # Capitalised multi-word phrases
    cap_phrases = CAPITALIZED_PHRASE.findall(text)
    for phrase in cap_phrases:
        if len(phrase.split()) >= 2 and phrase.lower() not in STOP_WORDS:
            phrases.append(phrase)
    # Tech terms with special chars
    tech_terms = TECH_TERM.findall(text)
    phrases.extend(tech_terms)
    # Title-case bigrams
    words = WORD_PATTERN.findall(text)
    for i in range(len(words)-1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            bigram = f"{words[i]} {words[i+1]}"
            if len(bigram.split()) == 2 and bigram.lower() not in STOP_WORDS:
                phrases.append(bigram)
    phrase_counts = Counter(phrases)
    # Weight by length²
    weighted = [(p, c * (len(p.split()) ** 2)) for p, c in phrase_counts.items() if len(p) > 2]
    weighted.sort(key=lambda x: x[1], reverse=True)
    final = []
    for phrase, _ in weighted:
        if not any(phrase != other and phrase in other for other in final):
            final.append(phrase)
        if len(final) >= top_n:
            break
    # Fallback: single words
    if len(final) < top_n:
        singles = [w for w in words if w not in STOP_WORDS and len(w) > 5 and w[0].isupper()]
        for w, c in Counter(singles).most_common():
            if w not in final and not any(w in p for p in final):
                final.append(w)
            if len(final) >= top_n:
                break
    return final

# ---------- Definition finding (scored) ----------
DEFINITION_PATTERNS = [r'\bis a\b', r'\bdefined as\b', r'\brefers to\b', r'\bmeans\b', r'\bis the\b']

def score_definition_sentence(sent, term):
    if term.lower() not in sent.lower():
        return 0
    score = 1
    for pat in DEFINITION_PATTERNS:
        if re.search(pat, sent, re.IGNORECASE):
            score += 3
    if 30 < len(sent) < 300:
        score += 1
    return score

def find_definition_sentence(text, phrase):
    sents = smart_sentences(text)
    best = None
    best_score = 0
    for sent in sents:
        s = score_definition_sentence(sent, phrase)
        if s > best_score:
            best_score = s
            best = sent
    if best:
        return best[:300]
    # fallback: first sentence containing the phrase
    for sent in sents:
        if phrase.lower() in sent.lower():
            return sent[:300]
    return f"Related to {phrase}"

# ---------- Entity extractors (tightened) ----------
PERSON_NON_NAMES = {
    'rendering','pipeline','definition','high','android','ios','app','store','asset','game',
    'engine','cut','pro','final','mac','os','x','windows','machine','learning','deep','data',
    'science','big','small','large','long','short','high','low','different','important','many',
    'much','city','street','road','avenue','country','state','province','district','headquarters',
    'office','center','lab','studio','january','february','march','april','may','june','july',
    'august','september','october','november','december','monday','tuesday','wednesday','thursday',
    'friday','saturday','sunday'
}

def extract_persons(text):
    words = WORD_PATTERN.findall(text)
    persons = set()
    for i in range(len(words)-1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            full = f"{words[i]} {words[i+1]}"
            parts_lower = [w.lower() for w in full.split()]
            if not any(w in STOP_WORDS for w in parts_lower):
                if not any(w in PERSON_NON_NAMES for w in parts_lower):
                    persons.add(full)
    return list(persons)

def extract_locations(text):
    locs = set()
    loc_patterns = [
        r'\b(?:in|at|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|street|road|avenue|country|state|province|district)',
        r'\b([A-Z][a-z]+)\s+(?:headquarters|office|center|lab|studio)'
    ]
    for pat in loc_patterns:
        for m in re.finditer(pat, text):
            candidate = m.group(1).strip()
            if candidate.lower() not in PERSON_NON_NAMES and not any(
                d in candidate.lower()
                for d in ['january','february','march','april','may','june','july','august',
                          'september','october','november','december']
            ):
                locs.add(candidate)
    return list(locs)[:10]

def extract_dates(text):
    dates = re.findall(
        r'\b(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b',
        text
    )
    return dates

def extract_reason_sentences(text):
    sents = smart_sentences(text)
    return [s for s in sents if any(w in s.lower() for w in ['because','due to','reason','cause','lead to','result in'])]

def extract_method_sentences(text):
    sents = smart_sentences(text)
    return [s for s in sents if any(w in s.lower() for w in ['how','method','process','steps','procedure','way','by'])]

# ---------- Distractor filtering ----------
def is_too_similar(opt1, opt2, threshold=0.7):
    """Jaccard similarity of word sets."""
    words1 = set(WORD_PATTERN.findall(opt1.lower()))
    words2 = set(WORD_PATTERN.findall(opt2.lower()))
    if not words1 or not words2:
        return False
    intersection = words1 & words2
    union = words1 | words2
    return len(intersection) / len(union) > threshold

def deduplicate_options(options, correct):
    """Keep up to 3 unique, non‑similar distractors + correct."""
    unique = []
    for opt in options:
        if opt == correct:
            continue
        if not any(is_too_similar(opt, u, 0.7) for u in unique):
            unique.append(opt)
    distractors = unique[:3]
    while len(distractors) < 3:
        distractors.append("None of the above")
    return [correct] + distractors

# ---------- Safe Wikipedia enrichment ----------
async def fetch_wikipedia_title_and_summary(term):
    """Search for best non‑disambiguation article and fetch its summary."""
    search_url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={term.replace(' ', '_')}&limit=3&namespace=0&format=json"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(search_url, timeout=5) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    titles = data[1]  # list of titles
                    # pick first title that is not a disambiguation page
                    best_title = None
                    for t in titles:
                        if "(disambiguation)" not in t:
                            best_title = t
                            break
                    if not best_title and titles:
                        best_title = titles[0]
                    if best_title:
                        summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{best_title.replace(' ', '_')}"
                        async with session.get(summary_url, timeout=5) as resp2:
                            if resp2.status == 200:
                                data2 = await resp2.json()
                                extract = data2.get('extract', '')
                                # ensure it's not a hidden disambiguation
                                if extract and "may refer to:" not in extract[:200]:
                                    return best_title, extract[:300]
    except Exception:
        pass
    return None, None

async def get_wikipedia_definitions(phrases):
    """Fetch definitions only for top phrases, return dict {phrase: summary}."""
    summaries = {}
    tasks = [fetch_wikipedia_title_and_summary(p) for p in phrases[:8]]
    results = await asyncio.gather(*tasks)
    for phrase, (title, summary) in zip(phrases[:8], results):
        if summary:
            summaries[phrase] = f"{phrase}: {summary}"
    return summaries

# ---------- Question generators (fixed) ----------
def negate_sentence(sent):
    """Simple negation: insert 'not' after first auxiliary, or after first word."""
    aux_pattern = re.compile(r'\b(is|are|was|were|has|have|had|will|would|can|could|should|may|might|must|does|did|do)\b', re.IGNORECASE)
    match = aux_pattern.search(sent)
    if match:
        idx = match.end()
        return sent[:idx] + ' not' + sent[idx:]
    else:
        words = sent.split()
        if len(words) > 1:
            words.insert(1, 'not')
            return ' '.join(words)
    return "Not " + sent

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

def generate_why_questions(reason_sents, n):
    """Now extracts the full reason clause as answer, not just the connector."""
    questions = []
    for sent in reason_sents[:n]:
        match = re.search(r'\b(because|due to|as a result of)\b\s*(.*)', sent, re.IGNORECASE)
        if not match:
            continue
        connector = match.group(1)
        reason_clause = match.group(2).strip().rstrip('.')
        if len(reason_clause) < 5:
            continue
        question_text = re.sub(r'\b(because|due to|as a result of)\b.*', '________', sent, flags=re.IGNORECASE)
        # distractors: other sentence fragments
        other_reasons = [s.split()[-20:] for s in reason_sents if s != sent][:3]
        other_strs = [' '.join(frag) if isinstance(frag, list) else str(frag) for frag in other_reasons]
        while len(other_strs) < 3:
            other_strs.append("None of the above")
        options = deduplicate_options([reason_clause] + other_strs, reason_clause)
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "why",
            "question": f"Why? Complete the sentence: \"{question_text}\"",
            "options": options,
            "answer": reason_clause,
            "explanation": f"The reason is '{reason_clause}'."
        })
    return questions

def generate_how_questions(method_sents, n):
    questions = []
    for sent in method_sents[:n]:
        questions.append({
            "id": len(questions) + 1,
            "type": "how",
            "question": f"How can we understand this? \"{sent[:150]}...\"",
            "options": [],
            "answer": sent[:200],
            "explanation": "This sentence describes a method or process."
        })
    return questions

def generate_which_questions(phrases, text, n):
    """Reliable: true statement vs its negation."""
    questions = []
    for phrase in phrases[:n]:
        def_sent = find_definition_sentence(text, phrase)
        if def_sent.startswith("Related to"):
            continue
        false_sent = re.sub(
            r'\b(is|are|was|were|has|have|had|will|would|can|could|should|may|might|must|does|did|do)\b',
            r'\1 not', def_sent, count=1, flags=re.IGNORECASE
        )
        if false_sent == def_sent:
            words = def_sent.split()
            if len(words) > 1:
                words.insert(1, 'not')
                false_sent = ' '.join(words)
        options = [def_sent, false_sent]
        random.shuffle(options)
        questions.append({
            "id": len(questions) + 1,
            "type": "which",
            "question": f"Which statement is true about {phrase}?",
            "options": options,
            "answer": def_sent,
            "explanation": f"The correct statement about {phrase}."
        })
    return questions

# ---------- MAIN GENERATION ENDPOINT ----------
@app.post("/api/generate-reviewer-local")
async def gen_local(
    notes: str = Form(""),
    file: UploadFile = File(None),
    num_flashcards: int = Form(12),
    quiz_types: str = Form('{"identification":5}'),
    use_internet: bool = Form(False)
):
    start = time.time()
    text = notes.strip() if notes else ""
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or a file.")

    sents = smart_sentences(text)
    phrases = extract_key_phrases(text, top_n=max(num_flashcards, 25))

    # Internet enrichment (flashcards only)
    wiki_defs = {}
    if use_internet and phrases:
        wiki_defs = await get_wikipedia_definitions(phrases)
        # DO NOT append to text – keep quizzes source‑based

    summary = sents[:5] if len(sents) >= 5 else sents

    # Flashcards
    flashcards = []
    used_defs = set()
    # Prefer multi‑word phrases first
    multi = [p for p in phrases if len(p.split()) >= 2]
    single = [p for p in phrases if len(p.split()) == 1]
    for phrase in multi + single:
        if len(flashcards) >= num_flashcards:
            break
        def_sent = find_definition_sentence(text, phrase)
        # Use Wikipedia if local definition is weak and wiki available
        if def_sent.startswith("Related to") and phrase in wiki_defs:
            def_sent = wiki_defs[phrase]
        if def_sent in used_defs:
            continue
        flashcards.append({
            "id": len(flashcards) + 1,
            "term": phrase.strip(),
            "definition": def_sent
        })
        used_defs.add(def_sent)

    # Quiz parsing
    try:
        qt = json.loads(quiz_types)
    except:
        qt = {"identification": 5}
    quiz = []

    # True/False (negation‑based)
    tf_count = qt.get("truefalse", 0)
    for i in range(tf_count):
        sent = random.choice(sents) if sents else ""
        if not sent:
            break
        # Alternate true and false statements
        if i % 2 == 0:
            q_text = negate_sentence(sent)[:200]
            correct = "False"
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

    # Identification (fill‑in‑the‑blank)
    id_count = qt.get("identification", 0)
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
    enum_count = qt.get("enumeration", 0)
    if enum_count > 0:
        enum_concepts = [p for p in phrases if len(p.split()) >= 2] or phrases
        for _ in range(enum_count):
            concept = random.choice(enum_concepts)
            related = [s for s in sents if concept.lower() in s.lower()]
            if not related:
                continue
            points = [s[:100] for s in related[:3]]
            answer = "; ".join(points)
            question = (
                f"List three key points about {concept}."
                if len(points) >= 3
                else f"List the key point(s) about {concept} (only {len(points)} found)."
            )
            quiz.append({
                "id": len(quiz) + 1,
                "type": "enumeration",
                "question": question,
                "options": [],
                "answer": answer,
                "explanation": f"Points about {concept}."
            })

    # Multiple choice (definition‑based)
    mc_count = qt.get("multiplechoice", 0)
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

    # Wh‑questions
    persons = extract_persons(text)
    locations = extract_locations(text)
    dates = extract_dates(text)
    reason_sents = extract_reason_sentences(text)
    method_sents = extract_method_sentences(text)

    quiz.extend(generate_what_questions(phrases, text, qt.get("what", 0)))
    quiz.extend(generate_who_questions(persons, sents, qt.get("who", 0)))
    quiz.extend(generate_where_questions(locations, sents, qt.get("where", 0)))
    quiz.extend(generate_when_questions(dates, sents, qt.get("when", 0)))
    quiz.extend(generate_why_questions(reason_sents, qt.get("why", 0)))
    quiz.extend(generate_how_questions(method_sents, qt.get("how", 0)))
    quiz.extend(generate_which_questions(phrases, text, qt.get("which", 0)))

    elapsed = round(time.time() - start, 2)
    return JSONResponse(content={
        "summary": summary,
        "flashcards": flashcards,
        "quiz": quiz,
        "metadata": {
            "method": "accuracy_v5",
            "length": len(text),
            "time": elapsed
        }
    })

# ---------- AI endpoints (unchanged) ----------
def call_gemini(prompt, key):
    import urllib.request, urllib.error
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    data = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"}
    }).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.loads(json.loads(r.read())["candidates"][0]["content"]["parts"][0]["text"])

def call_deepseek(prompt, key):
    import urllib.request, urllib.error
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
        return json.loads(json.loads(r.read())["choices"][0]["message"]["content"])

@app.post("/api/generate-reviewer")
def gen_ai(
    api_key: str = Form(...),
    provider: str = Form("gemini"),
    notes: str = Form(""),
    file: UploadFile = File(None)
):
    if not api_key.strip():
        raise HTTPException(400, "API key required.")
    text = notes.strip() if notes else ""
    if file:
        fb = file.file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or file.")
    prompt = (
        "Analyze and return JSON with summary (5 points), "
        "flashcards (10 items with term/definition), "
        f"quiz (7 questions with options/answer/explanation). Notes: {text[:6000]}"
    )
    if provider == "deepseek":
        return call_deepseek(prompt, api_key)
    return call_gemini(prompt, api_key)