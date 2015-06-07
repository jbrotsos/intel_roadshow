///////////////////////////////////////////////
// onboard_gui.js : target GUI state machine for Follow-Me Cart
//
// This application does the following:
//   * Runs tje Follow-Me Cart state machine on the target
//   * Manages the LCD display and Buttons standalone user interface
//   * Manages a UPC scanner
//   * Manages a Cloud service connection
//   * Interfaces with the motor control
//   * Supports a pure simluation mode for devel/debug
//
// Requirements:
//   * Intel(c) Edison + Arduino Breakout Board
//   * Grove Shield + LCD + 4 Buttons + Buzzer + LED
//   * node.js
//   * Johnny-Five
//   * USB Scanner for scanner input
//   * Wifi connection for Cloud service
//
// Usage:
//  $ node onboard_gui.js [-parameters] [--server=port] [--client=ip:port]
//
// The application normally comes up in setup mode, where you can set
// which devices are enabled. By default it starts in pure simulation.
// You can also pass the setup character commands as command line parameters.
//
// With this example you would pre-enable the I/O:
//  $ node onboard_gui.js -i
//
// With this example you would enable all hardware and start the device:
//  $ node onboard_gui.js -Ag
//

///////////////////////////////////////////////
// Port Assignments

var BUTTON_1_PORT=6
var BUTTON_2_PORT=4
var BUTTON_3_PORT=7
var BUTTON_4_PORT=8

var LED_1_PORT=5
var BUZZER_1_PORT=2

const BUZZER_AS_LED = 1;
const BUZZER_AS_UMP = 2;
var buzzer_mode = BUZZER_AS_LED;

///////////////////////////////////////////////
// Globals

// hardware objects

var five = undefined;
var board = undefined;
var lcd = undefined;
var led1 = undefined;
var upmBuzzer = undefined;
var buzzer = undefined;
var analog1 = undefined;
var analog2 = undefined;
var analog3 = undefined;
var analog4 = undefined;

// state variables

var input_state="setup";
var state_now=0;

var enable_io     = false;
var enable_motors = false;
var enable_buzzer = false;
var enable_ipc    = false;
var enable_cloud  = false;
var enable_scanner= false;
var enable_board=false;
var verbose       = true;

var disp_weight = 0.0;
var disp_cost = 0.0;

var cur_direction_string = "";

// external values

var beeper="Off";
var motorL="Off";
var motorR="Off";

var a1=0;
var a2=0;
var a3=0;
var a4=0;

var scanner_input="";
var upc_name=undefined;
var upc_number = "";
var upc_price=0.0;
var upc_weight=0.0;

// server

var net = require('net');
var server = undefined;
var server_ip = '127.0.0.1';
var server_port = 3490;
var client = undefined;
var client_ip = '';
var client_port = 0;

// UPC Object Constructor

function UPC_Entry(upc,name,price,weight) {
	this.upc = upc;
	this.name = name;
	this.price = price;
	this.weight = weight;
};


// Distance Sensor Object Constructor

function DistanceSensor(rightPin, leftPin) {
    this.rightPin = new mraa.Aio(rightPin);
    this.leftPin = new mraa.Aio(leftPin);
    this.MAX_SAMPLES = 1024;
    this.READ_RATE = 1; //1ms per read
    this.counter = 0;
    this.leftBuffer = new Array();
    this.rightBuffer = new Array();
    for(i = 0; i < this.MAX_SAMPLES; ++i) {
        this.leftBuffer[i] = this.rightBuffer[i] = 0;
    }

    this.update = function(me) {
        ++me.counter;
        me.rightBuffer[me.counter % me.MAX_SAMPLES] = me.rightPin.read();
        me.leftBuffer[me.counter % me.MAX_SAMPLES] = me.leftPin.read();
    }
    setInterval(this.update, this.READ_RATE, this);
    this.distancehelper = function(buffer) {
        //find the mean
        var mean = 0;
        for(i = 0; i < this.MAX_SAMPLES; ++i)
            mean += buffer[i];
        mean /= this.MAX_SAMPLES;
        //subtract mean and square result - variance
        //find mean of variances
        var mean_of_variance = 0;
        for(i = 0; i < this.MAX_SAMPLES; ++i)
        {
            var variance = (buffer[i] - mean) * (buffer[i] - mean);
            mean_of_variance += variance;
        }
        mean_of_variance /= this.MAX_SAMPLES;
        //sqrt mean of variances - stddev
        var stddev = Math.sqrt(mean_of_variance);
        //discard any sample that is not within 2 stddevs of mean and return mean of resulting set
        var filteredMean = 0;
        var filteredCount = 0;
        for(i = 0; i < this.MAX_SAMPLES; ++i)
        {
            if( mean-(2*stddev) <= buffer[i] && buffer[i] <= mean+(2*stddev) )
            {
                //its a valid sample
                filteredMean += buffer[i];
                ++filteredCount;
            }
        }
        if( filteredCount == 0 )
            return 0;
        return filteredMean / filteredCount;
    }
    this.distance = function() {
        return this.distancehelper(this.rightBuffer) + this.distancehelper(this.leftBuffer);
    }
    this.spread = function() {
        return this.distancehelper(this.rightBuffer) - this.distancehelper(this.leftBuffer);
    }
}

///////////////////////////////////////////////
// Common routines

// format floating point to '%8.2'
function format_float(f) {
	var s = "";
	var i=7;
	var n = Math.floor(f * 100);
	while (n > 0.999) {
		var c = String(Math.floor(n % 10));
		s = c + s;
		i -= 1;
		if (i==5) {i--; s = '.' + s;}
		n=Math.floor(n/10);
	}
	if (s.length == 0) {
		s = "    0.00";
	}
	while (s.length < 8)
		s = ' '+s;
	return s;
}

// format integer to '%<n>d'
function format_int(d,n) {
	var s = String(Math.floor(d));
	while (s.length < n)
		s = ' '+s;
	return s;
}

///////////////////////////////////////////////
// Keyboard routines and initialization

var stdin = process.stdin;

// Set to non-blocking character mode
stdin.setRawMode( true );

// resume stdin in the parent process
// Note that CTRL-C must be explicitly handled
stdin.resume();

// Set to text mode
stdin.setEncoding( 'utf8' );

///////////////////////////////////////////////
// Hardware handlers

function init_board() {

	if (enable_io == true) {
		// Button #1 = Grove Shield GPIO jack
		var button1 = new five.Button(BUTTON_1_PORT);

		// Button #2 = Grove Shield GPIO jack
		var button2 = new five.Button(BUTTON_2_PORT);

		// Button #3 = Grove Shield GPIO jack
		var button3 = new five.Button(BUTTON_3_PORT);

		// Button #4 = Grove Shield GPIO jack
		var button4 = new five.Button(BUTTON_4_PORT);

		// Button handlers
		button1.on("release", function() {
			if (verbose)
				console.log("BUTTON_1 Pressed!");
			play_buzzer('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k1)
		});
		button2.on("release", function() {
			if (verbose)
				console.log("BUTTON_2 Pressed!");
			play_buzzer('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k2)
		});
		button3.on("release", function() {
			if (verbose)
				console.log("BUTTON_3 Pressed!");
			play_buzzer('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k3)
		});
		button4.on("release", function() {
			if (verbose)
				console.log("BUTTON_4 Pressed!");
			play_buzzer('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k4)
		});

		// The LCD module can be on any I2C connector.
		lcd = new five.LCD({
			controller: "JHD1313M1"
		});
		// Set init text on screen
		lcd.cursor(0, 0).print("Follow Me Cart");
		lcd.cursor(1, 0).print("Init!");
	    lcd.bgColor(76, 0, 130);


		// LED #1 = Grove Shield GPIO jack
		led1 = new five.Led(LED_1_PORT);
		
		// open up the four analog ports
		analog1 = new five.Sensor("A0");
		analog2 = new five.Sensor("A1");
		analog3 = new five.Sensor("A2");
		analog4 = new five.Sensor("A3");
		analog1.scale(0, 255).on("change", function() {
			a1 = this.value;
		});
		analog2.scale(0, 255).on("change", function() {
			a2 = this.value;
		});
		analog3.scale(0, 255).on("change", function() {
			a3 = this.value;
		});
		analog4.scale(0, 255).on("change", function() {
			a4 = this.value;
		});

	}
	
	if (enable_buzzer == true) {
		if (buzzer_mode == BUZZER_AS_LED) {
			buzzer = new five.Led(BUZZER_1_PORT);
			console.log("BUZZER is LED");
		}
		if (buzzer_mode == BUZZER_AS_UMP) {
			console.log("BUZZER is UMP");
			upmBuzzer = require("jsupm_buzzer");
			// Initialize on a Grove Shield GPIO jack
			buzzer = new upmBuzzer.Buzzer(BUZZER_1_PORT);
		}
	}
}

function set_lcd_backlight(r,g,b) {
	if (enable_io == true) {
	    lcd.bgColor(r, g, b);
	}
}

function buzzer_stop() {
	buzzer.off();
}

function play_buzzer(sound) {

	if (verbose)
		console.log("BUZZER Play:"+sound);
		
	if (!enable_buzzer)
		return
	
	if (buzzer_mode == BUZZER_AS_LED) {

		if (sound == "SONG_POWER_UP") {
			buzzer.on();
			setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_POWER_DOWN") {
			// No sound because off timer is lost
			// buzzer.on();
			// setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_FOLLOWING") {
			buzzer.on();
			setTimeout(buzzer_stop,100);
		}

		if (sound == "SONG_WAITING") {
			buzzer.on();
			setTimeout(buzzer_stop,100);
		}

		if (sound == "SONG_OK") {
			buzzer.on();
			setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_KEY_PRESS") {
			buzzer.on();
			setTimeout(buzzer_stop,5);
		}

		if (sound == "SONG_HELP") {
			buzzer.on();
			setTimeout(buzzer_stop,2000);
		}
	}

	if (buzzer_mode == BUZZER_AS_UMP) {
		// Available Notes: upmBuzzer.DO,upmBuzzer.RE,upmBuzzer.MI,upmBuzzer.FA
		//                  upmBuzzer.SOL,upmBuzzer.LA,upmBuzzer.SI


		if (sound == "SONG_POWER_UP") {
			buzzer.playSound(upmBuzzer.DO, 100000);
			buzzer.playSound(upmBuzzer.MI, 100000);
			buzzer.playSound(upmBuzzer.SOL, 100000);
		}

		if (sound == "SONG_POWER_DOWN") {
			buzzer.playSound(upmBuzzer.SOL, 100000);
			buzzer.playSound(upmBuzzer.MI, 100000);
			buzzer.playSound(upmBuzzer.DO, 100000);
		}

		if (sound == "SONG_FOLLOWING") {
			buzzer.playSound(upmBuzzer.DO, 100000);
			buzzer.playSound(upmBuzzer.MI, 100000);
		}

		if (sound == "SONG_WAITING") {
			buzzer.playSound(upmBuzzer.MI, 100000);
			buzzer.playSound(upmBuzzer.DO, 100000);
		}

		if (sound == "SONG_OK") {
			buzzer.playSound(upmBuzzer.MI, 100000);
			buzzer.playSound(upmBuzzer.SOL, 100000);
		}

		if (sound == "SONG_KEY_PRESS") {
			buzzer.playSound(upmBuzzer.MI, 100000);
		}

		if (sound == "SONG_HELP") {
			buzzer.playSound(upmBuzzer.SI, 100000);
			buzzer.playSound(upmBuzzer.MI, 100000);
			buzzer.playSound(upmBuzzer.SI, 100000);
		}
	}
}

var current_mood='';
function set_mood(mood) {
	if (current_mood == mood) {
		return;
	}
	current_mood = mood;

	if (mood == "MOOD_READY") {
	    set_lcd_backlight(76, 0, 130);
	    // no sound
	}
	if (mood == "MOOD_FOLLOW") {
	    set_lcd_backlight(100, 255, 100);
	    play_buzzer("SONG_FOLLOWING");
	}
	if (mood == "MOOD_LOOKING") {
	    set_lcd_backlight(200, 200, 0);
	    // no sound
	}
	if (mood == "MOOD_LOST") {
	    set_lcd_backlight(250, 50, 50);
	    play_buzzer("SONG_HELP");
	}
}


function set_led(value) {
	if (verbose)
		console.log("LED Set:"+value);
		
	if (!enable_io)
		return
	
	if (value == 'on')
		led1.on();
	else
    	led1.off();
}

//TBD
function beeper_control(control) {
	if (enable_buzzer)
		beeper=control;
}

//TBD
function MotorL_control(control) {
	if (enable_motors)
		motorL=control;
}
		
//TBD
function MotorR_control(control) {
	if (enable_motors)
		motorR=control;
}
		
var scanner_share_file='/tmp/barcode.txt';
var fs = require('fs')
var in_scanner_code=false;
function scan_scanner() {
	if (in_scanner_code) return;
	in_scanner_code=true;
	fs.stat(scanner_share_file, function(err, stat) {
		if (err == null) {
			fs.readFile(scanner_share_file, 'utf8', function (err,data) {
				if (err) {
				console.log(err);
				} else {
					fs.unlinkSync(scanner_share_file);
					console.log("UPC_READ:"+data);
					scanner_input=data;
				}
			});
		} else {
			// console.log('Some other error: ', err.code);
		}
	});
	in_scanner_code=false;
}

			
///////////////////////////////////////////////
// Cloud Handler Functions

function init_ipc() {
	if (enable_ipc == true) {

		// Create a server instance, and chain the listen function to it
		// The function passed to net.createServer() becomes the event handler for the 'connection' event
		// The sock object the callback function receives UNIQUE for each connection
		server = net.createServer(function(sock) {

			// We have a connection - a socket object is assigned to the connection automatically
			console.log('IPC:Cart Server CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

			// Add a 'data' event handler to this instance of socket
			sock.on('data', function(data) {
				sock.write(cart_server_receiver(sock,data));
			});

			// Add a 'close' event handler to this instance of socket
			sock.on('close', function(data) {
				console.log('IPC:Cart Server CLOSED: ');
			});

		}).listen(server_port, server_ip);
		console.log('IPC:Cart Server listening on:' + server_ip +':'+ server_port);

		// Only start the client if the Cloud's Server IP address is set
		if (client_ip != '') {
			client = new net.Socket();
			
			client.connect(client_port, client_ip, function() {
				console.log('IPC:Cart Client talking on:' + client_ip + ':' + client_port);
			});
			
			// Add a 'data' event handler for the client socket
			// data is what the server sent to this socket
			client.on('data', function(data) {
			    cart_client_receiver(data);
			});

			// Add a 'close' event handler for the client socket
			client.on('close', function() {
				console.log('IPC:Cart Client closed');
			});

			client.on('error', function (err) {
				console.log("!IPC: CLIENT CONNECT ERROR:"+err);
				client=undefined;
			});

		}
	}
}

function cart_server_receiver(sock,data) {
	console.log('IPC:Cart Server RECEIVE(' + sock.remoteAddress + ')=' + data);

	var reply='';
	// process the cloud client requests
	if (data == "cart_status:follow=on;") {
		goto_state('S_FollowStart');
		reply="re_card_status:status=ack;";
	} else if (data == "cart_status:follow=off;") {
		goto_state('S_FollowStop');
		reply="re_card_status:status=ack;";
	} else {
		// TBD
		reply='You said "' + data + '"';
	}
	
	console.log('IPC:Cart Server SEND(' + reply);
	return reply;
}

function cart_client_sender(data) {
	if (client_ip != '' && client!=undefined) {
		console.log('IPC:Cart Client SEND(' + data);
	    client.write(data);
	}
}

function cart_client_receiver(data) {
	if (client_ip != '') {
		console.log('IPC:Cart Client RECEIVE(' + data);
	}

	data=String(data);
	if (0 == data.indexOf("re_upc_lookup:")) {
		data=data.slice(14).replace(';','');
		var i;
		var param_list = data.split(",");
		upc_name='';
		for (i=0;i<param_list.length;i++) {
			if (0 == param_list[i].indexOf('name=')) {
				upc_name=param_list[i].slice(5);
			}
			if (0 == param_list[i].indexOf('price=')) {
				upc_price=Number(param_list[i].slice(6));
			}
			if (0 == param_list[i].indexOf('weight=')) {
				upc_weight=Number(param_list[i].slice(7));
			}
		}
		upc_ready=true;
	} else 	if (0 == data.indexOf("re_upc_lookup:status=nak,message=not found")) {
		upc_name=undefined;
		upc_price=0.0;
		upc_weight=0.0;
		upc_ready=true;
	}
	
}

function fetch_UCP(upc_lookup) {
	if (verbose)
		console.log("fetch_UCP("+upc_number+")");

	if (!enable_cloud) {
		// immediate reply for simulation
		if (upc_lookup == '760557824961') { // microSD
			upc_name='microSD';
			upc_price=7.45;
			upc_weight=0.2;
			upc_ready=true;
		} else if (upc_lookup == '941047822994') { // ROM cherry chocolate
			upc_name='ROM Cherry';
			upc_price=2.21;
			upc_weight=0.3;
			upc_ready=true;
		} else if (upc_lookup == '2839903352') {  // GUM Toothbrush
			upc_name='GUM Toothbrush';
			upc_price=5.62;
			upc_weight=0.4;
			upc_ready=true;
		} if (upc_lookup == '7094212457') {  // Gund plush penguin
			upc_name='Gund plush penguin';
			upc_price=12.88;
			upc_weight=0.77;
			upc_ready=true;
		} else {
			upc_name='Something else';
			upc_price=9.99;
			upc_weight=0.09;
			upc_ready=true;
		}
	} else {
		cart_client_sender("upc_lookup:upc="+upc_number+";");
	}
}

function icp_stop() {
	if (enable_ipc == true) {
		// server.destroy();
		if (client_ip != '' && client!=undefined) {
			client.destroy();
		}
	}
}

///////////////////////////////////////////////
// State Handler Functions

var first_init=true;
function S_Init_loop() {
	// Give another few seconds for things to start up
	if (first_init) {
		setTimeout(S_Init_continue,2000);
		first_init=false;
	}
	set_mood("MOOD_READY");
}
function S_Init_continue() {
	// Give another few seconds for things to finish up
	goto_state('S_ReadyHome');
}

function S_Follow_Start_enter() {
	set_led('on');
	set_mood("MOOD_FOLLOW");
	goto_state('S_Follow_Weight');
	cart_client_sender("cart_status:follow=on;");
	return false;
}

function S_Follow_Sensor_loop() {
	state = find_state('S_Follow_Weight');
	state_array[state].display_1=cur_direction_string;
	disp_state(next_state);
	return true; 
}

function S_Follow_Stop_enter() {
	set_led('off');
	set_mood("MOOD_READY");
	goto_state('S_ReadyHome');
	cart_client_sender("cart_status:follow=off;");
	return false;
}

function S_Follow_Weight_enter() {
	state = find_state('S_Follow_Weight');
	state_array[state].display_1='Cart'+format_float(disp_weight)+' lb '; 
	return true;
}

function S_Follow_Price_enter() {
	state = find_state('S_Follow_Price');
	state_array[state].display_1='Cart  $'+format_float(disp_cost)+' '; 
	return true;
}

function S_ScanReady_loop() {
	if (scanner_input != "") {
		goto_state('S_ScanFetch');
	}
	return true;
}

function S_ScanFetch_enter() {
	upc_number=scanner_input;
	scanner_input=""
	upc_ready = false;
	fetch_UCP(upc_number);
}

function S_ScanFetch_loop() {
	if (upc_ready) {
		if (upc_name == undefined) {
			goto_state('S_ScanMissing');
			return false;
		} else {
			goto_state('S_ScanAccept');
			return false;
		}
	}
	return true;
}

function S_ScanAccept_enter() {
	state = find_state('S_ScanAccept');
	state_array[state].display_1='Scan  $'+format_float(upc_price)+' ';
	return true;
}

function S_ScanAdd_enter() {
	disp_cost += upc_price;
	disp_weight += upc_weight;
	goto_state('S_Follow_Price');
	return false;
}

function S_ScanDel_enter() {
	disp_cost -= upc_price;
	if (disp_cost < 0.0) {
		disp_cost=0.0;
	}
	goto_state('S_Follow_Price');
	return false;
}

function S_TestAnalog_loop() {
	state = find_state('S_TestAnalog');
	state_array[state].display_2=format_int(a1,3)+format_int(a2,4)+format_int(a3,4)+format_int(a4,4);
	// display the new state
	disp_state(next_state);
}

var test_mood="MOOD_READY";
var prev_mood="MOOD_READY";
function S_TestMood_Init_enter() {
	test_mood="MOOD_READY";
	prev_mood=current_mood;
	goto_state('S_TestMood');
	return false;
}

function S_TestMood_enter() {
	state = find_state('S_TestMood');
	if (test_mood == "MOOD_READY") {
		state_array[state].display_1= 'Mood       READY';
	}
	if (test_mood == "MOOD_FOLLOW") {
		state_array[state].display_1= 'Mood      FOLLOW';
	}
	if (test_mood == "MOOD_LOOKING") {
		state_array[state].display_1= 'Mood     LOOKING';
	}
	if (test_mood == "MOOD_LOST") {
		state_array[state].display_1= 'Mood        LOST';
	}
	return true;
}

function S_TestMood_exit() {
	current_mood='';
	set_mood(prev_mood);
}

function S_TestMood_Play_enter() {
	current_mood='';
	if (test_mood == "MOOD_READY") {
		set_mood('MOOD_READY');
	}
	if (test_mood == "MOOD_FOLLOW") {
		set_mood('MOOD_FOLLOW');
	}
	if (test_mood == "MOOD_LOOKING") {
		set_mood('MOOD_LOOKING');
	}
	if (test_mood == "MOOD_LOST") {
		set_mood('MOOD_LOST');
	}
	goto_state('S_TestMood');
	return false;
}

function S_TestMood_Next_enter() {
	if (test_mood == "MOOD_READY") {
		test_mood = "MOOD_FOLLOW"
	} else if (test_mood == "MOOD_FOLLOW") {
		test_mood = "MOOD_LOOKING"
	} else if (test_mood == "MOOD_LOOKING") {
		test_mood = "MOOD_LOST"
	} else if (test_mood == "MOOD_LOST") {
		test_mood = "MOOD_READY"
	}
	goto_state('S_TestMood');
	return false;
}


function S_TestMotorL_exit() {
	MotorL_control('Off');
}

function S_TestMotorLFwd_enter() {
	MotorL_control('Fwd');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorLBck_enter() {
	MotorL_control('Bck');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorLOff_enter() {
	MotorL_control('Off');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorR_exit() {
	MotorR_control('Off');
}

function S_TestMotorRFwd_enter() {
	MotorR_control('Fwd');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestMotorRBck_enter() {
	MotorR_control('Bck');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestMotorROff_enter() {
	MotorR_control('Off');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestBeepOff_exit() {
	beeper_control("Off");
}

function S_TestBeepOn_enter() {
	play_buzzer('SONG_POWER_UP');
	goto_state('S_TestBeeper');
	return false;
}

function S_TestBeepOff_enter() {
	beeper_control("Off");
	goto_state('S_TestBeeper');
	return false;
}

///////////////////////////////////////////////
// State Table

var No_State="None";
var STATE_NOP="Nop";

// Constructor
function StateGUI(state_name,flags,display_1,display_2,k1,k2,k3,k4,state_enter,state_loop,state_exit) {
	this.state_name = state_name;
	this.state_flags = flags;
	this.display_1 = display_1;
	this.display_2 = display_2;
	this.k1 = k1;
	this.k2 = k2;
	this.k3 = k3;
	this.k4 = k4;
	this.state_enter = state_enter;
	this.state_loop   = state_loop;
	this.state_exit = state_exit;
}

StateGUI.prototype.getName = function() { return this.state_name; };

// export the class
module.exports = StateGUI;


// State Array

state_array = [];

state_array.push(new StateGUI('S_Init',0,
 'Follow Me Cart! ',
 '  Init...       ',
 'S_ReadyHome','S_ReadyHome','S_ReadyHome','S_ReadyHome',
 No_State,S_Init_loop,No_State));

state_array.push(new StateGUI('S_Shutdown',0,
 'Follow Me Cart! ',
 '  Bye...        ',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP,
 No_State,No_State,No_State));

// Follow!

state_array.push(new StateGUI('S_ReadyHome',0,
 'MyCart!         ',
 'Go    Setup Test',
 'S_FollowStart','S_SetupHome','S_TestHome',STATE_NOP, 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_FollowStart',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP,
 S_Follow_Start_enter,No_State,No_State));

state_array.push(new StateGUI('S_FollowStop',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP,
 S_Follow_Stop_enter,No_State,No_State));

state_array.push(new StateGUI('S_Follow_Weight',0,
 'Cart  123.45 lb ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Price', 
 S_Follow_Weight_enter,S_Follow_Sensor_loop,No_State));

state_array.push(new StateGUI('S_Follow_Price',0,
 'Cart    $123.45 ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Weight', 
 S_Follow_Price_enter,No_State,No_State));

// Scan!

state_array.push(new StateGUI('S_ScanReady',0,
 'Ready to Scan...',
 'Cancel          ',
 'S_Follow_Weight',STATE_NOP,STATE_NOP,'S_Follow_Weight', 
 S_ScanReady_loop,S_ScanReady_loop,No_State));

state_array.push(new StateGUI('S_ScanFetch',0,
 'Fetching info...',
 'Cancel          ',
 'S_Follow_Weight',STATE_NOP,STATE_NOP,'S_Follow_Weight', 
 S_ScanFetch_enter,S_ScanFetch_loop,No_State));

state_array.push(new StateGUI('S_ScanAccept',0,
 'Scan    $123.45 ',
 'Add   Del       ',
 'S_ScanAdd','S_ScanDel',STATE_NOP,'S_Follow_Weight', 
 S_ScanAccept_enter,No_State,No_State));

state_array.push(new StateGUI('S_ScanAdd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_ScanAdd_enter,No_State,No_State));

state_array.push(new StateGUI('S_ScanDel',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_ScanDel_enter,No_State,No_State));

state_array.push(new StateGUI('S_ScanMissing',0,
 'Item not found  ',
 'Rescan      Quit',
 'S_ScanReady',STATE_NOP,'S_Follow_Weight','S_Follow_Weight', 
 No_State,No_State,No_State));

// Help!

state_array.push(new StateGUI('S_HelpSend',0,
 'Help sending... ',
 '            Quit',
 STATE_NOP,STATE_NOP,'S_Follow_Weight','S_Follow_Weight', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_HelpSent',0,
 'Help call sent! ',
 '            Quit',
 STATE_NOP,STATE_NOP,'S_Follow_Weight','S_Follow_Weight', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_HelpLost',0,
 'Help not received',
 'Resend      Quit ',
 'S_ScanMissing',STATE_NOP,'S_Follow_Weight','S_Follow_Weight', 
 No_State,No_State,No_State));


// Setup!

state_array.push(new StateGUI('S_SetupHome',0,
 'Setup           ',
 'Dev   Cloud Quit',
 'S_SetupTgtIP','S_SetupHstEnb','S_ReadyHome','S_SetupHome', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_SetupTgtIP',0,
 'Target IP Addr  ',
 '123.123.123.123 ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_SetupHome', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_SetupHstEnb',0,
 'Server  Disabled',
 'Enable          ',
 'S_SetupHstDis',STATE_NOP,STATE_NOP,'S_SetupHstIP', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_SetupHstDis',0,
 'Server  Enabled!',
 'Disable         ',
 'S_SetupHstEnb',STATE_NOP,STATE_NOP,'S_SetupHstIP', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_SetupHstIP',0,
 'Server  IP Addr ',
 '123.123.123.123 ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_SetupHome', 
 No_State,No_State,No_State));

// Test!

state_array.push(new StateGUI('S_TestHome',0,
 'Test            ',
 'In    Out  Quit ',
 'S_TestAnalog','S_TestMotorL','S_ReadyHome','S_ReadyHome', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_TestAnalog',0,
 'Inputs  Analog  ',
 '123 123 123 123 ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_TestInputs', 
 No_State,S_TestAnalog_loop,No_State));

state_array.push(new StateGUI('S_TestInputs',0,
 'Inputs  L R F B ',
 'n n n n n n n n ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_TestMoodInit', 
 No_State,No_State,No_State));

// Test Moods

state_array.push(new StateGUI('S_TestMoodInit',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMood_Init_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMood',0,
 'Mood      READY ',
 'Play  Next      ',
 'S_TestMoodPlay','S_TestMoodNext',STATE_NOP,'S_TestMotorL', 
 S_TestMood_enter,No_State,S_TestMood_exit));

state_array.push(new StateGUI('S_TestMoodPlay',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMood_Play_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMoodNext',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMood_Next_enter,No_State,No_State));



// Test Motors

// MotorL

state_array.push(new StateGUI('S_TestMotorL',0,
 'Outputs  MotorL ',
 'Fwd   Back  Stop',
 'S_TestMotorLFwd','S_TestMotorLBck','S_TestMotorLOff','S_TestMotorR', 
 No_State,No_State,S_TestMotorL_exit));

state_array.push(new StateGUI('S_TestMotorLFwd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLFwd_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorLBck',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLBck_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorLOff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLOff_enter,No_State,No_State));

// MotorR

state_array.push(new StateGUI('S_TestMotorR',0,
 'Outputs  MotorR ',
 'Fwd   Back  Stop',
 'S_TestMotorRFwd','S_TestMotorRBck','S_TestMotorROff','S_TestBeeper', 
 No_State,No_State,S_TestMotorR_exit));

state_array.push(new StateGUI('S_TestMotorRFwd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorRFwd_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorRBck',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorRBck_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorROff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorROff_enter,No_State,No_State));

// Test Beeper

state_array.push(new StateGUI('S_TestBeeper',0,
 'Outputs  Beeper ',
 'On    Off       ',
 'S_TestBeepOn','S_TestBeepOff',STATE_NOP,'S_TestHome', 
 No_State,No_State,S_TestBeepOff_exit));

state_array.push(new StateGUI('S_TestBeepOn',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestBeepOn_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestBeepOff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestBeepOff_enter,No_State,No_State));


///////////////////////////////////////////////
// State Routines

function disp_state(next_state) {
	if (verbose) {
		console.log('');
		console.log('/----------------\\'+' Mood='+current_mood);
		console.log('|'+state_array[next_state].display_1+'| Beeper=' + beeper + ', Scanner='+scanner_input);
		console.log('|'+state_array[next_state].display_2+'| Motors='+motorL+' '+motorR);
		console.log('\\--1----2----3---/');
		console.log(' 1:'+state_array[next_state].k1+',2:'+state_array[next_state].k2+
		            ',3:'+state_array[next_state].k3+',Next:'+state_array[next_state].k4);
	}

	if (enable_io == true) {
		// Add text to screen
		lcd.cursor(0, 0).print(state_array[next_state].display_1);
		lcd.cursor(1, 0).print(state_array[next_state].display_2);
	}
}


function find_state(select_state) {
	var i;
	for (i=0;i<state_array.length;i++) {
		if (select_state == state_array[i].state_name)
			return i;
	}
	return No_State;
}

function goto_state(select_state_name) {
	// skip if next state is NOP
	if (select_state_name == STATE_NOP)
		return;
	
	// Find state
	next_state=find_state(select_state_name);
	if (next_state == No_State) {
		console.log('');
		console.log('ERROR: Could not find state '+select_state_name);
		console.log('');
		return;
	}

	// execute any state epilog function
	if (state_array[state_now].state_exit != No_State) {
		state_array[state_now].state_exit();
	}
	
	// assert new state
	state_now = next_state;

	// execute any state prolog function
	if (state_array[state_now].state_enter != No_State) {
		if (!state_array[state_now].state_enter()) {
			return;
		}
	}
	
	// display the new state
	disp_state(next_state);
}

///////////////////////////////////////////////
// Setup Mode

function setup_init() {
	input_state="setup";

	// read any parameters, any mix of dashes and spaces
	process.argv.forEach(function (val, index, array) {
		// skip the 'node app.js' parameters
 		if (index >= 2) {
			var i;
			
			if (val.indexOf('--server=') == 0) {
				server_port=val.slice(9);
				enable_ipc=true;
			} else if (val.indexOf('--client=') == 0) {
				val=val.slice(9);
				var j = val.indexOf(':');
				if (0 < j) {
					client_ip=val.slice(0,j);
					client_port=val.slice(j+1);
					enable_ipc=true;
					enable_cloud =true;
				}
			} else {
				// key configure commands
				for (i=0; i<val.length;i++) {
					var c = val.charAt(i);
					if (c != '-')
						config_cmnd(val.charAt(i))
				}
			}
		}
	});
	console.log("IPC:"+server_port+','+client_ip+','+client_port);

	// Show menu if we are still in setup mode
	if (input_state == "setup")
		setup_display();
}

function usage_enabled(selected) {
	if (selected)
		return '[x]';
	else
		return '[ ]';
}

function setup_display() {
	console.log("syntax { onboard_gui.py [0..8,v,g]");
	console.log(" i : "+usage_enabled(enable_io     )+" I/O (LCD,Buttons,LED)");
	console.log(" b : "+usage_enabled(enable_buzzer )+" Buzzer");
	console.log(" p : "+usage_enabled(enable_ipc    )+" IPC");
	console.log(" c : "+usage_enabled(enable_cloud  )+" Cloud");
	console.log(" s : "+usage_enabled(enable_scanner)+" Scanner");
	console.log(" v : "+usage_enabled(verbose       )+" Verbose display on console");
	console.log(" -------------------------");
	console.log(" a : all hardware on/off");
	console.log(" A : all features on");
	console.log(" g : Go!");
	console.log(" q : Quit");
}

function config_cmnd(key) {
	if (key == 'i')
		enable_io = !enable_io;
	if (key == 'b')
		enable_buzzer = !enable_buzzer;
	if (key == 'p')
		enable_ipc = !enable_ipc;
	if (key == 'c')
		enable_cloud = !enable_cloud;
	if (key == 's') 
		enable_scanner = !enable_scanner;
	if (key == 'v') 
		verbose = !verbose;

	if (key == 'a') {
		// toggle all based on enable_io's current value
		enable_io      = !enable_io;
		enable_buzzer  =  enable_io;
		enable_cloud   =  enable_io;
		enable_scanner =  enable_io;
	}
	if (key == 'A') {
		// turn all on
		enable_io      = true;
		enable_buzzer  = true;
		enable_cloud   = true;
		enable_scanner = true;
	}
	if (key == 'g') {
		run_init();
		return;
	}

	// ctrl-c ( end of text )
	if ( key === '\u0003' )
		process.exit();
	if (key == 'q') 
		process.exit();

	// display current setting (if we get here)		
	setup_display();

}

//////////////////////////////////////////////////
// Run Mode

var mraa = require('mraa');

function run_init() {
	input_state="run";
	run_usage();
	
	if (enable_io || enable_motors || enable_buzzer)
		enable_board=true;

	if (enable_board) {
		five = require("johnny-five");
		var Edison = require("edison-io");
		board = new five.Board({
		  io: new Edison()
		});

		board.on("ready", function() {
			init_board();
			init_ipc();
			goto_state('S_Init');
			play_buzzer('SONG_POWER_UP');
			console.log('MRAA Version: ' + mraa.getVersion()); //write the mraa version to the Intel XDK console
			var distanceSensor = new DistanceSensor(0,1);
			setInterval(function()
			{
				var distance = distanceSensor.distance();
				var spread = distanceSensor.spread();
				//console.log("Motor control (" + distance + ", " + spread + "):");
				if( -10 < spread && spread < 10 &&
					-50 < distance && distance < 50 )
				{
					cur_direction_string = "Waiting . . . . ";
					return;
				}
				if( spread < -100 )
				{
					cur_direction_string = "Left    ";
				}
				else if( spread > 100 )
				{
					cur_direction_string = "Right   ";
				}
				else
				{
					cur_direction_string = "Straight";
				}
				if( distance > 1200 )
				{
					cur_direction_string += " stop.  ";
				}
				else if( distance > 600 )
				{
					cur_direction_string += " slow.  ";
				}
				else
				{
					cur_direction_string += " fast.  ";
				}
			}, 1000);
		});
	} else {
		init_ipc();
		goto_state('S_Init');
	}
  	
}

function run_usage() {
	console.log("");
	console.log("=== Simulation Keyboard Commands ===");
	console.log("Keys: 1,2,3,4");
	console.log("UPCs: a,b,c,d");
	console.log("Help: ?");
	console.log("Quit: q");
	console.log("");
}

function run_cmnd(key) {

	// ctrl-c ( end of text )
	if ( key === '\u0003' )
		on_exit();
	if ( key === 'q' )
		on_exit();

	// simlation for buttons
	if (key == '1') 
		goto_state(state_array[state_now].k1)
	if (key == '2')
		goto_state(state_array[state_now].k2)
	if (key == '3')
		goto_state(state_array[state_now].k3)
	if (key == '4')
		goto_state(state_array[state_now].k4)

	// refresh display
	if (key == ' ') 
		disp_state(state_now);

	// simlation for scanner
	if (key == 'a')
		scanner_input="760557824961"; // microSD
	if (key == 'b')
		scanner_input="941047822994"; // ROM cherry chocolate
	if (key == 'c')
		scanner_input="2839903352";   // GUM Toothbrush
	if (key == 'd')
		scanner_input="7094212457";   // Gund plush penguin
}

function run_loop() {

	// execute any state loop function
	if (state_array[state_now].state_loop != No_State) {
		state_array[state_now].state_loop();
	}
	
	// poll scanner
	scan_scanner();
	if (('S_ScanReady' != state_array[state_now].state_name) && (scanner_input != "")) {
		// direct to scan fetch
		goto_state('S_ScanReady');
	}
}


//////////////////////////////////////////////////
// main()

function on_exit() {

	// Stop LCD
	goto_state('S_Shutdown');
	set_led('off');

	// Stop motors
	
	// Stop buzzer
	play_buzzer('SONG_POWER_DOWN');
	
	// Stop Cloud
	icp_stop();

	// Give another few seconds for things to finish up
	setTimeout(final_exit,2000);
}

function final_exit() {
	// Now we can safely exit
	process.exit();
}

// on any data into stdin
stdin.on( 'data', function( key ){
	if (input_state=="setup") {
		config_cmnd(key);
	} else {
		run_cmnd(key);
	}
});

var busywait=0;
function fmc_loop() {

	if (input_state=="setup") {
		// only waiting for keyboard commands
	} else {
		run_loop();
	}
	
	busywait += 1;
	if (busywait == 1)  process.stdout.write("|\b" );
	if (busywait == 2)  process.stdout.write("/\b" );
	if (busywait == 3)  process.stdout.write("-\b" );
	if (busywait == 4)  process.stdout.write("\\\b" );
	if (busywait == 5)  process.stdout.write("|\b" );
	if (busywait == 6)  process.stdout.write("/\b" );
	if (busywait == 7)  process.stdout.write("-\b" );
	if (busywait == 8) {process.stdout.write("\\\b" ); busywait=0;}

}

// Start the GUI
setup_init();

// Scan the non-event I/O every 1/4 second
setInterval(fmc_loop, 250);





