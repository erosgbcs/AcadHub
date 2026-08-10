"use client";
import React, { useState, useEffect } from "react";

interface Flashcard {
  id: number;
  term: string;
  definition: string;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface ReviewerData {
  summary: string[];
  flashcards: Flashcard[];
  quiz: Question[];
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"converter" | "scheduler" | "reviewer">("reviewer");
  const [reviewerMode, setReviewerMode] = useState<"summary" | "flashcards" | "quiz">("summary");
  const [apiStatus, setApiStatus] = useState<string>("Checking backend...");
  
  const [apiKey, setApiKey] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ReviewerData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    fetch("http://127.0.0.1:8000/api/health", { signal: controller.signal })
      .then((res) => res.json())
      .then((resData) => setApiStatus(resData.status))
      .catch(() => setApiStatus("Backend Offline"))
      .finally(() => clearTimeout(timeoutId));
  }, []);

  const handleGenerate = async () => {
    if (!notes && !file) {
      alert("Please paste study notes or select a PDF / DOCX file.");
      return;
    }
    if (!apiKey) {
      alert("Please provide your Gemini API Key.");
      return;
    }

    setLoading(true);
    setData(null);
    setFlippedCards({});
    setSelectedAnswers({});

    const formData = new FormData();
    formData.append("api_key", apiKey);
    formData.append("notes", notes);
    if (file) {
      formData.append("file", file);
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/api/generate-reviewer", {
        method: "POST",
        body: formData,
      });
      const resData = await res.json();
      if (res.ok) {
        setData(resData);
      } else {
        alert("Error: " + (resData.detail || "Failed to generate reviewer."));
      }
    } catch (err) {
      alert("Failed to connect to backend server. Make sure FastAPI is running on port 8000.");
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id: number) => {
    setFlippedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAnswer = (qId: number, option: string) => {
    setSelectedAnswers((prev) => ({ ...prev, [qId]: option }));
  };

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 font-sans max-w-2xl mx-auto">
      <header className="border-b border-slate-700 pb-4 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-indigo-400">AcadHub Suite</h1>
          <p className="text-xs text-slate-400">Smart Academic Workspace</p>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase text-slate-400 block">FastAPI</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
            apiStatus === "healthy" ? "bg-emerald-900/80 text-emerald-400 border border-emerald-700" : "bg-rose-900/80 text-rose-400 border border-rose-700"
          }`}>
            {apiStatus}
          </span>
        </div>
      </header>

      <div className="flex space-x-2 border-b border-slate-700 mb-6">
        <button
          onClick={() => setActiveTab("reviewer")}
          className={`py-2 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "reviewer" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400"
          }`}
        >
          AI Reviewer Suite
        </button>
        <button
          onClick={() => setActiveTab("scheduler")}
          className={`py-2 px-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "scheduler" ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400"
          }`}
        >
          Dev Scheduler
        </button>
      </div>

      {activeTab === "reviewer" && (
        <section className="space-y-6">
          <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-3">
            <h2 className="text-base font-semibold text-indigo-300">Generate Review Material</h2>
            
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Gemini API Key</label>
              <input
                type="password"
                placeholder="Paste API Key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Upload Document (.pdf, .docx, .txt)</label>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Or Paste Additional Study Notes / Code</label>
              <textarea
                rows={3}
                placeholder="Paste lecture notes, definitions, or code documentation..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 rounded font-medium text-xs transition-colors"
            >
              {loading ? "Processing Document & Notes..." : "Build Complete Reviewer"}
            </button>
          </div>

          {data && (
            <div className="space-y-4">
              <div className="flex bg-slate-800 rounded p-1 border border-slate-700 text-xs font-medium">
                <button
                  onClick={() => setReviewerMode("summary")}
                  className={`flex-1 py-1.5 rounded transition-colors ${reviewerMode === "summary" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setReviewerMode("flashcards")}
                  className={`flex-1 py-1.5 rounded transition-colors ${reviewerMode === "flashcards" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
                >
                  Flashcards
                </button>
                <button
                  onClick={() => setReviewerMode("quiz")}
                  className={`flex-1 py-1.5 rounded transition-colors ${reviewerMode === "quiz" ? "bg-indigo-600 text-white" : "text-slate-400"}`}
                >
                  Quiz Mode
                </button>
              </div>

              {reviewerMode === "summary" && (
                <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-2">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wide mb-2">Key Concepts Summary</h3>
                  <ul className="space-y-2">
                    {data.summary.map((item, index) => (
                      <li key={index} className="text-xs text-slate-200 flex items-start space-x-2">
                        <span className="text-indigo-400 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {reviewerMode === "flashcards" && (
                <div className="grid grid-cols-1 gap-3">
                  {data.flashcards.map((card) => {
                    const isFlipped = flippedCards[card.id];
                    return (
                      <div
                        key={card.id}
                        onClick={() => toggleCard(card.id)}
                        className="p-5 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-lg cursor-pointer transition-all min-h-[100px] flex flex-col justify-center items-center text-center"
                      >
                        <span className="text-[10px] text-indigo-400 uppercase font-semibold mb-1">
                          {isFlipped ? "Definition (Tap to Flip)" : "Term (Tap to Flip)"}
                        </span>
                        <p className={`text-xs ${isFlipped ? "text-emerald-300 font-normal" : "text-white font-bold"}`}>
                          {isFlipped ? card.definition : card.term}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}

              {reviewerMode === "quiz" && (
                <div className="space-y-4">
                  {data.quiz.map((q) => {
                    const selected = selectedAnswers[q.id];
                    return (
                      <div key={q.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700 space-y-3">
                        <p className="text-xs font-semibold text-white">{q.id}. {q.question}</p>
                        <div className="space-y-1.5">
                          {q.options.map((opt, i) => {
                            let style = "bg-slate-700 hover:bg-slate-650 border-slate-600";
                            if (selected) {
                              if (opt === q.answer) style = "bg-emerald-900/80 border-emerald-500 text-emerald-200";
                              else if (opt === selected) style = "bg-rose-900/80 border-rose-500 text-rose-200";
                            }
                            return (
                              <button
                                key={i}
                                onClick={() => selectAnswer(q.id, opt)}
                                className={`w-full text-left p-2 rounded text-xs border transition-colors ${style}`}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {selected && (
                          <div className="p-2 bg-slate-900/60 rounded text-[11px] border border-slate-700 text-slate-300">
                            <strong className="text-indigo-400">Explanation: </strong>{q.explanation}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
