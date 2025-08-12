#!/bin/bash

# Activate virtual environment
source venv/bin/activate

# Run the FastAPI app with hot reload
echo "Starting backend server on http://localhost:8000"
uvicorn main:app --reload --host 0.0.0.0 --port 8000