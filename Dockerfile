FROM node:carbon
RUN apt-get update && apt-get install -y imagemagick --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY . .
RUN npm install
CMD [ "node", "main.js" ]