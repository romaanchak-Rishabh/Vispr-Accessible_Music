FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir yt-dlp mutagen

COPY server/app.py .
COPY api/v2/ ./v2/

ENV PORT=8080
EXPOSE 8080

CMD ["python", "app.py"]
