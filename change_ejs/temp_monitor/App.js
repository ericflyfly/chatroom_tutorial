import React, { Component } from "react";
import socketIOClient from "socket.io-client";
class App extends Component {
  constructor() {
    super();
    this.state = {
      response: false,
      //endpoint: "http://127.0.0.1:4001"
      endpoint: "http://192.168.186.143:8087"
    };
  }
  componentDidMount() {
    const { endpoint } = this.state;
    const socket = socketIOClient(endpoint);
    socket.on("num_connect", data => this.setState({num_connect: data}));
    socket.on("num_msg", data => this.setState({num_msg: data}));
  }
  render() {
    const { num_connect, num_msg } = this.state;
    return (
        <div style={{ textAlign: "center" }}>         
          {num_connect ?
          <p>
          Chatroom has {num_connect} connections.
          </p> 
          :<p>Loading...</p>
          }
          {num_msg ?
          <p>
            Chatroom has transferred {num_msg} messages.
          </p> 
          :<p>Loading...</p>
          }
        </div>
    );
  }
}

export default App;
