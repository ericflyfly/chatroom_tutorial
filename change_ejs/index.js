const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const mongojs = require('mongojs');

//share variable
const transporter = nodemailer.createTransport('smtps://cuhk%2eccl%40gmail.com:%21ccl123%21@smtp.gmail.com');
const topic_header = "test/";

var num_connect = 0;
let msg_arr = [];
let msg_username = '';

//connect to frontend
app.get('/', function(req, res) {
    res.render('index.ejs');
});

//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');
const db = mongojs("ccl:ccl123!@localhost/chatroom", ['myCollection']);

db.on('error', function(err){
    console.log("database error " + err);
});

/*let objs = [{real_name: 'eric chan', nick_name: 'eric'}, {real_name: 'peter leung', nick_name: 'peter'}, {real_name: 'mandy wong', nick_name: 'mandy'}];
db.user.insert(objs, function(err, res){
    if (err) throw err;
    console.log(res);
});*/

/*
db.user.remove({real_name: 'peter leung'}, function(err, obj){
    if (err) throw err;
    console.log(obj);
})
*/


//listen to MQTT broker connection
client.on('connect', function (){
    //MQTT Connection success, subscribe to certain topics
    console.log("Connected to mqtt");
    client.subscribe(topic_header+'chat_room/disconnect');
    client.subscribe(topic_header+'chat_room/username');
    client.subscribe(topic_header+'chat_room/chat_message/#');
    client.subscribe('monitor/online');
});

//Listen MQTT message event and then take action respectively
client.on('message', function(topic, message){
    message = message.toString();
    //console.log('%s -> %s', topic, message.toString());
    switch(topic){
        case topic_header+'chat_room/disconnect':
            //io.sockets.in('online').emit('is_online', '🔴 <i>' + message + ' left the chat..</i>');
            num_connect -= 1;
            client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
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
        db.user.findOne({real_name: username_data['msg']}, function(err, doc){
            let socketID = username_data['socketID'];
            if (doc != null){
                console.log(doc['nick_name']);
                socket.username = doc['nick_name'];
                num_connect += 1;
                client.publish(topic_header + 'chat_room/num_connect', num_connect.toString());
                io.to(socketID).emit('is_online', '🔵 <i>' + socket.username + ' join the chat..</i>');
            }
            else{
                io.to(socketID).emit('login_fail',"");
            }
        });
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
        //console.log(socket.username);
        let socketID = message['socketID'];
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
                io.to(socketID).emit('email_msg_res', 'Fail to email Chatboard message.');
            }
            else{
                console.log('Message sent: ' + info.response);
                //console.log('email_msg_res' + '_'+socket.username);
                io.to(socketID).emit('email_msg_res', 'Chatboard Message sent to ' + message["dest_email"] + '.');
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
