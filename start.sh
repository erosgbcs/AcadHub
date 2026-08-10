#!/bin/bash
echo "Starting FastAPI Backend..."
cd ~/AcademicHub/backend
uvicorn main:app --host 0.0.0.0 --port 8000 &

echo "Starting Next.js Frontend..."
cd ~/AcademicHub/frontend
npm run dev
