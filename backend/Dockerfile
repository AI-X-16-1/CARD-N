FROM python:3.11-slim

# Native libraries the slim base image does not carry:
#   libgl1, libglib2.0-0 - opencv-python-headless and paddleocr, at import time
#   libgomp1             - paddlepaddle's libpaddle.so links against OpenMP.
#                          Without it PaddleOCR raises ImportError: libgomp.so.1
#                          the first time it is constructed. app/main.py's warmup
#                          catches that and defers to the first request, so the
#                          container still starts and only the first scan fails -
#                          verify with `import paddle`, not with `up -d`.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY . .

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
