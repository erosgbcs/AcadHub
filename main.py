"""AcadHub backend — Gemini primary, Grok fallback. Keys from env vars.

Adds Firebase Admin usage tracking + per-user daily limits.
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ------------------------------------------------------------------
# Firebase Admin init (best-effort; endpoints fail closed if missing)
# ------------------------------------------------------------------
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    _FB_AVAILABLE = True
except Exception as _exc:  # pragma: no cover
    _FB_AVAILABLE = False
    print(f"[usage] firebase-admin not installed: {_exc}")

_DB = None
_FB_READY = False


def _init_firebase():
    global _DB, _FB_READY
    if _FB_READY:
        return
    if not _FB_AVAILABLE:
        print("[usage] firebase-admin missing — limits disabled")
        return
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT", "").strip()
    if not raw:
        print("[usage] FIREBASE_SERVICE_ACCOUNT not set — limits disabled")
        return
    try:
        # Accept raw JSON or base64-encoded JSON
        decoded = raw
        if not raw.startswith("{"):
            decoded = base64.b64decode(raw).decode("utf-8")
        cred_dict = json.loads(decoded)
        cred = credentials.Certificate(cred_dict)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _DB = firestore.client()
        _FB_READY = True
        print("[usage] firebase-admin initialized")
    except Exception as exc:  # pragma: no cover
        print(f"[usage] firebase-admin init failed: {exc}")


_init_firebase()

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "").strip()
GEMINI_MODEL   = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-exp").strip()
GROQ_MODEL     = os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b").strip()

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# ---- Limit config ----
DEFAULT_DAILY_LIMIT = int(os.environ.get("DEFAULT_DAILY_LIMIT", "20"))
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "gabrielagsamosam@gmail.com").strip().lower()

app = FastAPI(title="AcadHub API", version="2.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Usage-Remaining", "X-Usage-Limit"],
)

STOP_WORDS = {
    "about","after","again","against","also","because","before","being",
    "between","could","first","from","have","into","more","other","over",
    "same","should","their","there","these","they","this","through","using",
    "were","which","with","would","your","that","then","than","where",
}

# ------------------------------------------------------------------
# Usage tracking helpers
# ------------------------------------------------------------------
def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _usage_doc_ref(uid: str, day: str):
    # Using explicit path to prevent chaining errors
    return _DB.document(f"users/{uid}/usage_daily/{day}")


def _meta_doc_ref(uid: str):
    return _DB.document(f"users/{uid}/usage_meta/config")


def _events_col(uid: str):
    return _DB.collection(f"users/{uid}/usage_events")


def _resolve_identity(request: Request) -> tuple[str, str]:
    """Read Firebase ID token (Authorization: Bearer ...) and return (uid, email).
    Returns ("", "") when auth is unavailable."""
    if not _FB_READY:
        # Admin SDK not ready — endpoints will fail closed upstream.
        return "", ""
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization") or ""
    if not auth_header.startswith("Bearer "):
        return "", ""
    token = auth_header[7:].strip()
    if not token:
        return "", ""
    try:
        from firebase_admin import auth as fb_auth
        decoded = fb_auth.verify_id_token(token, check_revoked=False)
        return decoded.get("uid", ""), (decoded.get("email") or "").lower()
    except Exception as exc:
        print(f"[usage] token verify failed: {exc}")
        return "", ""


def _get_limit_for(uid: str, email: str = "") -> int:
    if not _FB_READY or not uid:
        return 0
    if email and email.lower() == ADMIN_EMAIL:
        return 10**9  # Admin has infinite credits
    try:
        # Read the "credits" field from the user's main document
        snap = _DB.document(f"users/{uid}").get()
        if snap.exists:
            data = snap.to_dict() or {}
            return int(data.get("credits", 0)) # Default to 0 if field is missing
    except Exception as exc:
        print(f"[credits] read failed: {exc}")
    return 0


def _get_used_today(uid: str) -> int:
    if not _FB_READY or not uid:
        return 0
    try:
        snap = _usage_doc_ref(uid, _today_utc()).get()
        if not snap.exists:
            return 0
        data = snap.to_dict() or {}
        return int(data.get("total", 0) or 0)
    except Exception as exc:
        print(f"[usage] read failed: {exc}")
        return 0


def check_usage(request: Request, kind: str) -> tuple[str, str, int]:
    """Raise 402 if out of credits. Return (uid, email, credits_remaining)."""
    if not _FB_READY:
        raise HTTPException(500, "Usage tracking is not configured on the server.")
    
    uid, email = _resolve_identity(request)
    if not uid:
        raise HTTPException(401, "Sign in required to use AI features.")

    credits = _get_limit_for(uid, email)
    if credits <= 0:
        raise HTTPException(
            402, # 402 Payment Required (standard for SaaS out-of-credits)
            "You are out of AI credits. Please contact the admin to top up.",
        )
    return uid, email, credits


def record_usage(uid: str, email: str, kind: str, provider: str | None, elapsed_ms: int) -> tuple[int, int]:
    """Deduct 1 credit + append event. Returns (credits_remaining, 0)."""
    if not _FB_READY or not uid:
        return 0, 0
    if email and email.lower() == ADMIN_EMAIL:
        return 999999, 999999 # Admin bypass
        
    day = _today_utc()
    try:
        from google.cloud.firestore_v1 import Increment
        # Deduct 1 credit from the user's document
        _DB.document(f"users/{uid}").set(
            {"credits": Increment(-1)},
            merge=True,
        )
        # Keep incrementing usage_daily so admin dashboard KPIs still work
        _usage_doc_ref(uid, day).set(
            {
                "date": day,
                "total": Increment(1),
                kind: Increment(1),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        # Log the event
        _events_col(uid).add({
            "kind": kind,
            "provider": provider,
            "elapsedMs": elapsed_ms,
            "at": firestore.SERVER_TIMESTAMP,
        })
    except Exception as exc:
        print(f"[credits] write failed: {exc}")
    
    new_credits = _get_limit_for(uid, email)
    return new_credits, new_credits


# ------------------------------------------------------------------
# Quality / text helpers (unchanged from prior version)
# ------------------------------------------------------------------
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

    for i in range(quiz_types.get("fillblank", 0)):
        term = terms[i % len(terms)] if terms else "concept"
        quiz.append({"type": "fillblank", "question": f"Fill in the blank: ________ refers to {term.title()}.", "answer": term.title()})

    enum_stems = [
        ("List three important concepts from the notes.", 3),
        ("Enumerate two key terms discussed in the material.", 2),
        ("Give four concepts covered in the notes.", 4),
    ]
    for i in range(quiz_types.get("enumeration", 0)):
        stem, n = enum_stems[i % len(enum_stems)]
        items = ", ".join(terms[(i + o) % len(terms)] for o in range(n)) if terms else "the main ideas"
        quiz.append({"type": "enumeration", "question": stem, "answer": items})

    for i in range(quiz_types.get("matching", 0)):
        match_terms = [terms[(i + offset) % len(terms)].title() for offset in range(min(4, len(terms)))] if terms else ["concept"]
        quiz.append({
            "type": "matching",
            "question": "Match each concept with its definition.",
            "pairs": [{"left": term, "right": f"Definition of {term}"} for term in match_terms],
            "answer": [f"Definition of {term}" for term in match_terms],
        })

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
            "User-Agent": "AcadHub/2.1 (python-urllib)",
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
    result["_provider"] = "groq"
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
            "User-Agent": "AcadHub/2.1 (python-urllib)",
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


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "acadhub-api",
        "providers": {"gemini": bool(GEMINI_API_KEY), "grok": bool(GROQ_API_KEY)},
        "usageTracking": _FB_READY,
        "defaultDailyLimit": DEFAULT_DAILY_LIMIT,
    }


@app.post("/api/generate-reviewer")
async def generate_reviewer(
    request: Request,
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    quiz_types: str | None = Form(None),
    num_flashcards: int = Form(10),
    use_internet: bool = Form(False),
    enrich_count: int = Form(5),
):
    text = await read_notes(notes, file)
    uid, email, credits_left = check_usage(request, "reviewer")
    started = time.time()
    result = await generate_with_ai(text, parse_quiz_types(quiz_types), max(1, min(num_flashcards, 50)))
    new_used, limit = record_usage(uid, email, "reviewer", result.get("_provider"), int((time.time() - started) * 1000))
    headers = {
        "X-Usage-Remaining": str(credits_left),
        "X-Usage-Limit": "0",
    }
    return JSONResponse(content=result, headers=headers)


@app.post("/api/summary")
async def summary(
    request: Request,
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
):
    text = await read_notes(notes, file)
    uid, email, credits_left = check_usage(request, "summary")
    started = time.time()
    summary_list = await generate_summary_ai(text)
    provider = "gemini" if GEMINI_API_KEY else ("groq" if GROQ_API_KEY else None)
    new_used, limit = record_usage(uid, email, "summary", provider, int((time.time() - started) * 1000))
    headers = {
        "X-Usage-Remaining": str(credits_left),
        "X-Usage-Limit": "0",
    }
    return JSONResponse(content={"summary": summary_list}, headers=headers)


@app.post("/api/generate-test")
async def generate_test(
    request: Request,
    notes: str | None = Form(None),
    file: list[UploadFile] = File(default=[]),
    difficulty: str = Form("easy"),
    use_internet: bool = Form(False),
    question_count: int | None = Form(None),
    question_types: str | None = Form(None),
    topic: str | None = Form(None),
):
    text = await read_notes(notes, file)
    uid, email, credits_left = check_usage(request, "test")
    default_count = {"easy": 8, "medium": 15, "hard": 26}.get(difficulty, 8)
    count = max(1, min(question_count or default_count, 30))
    requested_types = []
    if question_types:
        try:
            requested_types = [str(item).lower() for item in json.loads(question_types)]
        except (TypeError, json.JSONDecodeError):
            requested_types = []
    supported_types = [item for item in requested_types if item in {"multiplechoice", "truefalse", "identification", "fillblank", "enumeration", "matching"}]
    if not supported_types:
        supported_types = ["multiplechoice"]
    base, remainder = divmod(count, len(supported_types))
    quiz_types = {
        question_type: base + (1 if index < remainder else 0)
        for index, question_type in enumerate(supported_types)
    }
    if topic:
        text = f"Focus the questions on this topic: {topic}\n\n{text}"
    started = time.time()
    materials = build_materials(text, quiz_types, 1)
    new_used, limit = record_usage(uid, email, "test", None, int((time.time() - started) * 1000))
    headers = {
        "X-Usage-Remaining": str(credits_left),
        "X-Usage-Limit": "0",
    }
    return JSONResponse(content={"questions": materials["quiz"]}, headers=headers)


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