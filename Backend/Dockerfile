FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install all dependencies (typescript is in dependencies)
RUN npm ci

# Copy project files
COPY . .

# Build TypeScript to dist
RUN npm run build

# Remove development packages for a lightweight runner
RUN npm prune --production

# ----------------------------------------------------
# Production runner
# ----------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
