//https://docs.google.com/presentation/d/1_JnUiguDVwsZ5kDO878yCXP4HcZ4wUhCdeZLOO-w_co/edit?usp=sharing
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.get('/', function(req, res) {
    res.render('index.ejs');
});

io.sockets.on('connection', function(socket) {
    socket.on('username', function(username) {
        socket.username = username;
        io.emit('is_online', '🔵 <i>' + socket.username + ' join the chat..</i>');
    });

    socket.on('disconnect', function(username) {
        io.emit('is_online', '🔴 <i>' + socket.username + ' left the chat..</i>');
    })

    //***Fill here***//
    //listen to an event from front-end and then fire an event with message in HTML through socket.io
    //message --> '<strong>' + socket.username + '</strong>: ' + message

});

const server = http.listen(8080, function() {
    console.log('listening on *:8080');
});