import json
import io
import zipfile
import xml.etree.ElementTree as ET
import urllib.request
import urllib.error
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import pypdf

app = FastAPI(title="AcademicHub API Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "online", "system": "AcademicHub Core API"}

@app.get("/api/health")
def health_check():
    return {"service": "AcademicHub Engine", "status": "healthy"}

def extract_docx_text(file_bytes: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
            xml_content = z.read("word/document.xml")
            tree = ET.fromstring(xml_content)
            paragraphs = []
            for p in tree.iter():
                if p.tag.endswith("}p"):
                    p_text = "".join(
                        node.text for node in p.iter() if node.tag.endswith("}t") and node.text
                    )
                    if p_text:
                        paragraphs.append(p_text)
            return "\n".join(paragraphs)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read DOCX file: {str(e)}")

def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    text = ""
    filename_lower = filename.lower()
    
    if filename_lower.endswith(".pdf"):
        pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        max_pages = min(len(pdf_reader.pages), 8)
        for i in range(max_pages):
            extracted = pdf_reader.pages[i].extract_text()
            if extracted:
                text += extracted + "\n"
    elif filename_lower.endswith(".docx"):
        text = extract_docx_text(file_bytes)
    elif filename_lower.endswith(".txt"):
        text = file_bytes.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload PDF, DOCX, or TXT.")
        
    return text

def call_deepseek_api(prompt: str, api_key: str) -> dict:
    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are an academic reviewer generator. Return strictly valid JSON."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=40) as response:
            result = json.loads(response.read().decode("utf-8"))
            content = result["choices"][0]["message"]["content"]
            return json.loads(content)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        if e.code == 429:
            raise HTTPException(status_code=429, detail="DeepSeek Rate limit exceeded. Wait a minute.")
        raise HTTPException(status_code=e.code, detail=f"DeepSeek API Error: {error_body}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DeepSeek Request Failed: {str(e)}")

def call_gemini_api(prompt: str, api_key: str) -> dict:
    model_name = "gemini-1.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }
    try:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=35) as response:
            result = json.loads(response.read().decode("utf-8"))
            text_response = result["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text_response)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        if e.code == 429:
            raise HTTPException(status_code=429, detail="Gemini Rate limit reached (429). Wait 60 seconds before retrying.")
        elif e.code == 404:
            raise HTTPException(status_code=404, detail=f"Gemini Model Endpoint Not Found ({model_name}).")
        else:
            raise HTTPException(status_code=e.code, detail=f"Gemini API Error ({e.code}): {error_body}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini Request Failed: {str(e)}")

@app.post("/api/generate-reviewer")
def generate_reviewer(
    api_key: str = Form(...),
    provider: str = Form("gemini"),
    notes: str = Form(""),
    file: UploadFile = File(None)
):
    clean_key = api_key.strip().replace("\n", "").replace("\r", "").replace(" ", "")
    
    if not clean_key:
        raise HTTPException(status_code=400, detail="Valid API Key is required.")

    combined_notes = notes.strip()

    if file:
        file_bytes = file.file.read()
        extracted = extract_text_from_file(file_bytes, file.filename)
        combined_notes += f"\n\n--- Document Content ({file.filename}) ---\n" + extracted

    if not combined_notes.strip():
        raise HTTPException(status_code=400, detail="Provide study notes or upload a PDF/DOCX file.")

    truncated_notes = combined_notes[:6000]

    prompt = f"""
    Analyze the provided study notes and generate a reviewer suite.
    Return ONLY a valid JSON object matching this exact structure:

    {{
      "summary": [
        "Key takeaway 1",
        "Key takeaway 2",
        "Key takeaway 3"
      ],
      "flashcards": [
        {{
          "id": 1,
          "term": "Term / Concept Name",
          "definition": "Concise explanation"
        }}
      ],
      "quiz": [
        {{
          "id": 1,
          "question": "Question text?",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "Exact match to one of the options",
          "explanation": "Brief reasoning"
        }}
      ]
    }}

    Generate 3 summary bullets, 3 flashcards, and 2 quiz questions.

    Study Notes:
    {truncated_notes}
    """

    if provider.lower() == "deepseek":
        return call_deepseek_api(prompt, clean_key)
    else:
        return call_gemini_api(prompt, clean_key)
