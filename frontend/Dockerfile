FROM node:22-slim

WORKDIR /app

# Cache the dependency layer separately from the source.
COPY package.json package-lock.json ./
# Cypress downloads a large binary that is not needed to serve the dev server.
ENV CYPRESS_INSTALL_BINARY=0
RUN npm ci --no-audit --no-fund

COPY . .

EXPOSE 5173

# --host makes Vite listen on all interfaces so the port mapping reaches it.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
