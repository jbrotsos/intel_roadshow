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
//  $ node onboard_gui.js [parameters]
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

var BUTTON_1_PORT=3
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
var disp_cost = 7.49;

// external values

var beeper="Off";
var motorL="Off";
var motorR="Off";

var scanner_input="";
var upc_number = "";
var upc_price=0.0;
var upc_weight=0.0;

// server

var net = require('net');
var HOST = '127.0.0.1';
var PORT = 3490;

// UPC Object Constructor

function UPC_Entry(upc,name,price,weight) {
	this.upc = upc;
	this.name = name;
	this.price = price;
	this.weight = weight;
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
		lcd.cursor(0, 0).print("FMC");
		lcd.cursor(1, 0).print("Init!");

		// LED #1 = Grove Shield GPIO jack
		led1 = new five.Led(LED_1_PORT);

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

	if (enable_ipc == true) {

		// Create a server instance, and chain the listen function to it
		// The function passed to net.createServer() becomes the event handler for the 'connection' event
		// The sock object the callback function receives UNIQUE for each connection
		net.createServer(function(sock) {

			// We have a connection - a socket object is assigned to the connection automatically
			console.log('IPC CONNECTED: ' + sock.remoteAddress +':'+ sock.remotePort);

			// Add a 'data' event handler to this instance of socket
			sock.on('data', function(data) {
				console.log('IPC DATA(' + sock.remoteAddress + ')=' + data);
				// Write the data back to the socket, the client will receive it as data from the server
				sock.write('You said "' + data + '"');
			});

			// Add a 'close' event handler to this instance of socket
			sock.on('close', function(data) {
				console.log('IPC CLOSED: ');
			});

		}).listen(PORT, HOST);
		
		console.log('IPC Server listening on ' + HOST +':'+ PORT);
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

		if (sound == "SONG_FOLLOW_START") {
			buzzer.on();
			setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_FOLLOW_STOP") {
			buzzer.on();
			setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_OK") {
			buzzer.on();
			setTimeout(buzzer_stop,250);
		}

		if (sound == "SONG_KEY_PRESS") {
			buzzer.on();
			setTimeout(buzzer_stop,20);
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

		if (sound == "SONG_FOLLOW_START") {
			buzzer.playSound(upmBuzzer.DO, 100000);
			buzzer.playSound(upmBuzzer.MI, 100000);
		}

		if (sound == "SONG_FOLLOW_STOP") {
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
		
//TBD
function scan_scanner() {
	// no action yet
}
			
function fetch_UCP(upc_number) {
	if (verbose)
		console.log("fetch_UCP("+upc_number+")");
	
	upc=undefined;
	if (!enable_cloud) {
		if (upc_number == '760557824961') // microSD
			upc = new UPC_Entry('760557824961','microSD',7.45,0.2);
		if (upc_number == '941047822994') // ROM cherry chocolate
			upc = new UPC_Entry('941047822994','ROM Cherry',2.21,0.3);
		if (upc_number == '2839903352')   // GUM Toothbrush
			upc = new UPC_Entry('2839903352','GUM Toothbrush',5.62,0.4);
		if (upc_number == '7094212457')   // Gund plush penguin
			upc = new UPC_Entry('7094212457','Gund plush penguin',12.88,0.77);
	} else {
		//TBD
	}

	if (verbose)
		console.log("fetch_UCP="+upc.name+","+upc.price);
	
	return upc;
}

///////////////////////////////////////////////
// State Handler Functions

function S_Init_prolog() {
	if (verbose)
		console.log('Verbose:S_Init_prolog');
	return true;
}
	
function S_Init_loop() {
	if (verbose)
		console.log('Verbose:S_Init_loop');
	goto_state('S_ReadyHome');
	return false;
}

function S_Init_epilog() {
	if (verbose)
		console.log('Verbose:S_Init_epilog');
}

function S_Follow_Start_prolog() {
	set_led('on');
	play_buzzer('SONG_FOLLOW_START');
	goto_state('S_Follow_Weight');
	return false;
}

function S_Follow_Stop_prolog() {
	set_led('off');
	play_buzzer('SONG_FOLLOW_STOP');
	goto_state('S_ReadyHome');
	return false;
}

function S_Follow_Weight_prolog() {
	state = find_state('S_Follow_Weight');
	state_array[state].display_1='MC  '+format_float(disp_weight)+' lb '; 
	return true;
}

function S_Follow_Price_prolog() {
	state = find_state('S_Follow_Price');
	state_array[state].display_1='MC    $'+format_float(disp_cost)+' '; 
	return true;
}

function S_ScanReady_Loop() {
	if (scanner_input != "") {
		upc_number=scanner_input;
		scanner_input=""
		upc=fetch_UCP(upc_number);
		if (upc == undefined) {
			goto_state('S_ScanMissing');
			return false;
		}
		else {
			upc_price = upc.price;
			upc_weight = upc.weight;
			goto_state('S_ScanAccept');
			return false;
		}
	}
	return true;
}

function S_ScanAccept_Prolog() {
	state = find_state('S_ScanAccept');
	state_array[state].display_1='Scan  $'+format_float(upc_price)+' ';
	return true;
}

function S_ScanAdd_Prolog() {
	disp_cost += upc_price;
	disp_weight += upc_weight;
	goto_state('S_Follow_Price');
	return false;
}

function S_ScanDel_Prolog() {
	disp_cost -= upc_price;
	if (disp_cost < 0.0) {
		disp_cost=0.0;
	}
	goto_state('S_Follow_Price');
	return false;
}

function S_TestMotorL_Epilog() {
	MotorL_control('Off');
}

function S_TestMotorLFwd_Prolog() {
	MotorL_control('Fwd');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorLBck_Prolog() {
	MotorL_control('Bck');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorLOff_Prolog() {
	MotorL_control('Off');
	goto_state('S_TestMotorL');
	return false;
}

function S_TestMotorR_Epilog() {
	MotorR_control('Off');
}

function S_TestMotorRFwd_Prolog() {
	MotorR_control('Fwd');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestMotorRBck_Prolog() {
	MotorR_control('Bck');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestMotorROff_Prolog() {
	MotorR_control('Off');
	goto_state('S_TestMotorR');
	return false;
}

function S_TestBeepOff_Epilog() {
	beeper_control("Off");
}

function S_TestBeepOn_Prolog() {
	play_buzzer('SONG_POWER_UP');
	goto_state('S_TestBeeper');
	return false;
}

function S_TestBeepOff_Prolog() {
	beeper_control("Off");
	goto_state('S_TestBeeper');
	return false;
}

///////////////////////////////////////////////
// State Table

var No_State="None";
var STATE_NOP="Nop";

// Constructor
function StateGUI(state_name,flags,display_1,display_2,k1,k2,k3,k4,state_prolog,state_loop,state_epilog) {
	this.state_name = state_name;
	this.state_flags = flags;
	this.display_1 = display_1;
	this.display_2 = display_2;
	this.k1 = k1;
	this.k2 = k2;
	this.k3 = k3;
	this.k4 = k4;
	this.state_prolog = state_prolog;
	this.state_loop   = state_loop;
	this.state_epilog = state_epilog;
}

StateGUI.prototype.getName = function() { return this.state_name; };

// export the class
module.exports = StateGUI;


// State Array

state_array = [];

state_array.push(new StateGUI('S_Init',0,
 'FollowMe Cart   ',
 '  Init...       ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_ReadyHome',
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_Shutdown',0,
 'FollowMe Cart   ',
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
 S_Follow_Start_prolog,No_State,No_State));

state_array.push(new StateGUI('S_FollowStop',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP,
 S_Follow_Stop_prolog,No_State,No_State));

state_array.push(new StateGUI('S_Follow_Weight',0,
 'MC    123.45 lb ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Price', 
 S_Follow_Weight_prolog,No_State,No_State));

state_array.push(new StateGUI('S_Follow_Price',0,
 'MC      $123.45 ',
 'Stop  Scan  Help',
 'S_FollowStop','S_ScanReady','S_HelpSend','S_Follow_Weight', 
 S_Follow_Price_prolog,No_State,No_State));

// Scan!

state_array.push(new StateGUI('S_ScanReady',0,
 'Ready to Scan...',
 'Cancel          ',
 'S_Follow_Weight',STATE_NOP,STATE_NOP,'S_Follow_Weight', 
 S_ScanReady_Loop,S_ScanReady_Loop,No_State));

state_array.push(new StateGUI('S_ScanAccept',0,
 'Scan    $123.45 ',
 'Add   Del       ',
 'S_ScanAdd','S_ScanDel',STATE_NOP,'S_Follow_Weight', 
 S_ScanAccept_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_ScanAdd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_ScanAdd_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_ScanDel',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_ScanDel_Prolog,No_State,No_State));

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
 'S_TestInputs','S_TestMotorL','S_ReadyHome','S_ReadyHome', 
 No_State,No_State,No_State));

state_array.push(new StateGUI('S_TestInputs',0,
 'Inputs  L R F B ',
 'n n n n n n n n ',
 STATE_NOP,STATE_NOP,STATE_NOP,'S_TestHome', 
 No_State,No_State,No_State));

// Test Motors

// MotorL

state_array.push(new StateGUI('S_TestMotorL',0,
 'Outputs  MotorL ',
 'Fwd   Back  Stop',
 'S_TestMotorLFwd','S_TestMotorLBck','S_TestMotorLOff','S_TestMotorR', 
 No_State,No_State,S_TestMotorL_Epilog));

state_array.push(new StateGUI('S_TestMotorLFwd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLFwd_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorLBck',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLBck_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorLOff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorLOff_Prolog,No_State,No_State));

// MotorR

state_array.push(new StateGUI('S_TestMotorR',0,
 'Outputs  MotorR ',
 'Fwd   Back  Stop',
 'S_TestMotorRFwd','S_TestMotorRBck','S_TestMotorROff','S_TestBeeper', 
 No_State,No_State,S_TestMotorR_Epilog));

state_array.push(new StateGUI('S_TestMotorRFwd',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorRFwd_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorRBck',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorRBck_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_TestMotorROff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestMotorROff_Prolog,No_State,No_State));

// Test Beeper

state_array.push(new StateGUI('S_TestBeeper',0,
 'Outputs  Beeper ',
 'On    Off       ',
 'S_TestBeepOn','S_TestBeepOff',STATE_NOP,'S_TestHome', 
 No_State,No_State,S_TestBeepOff_Epilog));

state_array.push(new StateGUI('S_TestBeepOn',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestBeepOn_Prolog,No_State,No_State));

state_array.push(new StateGUI('S_TestBeepOff',0,
 '',
 '',
 STATE_NOP,STATE_NOP,STATE_NOP,STATE_NOP, 
 S_TestBeepOff_Prolog,No_State,No_State));


///////////////////////////////////////////////
// State Routines

function disp_state(next_state) {
	if (verbose) {
		console.log('');
		console.log('/----------------\\');
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
	if (state_array[state_now].state_epilog != No_State) {
		state_array[state_now].state_epilog();
	}
	
	// assert new state
	state_now = next_state;

	// execute any state prolog function
	if (state_array[state_now].state_prolog != No_State) {
		if (!state_array[state_now].state_prolog()) {
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
			for (i=0; i<val.length;i++) {
				var c = val.charAt(i);
				if (c != '-')
					config_cmnd(val.charAt(i))
			}
		}
	});

	// Show menu if we are still in setup mode
	if (input_state == "setup")
		setup_usage();
}

function usage_enabled(selected) {
	if (selected)
		return '[x]';
	else
		return '[ ]';
}

function setup_usage() {
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
	if (key == 'g')
		run_init();

	// ctrl-c ( end of text )
	if ( key === '\u0003' )
		process.exit();
	if (key == 'q') 
		process.exit();
}

//////////////////////////////////////////////////
// Run Mode

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
			goto_state('S_Init');
			play_buzzer('SONG_POWER_UP');
		});
	} else {
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

	// poll scanner
	scan_scanner();
	if (scanner_input != "") {
		S_ScanReady_Loop();
		goto_state('S_ScanAccept');
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
	
	// Now we can safely exit
	process.exit();
}

// on any data into stdin
stdin.on( 'data', function( key ){
	if (input_state=="setup") {
		config_cmnd(key);
		setup_usage();
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