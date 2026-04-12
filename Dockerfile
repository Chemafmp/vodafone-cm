# ─── Bodaphone Poller — production image ────────────────────────────────────
#
# Runs the poller in self-contained auto-fleet mode:
#   - Forks N simulated SNMP nodes on 127.0.0.1:116X
#   - Exposes HTTP API + WebSocket on 0.0.0.0:4000
#   - Exposes /health for Railway/Fly.io liveness probes
#
# Frontend (GitHub Pages) connects via wss:// to this container.

FROM node:20-alpine

# C3 — run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy only what the backend needs:
#   - server/               → poller, node-sim, libs
#   - src/data/inventory/   → node-sim imports seed data from here
COPY server ./server
COPY src/data/inventory ./src/data/inventory

# Fix ownership so non-root user can read the files
RUN chown -R appuser:appgroup /app

# C3 — switch to non-root user before running anything
USER appuser

# Railway sets PORT automatically; we respect it but default to 4000.
# AUTO_FLEET=6 → self-bootstrap 6 simulated nodes on boot.
ENV NODE_ENV=production
ENV AUTO_FLEET=6
ENV HOST=0.0.0.0

EXPOSE 4000

# C4 — container health check; restarts container if API stops responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

# Railway injects $PORT; fall back to 4000 for local `docker run`.
CMD ["sh", "-c", "node server/poller.js --port ${PORT:-4000}"]
