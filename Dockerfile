# Hustle n' Tussle web app image
FROM python:3.12-slim

# Don't write .pyc files; flush logs straight to stdout for `docker logs`
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production

WORKDIR /app

# Install Python deps first for better layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source
COPY . .

# Gunicorn listens on 8080 inside the container (compose maps a host port to this)
EXPOSE 8080

CMD ["gunicorn", "--workers", "3", "--bind", "0.0.0.0:8080", "wsgi:application"]
