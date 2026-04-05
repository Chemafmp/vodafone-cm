# ─── Bodaphone Poller — production image ────────────────────────────────────
#
# Runs the poller in self-contained auto-fleet mode:
#   - Forks N simulated SNMP nodes on 127.0.0.1:116X
#   - Exposes HTTP API + WebSocket on 0.0.0.0:4000
#   - Exposes /health for Railway/Fly.io liveness probes
#
# Frontend (GitHub Pages) connects via wss:// to this container.

FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy only what the backend needs:
#   - server/               → poller, node-sim, libs
#   - src/data/inventory/   → node-sim imports seed data from here
COPY server ./server
COPY src/data/inventory ./src/data/inventory

# Railway sets PORT automatically; we respect it but default to 4000.
# AUTO_FLEET=6 → self-bootstrap 6 simulated nodes on boot.
ENV NODE_ENV=production
ENV AUTO_FLEET=6
ENV HOST=0.0.0.0

EXPOSE 4000

# Railway injects $PORT; fall back to 4000 for local `docker run`.
CMD ["sh", "-c", "node server/poller.js --port ${PORT:-4000}"]
