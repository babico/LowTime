FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY apps/web/index.html ./apps/web/index.html
COPY apps/web/src ./apps/web/src
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY packages/shared/src ./packages/shared/src

RUN npm install

WORKDIR /app/apps/web

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

