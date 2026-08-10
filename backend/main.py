import json, io, zipfile, xml.etree.ElementTree as ET, re, random, time
from collections import Counter
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pypdf

app = FastAPI(title="AcademicHub API Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status":"online","system":"AcademicHub Core API"}

@app.get("/api/health")
def health():
    return {"service":"AcademicHub Engine","status":"healthy"}

# Pre-compiled patterns
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
                    if texts:
                        paragraphs.append(''.join(texts))
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
    # bigrams with capitals
    words = WORD_PATTERN.findall(text)
    for i in range(len(words)-1):
        if words[i][0].isupper() and words[i+1][0].isupper():
            bigram = f"{words[i]} {words[i+1]}"
            if len(bigram.split()) == 2 and bigram.lower() not in STOP_WORDS:
                phrases.append(bigram)
    phrase_counts = Counter(phrases)
    weighted = [(p, c * len(p.split())) for p, c in phrase_counts.items() if len(p) > 2]
    weighted.sort(key=lambda x: x[1], reverse=True)
    final = []
    for phrase, _ in weighted:
        if not any(phrase != other and phrase in other for other in final):
            final.append(phrase)
        if len(final) >= top_n:
            break
    # fallback to longer single words if needed
    if len(final) < top_n:
        singles = [w for w in words if w not in STOP_WORDS and len(w)>5 and w[0].isupper()]
        for w in Counter(singles).most_common():
            if w[0] not in final:
                final.append(w[0])
            if len(final) >= top_n:
                break
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
    num_quiz: int = Form(10)
):
    start = time.time()
    text = notes.strip() if notes else ""
    if file:
        fb = await file.read()
        text += "\n" + extract_text_fast(fb, file.filename)
    if not text.strip():
        raise HTTPException(400, "Provide notes or a file.")
    sents = smart_sentences(text)
    phrases = extract_key_phrases(text, top_n=max(num_flashcards, num_quiz))
    summary = sents[:5] if len(sents) >= 5 else sents
    # Flashcards exactly as requested
    flashcards = []
    for i, phrase in enumerate(phrases[:num_flashcards]):
        definition = find_definition_sentence(text, phrase)
        flashcards.append({
            "id": i+1,
            "term": phrase.strip(),
            "definition": definition
        })
    # Quiz exactly as requested
    quiz = []
    used_sents = set()
    for sent in sents:
        if len(quiz) >= num_quiz: break
        blanked, correct = None, None
        for phrase in phrases:
            if phrase.lower() in sent.lower() and sent not in used_sents:
                blanked = re.sub(re.escape(phrase), '________', sent, flags=re.IGNORECASE)
                correct = phrase
                break
        if not blanked:
            words = [w for w in WORD_PATTERN.findall(sent) if w.lower() not in STOP_WORDS and len(w)>4]
            if not words: continue
            correct = random.choice(words)
            blanked = re.sub(r'\b' + re.escape(correct) + r'\b', '________', sent)
        pool = [p for p in phrases if p.lower() != correct.lower()]
        distractors = random.sample(pool, min(3, len(pool))) if pool else []
        while len(distractors) < 3: distractors.append('None of the above')
        options = [correct] + distractors
        random.shuffle(options)
        quiz.append({
            "id": len(quiz)+1,
            "question": f"Fill in the blank: \"{blanked}\"",
            "options": options,
            "answer": correct,
            "explanation": f"The correct phrase is '{correct}'."
        })
        used_sents.add(sent)
    elapsed = round(time.time() - start, 2)
    return JSONResponse(content={
        "summary": summary,
        "flashcards": flashcards,
        "quiz": quiz,
        "metadata": {"method":"accuracy_v3","text_length":len(text),"time":elapsed}
    })

# AI endpoints unchanged
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
