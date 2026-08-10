import json, io, zipfile, xml.etree.ElementTree as ET, re, random, time, asyncio
from collections import Counter
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pypdf
import aiohttp

app = FastAPI(title="AcademicHub API Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root(): return {"status":"online","system":"AcademicHub Core API"}

@app.get("/api/health")
def health(): return {"service":"AcademicHub Engine","status":"healthy"}

SENTENCE_PATTERN = re.compile(r'(?<!\d)[.!?](?!\d)')
WORD_PATTERN = re.compile(r'[a-zA-Z]+')
CAPITALIZED_PHRASE = re.compile(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b')
TECH_TERM = re.compile(r'\b[A-Za-z]+[#+]\b')
STOP_WORDS = frozenset({'the','is','at','which','on','a','an','and','or','but','in','with','to','for','of','from','by','as','be','was','are','been','this','that','these','those','it','its','they','them','we','you','he','she','his','her','their','our','my','your','has','have','had','do','does','did','will','would','could','should','may','might','can','shall','not','no','so','if','then','than','too','very','just','about','also','into','onto','upon','within','without','because','each','all','some','any','every','both','few','more','most','other','such','only','own','same','new','good','great','big','small','large','long','short','high','low','different','important','many','much'})

def extract_docx_text(file_bytes):
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            with z.open("word/document.xml") as f:
                tree = ET.parse(f)
                ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs = []
                for p in tree.iterfind('.//w:p', ns):
                    texts = [t.text for t in p.iterfind('.//w:t', ns) if t.text]
                    if texts: paragraphs.append(''.join(texts))
                return '\n'.join(paragraphs)
    except: raise HTTPException(400,"DOCX read error")

def extract_text_fast(file_bytes, fname):
    fname = fname.lower()
    if fname.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        return '\n'.join(page.extract_text() or "" for page in reader.pages)
    elif fname.endswith(".docx"): return extract_docx_text(file_bytes)
    elif fname.endswith(".txt"): return file_bytes.decode("utf-8","ignore")
    else: raise HTTPException(400,"Unsupported file")

def smart_sentences(text):
    text = re.sub(r'(Dr|Mr|Mrs|Ms|Prof|etc|vs|e\.g|i\.e)\.', r'\1<DOT>', text)
    sents = SENTENCE_PATTERN.split(text)
    return [s.strip().replace('<DOT>','.') for s in sents if len(s.strip()) > 20]

def extract_key_phrases(text, top_n=15):
    phrases = []
    cap_phrases = CAPITALIZED_PHRASE.findall(text)
    for phrase in cap_phrases:
        if len(phrase.split()) >= 2 and phrase.lower() not in STOP_WORDS:
            phrases.append(phrase)
    tech_terms = TECH_TERM.findall(text)
    phrases.extend(tech_terms)
    words = WORD_PATTERN.findall(text)
    for i in range(len(words)-1):
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
        if len(final) >= top_n: break
    if len(final) < top_n:
        singles = [w for w in words if w not in STOP_WORDS and len(w)>5 and w[0].isupper()]
        for w, c in Counter(singles).most_common():
            if w not in final and not any(w in p for p in final):
                final.append(w)
            if len(final) >= top_n: break
    return final

def find_definition_sentence(text, phrase):
    sents = smart_sentences(text)
    for sent in sents:
        if phrase.lower() in sent.lower():
            return sent[:300]
    return f"Related to {phrase}"

# ---------- WIKIPEDIA ENRICHMENT ----------
async def fetch_wikipedia_summary(term):
    """Fetch a short summary from Wikipedia for a given term."""
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{term.replace(' ', '_')}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=5) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    extract = data.get('extract', '')
                    if extract:
                        return f"{term}: {extract[:300]}"
    except Exception:
        pass
    return None

async def enrich_with_internet(key_phrases):
    """Fetch Wikipedia summaries for the top key phrases concurrently."""
    summaries = []
    tasks = [fetch_wikipedia_summary(phrase) for phrase in key_phrases[:5]]
    results = await asyncio.gather(*tasks)
    for res in results:
        if res:
            summaries.append(res)
    return "\n".join(summaries)

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

    # Extract initial phrases (before enrichment)
    sents = smart_sentences(text)
    phrases = extract_key_phrases(text, top_n=max(num_flashcards, 25))

    # ---- INTERNET ENRICHMENT ----
    if use_internet and phrases:
        extra = await enrich_with_internet(phrases)
        if extra:
            text += "\n\n--- Additional Context from Wikipedia ---\n" + extra
            # Re-extract sentences and phrases with the enriched text
            sents = smart_sentences(text)
            phrases = extract_key_phrases(text, top_n=max(num_flashcards, 25))

    summary = sents[:5] if len(sents) >= 5 else sents

    # Flashcards (unchanged logic)
    flashcards = []
    used_defs = set()
    multi = [p for p in phrases if len(p.split()) >= 2]
    single = [p for p in phrases if len(p.split()) == 1]
    for phrase in multi + single:
        if len(flashcards) >= num_flashcards: break
        def_sent = find_definition_sentence(text, phrase)
        if def_sent in used_defs: continue
        flashcards.append({"id": len(flashcards)+1, "term": phrase.strip(), "definition": def_sent})
        used_defs.add(def_sent)

    try: qt = json.loads(quiz_types)
    except: qt = {"identification":5}

    quiz = []

    # True/False
    tf_count = qt.get("truefalse",0)
    for i in range(tf_count):
        sent = random.choice(sents) if sents else ""
        if not sent: break
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
        quiz.append({"id": len(quiz)+1, "type":"truefalse",
                     "question": f'True or False: "{q_text}"',
                     "options":["True","False"], "answer":correct,
                     "explanation":f"The statement is {correct.lower()}."})

    # Identification
    id_count = qt.get("identification",0)
    for _ in range(id_count):
        sent = random.choice(sents) if sents else ""
        if not sent: break
        phrase_in = next((p for p in phrases if p.lower() in sent.lower()), None)
        if phrase_in:
            blanked = sent.replace(phrase_in, "________")
            correct = phrase_in
        else:
            words = [w for w in WORD_PATTERN.findall(sent) if w.lower() not in STOP_WORDS and len(w)>4]
            if not words: continue
            correct = random.choice(words)
            blanked = re.sub(r'\b'+re.escape(correct)+r'\b', '________', sent)
        pool = [p for p in phrases if p.lower() != correct.lower()]
        if len(pool) >= 3:
            distractors = random.sample(pool, 3)
        else:
            distractors = pool + ["None of the above"] * (3 - len(pool))
        options = [correct] + distractors
        random.shuffle(options)
        quiz.append({"id": len(quiz)+1, "type":"identification",
                     "question": f'Fill in the blank: "{blanked}"',
                     "options":options, "answer":correct,
                     "explanation":f"The missing term is '{correct}'."})

    # Enumeration
    enum_count = qt.get("enumeration",0)
    if enum_count > 0:
        enum_concepts = [p for p in phrases if len(p.split()) >= 2]
        if not enum_concepts: enum_concepts = phrases
        for _ in range(enum_count):
            concept = random.choice(enum_concepts)
            related = [s for s in sents if concept.lower() in s.lower()]
            if not related: continue
            points = [s[:100] for s in related[:3]]
            answer = "; ".join(points)
            if len(points) < 3:
                question = f"List the key point(s) about {concept} (only {len(points)} found)."
            else:
                question = f"List three key points about {concept}."
            quiz.append({"id": len(quiz)+1, "type":"enumeration",
                         "question": question, "options":[],
                         "answer":answer,
                         "explanation":f"Points about {concept}."})

    # Multiple Choice
    mc_count = qt.get("multiplechoice",0)
    if mc_count > 0:
        for _ in range(mc_count):
            if not phrases: break
            phrase = random.choice(phrases)
            def_sent = find_definition_sentence(text, phrase)
            pool = [find_definition_sentence(text, p) for p in phrases if p != phrase][:3]
            while len(pool) < 3: pool.append("None of the above")
            options = [def_sent] + pool
            random.shuffle(options)
            quiz.append({"id": len(quiz)+1, "type":"multiplechoice",
                         "question": f"What is {phrase}?",
                         "options": options,
                         "answer": def_sent,
                         "explanation": f"The definition of {phrase}."})

    # WH‑question types (unchanged – they use the same enriched text)
    persons = extract_persons(text)
    locations = extract_locations(text)
    dates = extract_dates(text)
    reason_sents = extract_reason_sentences(text)
    method_sents = extract_method_sentences(text)

    quiz.extend(generate_what_questions(phrases, text, qt.get("what",0)))
    quiz.extend(generate_who_questions(persons, sents, qt.get("who",0)))
    quiz.extend(generate_where_questions(locations, sents, qt.get("where",0)))
    quiz.extend(generate_when_questions(dates, sents, qt.get("when",0)))
    quiz.extend(generate_why_questions(reason_sents, qt.get("why",0)))
    quiz.extend(generate_how_questions(method_sents, qt.get("how",0)))
    quiz.extend(generate_which_questions(phrases, text, qt.get("which",0)))
    quiz.extend(generate_whose_questions(persons, sents, qt.get("whose",0)))

    elapsed = round(time.time()-start,2)
    return JSONResponse(content={"summary":summary,"flashcards":flashcards,"quiz":quiz,"metadata":{"method":"enriched_v1","length":len(text),"time":elapsed}})

# ---------- WH‑QUESTION GENERATORS ----------
def extract_persons(text):
    words = WORD_PATTERN.findall(text)
    persons = set()
    for i in range(len(words)-1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            full = f"{words[i]} {words[i+1]}"
            if not any(w.lower() in STOP_WORDS for w in full.split()):
                persons.add(full)
    return list(persons)

def extract_locations(text):
    loc_patterns = [
        r'\b(?:in|at|from|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:city|street|road|avenue|country|state|province|district)',
        r'\b([A-Z][a-z]+)\s+(?:headquarters|office|center|lab|studio)'
    ]
    locs = set()
    for pat in loc_patterns:
        for m in re.finditer(pat, text):
            locs.add(m.group(1).strip())
    return list(locs)[:10]

def extract_dates(text):
    dates = re.findall(r'\b(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b|\b\d{1,2}/\d{1,2}/\d{2,4}\b', text)
    return dates

def extract_reason_sentences(text):
    sents = smart_sentences(text)
    reason_sents = [s for s in sents if any(w in s.lower() for w in ['because','due to','reason','cause','lead to','result in'])]
    return reason_sents

def extract_method_sentences(text):
    sents = smart_sentences(text)
    method_sents = [s for s in sents if any(w in s.lower() for w in ['how','method','process','steps','procedure','way','by'])]
    return method_sents

def generate_what_questions(phrases, text, n):
    questions = []
    for phrase in phrases[:n]:
        def_sent = find_definition_sentence(text, phrase)
        other_defs = [find_definition_sentence(text, p) for p in phrases if p != phrase][:3]
        while len(other_defs) < 3: other_defs.append("None of the above")
        options = [def_sent] + other_defs
        random.shuffle(options)
        questions.append({"id": len(questions)+1, "type":"what",
                         "question": f"What is {phrase}?",
                         "options":options, "answer":def_sent,
                         "explanation":f"The description of {phrase}."})
    return questions

def generate_who_questions(persons, sents, n):
    questions = []
    for person in persons[:n]:
        related = [s for s in sents if person.lower() in s.lower()]
        if not related: continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if person.lower() not in s.lower()][:3]
        while len(other_sents) < 3: other_sents.append("None of the above")
        options = [correct] + other_sents
        random.shuffle(options)
        questions.append({"id": len(questions)+1, "type":"who",
                         "question": f"Who is {person}?",
                         "options":options, "answer":correct,
                         "explanation":f"About {person}."})
    return questions

def generate_where_questions(locations, sents, n):
    questions = []
    for loc in locations[:n]:
        related = [s for s in sents if loc.lower() in s.lower()]
        if not related: continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if loc.lower() not in s.lower()][:3]
        while len(other_sents) < 3: other_sents.append("None of the above")
        options = [correct] + other_sents
        random.shuffle(options)
        questions.append({"id": len(questions)+1, "type":"where",
                         "question": f"Where is {loc}?",
                         "options":options, "answer":correct,
                         "explanation":f"About {loc}."})
    return questions

def generate_when_questions(dates, sents, n):
    questions = []
    for date in dates[:n]:
        related = [s for s in sents if date in s]
        if not related: continue
        correct = related[0][:200]
        other_sents = [s[:200] for s in sents if date not in s][:3]
        while len(other_sents) < 3: other_sents.append("None of the above")
        options = [correct] + other_sents
        random.shuffle(options)
        questions.append({"id": len(questions)+1, "type":"when",
                         "question": f"When did this occur?",
                         "options":options, "answer":correct,
                         "explanation":f"This sentence contains the date {date}."})
    return questions

def generate_why_questions(reason_sents, n):
    questions = []
    for sent in reason_sents[:n]:
        causal_phrases = re.findall(r'\b(because|due to|reason|as a result)\b', sent, re.IGNORECASE)
        if not causal_phrases: continue
        blanked = re.sub(r'\b(because|due to|reason|as a result)\b', '________', sent, count=1, flags=re.IGNORECASE)
        correct = causal_phrases[0]
        distractors = ["because", "due to", "as a result", "therefore"]
        distractors = [d for d in distractors if d != correct][:3]
        while len(distractors) < 3: distractors.append("None of the above")
        options = [correct] + distractors
        random.shuffle(options)
        questions.append({"id": len(questions)+1, "type":"why",
                         "question": f"Why did this happen? Fill in the blank: \"{blanked}\"",
                         "options":options, "answer":correct,
                         "explanation":f"The missing cause is '{correct}'."})
    return questions

def generate_how_questions(method_sents, n):
    questions = []
    for sent in method_sents[:n]:
        questions.append({"id": len(questions)+1, "type":"how",
                         "question": f"How can we understand this? \"{sent[:150]}...\"",
                         "options":[],
                         "answer": sent[:200],
                         "explanation": "This sentence describes a method or process."})
    return questions

def generate_which_questions(phrases, text, n):
    questions = []
    for phrase in phrases[:n]:
        true_stmt = find_definition_sentence(text, phrase)
        words = WORD_PATTERN.findall(true_stmt)
        if words:
            random_word = random.choice([w for w in words if w.lower() not in STOP_WORDS and len(w)>4])
            if random_word:
                false_stmt = true_stmt.replace(random_word, "something")
                options = [true_stmt, false_stmt, "None of the above", "Both A and B"]
                random.shuffle(options)
                questions.append({"id": len(questions)+1, "type":"which",
                                 "question": f"Which statement is correct about {phrase}?",
                                 "options":options, "answer":true_stmt,
                                 "explanation":f"The correct description of {phrase}."})
    return questions

def generate_whose_questions(persons, sents, n):
    questions = []
    for sent in sents:
        for person in persons:
            if person in sent and re.search(r'\bof\b', sent):
                questions.append({"id": len(questions)+1, "type":"whose",
                                 "question": f"Whose responsibility is this? \"{sent[:120]}...\"",
                                 "options":[],
                                 "answer": sent[:200],
                                 "explanation": f"Related to {person}."})
                if len(questions) >= n: break
        if len(questions) >= n: break
    return questions

# AI endpoints
def call_gemini(prompt, key):
    import urllib.request, urllib.error
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    data = json.dumps({"contents":[{"parts":[{"text":prompt}]}],"generationConfig":{"temperature":0.2,"responseMimeType":"application/json"}}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req, timeout=35) as r:
        return json.loads(json.loads(r.read())["candidates"][0]["content"]["parts"][0]["text"])

def call_deepseek(prompt, key):
    import urllib.request, urllib.error
    url = "https://api.deepseek.com/chat/completions"
    headers = {"Content-Type":"application/json","Authorization":f"Bearer {key}"}
    payload = {"model":"deepseek-chat","messages":[{"role":"system","content":"Return JSON only."},{"role":"user","content":prompt}],"response_format":{"type":"json_object"},"temperature":0.2}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(json.loads(r.read())["choices"][0]["message"]["content"])

@app.post("/api/generate-reviewer")
def gen_ai(api_key: str = Form(...), provider: str = Form("gemini"), notes: str = Form(""), file: UploadFile = File(None)):
    if not api_key.strip(): raise HTTPException(400,"API key required.")
    text = notes.strip() if notes else ""
    if file:
        fb = file.file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip(): raise HTTPException(400,"Provide notes or file.")
    prompt = f"Analyze and return JSON with summary (5 points), flashcards (10 items with term/definition), quiz (7 questions with options/answer/explanation). Notes: {text[:6000]}"
    if provider=="deepseek": return call_deepseek(prompt, api_key)
    return call_gemini(prompt, api_key)
