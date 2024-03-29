const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
//const mongojs = require('mongojs');
const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
//const MongoClient = require('mongodb').MongoClient;
const path = require('path');
//set up socketio-file-upload modules
const siofu = require('socketio-file-upload');
app.use(siofu.router);
const assert = require('assert');
const fs = require('fs');
var bucket;


//share variable
const transporter = nodemailer.createTransport('smtps://cuhk%2eccl%40gmail.com:%21ccl123%21@smtp.gmail.com');
const topic_header = "test/";

let curr_username;
var num_connect = 0;
let msg_arr = [];
let msg_username = '';
let port_num = 8082;

//connect to frontend
app.get('/', function(req, res) {
    res.render('index.ejs');
});


//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');

let mongo;

MongoClient.connect("mongodb://ccl:ccl123!@localhost:27017/chatroom",function(err, db) {
    if (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
        process.exit(1);
    }
  console.log("Database created!");
  mongo = db;
  bucket = new mongodb.GridFSBucket(mongo.db("chatroom"));
});

/*const db = mongojs("ccl:ccl123!@localhost/chatroom", ['myCollection']);
let bucket = new mongojs.GridFSBucket(db, {
    bucketName: 'tracks'
});*/


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
    const uploader = new siofu();
    uploader.dir = path.join(__dirname, '/uploads');
    uploader.listen(socket);

    uploader.on("saved", function(event){
        console.log(event['file']['pathName']);
        //console.log(event.file.name);
        //send mp3 from local path to mongodb
        file_to_mongo(event['file']['pathName'], event.file.name);
        //after mp3 file store in mongodb, remove it from the local directory
        fs.unlink(event['file']['pathName'], function(err){
            if (err) throw err;
            console.log(event['file']['pathName']+' Deleted');
        });
    });

    //console.log(client);
    socket.on('username', function(username_data) {
        //client.subscribe('chat_room/#');
        let myobj = [{real_name: 'eric chan', nick_name: 'eric'}, {real_name: 'peter leung', nick_name: 'peter'}, {real_name: 'mandy wong', nick_name: 'mandy'}]
        /*mongo.db("chatroom").collection("user").insertMany(myobj, function(err, res) {
            if (err) throw err;
            console.log("Number of documents inserted: " + res.insertedCount);
        });*/
        /*
        for(var i = 0; i < 3; i++){
            mongo.db("chatroom").collection("user").deleteMany(myobj[i], function(err, obj) {
                if (err) throw err;
                console.log(obj.result.n + " document(s) deleted");
            });
        }*/
        mongo.db("chatroom").collection("user").findOne({real_name: username_data['msg']}, function(err, res){
            let socketID = username_data['socketID'];
            //console.log(res);
            if (res != null){
                curr_username = username_data['msg'];
                console.log(res['nick_name']);
                socket.username = res['nick_name'];
                num_connect += 1;
                client.publish(topic_header + 'chat_room/num_connect', num_connect.toString());
                io.to(socketID).emit('is_online', {'curr_username': curr_username, 'data': '🔵 <i>' + socket.username + ' join the chat..</i>' });
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

//function send file in the system to mongodb
function file_to_mongo(file_Pathname, filename){
    fs.createReadStream(file_Pathname).
    pipe(bucket.openUploadStream(filename)).
    on('error', function(error) {
      assert.ifError(error);
    }).
    on('finish', function() {
      console.log('file uploaded to Mongodb done!');
    });
}


//create http server
const server = http.listen(port_num,function() {
    console.log('listening on *:' + port_num);
});
