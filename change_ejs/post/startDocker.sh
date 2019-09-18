#!/bin/sh
docker build --network=host -t mongodb .
docker run -p 27017:27017 --name mongodb -d mongodb:latest