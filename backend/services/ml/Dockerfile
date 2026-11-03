FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY features.json ./
COPY ml ./ml
# Os modelos NÃO vão na imagem: monte /app/models (volume/S3) com a saída de `python -m ml.train --source db`.
ENV ML_MODELS_DIR=/app/models PYTHONUNBUFFERED=1
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys;sys.exit(0 if b'true' in urllib.request.urlopen('http://127.0.0.1:8090/healthz').read() else 1)"
CMD ["uvicorn", "ml.serve:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "2"]
