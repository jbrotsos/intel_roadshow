//////////////////////////////////////////////
// sonor.js : module for sonor computations
//            part of "onboard_gui.js"


const TIME_TO_WORRY=2000; // 2 seconds
const TIME_TO_LOST=6000;  // 5 seconds
const SAMPLE_TIME=1000;   // 1 second per scan

//var distanceSensor=undefined;
var sonar_enabled = false;
var cur_direction_string = "<no sonor data> ";
var motor=undefined;
var mraa=undefined;
var sonor_on=false;
var time_lost=0;

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

var simuated_found_state=true;
function sonor_simulated_found_set(state) {
	simuated_found_state=state;
}

function sonor_loop()
{
	if (!sonar_enabled) {
		// provide simulated results
		if (simuated_found_state) {
			time_lost = 0;
			cur_direction_string = " straight"+" slow  ";
		} else {
			time_lost += SAMPLE_TIME;
			if (time_lost > TIME_TO_LOST)
				cur_direction_string = " ...lost!!...   ";
			else
				cur_direction_string = " ...looking...  ";
		}
		
		// Wait for next sample
		setTimeout(sonor_loop, SAMPLE_TIME);

		return;
	}

	if (sonor_on == false) return;
	var motor_action="";

	var distance = distanceSensor.distance();
	var spread = distanceSensor.spread();
	//console.log("Motor control (" + distance + ", " + spread + "):");
	if( -10 < spread && spread < 10 &&
		-50 < distance && distance < 50 )
	{
		cur_direction_string = "Waiting...     ";
		motor_action="W";
		
		time_lost += SAMPLE_TIME;
		
	} else {
		time_lost=0;

		if( spread < -100 )
		{
			motor_action+="L";
			cur_direction_string = "Left    ";
		}
		else if( spread > 100 )
		{
			motor_action+="R";
			cur_direction_string = "Right   ";
		}
		else
		{
			motor_action+="S";
			cur_direction_string = "Straight";
		}
		if( distance > 1200 )
		{
			motor_action+="P";
			cur_direction_string += " stop.  ";
		}
		else if( distance > 600 )
		{
			motor_action+="M";
			cur_direction_string += " slow.  ";
		}
		else
		{
			motor_action+="F";
			cur_direction_string += " fast.  ";
		}
	}
	
	// pass action to the motor
	motor.motor_action(motor_action);
	
	// Wait for next sample
	setTimeout(sonor_loop, SAMPLE_TIME);
}
		
function sonor_init(mraa_dev,motor_dev) {
	mraa=mraa_dev;
	motor=motor_dev;
	sonar_enabled = true;

	// set up follow detectors
	console.log('MRAA Version: ' + mraa.getVersion());
	distanceSensor = new DistanceSensor(0,1);
	sonor_on=false;
	
}

function sonor_display_loop() {
	return cur_direction_string;
}

function sonor_mood_get() {
	if (time_lost > TIME_TO_LOST) {
		return 'MOOD_LOST';
	} else if (time_lost > TIME_TO_WORRY) {
		return 'MOOD_LOOKING';
	} else {
		return 'MOOD_FOLLOW';
	}
}

function sonor_start() {
	sonor_on=true;
	time_lost=0;
	sonor_loop();
}

function sonor_stop() {
	time_lost=0;
	sonor_on=false;
}

function sonor_shutdown() {
	// no action at this time
}

module.exports = {
  sonor_init: sonor_init,
  sonor_display_loop: sonor_display_loop,
  sonor_start: sonor_start,
  sonor_stop: sonor_stop,
  sonor_shutdown: sonor_shutdown,
  sonor_mood_get: sonor_mood_get,
  sonor_simulated_found_set: sonor_simulated_found_set
}
