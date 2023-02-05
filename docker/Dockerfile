FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app
RUN chown -R node /usr/src/app

RUN apk add --no-cache tini

RUN npm install -g npm && npm install -g wire.io@3.3.1

USER node

EXPOSE 4000

ENTRYPOINT [ "/sbin/tini", "--" ]

CMD [ "wire.io" ]
