FROM node:22-alpine AS base

WORKDIR /app

# Copy monorepo configuration files
COPY package.json tsconfig.base.json turbo.json ./

# Copy required workspace packages
COPY packages/errors ./packages/errors
COPY packages/logger ./packages/logger
COPY packages/protocol ./packages/protocol
COPY packages/shared-types ./packages/shared-types
COPY services/core ./services/core

# Install workspace dependencies
RUN npm install

# Expose default HTTP/WebSocket port
EXPOSE 8000

ENV NODE_ENV=production
ENV PORT=8000
ENV HOST=0.0.0.0

CMD ["npm", "--prefix", "services/core", "run", "start"]
