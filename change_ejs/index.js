const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');

//share variable
var num_connect = 0;
var num_msg = 0;

//connect with frontend
app.get('/', function(req, res) {
    res.render('index.ejs');
});

//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');

//listen to MQTT broker connection
client.on('connect', function (){
    //MQTT Connection success, subscribe to certain topics
    console.log("Connect to mqtt");
    client.subscribe('chat_room/disconnect');
    client.subscribe('chat_room/username');
    client.subscribe('chat_room/chat_message');
    client.subscribe('monitor/online');
});

//Listen message event and then take action respectively
client.on('message', function(topic, message){
    message = message.toString();
    //console.log('%s -> %s', topic, message.toString());
    switch(topic){
        case 'chat_room/username':
            //console.log('Receive %s from %s', message, topic);
            io.emit('is_online', '🔵 <i>' + message + ' join the chat..</i>');
            num_connect += 1;
            client.publish('chat_room/num_connect', num_connect.toString());
            io.emit('num_update', num_connect.toString());
            break;
        case 'chat_room/disconnect':
            //console.log('Receive %s from %s', message, topic);
            io.emit('is_online', '🔴 <i>' + message + ' left the chat..</i>');
            num_connect -= 1;
            client.publish('chat_room/num_connect', num_connect.toString());
            io.emit('num_update', num_connect.toString());
            break;
        case 'chat_room/chat_message':
            //console.log('Receive %s from %s', message, topic);
            num_msg += 1;
            client.publish('chat_room/num_msg', num_msg.toString());
            //console.log('num msg: %s', num_msg.toString());
            io.emit('chat_message', message);
            break;
        case 'monitor/online':
            client.publish('chat_room/num_msg', num_msg.toString());
            client.publish('chat_room/num_connect', num_connect.toString());
            break;
        default:
            console.log('\'%s\' topic not handled --> ', topic);
    }
});


//socket.io communicate with frontend
io.sockets.on('connection', function(socket) {
    //console.log(client);
    socket.on('username', function(username) {
        //client.subscribe('chat_room/#');
        socket.username = username;
        client.publish('chat_room/username', socket.username);
        //console.log(socket.username);
    });

    socket.on('disconnect', function(username) {
        if (num_connect > 0){
            client.publish('chat_room/disconnect', socket.username);
        }
    })

    socket.on('chat_message', function(message) {
        //******/add strong tag in front end code
        client.publish('chat_room/chat_message', '<strong>' + socket.username + '</strong>: ' + message)
        console.log(message);
    });

})


//create http server
const server = http.listen(8080,function() {
    console.log('listening on *:8080');
});
