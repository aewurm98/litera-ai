# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Install system dependencies needed for native modules (bcrypt) and PDF processing
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Install all dependencies (including devDependencies for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Prune devDependencies for production
RUN npm prune --production

# Stage 2: Production
FROM node:20-slim

WORKDIR /app

# Install runtime system dependencies
RUN apt-get update && apt-get install -y \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy built output and production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
