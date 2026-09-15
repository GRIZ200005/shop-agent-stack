FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY aster_agent ./aster_agent
COPY tests ./tests
RUN useradd --create-home --uid 10001 aster && mkdir /data && chown aster:aster /data
USER aster
CMD ["uvicorn","aster_agent.app:app","--host","0.0.0.0","--port","8010","--no-access-log"]
