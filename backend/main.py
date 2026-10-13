"""AcadHub backend.

Uses Gemini as primary provider with automatic Grok (xAI) fallback.
API keys are read from environment variables — never exposed to the client.
"""

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

# ============================================================
# SERVER-SIDE API KEYS + MODELS (set as env vars)
# ============================================================
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GROK_API_KEY   = os.environ.get("GROK_API_KEY", "").strip()
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash").strip()
GROK_MODEL     = os.environ.get("GROK_MODEL", "grok-4").strip()

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)
GROK_URL = "https://api.x.ai/v1/chat/completions"

STOP_WORDS = {
    "about", "after", "again", "against", "also", "because", "before", "being",
    "between", "could", "first", "from", "have", "into", "more", "other", "over",
    "same", "should", "their", "there", "these", "they", "this", "through", "using",
    "were", "which", "with", "would", "your", "that", "then", "than", "where",
}


# ============================================================
# HELPERS (unchanged)
# ============================================================
def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def split_sentences(text: str) -> list[str]:
    return [clean_text(item) for item in re.split(r"(?<=[.!?])\s+|\n+", text) if clean_text(item)]


def keywords(text: str, limit: int = 20) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z'-]{3,}", text.lower())
    counts = Counter(word for word in words if word not in STOP_WORDS)
    return [word for word, _ in counts.most_common(limit)]


def assess_quality(materials: dict[str, Any], source_text: str) -> dict[str, Any]:
    source = source_text.casefold()
    checks: list[bool] = []
    checks.extend(bool(item) for item in materials.get("summary", []))
    for card in materials.get("flashcards", []):
        term = str(card.get("term", ""))
        checks.append(bool(term) and term.casefold() in source)
        checks.append(bool(card.get("definition")))
    for question in materials.get("quiz", []):
        answer = str(question.get("answer", "")).strip()
        question_type = question.get("type")
        if question_type == "truefalse":
            checks.append(answer.casefold() in {"true", "false"})
        elif question_type in {"multiplechoice", "what", "who", "where", "when"}:
            options = [str(option) for option in question.get("options", [])]
            checks.append(bool(options) and answer in options)
            checks.append(bool(answer) and answer.casefold() in source)
        else:
            checks.append(bool(answer))
            checks.append(bool(answer) and any(part.casefold() in source for part in answer.split(", ")))
    score = round(sum(checks) / len(checks) * 100) if checks else 0
    return {
        "score": score,
        "basis": "source grounding and answer consistency; not a guarantee of semantic correctness",
    }


def parse_quiz_types(raw: str | None) -> dict[str, int]:
    if not raw:
        return {"truefalse": 3, "identification": 3, "enumeration": 2, "multiplechoice": 3}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(value, dict):
        return {}
    parsed: dict[str, int] = {}
    for key, count in value.items():
        try:
            parsed[str(key).lower()] = max(0, min(int(count), 50))
        except (TypeError, ValueError):
            continue
    return parsed


def build_materials(text: str, quiz_types: dict[str, int], flashcard_count: int) -> dict[str, Any]:
    """Local NLP generator — used only by test/flashcards/quiz/enrich endpoints."""
    text = clean_text(text)
    sentences = split_sentences(text)
    terms = keywords(text, max(flashcard_count * 3, 30))
    summary = sentences[: min(8, len(sentences))]
    if not summary:
        summary = ["Add more complete sentences to generate a useful summary."]

    flashcards: list[dict[str, str]] = []
    used_sentences: set[str] = set()

    for term in terms:
        if len(flashcards) >= flashcard_count:
            break
        source = next(
            (s for s in sentences if term in s.lower() and s not in used_sentences),
            "",
        )
        if source:
            used_sentences.add(source)
        definition = source or f"A key concept found in the study material: {term}."
        flashcards.append({"term": term.title(), "definition": definition})

    if len(flashcards) < flashcard_count:
        for sentence in sentences:
            if len(flashcards) >= flashcard_count:
                break
            if sentence in used_sentences:
                continue
            words = re.findall(r"[A-Za-z][A-Za-z'-]{4,}", sentence)
            meaningful = [w for w in words if w.lower() not in STOP_WORDS]
            if not meaningful:
                continue
            term = meaningful[0].title()
            used_sentences.add(sentence)
            flashcards.append({"term": term, "definition": sentence})

    quiz: list[dict[str, Any]] = []

    for index in range(quiz_types.get("truefalse", 0)):
        if not sentences:
            quiz.append({
                "type": "truefalse",
                "question": "True or False: The notes contain study material.",
                "answer": "True",
            })
            continue
        sentence = sentences[index % len(sentences)]
        is_true = index % 2 == 0
        if is_true:
            question = f"True or False: {sentence}"
            answer = "True"
        else:
            words = sentence.split()
            flipped = list(words)
            for i, w in enumerate(words):
                if w.lower() in STOP_WORDS or len(w) < 4:
                    continue
                flipped[i] = "NOT_" + w
                break
            if "NOT_" not in " ".join(flipped):
                question = f"True or False: {sentence}"
                answer = "True"
            else:
                flipped_text = " ".join(flipped).replace("NOT_", "")
                question = f"True or False: {sentence.replace(words[i], 'NOT ' + words[i])}"
                answer = "False"
        quiz.append({"type": "truefalse", "question": question, "answer": answer})

    ident_stems = [
        "Identify the key term: {term}.",
        "What term matches this description: {term}?",
        "Fill in the blank: ____________ refers to {term}.",
        "Name the concept: {term}.",
    ]
    for index in range(quiz_types.get("identification", 0)):
        term = terms[index % len(terms)] if terms else "concept"
        stem = ident_stems[index % len(ident_stems)].format(term=term.title())
        quiz.append({
            "type": "identification",
            "question": stem,
            "answer": term.title(),
        })

    enum_stems = [
        ("List three important concepts from the notes.", 3),
        ("Enumerate two key terms discussed in the material.", 2),
        ("Give four concepts covered in the notes.", 4),
    ]
    for index in range(quiz_types.get("enumeration", 0)):
        stem, n = enum_stems[index % len(enum_stems)]
        if terms:
            items = ", ".join(
                terms[(index + offset) % len(terms)] for offset in range(n)
            )
        else:
            items = "the main ideas"
        quiz.append({
            "type": "enumeration",
            "question": stem,
            "answer": items,
        })

    distractor_pool = [t.title() for t in terms if len(t) >= 4]
    fallback_distractors = [
        "An unrelated concept",
        "A secondary detail",
        "None of these",
    ]

    def make_mcq(qtype: str, position: int) -> dict[str, Any]:
        if sentences:
            source_sentence = sentences[position % len(sentences)]
        else:
            source_sentence = "the study material"

        sentence_words = re.findall(r"[A-Za-z][A-Za-z'-]{4,}", source_sentence)
        sentence_keywords = [w for w in sentence_words if w.lower() not in STOP_WORDS]

        if sentence_keywords:
            correct = sentence_keywords[position % len(sentence_keywords)].title()
        elif distractor_pool:
            correct = distractor_pool[position % len(distractor_pool)]
        else:
            correct = "the study material"

        candidates = [t for t in distractor_pool if t.lower() != correct.lower()]
        if len(candidates) < 3:
            for f in fallback_distractors:
                if f.lower() != correct.lower() and f not in candidates:
                    candidates.append(f)

        wrong: list[str] = []
        i = position
        safety = 0
        while len(wrong) < 3 and safety < len(candidates) * 3:
            cand = candidates[i % len(candidates)]
            if cand.lower() != correct.lower() and cand not in wrong:
                wrong.append(cand)
            i += 1
            safety += 1

        options = [correct] + wrong[:3]
        rotate = position % max(1, len(options))
        options = options[rotate:] + options[:rotate]

        excerpt = source_sentence if len(source_sentence) <= 90 else source_sentence[:87].rstrip() + "..."

        stem_templates = {
            "what": f"Which term best completes this idea: \"{excerpt}\"?",
            "who": f"Which term is most associated with: \"{excerpt}\"?",
            "where": f"Which concept is referenced here: \"{excerpt}\"?",
            "when": f"Which term relates to this statement: \"{excerpt}\"?",
            "multiplechoice": f"Based on the notes, which of these is a key concept related to: \"{excerpt}\"?",
        }
        question = stem_templates.get(qtype, stem_templates["multiplechoice"])

        return {
            "type": qtype,
            "question": question,
            "options": options,
            "answer": correct,
        }

    mcq_position = 0
    for quiz_type in ("multiplechoice", "what", "who", "where", "when"):
        count = quiz_types.get(quiz_type, 0)
        for _ in range(count):
            quiz.append(make_mcq(quiz_type, mcq_position))
            mcq_position += 1

    materials = {"summary": summary, "flashcards": flashcards, "quiz": quiz}
    materials["quality"] = assess_quality(materials, text)
    return materials


async def read_notes(notes: str | None, files: list[UploadFile] | None) -> str:
    chunks = [clean_text(notes or "")]
    for file in (files or []):
        if not file or not file.filename:
            continue
        raw = await file.read()
        filename = (file.filename or "").lower()

        if filename.endswith((".txt", ".md", ".rtf", ".html", ".htm")):
            decoded = raw.decode("utf-8", errors="ignore")
            chunks.append(re.sub(r"<[^>]+>", " ", decoded))

        elif filename.endswith(".pdf"):
            try:
                from pypdf import PdfReader
                reader = PdfReader(io.BytesIO(raw))
                chunks.append("\n".join(page.extract_text() or "" for page in reader.pages))
            except Exception as exc:
                raise HTTPException(400, f"Could not read PDF file: {file.filename}") from exc

        elif filename.endswith(".docx"):
            try:
                from docx import Document
                document = Document(io.BytesIO(raw))
                chunks.append("\n".join(p.text for p in document.paragraphs))
            except Exception as exc:
                raise HTTPException(400, f"Could not read DOCX file: {file.filename}") from exc

    text = clean_text(" ".join(chunks))
    if not text:
        raise HTTPException(400, "Please provide notes or a readable document.")
    return text


def parse_json_response(value: str) -> dict[str, Any]:
    cleaned = value.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="AI returned invalid JSON.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="AI returned an invalid response shape.")
    return parsed


def build_ai_prompt(text: str, quiz_types: dict[str, int], flashcard_count: int) -> str:
    return f"""Create study materials from the notes below.
Return JSON only, with exactly these keys:
summary: an array of concise strings
flashcards: an array of objects with term and definition strings
quiz: an array of objects with type, question, answer, and optional options array

Create up to {flashcard_count} flashcards. Quiz counts by type: {json.dumps(quiz_types)}.
Allowed quiz types: truefalse, identification, enumeration, multiplechoice, what, who, where, when.
For multiple choice questions, options must be an array and answer must exactly match one option.
For truefalse questions, answer must be exactly True or False.

NOTES:
{text}
"""


def build_summary_prompt(text: str) -> str:
    return f"""Summarize the notes below into a JSON object with exactly one key:
summary: an array of concise, standalone bullet-point strings (max 8 items)

Each bullet should capture one key idea from the notes, written clearly and briefly.

NOTES:
{text}
"""


# ============================================================
# GEMINI
# ============================================================
async def generate_with_gemini(
    text: str,
    quiz_types: dict[str, int],
    flashcard_count: int,
) -> dict[str, Any]:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY is not configured on the server.")

    prompt = build_ai_prompt(text, quiz_types, flashcard_count)
    request_body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{GEMINI_URL}?key={urllib.parse.quote(GEMINI_API_KEY)}",
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def call() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Gemini request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Gemini could not be reached.") from exc

    response = await asyncio.to_thread(call)
    try:
        generated_text = response["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Gemini returned no generated content.") from exc

    result = parse_json_response(generated_text)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    result["_provider"] = "gemini"
    return result


async def generate_summary_with_gemini(text: str) -> list[str]:
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY is not configured on the server.")

    prompt = build_summary_prompt(text)
    request_body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{GEMINI_URL}?key={urllib.parse.quote(GEMINI_API_KEY)}",
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def call() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Gemini request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Gemini could not be reached.") from exc

    response = await asyncio.to_thread(call)
    try:
        generated_text = response["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Gemini returned no generated content.") from exc

    parsed = parse_json_response(generated_text)
    summary = parsed.get("summary", [])
    if not isinstance(summary, list):
        return []
    return [str(item) for item in summary][:8]


# ============================================================
# GROK (xAI — OpenAI-compatible API)
# ============================================================
async def generate_with_grok(
    text: str,
    quiz_types: dict[str, int],
    flashcard_count: int,
) -> dict[str, Any]:
    if not GROK_API_KEY:
        raise HTTPException(500, "GROK_API_KEY is not configured on the server.")

    request_body = json.dumps({
        "model": GROK_MODEL,
        "messages": [
            {"role": "system", "content": "You return valid JSON only, no prose."},
            {"role": "user", "content": build_ai_prompt(text, quiz_types, flashcard_count)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(
        GROK_URL,
        data=request_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROK_API_KEY}",
        },
        method="POST",
    )

    def call() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Grok request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Grok could not be reached.") from exc

    response = await asyncio.to_thread(call)
    try:
        generated_text = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Grok returned no generated content.") from exc

    result = parse_json_response(generated_text)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    result["_provider"] = "grok"
    return result


async def generate_summary_with_grok(text: str) -> list[str]:
    if not GROK_API_KEY:
        raise HTTPException(500, "GROK_API_KEY is not configured on the server.")

    request_body = json.dumps({
        "model": GROK_MODEL,
        "messages": [
            {"role": "system", "content": "You return valid JSON only, no prose."},
            {"role": "user", "content": build_summary_prompt(text)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(
        GROK_URL,
        data=request_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROK_API_KEY}",
        },
        method="POST",
    )

    def call() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(502, f"Grok request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(502, "Grok could not be reached.") from exc

    response = await asyncio.to_thread(call)
    try:
        generated_text = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(502, "Grok returned no generated content.") from exc

    parsed = parse_json_response(generated_text)
    summary = parsed.get("summary", [])
    if not isinstance(summary, list):
        return []
    return [str(item) for item in summary][:8]


# ============================================================
# AUTO-FALLBACK WRAPPERS — try Gemini → Grok
# ============================================================
async def generate_with_ai(
    text: str,
    quiz_types: dict[str, int],
    flashcard_count: int,
) -> dict[str, Any]:
    errors: list[str] = []

    if GEMINI_API_KEY:
        try:
            return await generate_with_gemini(text, quiz_types, flashcard_count)
        except HTTPException as exc:
            errors.append(f"Gemini: {exc.detail}")
            print(f"⚠️ Gemini failed, falling back to Grok → {exc.detail}")

    if GROK_API_KEY:
        try:
            return await generate_with_grok(text, quiz_types, flashcard_count)
        except HTTPException as exc:
            errors.append(f"Grok: {exc.detail}")

    raise HTTPException(
        status_code=502,
        detail="All AI providers failed. " + " | ".join(errors) if errors
        else "No AI provider is configured on the server.",
    )


async def generate_summary_ai(text: str) -> list[str]:
    errors: list[str] = []

    if GEMINI_API_KEY:
        try:
            return await generate_summary_with_gemini(text)
        except HTTPException as exc:
            errors.append(f"Gemini: {exc.detail}")
            print(f"⚠️ Gemini summary failed, falling back to Grok → {exc.detail}")

    if GROK_API_KEY:
        try:
            return await generate_summary_with_grok(text)
        except HTTPException as exc:
            errors.append(f"Grok: {exc.detail}")

    # Final fallback: local sentence extraction (no AI)
    return split_sentences(text)[:8]


# ============================================================
# ROUTES
# ============================================================
@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "acadhub-api",
        "providers": {
            "gemini": bool(GEMINI_API_KEY),
            "grok": bool(GROK_API_KEY),
        },
    }


@app.post("/api/generate-reviewer")
async def generate_reviewer(
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
    use_internet: bool = Form(False),
    enrich_count: int = Form(5),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    return await generate_with_ai(
        text,
        parse_quiz_types(quiz_types),
        max(1, min(num_flashcards, 50)),
    )


@app.post("/api/summary")
async def summary(
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    return {"summary": await generate_summary_ai(text)}


@app.post("/api/generate-test")
async def generate_test(
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    difficulty: str = Form("easy"),
    use_internet: bool = Form(False),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    count = {"easy": 8, "medium": 15, "hard": 26}.get(difficulty, 8)
    materials = build_materials(text, {"multiplechoice": count}, 1)
    return {"questions": materials["quiz"]}


@app.post("/api/flashcards")
async def flashcards(notes: str = Form(""), num_flashcards: int = Form(10)) -> dict[str, Any]:
    text = await read_notes(notes, None)
    return {"flashcards": build_materials(text, {}, num_flashcards)["flashcards"]}


@app.post("/api/quiz")
async def quiz(notes: str = Form(""), quiz_types: str | None = Form(None)) -> dict[str, Any]:
    text = await read_notes(notes, None)
    return {"quiz": build_materials(text, parse_quiz_types(quiz_types), 1)["quiz"]}


@app.post("/api/enrich")
async def enrich(notes: str = Form(""), enrich_count: int = Form(5)) -> dict[str, Any]:
    text = await read_notes(notes, None)
    return {"results": keywords(text, max(1, min(enrich_count, 20)))}