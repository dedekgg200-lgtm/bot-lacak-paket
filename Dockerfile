# Dockerfile untuk "bot tele cek resi" (Pterodactyl)
FROM node:20-slim

WORKDIR /app

# Salin package & install dependencies
COPY package.json ./
RUN npm install --production

# Salin kode API + bot
COPY index.js function.js manual.js start.js bot.js ./
COPY lib ./lib
COPY public ./public
COPY bot ./bot
COPY .env.example ./

# Port API dashboard
ENV PORT=3000
ENV NODE_ENV=production

# Jalankan API + bot bersama
CMD ["node", "start.js"]
