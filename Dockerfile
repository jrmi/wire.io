FROM node:14

# Create app directory
WORKDIR /usr/src/app

RUN npm install -g npm && npm install -g client2client.io@latest

EXPOSE 4000

CMD [ "client2client" ]
