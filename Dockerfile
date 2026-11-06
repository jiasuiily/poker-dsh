# 多阶段不可用（本机无 Docker 时亦可直接 pnpm 本地跑），单阶段：装依赖 + 构建前端 + 跑服务端
FROM node:22-slim

RUN npm install -g pnpm@11.28.5

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @poker/web build

ENV NODE_ENV=production
ENV PORT=2568
ENV WEB_PORT=8080
ENV WEB_DIR=/app/packages/web/dist
ENV DB_PATH=/app/packages/server/data/poker.db
# 可选：接入真实大模型人格层
# ENV LLM_API_KEY=...
# ENV LLM_BASE_URL=https://api.deepseek.com/chat/completions
# ENV LLM_MODEL=deepseek-chat

EXPOSE 2568 8080

CMD ["pnpm", "--filter", "@poker/server", "start"]
