FROM node:18-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .
RUN npm run build

# Use node directly instead of npm
CMD ["node", "dist/server.js"]