"""AcadHub backend — Gemini primary, Grok fallback. Keys from env vars."""

from __future__ import annotations

import asyncio
import io
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AcadHub API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "").strip()
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-exp").strip()
GROQ_MODEL     = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

STOP_WORDS = {
    "about","after","again","against","also","because","before","being",
    "between","could","first","from","have","into","more","other","over",
    "same","should","their","there","these","they","this","through","using",
    "were","which","with","would","your","that","then","than","where",
}

def clean_text(v: str) -> str:
    return re.sub(r"\s+", " ", v or "").strip()

def split_sentences(text: str) -> list[str]:
    return [clean_text(s) for s in re.split(r"(?<=[.!?])\s+|\n+", text) if clean_text(s)]

def keywords(text: str, limit: int = 20) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", text.lower())
    counts = Counter(w for w in words if w not in STOP_WORDS)
    return [w for w, _ in counts.most_common(limit)]

def assess_quality(materials: dict, source_text: str) -> dict:
    source = source_text.casefold()
    checks: list[bool] = []
    checks.extend(bool(i) for i in materials.get("summary", []))
    for card in materials.get("flashcards", []):
        term = str(card.get("term", ""))
        checks.append(bool(term) and term.casefold() in source)
        checks.append(bool(card.get("definition")))
    for q in materials.get("quiz", []):
        ans = str(q.get("answer", "")).strip()
        qt = q.get("type")
        if qt == "truefalse":
            checks.append(ans.casefold() in {"true", "false"})
        elif qt in {"multiplechoice","what","who","where","when"}:
            opts = [str(o) for o in q.get("options", [])]
            checks.append(bool(opts) and ans in opts)
            checks.append(bool(ans) and ans.casefold() in source)
        else:
            checks.append(bool(ans))
            checks.append(bool(ans) and any(p.casefold() in source for p in ans.split(", ")))
    score = round(sum(checks) / len(checks) * 100) if checks else 0
    return {"score": score, "basis": "source grounding and answer consistency"}

def parse_quiz_types(raw: str | None) -> dict[str, int]:
    if not raw:
        return {"truefalse": 3, "identification": 3, "enumeration": 2, "multiplechoice": 3}
    try:
        v = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(v, dict):
        return {}
    out = {}
    for k, c in v.items():
        try:
            out[str(k).lower()] = max(0, min(int(c), 50))
        except (TypeError, ValueError):
            continue
    return out

def build_materials(text: str, quiz_types: dict, flashcard_count: int) -> dict:
    text = clean_text(text)
    sentences = split_sentences(text)
    terms = keywords(text, max(flashcard_count * 3, 30))
    summary = sentences[: min(8, len(sentences))]
    if not summary:
        summary = ["Add more complete sentences to generate a useful summary."]

    flashcards: list[dict] = []
    used = set()
    for term in terms:
        if len(flashcards) >= flashcard_count:
            break
        src = next((s for s in sentences if term in s.lower() and s not in used), "")
        if src:
            used.add(src)
        flashcards.append({"term": term.title(), "definition": src or f"A key concept: {term}."})
    if len(flashcards) < flashcard_count:
        for s in sentences:
            if len(flashcards) >= flashcard_count:
                break
            if s in used:
                continue
            words = re.findall(r"[A-Za-z][A-Za-z'-]{4,}", s)
            meaningful = [w for w in words if w.lower() not in STOP_WORDS]
            if not meaningful:
                continue
            flashcards.append({"term": meaningful[0].title(), "definition": s})
            used.add(s)

    quiz: list[dict] = []
    for idx in range(quiz_types.get("truefalse", 0)):
        if not sentences:
            quiz.append({"type": "truefalse", "question": "True or False: The notes contain study material.", "answer": "True"})
            continue
        s = sentences[idx % len(sentences)]
        is_true = idx % 2 == 0
        if is_true:
            quiz.append({"type": "truefalse", "question": f"True or False: {s}", "answer": "True"})
        else:
            words = s.split()
            flipped = list(words)
            for i, w in enumerate(words):
                if w.lower() in STOP_WORDS or len(w) < 4:
                    continue
                flipped[i] = "NOT_" + w
                break
            if "NOT_" not in " ".join(flipped):
                quiz.append({"type": "truefalse", "question": f"True or False: {s}", "answer": "True"})
            else:
                quiz.append({"type": "truefalse", "question": f"True or False: {s.replace(words[i], 'NOT ' + words[i])}", "answer": "False"})

    ident_stems = [
        "Identify the key term: {term}.",
        "What term matches this description: {term}?",
        "Fill in the blank: ____________ refers to {term}.",
        "Name the concept: {term}.",
    ]
    for i in range(quiz_types.get("identification", 0)):
        term = terms[i % len(terms)] if terms else "concept"
        quiz.append({"type": "identification", "question": ident_stems[i % len(ident_stems)].format(term=term.title()), "answer": term.title()})

    enum_stems = [
        ("List three important concepts from the notes.", 3),
        ("Enumerate two key terms discussed in the material.", 2),
        ("Give four concepts covered in the notes.", 4),
    ]
    for i in range(quiz_types.get("enumeration", 0)):
        stem, n = enum_stems[i % len(enum_stems)]
        items = ", ".join(terms[(i + o) % len(terms)] for o in range(n)) if terms else "the main ideas"
        quiz.append({"type": "enumeration", "question": stem, "answer": items})

    distractor_pool = [t.title() for t in terms if len(t) >= 4]
    fb = ["An unrelated concept", "A secondary detail", "None of these"]

    def make_mcq(qtype: str, pos: int) -> dict:
        src = sentences[pos % len(sentences)] if sentences else "the study material"
        sw = re.findall(r"[A-Za-z][A-Za-z'-]{4,}", src)
        sk = [w for w in sw if w.lower() not in STOP_WORDS]
        correct = sk[pos % len(sk)].title() if sk else (distractor_pool[pos % len(distractor_pool)] if distractor_pool else "the study material")
        cands = [t for t in distractor_pool if t.lower() != correct.lower()]
        if len(cands) < 3:
            for f in fb:
                if f.lower() != correct.lower() and f not in cands:
                    cands.append(f)
        wrong: list[str] = []
        i = pos
        safety = 0
        while len(wrong) < 3 and safety < len(cands) * 3:
            c = cands[i % len(cands)]
            if c.lower() != correct.lower() and c not in wrong:
                wrong.append(c)
            i += 1
            safety += 1
        opts = [correct] + wrong[:3]
        rot = pos % max(1, len(opts))
        opts = opts[rot:] + opts[:rot]
        exc = src if len(src) <= 90 else src[:87].rstrip() + "..."
        stems = {
            "what": f"Which term best completes this idea: \"{exc}\"?",
            "who": f"Which term is most associated with: \"{exc}\"?",
            "where": f"Which concept is referenced here: \"{exc}\"?",
            "when": f"Which term relates to this statement: \"{exc}\"?",
            "multiplechoice": f"Which of these is a key concept related to: \"{exc}\"?",
        }
        return {"type": qtype, "question": stems.get(qtype, stems["multiplechoice"]), "options": opts, "answer": correct}

    mpos = 0
    for qt in ("multiplechoice", "what", "who", "where", "when"):
        for _ in range(quiz_types.get(qt, 0)):
            quiz.append(make_mcq(qt, mpos))
            mpos += 1

    materials = {"summary": summary, "flashcards": flashcards, "quiz": quiz}
    materials["quality"] = assess_quality(materials, text)
    return materials

async def read_notes(notes: str | None, files: list[UploadFile] | None) -> str:
    chunks = [clean_text(notes or "")]
    for f in (files or []):
        if not f or not f.filename:
            continue
        raw = await f.read()
        fn = (f.filename or "").lower()
        if fn.endswith((".txt", ".md", ".rtf", ".html", ".htm")):
            chunks.append(re.sub(r"<[^>]+>", " ", raw.decode("utf-8", errors="ignore")))
        elif fn.endswith(".pdf"):
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(raw))
                chunks.append("\n".join(p.extract_text() or "" for p in reader.pages))
            except Exception as exc:
                raise HTTPException(400, f"Could not read PDF: {f.filename}") from exc
        elif fn.endswith(".docx"):
            try:
                from docx import Document
                doc = Document(io.BytesIO(raw))
                chunks.append("\n".join(p.text for p in doc.paragraphs))
            except Exception as exc:
                raise HTTPException(400, f"Could not read DOCX: {f.filename}") from exc
    text = clean_text(" ".join(chunks))
    if not text:
        raise HTTPException(400, "Please provide notes or a readable document.")
    return text

def parse_json_response(v: str) -> dict:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", v.strip(), flags=re.IGNORECASE)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(502, "AI returned invalid JSON.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(502, "AI returned invalid shape.")
    return parsed

def build_ai_prompt(text: str, quiz_types: dict, flashcard_count: int) -> str:
    return f"""Create study materials from the notes below.
Return JSON only, with exactly these keys:
summary: array of concise strings
flashcards: array of objects with term and definition strings
quiz: array of objects with type, question, answer, optional options array

Create up to {flashcard_count} flashcards. Quiz counts by type: {json.dumps(quiz_types)}.
Allowed quiz types: truefalse, identification, enumeration, multiplechoice, what, who, where, when.
For multiple choice, options must be an array and answer must exactly match one option.
For truefalse, answer must be exactly True or False.

NOTES:
{text}
"""

def build_summary_prompt(text: str) -> str:
    return f"""Summarize the notes below into a JSON object with exactly one key:
summary: array of concise standalone bullet-point strings (max 8 items)

NOTES:
{text}
"""

async def generate_with_gemini(text: str, quiz_types: dict, flashcard_count: int) -> dict:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not configured.")
    body = json.dumps({
        "contents": [{"parts": [{"text": build_ai_prompt(text, quiz_types, flashcard_count)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_URL}?key={urllib.parse.quote(GEMINI_API_KEY)}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    def call():
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Gemini failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Gemini unreachable.") from exc
    resp = await asyncio.to_thread(call)
    try:
        gen = resp["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Gemini returned no content.") from exc
    result = parse_json_response(gen)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    result["_provider"] = "gemini"
    return result

async def generate_summary_with_gemini(text: str) -> list[str]:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not configured.")
    body = json.dumps({
        "contents": [{"parts": [{"text": build_summary_prompt(text)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{GEMINI_URL}?key={urllib.parse.quote(GEMINI_API_KEY)}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    def call():
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Gemini failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Gemini unreachable.") from exc
    resp = await asyncio.to_thread(call)
    try:
        gen = resp["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Gemini returned no content.") from exc
    parsed = parse_json_response(gen)
    s = parsed.get("summary", [])
    return [str(i) for i in s][:8] if isinstance(s, list) else []

async def generate_with_groq(text: str, quiz_types: dict, flashcard_count: int) -> dict:
    if not GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY not configured.")
    body = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You return valid JSON only, no prose."},
            {"role": "user", "content": build_ai_prompt(text, quiz_types, flashcard_count)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }).encode("utf-8")
    req = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "User-Agent": "AcadHub/2.0 (python-urllib)",
        },
        method="POST",
    )
    def call():
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Groq failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Groq unreachable.") from exc
    resp = await asyncio.to_thread(call)
    try:
        gen = resp["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Groq returned no content.") from exc
    result = parse_json_response(gen)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    result["_provider"] = "grok"
    return result

async def generate_summary_with_groq(text: str) -> list[str]:
    if not GROQ_API_KEY:
        raise HTTPException(500, "GROQ_API_KEY not configured.")
    body = json.dumps({
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": "You return valid JSON only, no prose."},
            {"role": "user", "content": build_summary_prompt(text)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }).encode("utf-8")
    req = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "User-Agent": "AcadHub/2.0 (python-urllib)",
        },
        method="POST",
    )
    def call():
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Groq failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Groq unreachable.") from exc
    resp = await asyncio.to_thread(call)
    try:
        gen = resp["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Groq returned no content.") from exc
    parsed = parse_json_response(gen)
    s = parsed.get("summary", [])
    return [str(i) for i in s][:8] if isinstance(s, list) else []

async def generate_with_ai(text: str, quiz_types: dict, flashcard_count: int) -> dict:
    errors: list[str] = []
    if GEMINI_API_KEY:
        try:
            return await generate_with_gemini(text, quiz_types, flashcard_count)
        except HTTPException as exc:
            errors.append(f"Gemini: {exc.detail}")
            print(f"[fallback] Gemini failed → {exc.detail}")
    if GROQ_API_KEY:
        try:
            return await generate_with_groq(text, quiz_types, flashcard_count)
        except HTTPException as exc:
            errors.append(f"Grok: {exc.detail}")
    raise HTTPException(502, "All AI providers failed. " + " | ".join(errors) if errors else "No AI provider configured.")

async def generate_summary_ai(text: str) -> list[str]:
    errors: list[str] = []
    if GEMINI_API_KEY:
        try:
            return await generate_summary_with_gemini(text)
        except HTTPException as exc:
            errors.append(f"Gemini: {exc.detail}")
            print(f"[fallback] Gemini summary failed → {exc.detail}")
    if GROQ_API_KEY:
        try:
            return await generate_summary_with_groq(text)
        except HTTPException as exc:
            errors.append(f"Grok: {exc.detail}")
    return split_sentences(text)[:8]

@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "acadhub-api",
        "providers": {"gemini": bool(GEMINI_API_KEY), "grok": bool(GROQ_API_KEY)},
    }

@app.post("/api/generate-reviewer")
async def generate_reviewer(
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
    use_internet: bool = Form(False),
    enrich_count: int = Form(5),
) -> dict:
    text = await read_notes(notes, file)
    return await generate_with_ai(text, parse_quiz_types(quiz_types), max(1, min(num_flashcards, 50)))

@app.post("/api/summary")
async def summary(notes: str | None = Form(None), file: list[UploadFile] = File(default=[])) -> dict:
    text = await read_notes(notes, file)
    return {"summary": await generate_summary_ai(text)}

@app.post("/api/generate-test")
async def generate_test(
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    difficulty: str = Form("easy"),
    use_internet: bool = Form(False),
) -> dict:
    text = await read_notes(notes, file)
    count = {"easy": 8, "medium": 15, "hard": 26}.get(difficulty, 8)
    materials = build_materials(text, {"multiplechoice": count}, 1)
    return {"questions": materials["quiz"]}

@app.post("/api/flashcards")
async def flashcards(notes: str = Form(""), num_flashcards: int = Form(10)) -> dict:
    text = await read_notes(notes, None)
    return {"flashcards": build_materials(text, {}, num_flashcards)["flashcards"]}

@app.post("/api/quiz")
async def quiz(notes: str = Form(""), quiz_types: str | None = Form(None)) -> dict:
    text = await read_notes(notes, None)
    return {"quiz": build_materials(text, parse_quiz_types(quiz_types), 1)["quiz"]}

@app.post("/api/enrich")
async def enrich(notes: str = Form(""), enrich_count: int = Form(5)) -> dict:
    text = await read_notes(notes, None)
    return {"results": keywords(text, max(1, min(enrich_count, 20)))}
