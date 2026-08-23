FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY data/content ./data/content
ENV NODE_ENV=production
CMD ["npx", "tsx", "src/index.ts"]
