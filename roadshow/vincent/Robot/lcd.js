var five = require("johnny-five");
var Galileo = require("galileo-io");

var board = new five.Board({
  io: new Galileo()
});

board.on("ready", function() {
    var lcd = new five.LCD({ 
          controller: "JHD1313M1"
    });

  // Tell the LCD you will use these characters:
  lcd.useChar("check");
  lcd.useChar("heart");
  lcd.useChar("duck");

  // Line 1: Hi rmurphey & hgstrp!
  lcd.clear().print("rmurphey, hgstrp");
  lcd.cursor(1, 0);

  // Line 2: I <3 johnny-five
  // lcd.print("I").write(7).print(" johnny-five");
  // can now be written as:
  lcd.print("I :heart: johnny-five");

  this.wait(3000, function() {
    lcd.clear().cursor(0, 0).print("I :check::heart: 2 :duck: :)");
  });

  this.repl.inject({
    lcd: lcd
  });
});
