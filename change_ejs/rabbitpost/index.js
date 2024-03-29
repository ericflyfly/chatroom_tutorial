const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
//const mongojs = require('mongojs');
const mongodb = require('mongodb');
const mongo_client = require('mongodb').MongoClient;
const path = require('path');
//set up socketio-file-upload modules
const siofu = require('socketio-file-upload');
app.use(siofu.router);
app.use(express.json());
const assert = require('assert');
const fs = require('fs');
const redis = require("redis");
const redis_client = redis.createClient();
const voiceit2 = require('voiceit2-nodejs');
const config = require('./config');
const Joi = require('joi');
var amqp = require('amqplib').connect('amqp://mqadmin:password@192.168.186.143:8086');

var bucket;
let myVoiceIt = new voiceit2(config.VOICEIT_API_KEY, config.VOICEIT_API_TOKEN);
let myobj = [{"real_name": 'eric chan', "nick_name": 'eric', "voiceitid": 'usr_35d0150e38ec4dc5b24dffc0df36a261'}, 
{real_name: 'peter leung', nick_name: 'peter', voiceitid: 'usr_4f46d694935645dbb64c88cea95c3a78'}, 
{real_name: 'mandy wong', nick_name: 'mandy', voiceitid: 'usr_d3fe3fc61a6e4b2094a0c56c905e73cc'}]

//share variable
const transporter = nodemailer.createTransport('smtps://cuhk%2eccl%40gmail.com:%21ccl123%21@smtp.gmail.com');
const topic_header = "rabbit/";

let curr_username;
var num_connect = 0;
let msg_arr = [];
let msg_username = '';
let port_num = 8082;
let audio_action = 0;
let audio_action_arr = [null, null, null];
let audio_action_socketid = [null, null, null];
let real_name_voiceit;
let amqp_channel;
//let myVoiceIt = new voiceit2("key_8b56317c58b042a6970144b1955ac7d2", "tok_72d386db81444fdd86731f60ae4f4a2f");
//let myVoiceIt = new voiceit2("usr_35d0150e38ec4dc5b24dffc0df36a261", "");

//connect to frontend
app.get('/', function(req, res) {
    res.render('index.ejs');
});

//get api for developer to get list of users information or one sepecific user by real_name
app.get('/api/user', function(req, res){
    if (req.query.real_name != null){
        mongo.db("chatroom").collection("user").findOne({real_name: req.query.real_name}, function(err, mongo_res){
            if (err) throw err;
            if (!mongo_res) res.status(404).send('The user with the given real_name was not found');
            else res.send(mongo_res);
        });
    }
    else{
        mongo.db("chatroom").collection("user").find({}).toArray(function(err, mongo_res){
            if (err) throw err;
            res.send(mongo_res);
        });
    }
});

//post api for developer to add a new user with custom real_name
app.post('/api/user', function(req, res){
    //Invalid input return 400 - Bad request
    const schema = {
        real_name: Joi.string().min(1).required(),
        nick_name: Joi.string().min(1).required()
    };
    
    const result = Joi.validate(req.body, schema);

    if (result.error){
        res.status(400).send(result.error.details[0].message);
        return;
    }
    //Invalid input (identical real_name) return 400 - Bad request
    req.body.real_name = req.body.real_name.toLowerCase();
    mongo.db("chatroom").collection("user").findOne({real_name: req.body.real_name}, function(err, mongo_res){
        if (mongo_res){
            res.status(400).send('The given \"real_name\" is taken.');
        }
        else{
            myVoiceIt.createUser((jsonResponse)=>{
                //construct a new user information
                const user = {
                    real_name: req.body.real_name,
                    nick_name: req.body.nick_name,
                    voiceitid: jsonResponse.userId,
                }
                //create a user document in mongodb
                mongo.db("chatroom").collection("user").insertOne(user, function(err, insert_res) {
                    if (err) throw err;
                    console.log("InsertOne user result: " + insert_res);
                    //return the completed user info
                    res.send(user);
                });
            })
        }
    });
});

//put api for developer to update nick_name of a user
app.put('/api/user/:real_name', function (req, res){
    //validate nick_name
    const schema = {
        nick_name: Joi.string().min(1).required()
    };

    const result = Joi.validate(req.body, schema);

    if (result.error) return res.status(400).send(result.error.details[0].message);
    //Update user nick_name by real_name
    req.params.real_name = req.params.real_name.toLowerCase()
    mongo.db("chatroom").collection("user").updateOne({"real_name": req.params.real_name},{$set: {"nick_name": req.body.nick_name}}, function(err, update_res) {
        if (err) throw err;
        console.log("UpdateOne user result: " + update_res);
        //if any match found
        if (JSON.parse(update_res).n > 0) res.send(req.params.real_name+" modified nick_name as "+req.body.nick_name);
        else res.status(404).send(req.params.real_name+" is not found.");
    });
});

//delete api for develeoper to remove user from DB
app.delete('/api/user/:real_name', function (req, res){
    req.params.real_name = req.params.real_name.toLowerCase();
    mongo.db("chatroom").collection("user").findOne({real_name: req.params.real_name}, function(err, mongo_res){
        if (err) throw err;
        //console.log(mongo_res);
        if (!mongo_res) return res.status(404).send('The user with given real_name was not found');
        else {
            myVoiceIt.deleteUser({
                userId : mongo_res.voiceitid
            },(jsonResponse)=>{
                console.log(jsonResponse);
            });
            mongo.db("chatroom").collection("user").deleteOne({real_name: req.params.real_name}, function(err, delete_res){
                if (err) throw err;
                console.log(delete_res.result);
                res.send("Remove "+ req.params.real_name.toLowerCase() + " successfully.")
            });
        }
    });

});

//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');

/*
    case topic_header+'chat_room/chat_message/data':
    //console.log('Receive %s from %s', message, topic);
    //num_msg += 1;
    client.publish(topic_header+'chat_room/num_msg', msg_arr.length.toString());
    msg_arr.push(msg_username + ": " + message);
    //console.log('num msg: %s', msg_arr.length.toString());
    io.sockets.in('online').emit('chat_message', {'index': msg_arr.length - 1, 'data': '<strong>' + msg_username + '</strong>: ' + message });

    if (error0) {
    throw error0;
  }
*/

//Subscriber
amqp.then(function(conn) {
    return conn.createChannel();
}).then(function(ch) {
    amqp_channel = ch;
    var exchange = 'direct_logs';
    ch.assertExchange(exchange, 'direct', {
        durable: false
    }).then(function (err){
        q = 'chatroom';
        ch.purgeQueue(q);
        //ch.deleteQueue(q);
        ch.assertQueue(q).then(function(ok) {
            let routingKeys = ["username", "chat_msg", "disconnect", "online"];
            routingKeys.forEach(function(element){
                ch.bindQueue(q, exchange, element);
            })
            return ch.consume(q, function(msg) {
                if (msg !== null) {
                    switch(msg.fields.routingKey){
                        case "username":
                            msg_username = msg.content.toString();
                            break;
                        case "chat_msg":
                            msg_arr.push(msg_username + ": " + msg.content.toString());
                            amqp_channel.publish("direct_logs", "num_msg", Buffer.from(msg_arr.length.toString()));
                            io.sockets.in('online').emit('chat_message', {'index': msg_arr.length - 1, 'data': '<strong>' + msg_username + '</strong>: ' + msg.content.toString() });
                            break;
                        case "disconnect":
                            num_connect -= 1;
                            //console.log(msg.content.toString());
                            amqp_channel.publish("direct_logs", "num_connect", Buffer.from(num_connect.toString()))
                            //client.publish(topic_header+'chat_room/num_connect', num_connect.toString());
                            break;
                        case "online":
                            amqp_channel.publish("direct_logs", "num_msg", Buffer.from(msg_arr.length.toString()));
                            amqp_channel.publish("direct_logs", "num_connect", Buffer.from(num_connect.toString()))
                            break;
                        default:
                            thorw ("Unhandled rabbitmq routingkey in \"" + q + "\" queue.");
                            break;
                    }
                    ch.ack(msg);
                }
            });
        });
    });
}).catch(console.warn);

let mongo;
mongo_client.connect("mongodb://ccl:ccl123!@localhost:27017/chatroom",function(err, db) {
    if (err) {
        console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
        process.exit(1);
    }
  console.log("Connected to MongoDB!");
  mongo = db;
  bucket = new mongodb.GridFSBucket(mongo.db("chatroom"));
});

/*const db = mongojs("ccl:ccl123!@localhost/chatroom", ['myCollection']);
let bucket = new mongojs.GridFSBucket(db, {
    bucketName: 'tracks'
});*/

redis_client.on("error", function (err){
    console.log("Redis Error " + err);
})

redis_client.on("connect", function(){
    console.log("Connected to Redis.");
    //create_redis_data();
});

function create_redis_data(){
    let intent_keyword = ["hi", "Hello World!", "date", "curr_date", "six", 6, "sign out","Signed out. Please enter your real name to Sign in again.", "tomorrow", "tom_date" ];
    redis_client.hdel('intent', "end", function(err, res){
        /*console.log("redis del res: " + res);
        console.log("redis del err: " + err);*/
    });
    redis_client.hmset('intent', intent_keyword, function(err, res){
        /*console.log("redis res: " + res);
        console.log("redis err: " + err);*/
    });
    //get all haskeys from a key
    /*redis_client.hkeys('intent', function (err, replies) {
        if (err) {
            return console.error('error response - ' + err);
        }
        // 
        console.log(replies.length + ' replies:');
        replies.forEach(function (reply, i) {
            console.log('    ' + i + ': ' + reply);
        });
        console.log(replies[0]);
    });*/

}

//socket.io communicate with frontend
io.sockets.on('connection', function(socket) {
    const uploader = new siofu();
    uploader.dir = path.join(__dirname, '/audio');
    uploader.listen(socket);
    uploader.on("saved", function(event){
        if (audio_action == 1){
            myVoiceIt.createVoiceEnrollment({
                userId : audio_action_arr[1],
                contentLanguage : "en-US",
                phrase : "Never forget tomorrow is a new day",
                audioFilePath : event['file']['pathName']
            },(jsonResponse)=>{
                //handle response
                io.to(audio_action_socketid[1]).emit('enroll_audio_res', {'msg': jsonResponse['message']});
                audio_action_arr[1] = null;
                //audio_action_socketid[1] = null;
            });
        }
        else if (audio_action == 2){
            myVoiceIt.voiceVerification({
                userId : audio_action_arr[2],
                contentLanguage : "en-US",
                phrase : "Never forget tomorrow is a new day",
                audioFilePath : event['file']['pathName']
            },(jsonResponse)=>{
                //handle response
                let msg = jsonResponse['message'];
                let res = "FAIL";
                if (jsonResponse['confidence'] > 75){
                    msg = "You have logged in";
                    res = "SUCC";
                    mongo.db("chatroom").collection("user").findOne({real_name: real_name_voiceit}, function(err, res){
                        console.log(res);
                        if (res != null){
                            curr_username = real_name_voiceit;
                            socket.username = res['nick_name'];
                            num_connect += 1;
                            //client.publish(topic_header + 'chat_room/num_connect', num_connect.toString());
                            amqp_channel.publish("direct_logs", "num_connect", Buffer.from(num_connect.toString()));
                            io.to(audio_action_socketid[2]).emit('is_online', {'curr_username': curr_username, 'data': '🔵 <i>' + socket.username + ' join the chat..</i>' });
                        }
                        else{
                            io.to(audio_action_socketid[2]).emit('login_fail',"");
                        }
                    });
                }
                io.to(audio_action_socketid[2]).emit('voice_login_audio_res', {'msg': msg, 'res': res});
                audio_action_arr[2] = null;
                //audio_action_socketid[2] = null;
            });
        }
        else{
            //console.log(event.file.name);
            console.log(event['file']['pathName']);
            //send mp3 from local path to mongodb
            file_to_mongo(event['file']['pathName'], event.file.name);
            //after mp3 file store in mongodb, remove it from the local directory

        }
        fs.unlink(event['file']['pathName'], function(err){
            if (err) throw err;
            console.log(event['file']['pathName']+' Deleted');
        });
        audio_action = 0;
    });

    socket.on('enroll_audio', function(data){
        audio_action = 1;
        audio_action_arr[audio_action] = data['voiceitid'];
        audio_action_socketid[audio_action] = data['socketid'];
    });

    socket.on('voice_login_audio', function(data){
        audio_action = 2;
        audio_action_arr[audio_action] = data['voiceitid'];
        audio_action_socketid[audio_action] = data['socketid'];
        real_name_voiceit = data['real_name'];
    });
    

    //console.log(client);
    socket.on('username', function(username_data) {
        //client.subscribe('chat_room/#');
        //remove previous information from the chatroom
        /*for(var i = 0; i < 3; i++){
            mongo.db("chatroom").collection("user").deleteMany(myobj[i], function(err, obj) {
                if (err) throw err;
                console.log(obj.result.n + " document(s) deleted");
            });
        }*/

        //add new information from the chatroom
        /*mongo.db("chatroom").collection("user").insertMany(myobj, function(err, res) {
            if (err) throw err;
            console.log("Number of documents inserted: " + res.insertedCount);
        });*/

        mongo.db("chatroom").collection("user").findOne({real_name: username_data['msg']}, function(err, res){
            socketID = username_data['socketID'];
            //console.log(res);
            if (res != null){
                curr_username = username_data['msg'];
                //console.log(res['nick_name'] + ", voiceitid: " + res['voiceitid']);
                socket.username = res['nick_name'];
                num_connect += 1;
                //client.publish(topic_header + 'chat_room/num_connect', num_connect.toString());
                amqp_channel.publish("direct_logs", "num_connect", Buffer.from(num_connect.toString()));
                io.to(socketID).emit('is_online', {'curr_username': curr_username, 'data': '🔵 <i>' + socket.username + ' join the chat..</i>' });
            }
            else{
                io.to(socketID).emit('login_fail',"");
            }
        });
    });

    socket.on('disconnect', function(username) {
        if (num_connect > 0){
            amqp_channel.publish("direct_logs", "disconnect", Buffer.from(''));
        }
    })

    socket.on('chat_message', function(message) {
        
        //let intent_keyword = ["hi", "Hello World!", "date", "curr_date", "exit", "exit", "Sign out","sign_out", "tomorrow", "tom_date" ];
        redis_client.hget("intent", message['msg'].toLowerCase(), function(err, reply){
            if (err) {
                return console.error('error response - ' + err);
            }
            else{
                if (reply){
                    let socketID = message['socketID'];
                    switch(message['msg'].toLowerCase()){
                        case 'hi':
                            io.to(socketID).emit('hi', reply);
                            break;
                        case 'date':
                            io.to(socketID).emit('curr_date',"");
                            break;
                        case 'six':
                            io.to(socketID).emit('six', reply);
                            break;
                        case  'sign out':
                            socket.leave("online");
                            io.to(socketID).emit('sign_out', reply);
                            if (num_connect > 0){
                                //client.publish(topic_header+'chat_room/disconnect', socket.username);//rabbit amqp
                                amqp_channel.publish(exchange = 'direct_logs', "disconnect", Buffer.from(''));
                            }
                            break;
                        case 'tomorrow':
                            io.to(socketID).emit('tom_date', "");
                            break;
                        default:
                            return console.error('error reply - ' + reply);
                    }
                
                }
                else{
                    //rabbit amqp
                    amqp.then(function(conn) {
                        return conn.createChannel();
                    }).then(function(ch) {
                        var exchange = "direct_logs";
                        var msg = message['msg'];
                        ch.assertExchange(exchange, 'direct',{
                            durable: false
                        });
                        ch.publish(exchange, "username", Buffer.from(socket.username));
                        ch.publish(exchange, "chat_msg", Buffer.from(msg));
                        //console.log(" [x] Sent %s: '%s'", servity , msg);
                    }).catch(console.warn);
                }
                //console.log(reply);
            }
        });
        //console.log(message);
    });

    //check username for enrollment
    socket.on('check_real_name', function (data){
        mongo.db("chatroom").collection("user").findOne({real_name: data['real_name']}, function(err, res){
            let socketID = data['socketid'];
            if (res != null){
                myVoiceIt.getAllVoiceEnrollments({
                    userId : res["voiceitid"]
                  },(jsonResponse)=>{
                    io.to(socketID).emit('check_real_name_res', {'msg': "SUCC", 'voiceitid': res["voiceitid"], 'enroll_num': jsonResponse["count"]});
                  });
            }
            else{
                io.to(socketID).emit('check_real_name_res', {'msg': "FAIL"});
            }
        });
    });

    //check username for voice verification
    socket.on('check_real_name_login', function (data){
        mongo.db("chatroom").collection("user").findOne({real_name: data['real_name']}, function(err, res){
            let socketID = data['socketid'];
            if (res != null){
                myVoiceIt.getAllVoiceEnrollments({
                    userId : res["voiceitid"]
                  },(jsonResponse)=>{
                    io.to(socketID).emit('check_real_name_login_res', {'msg': "SUCC", 'voiceitid': res["voiceitid"], 'enroll_num': jsonResponse["count"]});
                  });
            }
            else{
                io.to(socketID).emit('check_real_name_res', {'msg': "FAIL"});
            }
        });
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
                io.to(socketID).emit('email_msg_res', 'Fail to email Chatboard message.\n' + error);
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
