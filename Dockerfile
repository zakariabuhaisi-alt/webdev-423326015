# The image Render builds and runs. node:22-alpine is small and has the Node we test on.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Dependencies first: this layer is cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations
COPY public ./public
COPY mcp-server ./mcp-server

# Do not run as root inside the container.
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
