FROM apify/actor-node:16

COPY package*.json ./

RUN npm --quiet set progress=false \
 && npm ci --production

COPY . ./
