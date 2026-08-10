import json, io, zipfile, xml.etree.ElementTree as ET, re, random
from collections import Counter
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import pypdf

app = FastAPI(title="AcademicHub API Engine")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def root():
    return {"status":"online","system":"AcademicHub Core API"}

@app.get("/api/health")
def health():
    return {"service":"AcademicHub Engine","status":"healthy"}

def extract_docx_text(b): 
    try:
        with zipfile.ZipFile(io.BytesIO(b)) as z:
            xml = z.read("word/document.xml")
            tree = ET.fromstring(xml)
            paras = []
            for p in tree.iter():
                if p.tag.endswith("}p"):
                    txt = "".join(n.text for n in p.iter() if n.tag.endswith("}t") and n.text)
                    if txt: paras.append(txt)
            return "\n".join(paras)
    except: raise HTTPException(400,"DOCX read error")

def extract_text(file_bytes, fname):
    fname = fname.lower()
    if fname.endswith(".pdf"):
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        return "\n".join(p.extract_text() or "" for p in reader.pages[:15])
    elif fname.endswith(".docx"): return extract_docx_text(file_bytes)
    elif fname.endswith(".txt"): return file_bytes.decode("utf-8","ignore")
    else: raise HTTPException(400,"Unsupported file")

class LocalEngine:
    STOP = {'the','is','at','which','on','a','an','and','or','but','in','with','to','for','of','from','by','as','be','was','are','been','this','that','these','those','it','its','they','them','we','you','he','she','his','her','their','our','my','your','has','have','had','do','does','did','will','would','could','should','may','might','can','shall','not','no','so','if','then','than','too','very','just','about','also','into','onto','upon','within','without','because','each','all','some','any','every','both','few','more','most','other','such','only','own','same','new','good','great','big','small','large','long','short','high','low','different','important','many','much'}

    @staticmethod
    def sentences(text):
        txt = re.sub(r'(Dr|Mr|Mrs|Ms|Prof|etc|vs)\.', r'\1<DOT>', text)
        sents = re.split(r'[.!?]+', txt)
        return [s.strip().replace('<DOT>','.') for s in sents if len(s.strip().split())>4]

    @staticmethod
    def summarize(text, n=5):
        sents = LocalEngine.sentences(text)
        if not sents: return ["Text too short."]
        words = [re.findall(r'[a-zA-Z]+', s.lower()) for s in sents]
        all_words = sum(words, [])
        freq = Counter(all_words)
        max_freq = max(freq.values()) if freq else 1
        scores = []
        for i, s in enumerate(sents):
            score = sum(freq[w]/max_freq for w in words[i] if w not in LocalEngine.STOP)
            if i == 0: score += 0.5
            elif i == len(sents)-1: score += 0.3
            scores.append((s[:250], score))
        scores.sort(key=lambda x: x[1], reverse=True)
        seen = set()
        summary = []
        for s, _ in scores:
            key = s[:50].lower()
            if key not in seen and len(summary) < n:
                summary.append(s)
                seen.add(key)
        return summary

    @staticmethod
    def flashcards(text, n=10):
        # Use the same important sentences as flashcards, with key concept highlighted
        sents = LocalEngine.summarize(text, n)
        flashcards = []
        for i, sent in enumerate(sents):
            # Extract a key word (longest non‑stopword)
            words = re.findall(r'[a-zA-Z]+', sent)
            key = ""
            for w in words:
                if w.lower() not in LocalEngine.STOP and len(w) > len(key):
                    key = w
            if not key:
                key = "concept"
            flashcards.append({
                "id": i+1,
                "term": key,
                "definition": sent
            })
        return flashcards

    @staticmethod
    def quiz(text, n=10):
        sents = LocalEngine.sentences(text)
        if not sents: return []
        # Use only the more important sentences
        important = LocalEngine.summarize(text, n)
        quiz = []
        for sent in important:
            if len(quiz) >= n: break
            # Pick a candidate word to blank out (noun/verb, length>3)
            words = re.findall(r'[a-zA-Z]+', sent)
            candidates = [w for w in words if w.lower() not in LocalEngine.STOP and len(w)>3]
            if not candidates:
                continue
            blank_word = random.choice(candidates)
            blanked = re.sub(r'\b' + re.escape(blank_word) + r'\b', '________', sent)
            correct = blank_word
            # Choose distractors from other candidate words
            other_words = [w for w in candidates if w.lower() != correct.lower()]
            random.shuffle(other_words)
            distractors = other_words[:3]
            while len(distractors) < 3:
                distractors.append('None of the above')
            options = [correct] + distractors
            random.shuffle(options)
            quiz.append({
                "id": len(quiz)+1,
                "question": f"Fill in the blank: \"{blanked}\"",
                "options": options,
                "answer": correct,
                "explanation": f"The missing word is '{correct}'."
            })
        return quiz

@app.post("/api/generate-reviewer-local")
async def gen_local(notes: str = Form(""), file: UploadFile = File(None)):
    text = notes.strip() if notes else ""
    if file:
        fb = await file.read()
        text += "\n" + extract_text(fb, file.filename)
    if not text.strip(): raise HTTPException(400,"Provide notes or a file.")
    text = text[:15000]
    eng = LocalEngine()
    return {
        "summary": eng.summarize(text),
        "flashcards": eng.flashcards(text),
        "quiz": eng.quiz(text),
        "metadata":{"method":"sentence_based_v1","length":len(text)}
    }

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
        text += "\n" + extract_text(fb, file.filename)
    if not text.strip(): raise HTTPException(400,"Provide notes or file.")
    prompt = f"Analyze and return JSON with summary (5 points), flashcards (10 items with term/definition), quiz (7 questions with options/answer/explanation). Notes: {text[:6000]}"
    if provider=="deepseek": return call_deepseek(prompt, api_key)
    return call_gemini(prompt, api_key)
