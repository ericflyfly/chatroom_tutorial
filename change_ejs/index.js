const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');

//share variable
const transporter = nodemailer.createTransport('smtps://cuhk%2eccl%40gmail.com:%21ccl123%21@smtp.gmail.com');
const topic_header = "test/";
const temp_real_name = ['eric chan', 'peter leung', 'mandy wong'];
const temp_nick_name = ['eric', 'peter', 'mandy'];

var num_connect = 0;
let msg_arr = [];
let msg_username = '';
let room = 'online';

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
    client.subscribe('monitor/online');
});

//Listen message event and then take action respectively
client.on('message', function(topic, message){
    message = message.toString();
    //console.log('%s -> %s', topic, message.toString());
    switch(topic){
        /*case topic_header+'chat_room/username':
            //console.log('Receive %s from %s', message, topic);
            io.to('online').emit('is_online', '🔵 <i>' + message + ' join the chat..</i>');
            num_connect += 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            io.to('online').emit('num_update', num_connect.toString());
            break;
            */
        case topic_header+'chat_room/disconnect':
            //console.log('Receive %s from %s', message, topic);
            //io.sockets.in('online').emit('is_online', '🔴 <i>' + message + ' left the chat..</i>');
            num_connect -= 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            //io.sockets.in('online').emit('num_update', num_connect.toString());
            break;
        case topic_header+'chat_room/chat_message/username':
            msg_username = message;
            break;
        case topic_header+'chat_room/chat_message/data':
            //console.log('Receive %s from %s', message, topic);
            //num_msg += 1;
            client.publish(topic_header+'chat_room/num_msg', msg_arr.length.toString());
            msg_arr.push(msg_username + ": " + message);
            //console.log('num msg: %s', msg_arr.length.toString());
            io.sockets.in('online').emit('chat_message', {'index': msg_arr.length - 1, 'data': '<strong>' + msg_username + '</strong>: ' + message });
            break;
        case 'monitor/online':
            client.publish(topic_header+'chat_room/num_msg', msg_arr.length.toString());
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            break;
        default:
            console.log('\'%s\' topic not handled --> ', topic);
    }
});

//socket.io communicate with frontend
io.sockets.on('connection', function(socket) {

    //console.log(client);
    socket.on('username', function(username_data) {
        //client.subscribe('chat_room/#');
        username = username_data['msg'].toLowerCase();
        username_index = temp_real_name.indexOf(username);
        let socketID = username_data['socketID'];
        //console.log("username: " + username + " \nindex: " + username_index);
        if (username_index > -1){
            
            socket.username = temp_nick_name[username_index];
            num_connect += 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
            //client.publish(topic_header+'chat_room/username', socket.username);
            io.to(socketID).emit('is_online', '🔵 <i>' + socket.username + ' join the chat..</i>');
            //io.sockets.in('online').emit('num_update', num_connect.toString());
        }
        else{
            io.to(socketID).emit('login_fail',"")
        }
        //socket.username = username;
        //client.publish(topic_header+'chat_room/username', socket.username);
        //console.log(socket.username);
    });

    /*socket.on('disconnect', function(username) {
        if (num_connect > 0){
            client.publish(topic_header+'chat_room/disconnect', socket.username);
        }
    })*/

    socket.on('chat_message', function(message) {
        client.publish(topic_header+'chat_room/chat_message/username', socket.username);
        client.publish(topic_header+'chat_room/chat_message/data', message)
        //console.log(message);
    });

    //receive an index of messages that need to email
    socket.on('email_msg', function (message){
        console.log(socket.username);
        email_msg = "";
        message['email_msg_index'].forEach(function (msg_index){
            email_msg += msg_arr[msg_index] + "\n";
        });
        //set up info to email messages
        let mailOptions = {
            from: 'cuhk.ccl@gmail.com',
            to: [message["dest_email"]],
            //Email content
            subject: "Chatboard Message to " + socket.username,
            text: email_msg,
        }
        //send email
        transporter.sendMail(mailOptions, function(error, info){
            if(error){
                console.log({success:false, error:error});
                io.emit('email_msg_res' + '_'+socket.username, 'Fail to email Chatboard message.');
            }
            else{
                console.log('Message sent: ' + info.response);
                //console.log('email_msg_res' + '_'+socket.username);
                io.emit('email_msg_res' + '_'+socket.username, 'Chatboard Message sent to ' + message["dest_email"] + '.');
            }
        });
    });

    //connect socket to a room
    socket.on('room', function(room){
        socket.join(room);
    })

})


//create http server
const server = http.listen(8082,function() {
    console.log('listening on *:8082');
});
