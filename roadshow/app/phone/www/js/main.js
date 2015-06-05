/*jslint browser:true, devel:true, white:true, vars:true, eqeq:true */
/*global $:false, intel:false*/
/*
 * This function runs once the page is loaded, but the JavaScript bridge library is not yet active.
 */
var init = function () {
    
    var b1= document.getElementById("buttonone");
    b1.addEventListener("touchstart", touchstarthandlerB1,false);
    b1.addEventListener("touchend", touchendhandlerB1,false);
    //b1.addEventListener("click", button1click, false);

    var b2= document.getElementById("buttontwo");
    b2.addEventListener("touchstart", touchstarthandlerB2, false);
    b2.addEventListener("touchend", touchendhandlerB2, false);
    
    var b3= document.getElementById("buttonthree");
    b3.addEventListener("touchstart", touchstarthandlerB3, false);
    b3.addEventListener("touchend", touchendhandlerB3, false);
    
    var b4= document.getElementById("buttonfour");
    b4.addEventListener("touchstart", touchstarthandlerB4, false);
    b4.addEventListener("touchend", touchendhandlerB4, false);
};

window.addEventListener("load", init, false);  

 // Prevent Default Scrolling 
var preventDefaultScroll = function(event) 
{
    event.preventDefault();
    window.scroll(0,0);
    return false;
};
    
window.document.addEventListener("touchmove", preventDefaultScroll, false);

/**
 * Device ready code.  This event handler is fired once the JavaScript bridge library is ready.
 */
function onDeviceReady()
{
    if( window.Cordova && navigator.splashscreen ) {     // Cordova API detected
        navigator.splashscreen.hide();                 // hide splash screen
    }

}

document.addEventListener("message", receiveMessage, false);

function receiveMessage(event)
{
   operation ("hello");
}

document.addEventListener("deviceready",onDeviceReady,false); 
/**
 * We use the target from the event to add the pressed class name to the selected button
 */     

// Touch start functionality for the buttons
function touchstarthandlerB1(event)
{
    var button= event.target;
    button.className ="pressed";
    
    operation ("On");
    
}

// Touch end functionality for the buttond
function touchendhandlerB1(event)
{
    var button= event.target;
    button.className ="";
}

// Touch start functionality for the buttons
function touchstarthandlerB2(event)
{
    var button= event.target;
    button.className ="pressed";
    
    operation ("Off");    
}

// Touch end functionality for the buttond
function touchendhandlerB2(event)
{
    var button= event.target;
    button.className ="";
}
    
// Touch start functionality for the buttons
function touchstarthandlerB3(event)
{
    var button= event.target;
    button.className ="pressed";
    
    operation ("Vincent");
}

// Touch end functionality for the buttond
function touchendhandlerB3(event)
{
    var button= event.target;
    button.className ="";
}
    
// Touch start functionality for the buttons
function touchstarthandlerB4(event)
{
    var button= event.target;
    button.className ="pressed";
    
    operation ("Adrian");
}

// Touch end functionality for the buttond
function touchendhandlerB4(event)
{
    var button= event.target;
    button.className ="";
}


function operation(n3)
{
    location.href = "http://52.24.244.202/:8080" + "?name=" + n3;
}
