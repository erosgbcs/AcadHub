import json, io, zipfile, xml.etree.ElementTree as ET, re, random, time
from collections import Counter
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pypdf

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

@app.post("/api/generate-reviewer-local")
async def gen_local(
    notes: str = Form(""),
    file: UploadFile = File(None),
    num_flashcards: int = Form(12),
    quiz_types: str = Form('{"identification":5}')
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
    summary = sents[:5] if len(sents) >= 5 else sents

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

    # ---- True/False (can reuse sentences but we limit to avoid repetition) ----
    tf_count = qt.get("truefalse",0)
    used_tf_sents = set()
    for i in range(tf_count):
        # pick a sentence, allow reuse after we exhaust unique ones
        if len(used_tf_sents) >= len(sents):
            # all sentences used, pick a random one (may repeat)
            sent = random.choice(sents)
        else:
            available = [s for s in sents if s not in used_tf_sents]
            sent = random.choice(available)
            used_tf_sents.add(sent)
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

    # ---- Identification: fill‑in‑the‑blank, allow reusing sentences with different blanks ----
    id_count = qt.get("identification",0)
    used_id_pairs = set()  # (sentence, phrase)
    for _ in range(id_count):
        # pick a sentence (allow reuse)
        sent = random.choice(sents)
        # find a key phrase in the sentence that we haven't used with this sentence yet
        contained = [(p, len(p)) for p in phrases if p.lower() in sent.lower()]
        if not contained:
            # fallback to any long word
            words = [w for w in WORD_PATTERN.findall(sent) if w.lower() not in STOP_WORDS and len(w)>4]
            if not words: continue
            correct = random.choice(words)
        else:
            # prefer a phrase not yet used for this sentence
            unused = [p for p, _ in contained if (sent, p) not in used_id_pairs]
            if unused:
                correct = random.choice(unused)
            else:
                correct = random.choice([p for p, _ in contained])
        used_id_pairs.add((sent, correct))
        blanked = re.sub(re.escape(correct), '________', sent, flags=re.IGNORECASE)
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

    # ---- Enumeration: unchanged, but we can generate more by reusing concepts ----
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

    # ---- Multiple Choice: definition‑based questions ----
    mc_count = qt.get("multiplechoice",0)
    if mc_count > 0:
        # Build a pool of (term, definition) from flashcards (or from phrases)
        term_defs = []
        for phrase in phrases:
            def_sent = find_definition_sentence(text, phrase)
            term_defs.append((phrase, def_sent))
        if not term_defs:
            # fallback: use sentences as definitions
            for sent in sents[:10]:
                term_defs.append(("concept", sent))
        for _ in range(mc_count):
            if not term_defs: break
            correct_term, correct_def = random.choice(term_defs)
            # Distractors: other definitions
            other_defs = [d for t, d in term_defs if d != correct_def][:3]
            while len(other_defs) < 3:
                other_defs.append("None of the above")
            options = [correct_def] + other_defs
            random.shuffle(options)
            question = f"What is {correct_term}?"
            quiz.append({"id": len(quiz)+1, "type":"multiplechoice",
                         "question": question,
                         "options": options,
                         "answer": correct_def,
                         "explanation": f"The definition of {correct_term}."})

    elapsed = round(time.time()-start,2)
    return JSONResponse(content={"summary":summary,"flashcards":flashcards,"quiz":quiz,"metadata":{"method":"unlimited_v2","length":len(text),"time":elapsed}})

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
