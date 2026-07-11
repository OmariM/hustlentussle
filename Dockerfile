# Hustle n' Tussle web app image

# Stage 1: build the frontend bundles (web/js/dist)
FROM node:22-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY web/js web/js
RUN npm run build

# Stage 2: the Python app
FROM python:3.12-slim

# Don't write .pyc files; flush logs straight to stdout for `docker logs`
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_ENV=production

WORKDIR /app

# Install Python deps first for better layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source, then the built frontend from the node stage
# (web/js/dist is in .dockerignore so a host dev build never leaks in)
COPY . .
COPY --from=frontend /build/web/js/dist ./web/js/dist

# Gunicorn listens on 8080 inside the container (compose maps a host port to this)
EXPOSE 8080

CMD ["gunicorn", "--workers", "3", "--bind", "0.0.0.0:8080", "wsgi:application"]
