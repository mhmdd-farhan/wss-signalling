FROM node:18-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .
RUN npm run build

# Document the port being used
EXPOSE 3000

# Use node directly instead of npm
CMD ["node", "dist/server.js"]