//////////////////////////////////////////////
// motor.js : module for sonor computations
//            part of "onboard_gui.js"

var motor_enabled = false;
var motor_on=false;
var cur_motor_string = "<no motor data) ";
var motor_action_string="x";

function motor_init(mraa) {
	// no code yet
	console.log("MOTOR:INIT!");
	motor_enabled = true;
}

function motor_display_loop() {
	// live telemetry display 
	if (motor_enabled) {
		var on_str;
		if (motor_on) on_str="On "; else on_str="Off";
		cur_motor_string = "Motor "+on_str+":"+motor_action_string+"    ";
		if ('W' == motor_action_string) cur_motor_string += " ";
	} else {
		cur_motor_string = "Motor Disabled   ";
	}
	return cur_motor_string;
}

function motor_start() {
	// Enable the motors for follow mode
	if (motor_enabled) {
		console.log("MOTOR:GO!");
		motor_on=true;
	}
}

// action from sonor=W|{LRS}{PMF}=Wait|{Left|Right|Straight}{stoP|Medium|Fast}
function motor_action(action) {
	// update the motor motion action
	if (motor_enabled) {
		console.log("MOTOR:action=" + action);
		motor_action_string=action;
	}
}

function motor_stop() {
	// Disable the motors for wait mode
	if (motor_enabled) {
		motor_action('W');
		console.log("MOTOR:STOP!");
		motor_on=false;
	}
}

function motor_shutdown() {
	// no action at this time
	motor_enabled = false;
	console.log("MOTOR:SHUTDOWN!");
}

module.exports = {
  motor_init: motor_init,
  motor_display_loop: motor_display_loop,
  motor_start: motor_start,
  motor_action: motor_action,
  motor_stop: motor_stop,
  motor_shutdown: motor_shutdown
}
