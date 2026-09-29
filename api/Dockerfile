

# Matches the Node version the app was developed with: newer Prisma generates the client as
# raw TypeScript (src/generated/prisma/*.ts), relying on Node's native TS support to run it
# without a compile step. Older Node majors (e.g. 20) can't execute those files directly.
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma.config.js ./
COPY prisma ./prisma
COPY src ./src

# Regenerated here, not copied from the host: the client's query engine must match
# this container's platform (linux-musl), not whatever OS built the image.
RUN npx prisma generate

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
