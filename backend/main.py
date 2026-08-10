import json
import io
import zipfile
import xml.etree.ElementTree as ET
import urllib.request
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
        max_pages = min(len(pdf_reader.pages), 15)
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

def find_working_model(api_key: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            models = data.get("models", [])
            
            preferred = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]
            available_dict = {}
            
            for m in models:
                name = m.get("name", "").replace("models/", "")
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    available_dict[name] = True

            for pref in preferred:
                if pref in available_dict:
                    return pref
            
            if available_dict:
                return list(available_dict.keys())[0]

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise HTTPException(status_code=e.code, detail=f"API Key Validation Error: {error_body}")
    except Exception as e:
        pass

    raise HTTPException(
        status_code=400, 
        detail="Could not retrieve available models for this API Key. Generate a fresh key at aistudio.google.com"
    )

@app.post("/api/generate-reviewer")
def generate_reviewer(
    api_key: str = Form(...),
    notes: str = Form(""),
    file: UploadFile = File(None)
):
    combined_notes = notes.strip()

    if file:
        file_bytes = file.file.read()
        extracted = extract_text_from_file(file_bytes, file.filename)
        combined_notes += f"\n\n--- Document Content ({file.filename}) ---\n" + extracted

    if not combined_notes.strip():
        raise HTTPException(status_code=400, detail="Provide study notes or upload a PDF/DOCX file.")
    if not api_key.strip():
        raise HTTPException(status_code=400, detail="Gemini API Key is required.")

    selected_model = find_working_model(api_key.strip())
    truncated_notes = combined_notes[:15000]

    prompt = f"""
Analyze the provided study notes and generate a complete reviewer suite.
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
      "definition": "Concise explanation or definition"
    }}
  ],
  "quiz": [
    {{
      "id": 1,
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Exact match to one of the options",
      "explanation": "Brief reasoning for the answer"
    }}
  ]
}}

Generate 3-5 summary bullets, 4 flashcards, and 3 quiz questions.

Study Notes:
{truncated_notes}
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{selected_model}:generateContent?key={api_key}"
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
        
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            text_response = result["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text_response)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        raise HTTPException(status_code=e.code, detail=f"Gemini API Error ({selected_model}): {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Request failed: {str(e)}")
