import json
import io
import zipfile
import xml.etree.ElementTree as ET
import re
import random
from collections import Counter
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

# ============================================================
# HEALTH ENDPOINTS
# ============================================================

@app.get("/")
def read_root():
    return {"status": "online", "system": "AcademicHub Core API"}

@app.get("/api/health")
def health_check():
    return {"service": "AcademicHub Engine", "status": "healthy"}


# ============================================================
# FILE EXTRACTION
# ============================================================

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

    return text.strip()


# ============================================================
# LOCAL NLP PROCESSING ENGINE
# ============================================================

class LocalReviewerEngine:
    """Professional-grade local text processor for academic content."""
    
    STOP_WORDS = {
        'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but',
        'in', 'with', 'to', 'for', 'of', 'from', 'by', 'as', 'be', 'was',
        'are', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them',
        'we', 'you', 'he', 'she', 'his', 'her', 'their', 'our', 'my', 'your'
    }
    
    ACADEMIC_TERMS = {
        'define', 'explain', 'analyze', 'compare', 'contrast', 'evaluate',
        'describe', 'discuss', 'identify', 'illustrate', 'summarize',
        'concept', 'theory', 'principle', 'method', 'process', 'function',
        'structure', 'system', 'model', 'framework', 'hypothesis',
        'therefore', 'however', 'furthermore', 'consequently', 'moreover'
    }
    
    @staticmethod
    def split_sentences(text: str) -> list:
        """Split text into clean sentences."""
        # Handle common abbreviations
        text = re.sub(r'(Dr|Mr|Mrs|Ms|Prof|etc|vs|i\.e|e\.g)\.', r'\1<DOT>', text)
        sentences = re.split(r'[.!?]+', text)
        return [
            s.strip().replace('<DOT>', '.') 
            for s in sentences 
            if len(s.strip().split()) > 3
        ]
    
    @staticmethod
    def extract_keywords(text: str, top_n: int = 10) -> list:
        """Extract meaningful keywords using frequency analysis."""
        words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
        filtered = [w for w in words if w not in LocalReviewerEngine.STOP_WORDS]
        word_counts = Counter(filtered)
        
        # Boost academic terms
        for word in word_counts:
            if word in LocalReviewerEngine.ACADEMIC_TERMS:
                word_counts[word] *= 1.5
        
        return word_counts.most_common(top_n)
    
    @staticmethod
    def score_sentence(sentence: str, keywords: list, position: int, total: int) -> float:
        """Score sentence importance based on multiple factors."""
        words = sentence.lower().split()
        word_count = len(words)
        
        # Factor 1: Keyword density
        keyword_hits = sum(1 for w in words if w in [k[0] for k in keywords])
        keyword_score = (keyword_hits / max(word_count, 1)) * 10
        
        # Factor 2: Position bonus (first/last sentences matter more)
        position_score = 0
        if position == 0:
            position_score = 3  # First sentence often intro
        elif position == total - 1:
            position_score = 2  # Last sentence often conclusion
        
        # Factor 3: Length penalty (too short = likely not important)
        length_score = min(word_count / 15, 3) if word_count < 15 else 3
        
        # Factor 4: Academic cue words
        academic_score = sum(2 for w in words if w in LocalReviewerEngine.ACADEMIC_TERMS)
        
        return keyword_score + position_score + length_score + academic_score
    
    @staticmethod
    def generate_summary(text: str, num_points: int = 5) -> list:
        """Generate extractive summary - pick most important sentences."""
        sentences = LocalReviewerEngine.split_sentences(text)
        if not sentences:
            return ["No content could be extracted. Please provide more text."]
        
        keywords = LocalReviewerEngine.extract_keywords(text)
        total = len(sentences)
        
        scored_sentences = []
        for i, sentence in enumerate(sentences):
            score = LocalReviewerEngine.score_sentence(sentence, keywords, i, total)
            scored_sentences.append((sentence, score))
        
        # Sort by score and pick top unique sentences
        scored_sentences.sort(key=lambda x: x[1], reverse=True)
        seen = set()
        summary = []
        
        for sentence, _ in scored_sentences:
            normalized = sentence.lower()[:50]
            if normalized not in seen and len(summary) < num_points:
                summary.append(sentence[:300])
                seen.add(normalized)
        
        return summary
    
    @staticmethod
    def generate_flashcards(text: str, num_cards: int = 5) -> list:
        """Generate flashcards from key concepts and their context."""
        keywords = LocalReviewerEngine.extract_keywords(text, top_n=num_cards * 2)
        sentences = LocalReviewerEngine.split_sentences(text)
        
        flashcards = []
        used_terms = set()
        
        for term, freq in keywords:
            if len(flashcards) >= num_cards:
                break
            
            clean_term = term.capitalize()
            if clean_term.lower() in used_terms:
                continue
            
            # Find best context sentence
            context_sentences = [s for s in sentences if term in s.lower()]
            if context_sentences:
                # Pick longest context sentence for richer definition
                context = max(context_sentences, key=len)[:200]
            else:
                context = f"Important concept appearing {freq} times in the material."
            
            flashcards.append({
                "id": len(flashcards) + 1,
                "term": clean_term,
                "definition": context
            })
            used_terms.add(clean_term.lower())
        
        return flashcards
    
    @staticmethod
    def generate_quiz(text: str, num_questions: int = 4) -> list:
        """Generate quiz questions with distractors."""
        sentences = LocalReviewerEngine.split_sentences(text)
        keywords = LocalReviewerEngine.extract_keywords(text, top_n=15)
        
        if len(sentences) < num_questions:
            num_questions = len(sentences)
        
        quiz = []
        used_sentences = set()
        
        # Pick diverse sentences for questions
        candidates = [s for s in sentences if 30 < len(s) < 200]
        random.shuffle(candidates)
        
        for i, sentence in enumerate(candidates):
            if len(quiz) >= num_questions:
                break
            if sentence[:50] in used_sentences:
                continue
            
            used_sentences.add(sentence[:50])
            
            # Generate question
            question_text = sentence[:150]
            if len(sentence) > 150:
                question_text += "..."
            
            question = f"According to the material: '{question_text}'"
            
            # Generate options
            correct_answer = "This statement is accurate based on the provided content."
            wrong_answers = [
                "This statement contradicts the material.",
                "This concept is not addressed in the provided text.",
                "This interpretation is partially correct but missing key details."
            ]
            
            options = [correct_answer] + wrong_answers[:3]
            random.shuffle(options)
            
            quiz.append({
                "id": len(quiz) + 1,
                "question": question,
                "options": options,
                "answer": correct_answer,
                "explanation": f"Key concept derived from the source material (sentence {i+1})."
            })
        
        return quiz


# ============================================================
# LOCAL PROCESSING ENDPOINT (No API Key Required)
# ============================================================

@app.post("/api/generate-reviewer-local")
async def generate_reviewer_local(
    notes: str = Form(""),
    file: UploadFile = File(None)
):
    """
    Generate reviewer materials using local NLP processing.
    No API key or internet connection required.
    """
    combined_notes = notes.strip() if notes else ""
    
    # Extract text from uploaded file
    if file:
        try:
            file_bytes = await file.read()
            extracted = extract_text_from_file(file_bytes, file.filename)
            if extracted:
                combined_notes += f"\n\n{extracted}"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    if not combined_notes.strip():
        raise HTTPException(status_code=400, detail="Please provide study notes or upload a document.")
    
    # Truncate for performance (local processing can handle more than AI)
    processed_text = combined_notes[:15000]
    
    try:
        engine = LocalReviewerEngine()
        
        summary = engine.generate_summary(processed_text, num_points=5)
        flashcards = engine.generate_flashcards(processed_text, num_cards=6)
        quiz = engine.generate_quiz(processed_text, num_questions=4)
        
        return {
            "summary": summary,
            "flashcards": flashcards,
            "quiz": quiz,
            "metadata": {
                "method": "local_nlp",
                "text_length": len(processed_text),
                "sentences_analyzed": len(engine.split_sentences(processed_text))
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


# ============================================================
# AI API ENDPOINTS (Keep your existing ones)
# ============================================================

def call_gemini_api(prompt: str, api_key: str) -> dict:
    import urllib.request
    import urllib.error
    
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
            raise HTTPException(status_code=429, detail="Rate limit reached. Wait 60 seconds.")
        raise HTTPException(status_code=e.code, detail=f"API Error: {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Request failed: {str(e)}")


def call_deepseek_api(prompt: str, api_key: str) -> dict:
    import urllib.request
    import urllib.error
    
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
            raise HTTPException(status_code=429, detail="Rate limit exceeded.")
        raise HTTPException(status_code=e.code, detail=f"API Error: {error_body}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Request failed: {str(e)}")


@app.post("/api/generate-reviewer")
def generate_reviewer(
    api_key: str = Form(...),
    provider: str = Form("gemini"),
    notes: str = Form(""),
    file: UploadFile = File(None)
):
    """Generate reviewer using AI APIs (requires API key)."""
    clean_key = api_key.strip()
    
    if not clean_key:
        raise HTTPException(status_code=400, detail="API Key is required for AI generation.")
    
    combined_notes = notes.strip()
    
    if file:
        file_bytes = file.file.read()
        extracted = extract_text_from_file(file_bytes, file.filename)
        combined_notes += f"\n\n--- Document Content ---\n{extracted}"
    
    if not combined_notes.strip():
        raise HTTPException(status_code=400, detail="Provide notes or upload a document.")
    
    truncated = combined_notes[:6000]
    
    prompt = f"""
    Analyze these study notes and generate a reviewer suite.
    Return ONLY valid JSON:
    
    {{
      "summary": ["Key point 1", "Key point 2", "Key point 3"],
      "flashcards": [
        {{"id": 1, "term": "Concept", "definition": "Explanation"}}
      ],
      "quiz": [
        {{
          "id": 1,
          "question": "Question?",
          "options": ["A", "B", "C", "D"],
          "answer": "A",
          "explanation": "Reason"
        }}
      ]
    }}
    
    Generate 3 summaries, 3 flashcards, 2 quizzes.
    
    Notes:
    {truncated}
    """
    
    if provider.lower() == "deepseek":
        return call_deepseek_api(prompt, clean_key)
    else:
        return call_gemini_api(prompt, clean_key)
