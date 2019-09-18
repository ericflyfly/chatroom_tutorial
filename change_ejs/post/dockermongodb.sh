#!/bin/sh
#start mongodb as a child process
#mongod --fork --syslog
#start mongodb as a background process
#mongod &
#sleep 1s
#configure mongodb
mongo --host 30.0.0.34 --eval 'db.runCommand({createRole: "manageOpRole",privileges:[{"resource" : {"cluster" : true},"actions" : ["inprog","killop"]},{"resource" : {"db" : "","collection" : ""},"actions" : ["killCursors"]}],roles:[]});' admin
#mongo --port 8085 --eval 'db.runCommand({createRole: "manageOpRole",privileges:[{"resource" : {"cluster" : true},"actions" : ["inprog","killop"]},{"resource" : {"db" : "","collection" : ""},"actions" : ["killCursors"]}],roles:[]});' admin
mongo --host 30.0.0.34 --eval 'db.runCommand({createRole: "mongostatRole",privileges:[{"resource" : {"cluster" : true},"actions" : ["serverStatus"]}],roles:[]});' admin
mongo --host 30.0.0.34 --eval 'db.createUser({user:"ccl",pwd:"ccl123!",roles:[{"role":"userAdmin",db:"admin"},{"role" : "clusterManager","db" : "admin"},{"role" : "manageOpRole","db" : "admin"},{"role":"readWrite","db":"chatroom"}]});' chatroom
#mongo