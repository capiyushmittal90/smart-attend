FROM node:18-bullseye-slim

WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Expose port (Render/Railway dynamically overwrite this or inject PORT)
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
