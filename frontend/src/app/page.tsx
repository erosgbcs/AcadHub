"use client";
import React, { useState } from "react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"converter" | "scheduler" | "quiz">("converter");

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 font-sans">
      {/* Header */}
      <header className="border-b border-slate-700 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-indigo-400">AcademicHub Suite</h1>
        <p className="text-xs text-slate-400">Computer Science & IT Workspace</p>
      </header>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-700 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab("converter")}
          className={`py-2 px-3 text-sm font-medium transition-colors ${
            activeTab === "converter"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Document Engine
        </button>
        <button
          onClick={() => setActiveTab("scheduler")}
          className={`py-2 px-3 text-sm font-medium transition-colors ${
            activeTab === "scheduler"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Dev & Thesis Scheduler
        </button>
        <button
          onClick={() => setActiveTab("quiz")}
          className={`py-2 px-3 text-sm font-medium transition-colors ${
            activeTab === "quiz"
              ? "border-b-2 border-indigo-500 text-indigo-400"
              : "text-slate-400 hover:text-white"
          }`}
        >
          AI Quiz Suite
        </button>
      </div>

      {/* Tab 1: Document Engine */}
      {activeTab === "converter" && (
        <section className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h2 className="text-lg font-semibold mb-2 text-indigo-300">Document & File Engine</h2>
          <p className="text-xs text-slate-400 mb-4">
            Convert PDF to Word, extract text layout, and process OCR.
          </p>
          <div className="border-2 border-dashed border-slate-600 rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".pdf,.docx"
              className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-indigo-600 file:text-white file:font-semibold hover:file:bg-indigo-500"
            />
          </div>
        </section>
      )}

      {/* Tab 2: Scheduler */}
      {activeTab === "scheduler" && (
        <section className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h2 className="text-lg font-semibold mb-2 text-indigo-300">Thesis & Dev Scheduler</h2>
          <p className="text-xs text-slate-400 mb-4">
            Manage Gantt roadmaps, defense countdowns, and Kanban boards.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-slate-700/50 rounded border border-slate-600">
              <span className="text-xs font-semibold text-amber-400 uppercase">Milestone</span>
              <h3 className="font-medium text-sm mt-1">Thesis Defense Countdown</h3>
            </div>
            <div className="p-3 bg-slate-700/50 rounded border border-slate-600">
              <span className="text-xs font-semibold text-emerald-400 uppercase">Kanban</span>
              <h3 className="font-medium text-sm mt-1">System Development Phase</h3>
            </div>
          </div>
        </section>
      )}

      {/* Tab 3: AI Reviewer */}
      {activeTab === "quiz" && (
        <section className="p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h2 className="text-lg font-semibold mb-2 text-indigo-300">AI Reviewer & Quiz Suite</h2>
          <p className="text-xs text-slate-400 mb-4">
            Transform lecture notes into MCQs and Flashcards via Gemini AI.
          </p>
          <button className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-medium text-sm transition-colors">
            + Create New Quiz from PDF
          </button>
        </section>
      )}
    </main>
  );
}
