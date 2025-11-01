
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy React dashboard (maritime scenario)
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy SATCOM dashboards (static HTML/CSS/JS)
COPY satcom /usr/share/nginx/html/satcom

# Copy nginx configuration with routing
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
