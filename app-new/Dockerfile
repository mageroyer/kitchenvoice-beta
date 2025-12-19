# Claude Proxy Server Dockerfile
FROM node:18-slim

WORKDIR /app

# Copy package files and install only what's needed
COPY package*.json ./
RUN npm ci --only=production

# Copy cloud proxy server code
COPY proxy-server-cloud.js ./

# Cloud Run sets PORT environment variable
ENV PORT=8080

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "proxy-server-cloud.js"]
