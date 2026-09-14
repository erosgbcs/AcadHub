# AcadHub backend

A local FastAPI backend for the static AcadHub frontend.

## Run locally

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is available at `http://localhost:8000`. Set `API_BASE_URL` in `script.js` to that URL when testing locally.

The generator uses deterministic local text processing and does not require an API key. Gemini and DeepSeek use the same frontend-compatible response contract.

Selecting `Google Gemini AI` in the frontend sends the entered key to `/api/generate-reviewer` for that request. The backend does not store the key. Gemini responses are requested as JSON and normalized into the same summary, flashcard, and quiz shape used by local mode.
