FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p data/tickets knowledge/documents/incoming knowledge/documents/archive knowledge/structured logs

EXPOSE ${PORT:-8000}

CMD python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
