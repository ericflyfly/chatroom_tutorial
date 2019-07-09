const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');

//share variable
const transporter = nodemailer.createTransport('smtps://cuhk%2eccl%40gmail.com:%21ccl123%21@smtp.gmail.com');
const topic_header = "";
var num_connect = 0;
var num_msg = 0;
let msg_arr = [];
let msg_username = '';

//connect with frontend
app.get('/', function(req, res) {
    res.render('index.ejs');
});

//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');

//listen to MQTT broker connection
client.on('connect', function (){
    //MQTT Connection success, subscribe to certain topics
    console.log("Connected to mqtt");
    client.subscribe(topic_header+'chat_room/disconnect');
    client.subscribe(topic_header+'chat_room/username');
    client.subscribe(topic_header+'chat_room/chat_message/#');
    client.subscribe(topic_header+'monitor/online');
});

//Listen message event and then take action respectively
client.on('message', function(topic, message){
    message = message.toString();
    //console.log('%s -> %s', topic, message.toString());
    switch(topic){
        case topic_header+'chat_room/username':
            //console.log('Receive %s from %s', message, topic);
            io.emit('is_online', '🔵 <i>' + message + ' join the chat..</i>');
            num_connect += 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            io.emit('num_update', num_connect.toString());
            break;
        case topic_header+'chat_room/disconnect':
            //console.log('Receive %s from %s', message, topic);
            io.emit('is_online', '🔴 <i>' + message + ' left the chat..</i>');
            num_connect -= 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            io.emit('num_update', num_connect.toString());
            break;
        case topic_header+'chat_room/chat_message/username':
            msg_username = message;
            break;
        case topic_header+'chat_room/chat_message/data':
            //console.log('Receive %s from %s', message, topic);
            num_msg += 1;
            client.publish(topic_header+'chat_room/num_msg', num_msg.toString());
            msg_arr.push(msg_username + ": " + message);
            //console.log('num msg: %s', num_msg.toString());
            io.emit('chat_message', {'index': num_msg - 1, 'data': '<strong>' + msg_username + '</strong>: ' + message });
            break;
        case topic_header+'monitor/online':
            client.publish(topic_header+'chat_room/num_msg', num_msg.toString());
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
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
        client.publish(topic_header+'chat_room/username', socket.username);
        //console.log(socket.username);
    });

    socket.on('disconnect', function(username) {
        if (num_connect > 0){
            client.publish(topic_header+'chat_room/disconnect', socket.username);
        }
    })

    socket.on('chat_message', function(message) {
        client.publish(topic_header+'chat_room/chat_message/username', socket.username);
        client.publish(topic_header+'chat_room/chat_message/data', message)
        //console.log(message);
    });

    //receive an index of messages that need to email
    socket.on('email_msg', function (message){
        email_msg = "";
        message['email_msg_index'].forEach(function (msg_index){
            email_msg += msg_arr[msg_index] + "\n";
        });

        let mailOptions = {
            from: 'cuhk.ccl@gmail.com',
            to: [message["dest_email"]],
            //Email content
            subject: "Chatboard Message to " + socket.username,
            text: email_msg,
        }

        transporter.sendMail(mailOptions, function(error, info){
            if(error){
                res.send({success:false, error:error});
            }
            else{
                console.log('Message sent: ' + info.response);
                res.send({success:true});
            }
        });
        

    });

})


//create http server
const server = http.listen(8080,function() {
    console.log('listening on *:8080');
});
