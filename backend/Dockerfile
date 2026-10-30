# GrowMore Backend Production Dockerfile
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Run as non-root user for security hardening
USER node

EXPOSE 5000

ENV NODE_ENV=production

CMD ["node", "server.js"]
