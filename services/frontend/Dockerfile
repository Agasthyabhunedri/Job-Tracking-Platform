FROM node:22 AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./tsconfig.base.json
COPY lib/ ./lib/
COPY artifacts/job-tracker/ ./artifacts/job-tracker/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY lib/api-spec/ ./lib/api-spec/
COPY lib/db/ ./lib/db/

RUN pnpm install --frozen-lockfile --ignore-scripts

ENV PORT=3000
ENV BASE_PATH=/
ENV NODE_ENV=production

RUN pnpm --filter @workspace/job-tracker run build && \
    echo "=== CHECKING BUILD OUTPUT ===" && \
    find /app/artifacts/job-tracker/dist -maxdepth 2 -type f

FROM nginx:1.27-alpine
COPY --from=builder /app/artifacts/job-tracker/dist /usr/share/nginx/html
COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
