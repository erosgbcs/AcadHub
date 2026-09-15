"""AcadHub local backend.

Provides the API consumed by the static frontend. The generator is intentionally
local and deterministic so the app remains useful without an AI provider key.
"""

from __future__ import annotations

import asyncio
import io
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AcadHub API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

STOP_WORDS = {
    "about", "after", "again", "against", "also", "because", "before", "being",
    "between", "could", "first", "from", "have", "into", "more", "other", "over",
    "same", "should", "their", "there", "these", "they", "this", "through", "using",
    "were", "which", "with", "would", "your", "that", "then", "than", "where",
}


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
            parsed[str(key).lower()] = max(0, min(int(count), 20))
        except (TypeError, ValueError):
            continue
    return parsed


def build_materials(text: str, quiz_types: dict[str, int], flashcard_count: int) -> dict[str, Any]:
    text = clean_text(text)
    sentences = split_sentences(text)
    terms = keywords(text, max(flashcard_count * 2, 12))
    summary = sentences[: min(8, len(sentences))]
    if not summary:
        summary = ["Add more complete sentences to generate a useful summary."]

    flashcards = []
    for index, term in enumerate(terms[:flashcard_count]):
        source = next((sentence for sentence in sentences if term in sentence.lower()), "")
        definition = source or f"A key concept found in the study material: {term}."
        flashcards.append({"term": term.title(), "definition": definition})

    quiz: list[dict[str, Any]] = []
    for index in range(quiz_types.get("truefalse", 0)):
        sentence = sentences[index % len(sentences)] if sentences else "The notes contain study material."
        quiz.append({"type": "truefalse", "question": f"True or False: {sentence}", "answer": "True"})
    for index in range(quiz_types.get("identification", 0)):
        term = terms[index % len(terms)] if terms else "concept"
        quiz.append({"type": "identification", "question": f"Identify the key term: {term.title()}.", "answer": term.title()})
    for index in range(quiz_types.get("enumeration", 0)):
        items = ", ".join(terms[(index + offset) % len(terms)] for offset in range(3)) if terms else "the main ideas"
        quiz.append({"type": "enumeration", "question": "List three important concepts from the notes.", "answer": items})
    for quiz_type in ("multiplechoice", "what", "who", "where", "when"):
        for index in range(quiz_types.get(quiz_type, 0)):
            answer = terms[index % len(terms)].title() if terms else "the study material"
            options = [answer, "An unrelated idea", "A secondary detail", "None of these"]
            quiz.append({
                "type": quiz_type if quiz_type != "multiplechoice" else "multiplechoice",
                "question": f"Which option is supported by the notes?",
                "options": options,
                "answer": answer,
            })
    materials = {"summary": summary, "flashcards": flashcards, "quiz": quiz}
    materials["quality"] = assess_quality(materials, text)
    return materials


async def read_notes(notes: str | None, file: UploadFile | None) -> str:
    chunks = [clean_text(notes or "")]
    if file:
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
                raise HTTPException(status_code=400, detail="Could not read this PDF file.") from exc
        elif filename.endswith(".docx"):
            try:
                from docx import Document

                document = Document(io.BytesIO(raw))
                chunks.append("\n".join(paragraph.text for paragraph in document.paragraphs))
            except Exception as exc:
                raise HTTPException(status_code=400, detail="Could not read this DOCX file.") from exc
    text = clean_text(" ".join(chunks))
    if not text:
        raise HTTPException(status_code=400, detail="Please provide notes or a readable document.")
    return text


async def generate_response(
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    return build_materials(text, parse_quiz_types(quiz_types), max(1, min(num_flashcards, 50)))


def parse_json_response(value: str) -> dict[str, Any]:
    cleaned = value.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Gemini returned invalid JSON.") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=502, detail="Gemini returned an invalid response shape.")
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


async def generate_with_gemini(
    text: str,
    api_key: str,
    quiz_types: dict[str, int],
    flashcard_count: int,
) -> dict[str, Any]:
    prompt = build_ai_prompt(text, quiz_types, flashcard_count)
    request_body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
        f"?key={urllib.parse.quote(api_key)}",
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def call_gemini() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(status_code=502, detail="Gemini could not be reached.") from exc

    response = await asyncio.to_thread(call_gemini)
    try:
        generated_text = response["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Gemini returned no generated content.") from exc
    result = parse_json_response(generated_text)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    return result

def build_summary_prompt(text: str) -> str:
    return f"""Summarize the notes below into a JSON object with exactly one key:
summary: an array of concise, standalone bullet-point strings (max 8 items)

Each bullet should capture one key idea from the notes, written clearly and briefly.

NOTES:
{text}
"""


async def generate_summary_with_gemini(text: str, api_key: str) -> list[str]:
    prompt = build_summary_prompt(text)
    request_body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
        f"?key={urllib.parse.quote(api_key)}",
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    def call_gemini() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(status_code=502, detail="Gemini could not be reached.") from exc

    response = await asyncio.to_thread(call_gemini)
    try:
        generated_text = response["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Gemini returned no generated content.") from exc

    parsed = parse_json_response(generated_text)
    summary = parsed.get("summary", [])
    if not isinstance(summary, list):
        return []
    return [str(item) for item in summary][:8]
async def generate_with_deepseek(
    text: str,
    api_key: str,
    quiz_types: dict[str, int],
    flashcard_count: int,
) -> dict[str, Any]:
    request_body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "Return valid JSON only."},
            {"role": "user", "content": build_ai_prompt(text, quiz_types, flashcard_count)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }).encode("utf-8")
    request = urllib.request.Request(
        "https://api.deepseek.com/chat/completions",
        data=request_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    def call_deepseek() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            raise HTTPException(status_code=502, detail=f"DeepSeek request failed: {detail[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(status_code=502, detail="DeepSeek could not be reached.") from exc

    response = await asyncio.to_thread(call_deepseek)
    try:
        generated_text = response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="DeepSeek returned no generated content.") from exc
    result = parse_json_response(generated_text)
    result.setdefault("summary", [])
    result.setdefault("flashcards", [])
    result.setdefault("quiz", [])
    result["quality"] = assess_quality(result, text)
    return result


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "acadhub-api"}


@app.post("/api/generate-reviewer-local")
async def generate_reviewer_local(
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
    use_internet: bool = Form(False),
    enrich_count: int = Form(5),
) -> dict[str, Any]:
    return await generate_response(notes, file, quiz_types, num_flashcards)


@app.post("/api/generate-reviewer")
async def generate_reviewer(
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
    provider: str = Form("local"),
    api_key: str | None = Form(None),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    parsed_quiz_types = parse_quiz_types(quiz_types)
    flashcard_count = max(1, min(num_flashcards, 50))
    if provider.lower() == "gemini":
        if not api_key:
            raise HTTPException(status_code=400, detail="A Gemini API key is required.")
        return await generate_with_gemini(text, api_key, parsed_quiz_types, flashcard_count)
    if provider.lower() == "deepseek":
        if not api_key:
            raise HTTPException(status_code=400, detail="A DeepSeek API key is required.")
        return await generate_with_deepseek(text, api_key, parsed_quiz_types, flashcard_count)
    return build_materials(text, parsed_quiz_types, flashcard_count)


@app.post("/api/generate-test")
async def generate_test(
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    difficulty: str = Form("easy"),
    use_internet: bool = Form(False),
) -> dict[str, Any]:
    text = await read_notes(notes, file)
    count = {"easy": 8, "medium": 15, "hard": 26}.get(difficulty, 8)
    materials = build_materials(text, {"multiplechoice": count}, 1)
    return {"questions": materials["quiz"]}


@app.post("/api/reviewer")
async def reviewer(payload: dict[str, Any]) -> dict[str, Any]:
    text = clean_text(str(payload.get("notes", "")))
    return build_materials(text, payload.get("quiz_types", {}), int(payload.get("num_flashcards", 10)))


@app.post("/api/summary")
async def summary(
    notes: str | None = Form(None),
    file: UploadFile | None = File(None),
    api_key: str | None = Form(None),
    provider: str = Form("local"),
) -> dict[str, Any]:
    text = await read_notes(notes, file)

    if provider.lower() == "gemini":
        if not api_key:
            raise HTTPException(status_code=400, detail="A Gemini API key is required.")
        return {"summary": await generate_summary_with_gemini(text, api_key)}

    return {"summary": split_sentences(text)[:8]}

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
