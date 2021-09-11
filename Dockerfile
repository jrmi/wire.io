FROM node:14

# Create app directory
WORKDIR /usr/src/app

RUN npm install -g npm && npm install -g wire.io@latest

EXPOSE 4000

CMD [ "wire.io" ]
