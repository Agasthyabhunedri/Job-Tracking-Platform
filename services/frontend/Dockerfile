FROM node:22-alpine AS builder

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/job-tracker/ ./artifacts/job-tracker/
COPY lib/api-client-react/ ./lib/api-client-react/
COPY lib/api-spec/ ./lib/api-spec/
COPY lib/db/ ./lib/db/

RUN pnpm install --frozen-lockfile --ignore-scripts

RUN pnpm --filter @workspace/job-tracker run build \
    --env PORT=3000 BASE_PATH=/ NODE_ENV=production

FROM nginx:1.27-alpine
COPY --from=builder /app/artifacts/job-tracker/dist/public /usr/share/nginx/html
COPY services/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
