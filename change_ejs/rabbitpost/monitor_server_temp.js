const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const axios = require("axios");
const mqtt = require('mqtt');

//set up connection with various server
//const client = mqtt.connect('mqtt://test.mosquitto.org');
const client = mqtt.connect('mqtt://192.168.186.143:8088');
const port = process.env.PORT || 8087;
const index = require("./routes/index");
const app = express();
app.use(index);
const server = http.createServer(app);
const io = socketIo(server);
var amqp = require('amqplib').connect('amqp://mqadmin:password@192.168.186.143:8086');



//share variables
let amqp_channel = null;
var num_connect = '0';
var num_msg = '0';


//listen connection event from MQTT
client.on('connect', function (){
  console.log("Connect to mqtt");
  client.subscribe('chat_room/num_connect');
  client.subscribe('chat_room/num_msg');
  //notice chatroom client monitor online
  client.publish('monitor/online');
});

//listen meesage received event from MQTT
client.on('message', function(topic, msg){
  msg = msg.toString();
  switch(topic){
    case 'chat_room/num_connect':
      //num_connect = msg;
      io.emit("num_connect", msg);
      break;
    case 'chat_room/num_msg':
      //num_msg = msg;
      io.emit("num_msg", msg);
      break;
    default:
      console.log('Error!!!! \'%s\' topic not handled --> ', topic);
  }
  console.log('%s -> %s', topic, msg.toString());
});

//get data from dark sky backend every 10 seconds
io.on("connection", socket => {
    //console.log("New client connected");
    io.emit("num_connect", num_connect);
    io.emit("num_msg", num_msg);
    /*socket.on("disconnect", () => {
        console.log("Client disconnected");
    });*/
});

amqp.then(function(conn) {
  return conn.createChannel();
}).then(function(ch) {
  amqp_channel = ch;
  var exchange = 'direct_logs';
  ch.assertExchange(exchange, 'direct', {
      durable: false
  }).then(function (err){
      q = 'chatroom';
      ch.assertQueue(q).then(function(ok) {
          let routingKeys = ["num_connect", "num_msg"];
          routingKeys.forEach(function(element){
              ch.bindQueue(q, exchange, element);
          })
          return ch.consume(q, function(msg) {
              if (msg !== null) {
                  switch(msg.fields.routingKey){
                      case "num_connect":
                          console.log("connections: " + msg.content.toString());
                          //io.emit("amqp_num_connect", msg.content.toString());
                          break;
                      case "num_msg":
                          console.log("amqp_num_msg: " + msg.content.toString());
                          //io.emit("amqp_num_msg", msg.content.toString());
                          break;
                      default:
                          thorw ("Unhandled rabbitmq rotingkey in \"" + q + "\" queue.");
                          break;
                  }
                  ch.ack(msg);
              }
          });
      });
  });
}).catch(console.warn);

amqp_channel.publish("direct_logs", "online", Buffer.from(""));


server.listen(port, () => console.log(`Listening on port ${port}`));
