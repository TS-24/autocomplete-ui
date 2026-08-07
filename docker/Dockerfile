# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — frontend (Vite build → dist/)
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci && npm approve-scripts --all || true
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Rust backend (embeds ../dist at compile time)
# ---------------------------------------------------------------------------
FROM rust:1.97-bookworm AS rust

# Tauri v2 Linux build deps (https://v2.tauri.app/start/prerequisites/#linux)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-dev \
    libappindicator3-dev \
    librsvg2-dev \
    patchelf \
    libxdo-dev \
    libssl-dev \
    pkg-config \
    build-essential \
    curl \
    wget \
    file \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY src-tauri/Cargo.toml src-tauri/Cargo.lock ./src-tauri/
COPY --from=frontend /build/dist ./dist
COPY src-tauri ./src-tauri

# `custom-protocol` embeds ../dist and serves it via tauri://localhost —
# without it the binary is a dev build that expects the Vite dev server.
RUN cargo build --release --features tauri/custom-protocol --manifest-path src-tauri/Cargo.toml

# ---------------------------------------------------------------------------
# Stage 3 — runtime: headless X + VNC so the desktop app is viewable
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libwebkit2gtk-4.1-0 \
    libgtk-3-0 \
    libayatana-appindicator3-1 \
    librsvg2-2 \
    libxdo3 \
    libssl3 \
    libsoup-3.0-0 \
    fonts-dejavu-core \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    x11-apps \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

COPY --from=rust /app/src-tauri/target/release/autocomplete-ui /app/autocomplete-ui
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV DISPLAY=:99 \
    WEBKIT_DISABLE_COMPOSITING_MODE=1 \
    WEBKIT_DISABLE_DMABUF_RENDERER=1 \
    LIBGL_ALWAYS_SOFTWARE=1 \
    WEBKIT_INSPECTOR_SERVER=127.0.0.1:9222 \
    XDG_DATA_HOME=/data

EXPOSE 5900 6080
VOLUME ["/data"]

ENTRYPOINT ["/app/entrypoint.sh"]
