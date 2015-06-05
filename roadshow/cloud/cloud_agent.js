//////////////////////////////////////////////////
// Cloud Server Mini (for unit testing the cart)

// Cart variables
var cart_follow=false;

// server variables

var net = require('net');
var server = undefined;
var server_ip = '52.24.244.202';
var server_port = 0; // normally 3490
var client = undefined;
var client_ip = '';
var client_port = 0;

///////////////////////////////////////////////
// Cloud Server Handler Functions

function server_init() {
	if (server_port != 0) {

		// Create a server instance, and chain
		// the listen function to it
		// The function passed to net.createServer()
		// becomes the event handler for the
		// 'connection' event.  The sock object the
		// callback function receives UNIQUE for
		// each connection

		server = net.createServer(function(sock) {

			// We have a connection - a socket object
			// is assigned to the connection
			// automatically

			console.log('CONNECTED: ' +
			  sock.remoteAddress +':'+ sock.remotePort);

			// Add a 'data' event handler to this
			// instance of socket

			sock.on('data', function(data) {
				sock.write(cart_server_receiver(sock,data));
			});

			// Add a 'close' event handler to this
			// instance of socket

			sock.on('close', function(data) {
				console.log('CLOSED: ');
			});

		}).listen(server_port, server_ip);
		console.log('LISTENING on:' +
		      server_ip +':'+ server_port);
	}
}

function cart_server_receiver(sock,data) {
	console.log('RECEIVED(' +
	   sock.remoteAddress + ')=' + data);
	data=String(data);

	var reply='';
	// process the cloud client requests
	if (data == "cart_status:follow=on;") {
		cart_follow=true;
		reply="re_cart_status:status=ack;";
		client_commands();
	} else if (data == "cart_status:follow=off;") {
		cart_follow=false;
		reply="re_cart_status:status=ack;";
		client_commands();
	} else if (0 == data.indexOf("upc_lookup:upc=")) {
		reply=fetch_UCP(data.slice(15).replace(';',''));
	} else {
		// TBD
		reply='no_command:status=nak,message=' + data + ';';
	}

	console.log('Cloud Server SEND(' + reply);
	return reply;
}

function fetch_UCP(upc_number) {
	console.log('fetch_UCP:' + upc_number);

	var reply = "re_upc_lookup:status=nak,message=not found";
	if (upc_number == '760557824961') // microSD
		reply = "re_upc_lookup:price=7.45,weight=0.2;";
	if (upc_number == '941047822994') // ROM cherry chocolate
		reply = "re_upc_lookup:price=2.21,weight=0.3;";
	if (upc_number == '2839903352')   // GUM Toothbrush
		reply = "re_upc_lookup:price=5.62,weight=0.4;";
	if (upc_number == '7094212457')   // Gund plush penguin
		reply = "re_upc_lookup:price=12.88,weight=0.77;";

	return reply;
}

///////////////////////////////////////////////
// Cloud Client Handler Functions

// This client connection is not persistent
function cloud_client_sender(data) {
	client = new net.Socket();

	if (client_port != 0) {
		client.connect(client_port, client_ip, function() {
			console.log('Cloud Client talking on:' + client_ip + ':' + client_port);
			console.log('Cloud Client SEND(' + data);
			client.write(data);
		});

		// Add a 'data' event handler for the client socket
		// data is what the server sent to this socket
		client.on('data', function(data) {
			cloud_client_receiver(data);
			client.destroy();
		});

		// Add a 'close' event handler for the client socket
		client.on('close', function() {
			console.log('Cloud Client closed');
		});
	}
}

function cloud_client_receiver(data) {
	console.log('Cart Client RECEIVE(' + data);

	// process the cloud client requests
	if (data == "re_cart_status:follow=on;") {
		cart_follow=true;
	} else if (data == "re_cart_status:follow=off;") {
		cart_follow=false;
	}

	// now display menu
	client_commands();
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
// User Commands

console.log("Mini Cloud Server and Client");
console.log("  Server="+server_ip+":"+server_port);
console.log("  Client="+client_ip+":"+client_port);
console.log("");

function usage_enabled(selected) {
	if (selected)
		return '[x]';
	else
		return '[ ]';
}

function client_commands() {
	console.log("");
	console.log("Mini Cloud Server and Client");
	console.log(" 1 : "+usage_enabled(!cart_follow)+" Start cart follow");
	console.log(" 2 : "+usage_enabled( cart_follow)+" Stop  cart follow");
	console.log(" 3 : Message 'Help in 2 min'");
	console.log(" 4 : Add pickels UPC");
	console.log(" 5 : Del pickels UPC");
	console.log(" q : Quit");
	console.log("============================");
}

function config_cmnd(key) {
	var message="";

	if (key == '1')
		cloud_client_sender("cart_status:follow=on;");
	if (key == '2')
		cloud_client_sender("cart_status:follow=off;");
	if (key == '3')
		cloud_client_sender("cust_alert:message=Help in 2 min;");
	if (key == '4')
		cloud_client_sender("upc_add:upc=123456789,price=5.34,weight=1.23;");
	if (key == '5')
		cloud_client_sender("upc_del:upc=123456789,price=5.34,weight=1.23;");

	// refresh display
	if (key == ' ') {
		client_commands();
		return;
	}

	// ctrl-c ( end of text )
	if ( key === '\u0003' )
		process.exit();
	if (key == 'q')
		process.exit();

	if (message == "") {
		cloud_client_sender(message);
		// postpone menu until client reply
	} else {
		// display menu (if we get here)
		client_commands();
	}

}

///////////////////////////////////////////////
// main()

// read parameters
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
			}
		}
	}
});

// Start the server
server_init();

// Display menu
client_commands();

// on any data into stdin
stdin.on( 'data', function( key ){
	config_cmnd(key);
});

var busywait=0;
function cloud_loop() {
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

// Scan the non-event I/O every 1/4 second
setInterval(cloud_loop, 250);
