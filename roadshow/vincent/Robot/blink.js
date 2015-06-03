var five = require("johnny-five");
var Galileo = require("galileo-io");

var board = new five.Board({
  io: new Galileo()
});

board.on("ready", function() {
  console.log ("Running J5!");
  var led = new five.Led(13);
  led.blink(5000);
});
