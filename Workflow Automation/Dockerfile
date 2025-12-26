FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if any are needed (none for now)
# RUN apt-get update && apt-get install -y --no-install-recommends ...

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ /app/src/
COPY main.py /app/
COPY run_pipeline.py /app/

# Port for FastAPI
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Command to run the application
CMD ["python", "main.py"]
