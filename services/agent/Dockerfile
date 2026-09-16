FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY shop_agent_stack ./shop_agent_stack
COPY tests ./tests
RUN useradd --create-home --uid 10001 shop_agent_stack && mkdir /data && chown shop_agent_stack:shop_agent_stack /data
USER shop_agent_stack
CMD ["uvicorn","shop_agent_stack.app:app","--host","0.0.0.0","--port","8010","--no-access-log"]
