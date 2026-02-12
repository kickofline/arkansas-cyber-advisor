FROM python:3.12-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
COPY . .
ENV UV_NO_DEV=1
EXPOSE 5000

RUN uv sync --locked

CMD ["uv", "run", "./index.py"]