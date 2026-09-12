# In `docker/` directory

docker pull node:18-alpine
docker build -t jrmi/wire.io:3.3.X .
docker build -t jrmi/wire.io .


docker login

docker push jrmi/wire.io
docker push jrmi/wire.io:3.3.X
