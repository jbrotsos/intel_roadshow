var five = require("johnny-five");
var Galileo = require("galileo-io");

var board = new five.Board({
  io: new Galileo()
});

board.on("ready", function() {

  var servo = new five.Servo(3);

  // Sweep from 0-180 and repeat.
  servo.sweep();
});
