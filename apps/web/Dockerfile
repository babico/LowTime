FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
COPY eslint.config.mjs ./

RUN npm --workspace @lowtime/web run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:5173/ >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
