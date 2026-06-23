FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --no-audit --no-fund

COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
COPY eslint.config.mjs ./

RUN npm --workspace @lowtime/server run build

FROM node:22-bookworm-slim AS serve
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/packages/shared packages/shared/
COPY --from=build /repo/apps/server/package.json apps/server/
COPY --from=build /repo/apps/server/dist apps/server/dist

RUN npm ci --omit=dev --no-audit --no-fund --workspaces --include-workspace-root

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health >/dev/null || exit 1
CMD ["npm", "--workspace", "@lowtime/server", "start"]
