FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json server.mjs index.html live.js ./
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
