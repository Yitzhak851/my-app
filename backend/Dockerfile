FROM python:3.11-slim

WORKDIR /app

# Copy requirements first so the dependency layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

CMD ["python", "run.py"]
