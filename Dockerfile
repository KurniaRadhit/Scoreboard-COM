FROM node:20-alpine

# Install build tools for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --omit=dev

# Copy app files
COPY server.js ./
COPY public ./public

# Create data directory for SQLite
RUN mkdir -p /app/data

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 7525

CMD ["node", "server.js"]
