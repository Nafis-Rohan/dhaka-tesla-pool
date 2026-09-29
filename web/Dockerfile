# Build stage: Vite bakes VITE_API_URL into the JS bundle at build time, so it must be
# passed as a build arg here, not a runtime env var (architecture.md).
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Final stage: nginx only serves the built static files. It is not a reverse proxy -
# the browser calls the API directly at VITE_API_URL (architecture.md).
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
