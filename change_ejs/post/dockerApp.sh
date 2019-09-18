#!/bin/sh
docker build --no-cache --network=host -t mqtt ./mqtt
docker run -p 1883:1883 --name mqtt -d mqtt:latest

docker build --no-cache --network=host -t redis ./redis
docker run -p 6379:6379 --name redis -d redis:latest

docker build --no-cache --network=host -t mongodb ./mongodb
docker run -p 27017:27017 --name mongodb -d mongodb:latest

docker build --no-cache -t setmongo ./chatroomMonitor
docker run --rm setmongo

docker build --no-cache --network=host -t chatroom .
docker run -p 8080:8080 --name chatroom -d chatroom:latest