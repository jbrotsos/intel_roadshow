///////////////////////////////////////////////
// onboard_gui.js : target GUI state machine for Follow-Me Cart
//
// This application does the following:
//   * Runs tje Follow-Me Cart state machine on the target
//   * Manages the LCD display and Buttons standalone user interface
//   * Manages a UPC scanner
//   * Manages a Cloud service connection
//   * Interfaces with the motor control
//   * Supports simluation modes for devel/debug
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

var BUTTON_1_PORT=13;
var BUTTON_2_PORT=12;
var BUTTON_3_PORT=11; //6;
var BUTTON_4_PORT=10; //7;

var LED_1_PORT=2
var BUZZER_1_PORT=3

const BUZZER_AS_LED = 1;
const BUZZER_AS_UMP = 2;
var buzzer_mode = BUZZER_AS_UMP;

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
var state_follow_on=false;

var enable_io     = false;
var enable_sonor  = false;
var enable_motors = false;
var enable_buzzer = false;
var enable_ipc    = false;
var enable_cloud  = false;
var enable_scanner= false;
var enable_board  = false;
var show_tracking = false;
var verbose       = true;

var disp_weight = 0.0;
var disp_cost = 0.0;
var disp_message='';

var sonor = require('./sonor.js');
var motor = require('./motor.js');

// external values

var beeper="Off";
var motorL="Off";
var motorR="Off";

var a1=0;
var a2=0;
var a3=0;
var a4=0;

// scanner

const SCANNER_AS_SPAWN = 1;
const SCANNER_AS_FILE = 2;
var scanner_mode = SCANNER_AS_SPAWN;
var spawn_scanner=undefined;
var scanner_agent=undefined;

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

function Socket_Debug_Rec() {
    this.remoteAddress = function() {
    	return 'localhost';
    }
}
var socket_debug = new Socket_Debug_Rec();

// UPC Object Constructor

function UPC_Entry(upc,name,price,weight,message) {
	this.upc = upc;
	this.name = name;
	this.price = price;
	this.weight = weight;
	this.message = message;
};

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

// format integer to '%<n>s'
function format_str(s,n) {
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
			buzzer_play('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k1)
		});
		button2.on("release", function() {
			if (verbose)
				console.log("BUTTON_2 Pressed!");
			buzzer_play('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k2)
		});
		button3.on("release", function() {
			if (verbose)
				console.log("BUTTON_3 Pressed!");
			buzzer_play('SONG_KEY_PRESS');
			goto_state(state_array[state_now].k3)
		});
		button4.on("release", function() {
			if (verbose)
				console.log("BUTTON_4 Pressed!");
			buzzer_play('SONG_KEY_PRESS');
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

function buzzer_off() {
	if (enable_io == true) {
		// Quite buzzer by setting to input port
		new five.Button(BUZZER_1_PORT);
	}
}

var chordIndex = 0;
var chords = [];

function melody_play() {
	chordIndex = 0;
	melody_loop()
}

function melody_loop()
{
	if (chords.length != 0)
	{
		if (chords[chordIndex])
			console.log( buzzer.playSound(chords[chordIndex], 200000) );
		chordIndex++;
		// set timer for next note if any
		if (chordIndex <= chords.length - 1)
			setTimeout(melody_loop, 100);
	}
}

function buzzer_play(sound) {

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

		if (sound == "SONG_OFF") {
			buzzer.off();
		}
	}

	if (buzzer_mode == BUZZER_AS_UMP) {
		// Available Notes: upmBuzzer.DO,upmBuzzer.RE,upmBuzzer.MI,upmBuzzer.FA
		//                  upmBuzzer.SOL,upmBuzzer.LA,upmBuzzer.SI


		if (sound == "SONG_POWER_UP") {
			chords = [];
			chords.push(upmBuzzer.DO);
			chords.push(upmBuzzer.MI);
			chords.push(upmBuzzer.SOL);
			melody_play();
		}

		if (sound == "SONG_POWER_DOWN") {
			chords = [];
			chords.push(upmBuzzer.SOL);
			chords.push(upmBuzzer.MI);
			chords.push(upmBuzzer.DO);
			melody_play();
		}

		if (sound == "SONG_FOLLOWING") {
			chords = [];
			chords.push(upmBuzzer.DO);
			chords.push(upmBuzzer.MI);
			melody_play();
		}

		if (sound == "SONG_WAITING") {
			chords = [];
			chords.push(upmBuzzer.MI);
			chords.push(upmBuzzer.DO);
			melody_play();
		}

		if (sound == "SONG_OK") {
			chords = [];
			chords.push(upmBuzzer.MI);
			chords.push(upmBuzzer.SOL);
			melody_play();
		}

		if (sound == "SONG_KEY_PRESS") {
			chords = [];
			chords.push(upmBuzzer.MI);
			melody_play();
		}

		if (sound == "SONG_HELP") {
			chords = [];
			chords.push(upmBuzzer.SI);
			chords.push(upmBuzzer.MI);
			chords.push(upmBuzzer.SI);
			melody_play();
		}

		if (sound == "SONG_OFF") {
			chords = [];
			melody_play();
		}
	}
}

var current_mood='';
function mood_set(mood) {
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
	    buzzer_play("SONG_FOLLOWING");
	}
	if (mood == "MOOD_LOOKING") {
	    set_lcd_backlight(200, 200, 0);
	    // no sound
	}
	if (mood == "MOOD_LOST") {
	    set_lcd_backlight(250, 50, 50);
	    buzzer_play("SONG_HELP");
	}
}


function led_set(value) {
	if (verbose)
		console.log("LED Set:"+value);
		
	if (!enable_io)
		return
	
	if (value == 'on')
		led1.on();
	else
    	led1.off();
}


///////////////////////////////////////////////
// Scanner Handler Functions

function init_scanner() {
	if (enable_scanner == true) {

		// Are we using a file to sync wiht the scanner input?
		if (scanner_mode == SCANNER_AS_SPAWN) {
			spawn_scanner = require('child_process').spawn,
				scanner_agent = spawn_scanner('python', ['scanner_agent.py']);

			scanner_agent.stdout.on('data', function (data) {
				// NOTE: This does _not_ seem to capture STDOUT
				data = String(data);
				console.log('SCANNER_SPAWN:' + data);
				if (0 == data.indexOf('SCANNER_READ:')) {
					scanner_input=data.slice(13);
				}
			});

			scanner_agent.stderr.on('data', function (data) {
				// NOTE: This _does_ capture STDERR
				data = String(data);
				console.log('SCANNER_SPAWN_ERROR:' + data);
				if (0 == data.indexOf('SCANNER_READ:')) {
					scanner_input=data.slice(13);
				}
			});

			scanner_agent.on('close', function (code) {
				console.log('SCANNER_SPAWN_CLOSE.');
			});
		}
	}
}

function close_scanner() {
	if (enable_scanner == true) {
		if (scanner_mode == SCANNER_AS_SPAWN) {
			scanner_agent.kill('SIGHUP');
		}
	}
}

var scanner_share_file='/tmp/barcode.txt';
var fs = require('fs')
var in_scanner_code=false;
function scan_scanner() {

	// Are we using a file to sync wiht the scanner input?
	if (scanner_mode!=SCANNER_AS_FILE) return;

	if (!in_scanner_code) {
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
}

///////////////////////////////////////////////
// Shopping cart Functions

function shop_upc_add(upc) {
	disp_weight += upc.weight;
	disp_cost += upc.price;

	// trigger the appropriate display updates	
	if (state_now == find_state('S_Follow_Price')) 
		goto_state('S_Follow_Price');
	if (state_now == find_state('S_Follow_Weight'))
		goto_state('S_Follow_Weight');
}

function shop_upc_del(upc) {
	disp_weight -= upc.weight;
	if (disp_weight < 0.0) disp_weight = 0.0 
	disp_cost -= upc.price;
	if (disp_cost < 0.0) disp_cost = 0.0 

	// trigger the appropriate display updates	
	if (state_now == find_state('S_Follow_Price')) 
		goto_state('S_Follow_Price');
	if (state_now == find_state('S_Follow_Weight'))
		goto_state('S_Follow_Weight');
}

function shop_clear(upc) {
	disp_weight = 0.0;
	disp_cost = 0.0;
}

function shop_list(upc) {
	// TBD
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

var rec=undefined;
function server_rec_parse(data) {
	rec=[];
	var i;
	var arr = data.split(",");
	for(i=0;i<arr.length;i++) {
		var val=arr[i];
		var name='';
		var value='';
		var j = val.indexOf('=');
		if (0 < j) {
			name=val.slice(0,j);
			value=val.slice(j+1);
		} else {
			name=value;
		}
		rec[name]=value;
	}
	return rec;
}

function parse_rec_to_upc(rec) {
	upc = new UPC_Entry(0,'',0.0,0.0,'');
	if (rec['upc']!=undefined) upc.upc=rec['upc'];
	if (rec['name']!=undefined) upc.name=rec['name'];
	if (rec['weight']!=undefined) upc.weight=Number(rec['weight']);
	if (rec['price']!=undefined) upc.price=Number(rec['price']);
	if (rec['message']!=undefined) upc.message=rec['message'];
	return upc;	
}

// "cust_alert:message=SALE! Aisle 4;"
function customer_alert(message) {
	disp_message=message.replace('message=','');
	goto_state('S_Alert');
}

function cart_server_receiver(sock,data) {
	console.log('IPC:Cart Server RECEIVE(' + sock.remoteAddress + ')=' + data);
	data = String(data).replace(';','');
	
	var reply='';
	// process the cloud client requests
	if (data == "cart_status:follow=on") {
		goto_state('S_FollowStart');
		reply="re_card_status:status=ack;";
	} else if (data == "cart_status:follow=off") {
		goto_state('S_FollowStop');
		reply="re_card_status:status=ack;";
	} else if (0 == data.indexOf("cust_alert:")) {
		customer_alert(data.slice(11));
		reply="re_cust_alert:status=ack;";
	} else if (0 == data.indexOf("upc_add:")) {
		// "upc_add:upc=123456789,price=5.34,weight=1.23;"
		shop_upc_add(parse_rec_to_upc(server_rec_parse(data.slice(8))));
		reply="re_upc_add:status=ack;";
	} else if (0 == data.indexOf("upc_del:")) {
		// "upc_del:upc=123456789,price=5.34,weight=1.23;"
		shop_upc_del(parse_rec_to_upc(server_rec_parse(data.slice(8))));
		reply="re_upc_del:status=ack;";
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
	mood_set("MOOD_READY");
}
function S_Init_continue() {
	// Give another few seconds for things to finish up
	goto_state('S_ReadyHome');
}

// follow

function S_Follow_Start_enter() {
	if (!state_follow_on) {
		led_set('on');
		mood_set("MOOD_FOLLOW");
		cart_client_sender("cart_status:follow=on;");
		motor.motor_start();
		sonor.sonor_start();
		state_follow_on = true;
	}
	goto_state('S_Follow_Price');
}

function S_Follow_Sonar_loop() {
	state_array[state_now].display_1=sonor.sonor_display_loop();
	state_array[state_now].display_2=motor.motor_display_loop();
	disp_state();
	mood_set(sonor.sonor_mood_get());
}

function S_Follow_Stop_enter() {
	if (state_follow_on) {
		led_set('off');
		sonor.sonor_stop();
		motor.motor_stop();
		mood_set("MOOD_READY");
		cart_client_sender("cart_status:follow=off;");
		buzzer_play('SONG_WAITING');
		state_follow_on=false;
	}
	goto_state('S_ReadyHome');
}

function S_Follow_Weight_enter() {
	state = find_state('S_Follow_Weight');
	state_array[state].display_1='Cart'+format_float(disp_weight)+' lb '; 
}

function S_Follow_Price_enter() {
	state = find_state('S_Follow_Price');
	state_array[state].display_1='Cart  $'+format_float(disp_cost)+' '; 
}

// scan

function S_ScanReady_loop() {
	if (scanner_input != "") {
		goto_state('S_ScanFetch');
	}
}

function S_ScanFetch_enter() {
	upc_number=scanner_input;
	scanner_input=""
	upc_ready = false;
	fetch_UCP(upc_number);
	
	// check it instant (simulater) answer 
	S_ScanFetch_loop();
}

function S_ScanFetch_loop() {
	if (upc_ready) {
		if (upc_name == undefined) {
			goto_state('S_ScanMissing');
		} else {
			goto_state('S_ScanAccept');
		}
	}
}

function S_ScanAccept_enter() {
	state = find_state('S_ScanAccept');
	state_array[state].display_1='Scan  $'+format_float(upc_price)+' ';
}

function S_ScanAdd_enter() {
	disp_cost += upc_price;
	disp_weight += upc_weight;
	goto_state('S_Follow_Price');
}

function S_ScanDel_enter() {
	disp_cost -= upc_price;
	if (disp_cost < 0.0) {
		disp_cost=0.0;
	}
	goto_state('S_Follow_Price');
}

// alert

var banner_index=0;
var banner_timeout=500;
var banner_Interval=undefined;
function alert_banner_loop() {
	console.log("FOO3:alert_banner_loop");
	if      (0 == banner_index)  set_lcd_backlight(76, 0, 130);
	else if (1 == banner_index)  set_lcd_backlight(100, 255, 100);
	else if (1 == banner_index)  set_lcd_backlight(200, 200, 0);
	else if (1 == banner_index)  set_lcd_backlight(100, 255, 100);
	else if (1 == banner_index) {set_lcd_backlight(100, 100, 255); banner_index = -1;}
	banner_index+=1;	
}

function S_Alert_enter() {
	var my_state=state_now;
	S_Follow_Stop_enter();
	state_now=my_state;
	state_array[state_now].display_1=format_str(disp_message,16);
	disp_state();
	banner_index=0;
	banner_Interval=setInterval(alert_banner_loop, banner_timeout);
}

function S_Alert_exit() {
	clearInterval(banner_Interval);
}

// test analog

function S_TestAnalog_loop() {
	state = find_state('S_TestAnalog');
	state_array[state].display_2=format_int(a1,3)+format_int(a2,4)+format_int(a3,4)+format_int(a4,4);
	// display the new state
	disp_state();
}

function S_TestSonar_loop() {
	state_array[state_now].display_1=sonor.sonor_display_loop();
	disp_state();
}


var test_mood="MOOD_READY";
var prev_mood="MOOD_READY";
function S_TestMood_Init_enter() {
	test_mood="MOOD_READY";
	prev_mood=current_mood;
	goto_state('S_TestMood');
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
}

function S_TestMood_exit() {
	current_mood='';
	mood_set(prev_mood);
}

function S_TestMood_Play_enter() {
	current_mood='';
	if (test_mood == "MOOD_READY") {
		mood_set('MOOD_READY');
	}
	if (test_mood == "MOOD_FOLLOW") {
		mood_set('MOOD_FOLLOW');
	}
	if (test_mood == "MOOD_LOOKING") {
		mood_set('MOOD_LOOKING');
	}
	if (test_mood == "MOOD_LOST") {
		mood_set('MOOD_LOST');
	}
	goto_state('S_TestMood');
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
}

// Alert Message

// test motors

// action from sonor=W|{LRS}{PMF}=Wait|{Left|Right|Straight}{stoP|Medium|Fast}
var motor_test_index=0;
var motor_test_actions=['W','SP','SM','LM','LF','SF','RF','RM'];

function S_TestMotorsInit_enter() {
	motor_test_index=0;
	motor.motor_action(motor_test_actions[motor_test_index]);
	goto_state('S_TestMotors');
}

function S_TestMotors_enter() {
	state_array[state_now].display_1=motor.motor_display_loop();
}

function S_TestMotorsOn_enter() {
	motor.motor_start();
	motor.motor_action(motor_test_actions[motor_test_index]);
	goto_state('S_TestMotors');
}

function S_TestMotorsOff_enter() {
	motor.motor_stop();
	goto_state('S_TestMotors');
}

function S_TestMotorsNext_enter() {
	motor_test_index += 1;
	if (motor_test_index >= motor_test_actions.length)
		motor_test_index=0;
	motor.motor_action(motor_test_actions[motor_test_index]);
	goto_state('S_TestMotors');
}

function S_TestMotorsDone_enter() {
	motor.motor_stop();
	goto_state('S_TestBeeper');
}

// test beeper

function S_TestBeepOff_exit() {
	buzzer_play('SONG_OFF');
}

function S_TestBeepOn_enter() {
	buzzer_play('SONG_POWER_UP');
	goto_state('S_TestBeeper');
}

function S_TestBeepOff_enter() {
	buzzer_play('SONG_OFF');
	goto_state('S_TestBeeper');
}

///////////////////////////////////////////////
// State Table

var No_State="None";
var STATE_NOP="Nop";

// Constructor
function StateGUI(state_name,flags,display_1,display_2,k1,k2,k3,k4,state_enter,state_loop,state_exit) {
	this.state_name = state_name;	// String name of state
	this.state_flags = flags;		// Optional state flags
	this.display_1 = display_1; 	// Display string Line 1 (16 chars) (empty string for no change)
	this.display_2 = display_2; 	// Display string Line 2 (16 chars)
	this.k1 = k1;					// Key1 goto state name (Use <STATE_NOP> for no action)
	this.k2 = k2;					// Key2 goto state name
	this.k3 = k3;					// Key3 goto state name
	this.k4 = k4;					// Key4 goto state name
	this.state_enter = state_enter; // Callback on state entry (Use <No_State> for no action)
	this.state_loop  = state_loop;	// Callback on state loop
	this.state_exit  = state_exit;	// Callback on state exit
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

state_array.push(new StateGUI('S_Follow_Price',0,
 'Cart    $123.45 ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Weight', 
 S_Follow_Price_enter,No_State,No_State));

state_array.push(new StateGUI('S_Follow_Weight',0,
 'Cart  123.45 lb ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Sonor', 
 S_Follow_Weight_enter,No_State,No_State));

state_array.push(new StateGUI('S_Follow_Sonor',0,
 'Cart  123.45 lb ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Price', 
 S_Follow_Sonar_loop,S_Follow_Sonar_loop,No_State));

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

// alert

state_array.push(new StateGUI('S_Alert',0,
 'Alert message...',
 'Ok              ',
 'S_ReadyHome',STATE_NOP,STATE_NOP,'S_ReadyHome', 
 S_Alert_enter,No_State,S_Alert_exit));


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
 'S_TestAnalog','S_TestMotorsInit','S_ReadyHome','S_ReadyHome', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_TestAnalog',0,
 'Inputs  Analog  ',
 '123 123 123 123 ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_TestSonar', 
 No_State,S_TestAnalog_loop,No_State));

state_array.push(new StateGUI('S_TestSonar',0,
 'Sonor           ',
 'Next            ',
 'S_TestMoodInit',STATE_NOP,STATE_NOP,'S_TestMoodInit', 
 No_State,S_TestSonar_loop,No_State));

// Test Moods

state_array.push(new StateGUI('S_TestMoodInit',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMood_Init_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMood',0,
 'Mood      READY ',
 'Play  Next      ',
 'S_TestMoodPlay','S_TestMoodNext',STATE_NOP,'S_TestHome', 
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

state_array.push(new StateGUI('S_TestMotorsInit',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorsInit_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotors',0,
 'Motors:         ',
 'On    Off   Next',
 'S_TestMotorsOn','S_TestMotorsOff','S_TestMotorsNext','S_TestMotorsDone', 
 S_TestMotors_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorsOn',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorsOn_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorsOff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorsOff_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorsNext',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorsNext_enter,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorsDone',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorsDone_enter,No_State,No_State));


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

function disp_state() {
	if (verbose) {
		console.log('');
		console.log('/----------------\\'+' State='+state_array[state_now].state_name+',Mood='+current_mood);
		console.log('|'+state_array[state_now].display_1+'| Beeper=' + beeper + ', Scanner='+scanner_input);
		console.log('|'+state_array[state_now].display_2+'| Motors='+motorL+' '+motorR);
		console.log('\\--1----2----3---/   <4=Next>');
		console.log(' 1:'+state_array[state_now].k1+',2:'+state_array[next_state].k2+
		            ',3:'+state_array[state_now].k3+',Next:'+state_array[next_state].k4);
	}

	if (enable_io == true) {
		// Add text to screen
		lcd.cursor(0, 0).print(state_array[state_now].display_1);
		lcd.cursor(1, 0).print(state_array[state_now].display_2);
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
	var display_this_state=true;
	
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
		var expected_state=state_now;
		state_array[state_now].state_enter();
		// See if the callback changed the state
		if (state_now != expected_state) {
			display_this_state=false;
		}
	}
	
	// display the new state
	if (display_this_state)
		disp_state();
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
				val=val.slice(9);
				var j = val.indexOf(':');
				if (0 < j) {
					server_ip=val.slice(0,j);
					server_port=val.slice(j+1);
				} else {
					server_port=val;
				}
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
	console.log("syntax { onboard_gui.py [-ibpcvg] [--server=<port>] [--client=<ip>,<port>");
	console.log(" i : "+usage_enabled(enable_io     )+" I/O (LCD,Buttons,LED)");
	console.log(" b : "+usage_enabled(enable_buzzer )+" Buzzer");
	console.log(" o : "+usage_enabled(enable_sonor  )+" Sonar");
	console.log(" m : "+usage_enabled(enable_motors )+" Motors");
	console.log(" p : "+usage_enabled(enable_ipc    )+" IPC");
	console.log(" c : "+usage_enabled(enable_cloud  )+" Cloud");
	console.log(" s : "+usage_enabled(enable_scanner)+" Scanner");
	console.log(" v : "+usage_enabled(verbose       )+" Verbose display on console");
	show_tracking
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
	if (key == 'o')
		enable_sonor = !enable_sonor;
	if (key == 'm')
		enable_motors = !enable_motors;
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
		enable_sonor   =  enable_io;
		enable_motor   =  enable_io;
		enable_ipc     =  enable_io;
		enable_cloud   =  enable_io;
		enable_scanner =  enable_io;
	}
	if (key == 'A') {
		// turn all on
		enable_io      = true;
		enable_buzzer  = true;
		enable_sonor   = true;
		enable_motor   = true;
		enable_ipc     = true;
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

var mraa = undefined;

function run_init() {
	input_state="run";
	run_usage();
	
	if (enable_io || enable_sonor || enable_motors || enable_buzzer)
		enable_board=true;

	if (enable_board) {
		five = require("johnny-five");
		var Edison = require("edison-io");
		board = new five.Board({
		  io: new Edison()
		});

		board.on("ready", function() {
			mraa = require('mraa');

			init_board();
			init_ipc();
			init_scanner();
			goto_state('S_Init');
			buzzer_play('SONG_POWER_UP');

			if (enable_motors)
				motor.motor_init(mraa);
			if (enable_sonor)
				sonor.sonor_init(mraa,motor);

		});
	} else {
		init_ipc();
		init_scanner();
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
		disp_state();

	// simlation for sonor found/lost
	if (key == 'f')
		sonor.sonor_simulated_found_set(true);
	if (key == 'l')
		sonor.sonor_simulated_found_set(false);

	// simlation for scanner
	if (key == 'a')
		scanner_input="760557824961"; // microSD
	if (key == 'b')
		scanner_input="941047822994"; // ROM cherry chocolate
	if (key == 'c')
		scanner_input="2839903352";   // GUM Toothbrush
	if (key == 'd')
		scanner_input="7094212457";   // Gund plush penguin
	if (key == 'e')
		scanner_input="1234567890";   // Something or other
		
	// simulatioin for cloud commands
	if (key == '!')
		cart_server_receiver(socket_debug,"cust_alert:message=Hi there!;");
	if (key == 'z')
		cart_server_receiver(socket_debug,"upc_add:upc=123456789,price=5.34,weight=1.23;");
	if (key == 'x')
		cart_server_receiver(socket_debug,"upc_del:upc=123456789,price=5.34,weight=1.23;");
	
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
	mood_set("MOOD_READY");
	goto_state('S_Shutdown');
	led_set('off');

	// Stop motors
	if (enable_motors)
		motor.motor_shutdown();
	if (enable_sonor)
		sonor.sonor_shutdown();
	
	// Stop Scanner
	close_scanner();
	
	// Stop Cloud
	icp_stop();

	// Stop buzzer
	buzzer_play('SONG_POWER_DOWN');
	
	// Give another few seconds for things to finish up (e.g. buzzer song)
	setTimeout(final_exit,2000);
}

function final_exit() {
	// Now we can safely exit
	buzzer_off();
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
