FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY index.js function.js manual.js start.js bot.js ./
COPY lib ./lib
COPY public ./public
COPY bot ./bot

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "start.js"]
