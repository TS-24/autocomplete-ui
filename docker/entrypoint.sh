#!/bin/sh
set -e

# Headless display for the Tauri window
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true' EXIT

sleep 1

# VNC server on the virtual display
x11vnc -display :99 -forever -shared -nopw -listen 0.0.0.0 -rfbport 5900 &
X11VNC_PID=$!
trap 'kill $XVFB_PID $X11VNC_PID 2>/dev/null || true' EXIT

# noVNC web client (http://localhost:6080/vnc.html)
websockify --web=/usr/share/novnc 0.0.0.0:6080 localhost:5900 &
WEBSOCKIFY_PID=$!
trap 'kill $XVFB_PID $X11VNC_PID $WEBSOCKIFY_PID 2>/dev/null || true' EXIT

echo "Autocomplete UI starting — open http://localhost:6080/vnc.html to view"
exec /app/autocomplete-ui
