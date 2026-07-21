# --- Stage 1: Build Angular Application ---
FROM node:20-alpine AS build
WORKDIR /app

# Copy dependency files first to leverage Docker layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy full project source code
COPY . .

# Build production bundle
RUN npm run build -- --configuration production

# --- Stage 2: Serve Application with Nginx ---
FROM nginx:alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled Angular assets from build stage
# Note: Angular 17+ outputs to 'dist/<project-name>/browser'. Update path if your dist structure differs.
COPY --from=build /app/dist/*/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
