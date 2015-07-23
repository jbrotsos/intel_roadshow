Readme for the Edison and "Follow-Me-Cart"


Table of Contents:

  1. Preparing the Edison
  2. Preparing the Cloud Service
  3. Preparing the Follow Me Cart
  4. Creating a custom Edison Image


1. Preparing the Edison target

1.1 Assemble your Edison, install your host drivers
  
Follow the official instructions at the Intel IoT website. They are accurate and clear.

  https://software.intel.com/en-us/intel-edison-board-getting-started-guide

  
1.2 Update the Edison Image
  
You will want the latest image, which is currently the June 2015 spin 2,1 (with Yocto Project 1.7.2). It contains the needed updates for MRAA and UPM needed for the Follow Cart and is therefore very preferred,

  https://software.intel.com/en-us/flashing-your-firmware-edison
  
NOTE: the "manual instructions for flashing that worked for 2,0 does not work for 2.1 (at least not for me), so you will definitely want to use the new firmware installer tool as per the Intel instructions.
  
Here is the link the current Edison image:

  http://downloadmirror.intel.com/25028/eng/edison-image-ww25.5-15.zip


1.3 Connect to network

You will need this to manage the device and to install for example Johnny-Five.

  # ifconfig usb0 down
  # ifconfig wlan0 down
  # ifconfig wlan0 up
  # configure_edison --setup

NOTE: the first three steps are optional if you are having issues connection to your Wifi. For some of my Wifi hotspots, I find I need to reboot those hotspots in order to make the connection (I am guessing there are stale state issues, and I do not know how to clear them on the target side).

NOTE: you must set up an SSH password or Wifi will not be enabled (to protect the planet from hackers).


1.4 Install Johnny-five

  # npm install galileo-io johnny-five

NOTE: this will go a lot faster (~ 10 minutes?) if you already have the latest MRAA libraries, else prepare to wait an extra 20 minutes for this process to complete.


1.5) Set up the USB network connection to the Edison

This will almost instant access between the host and the target, and avoids all the competing traffic on the Wifi.

Follow the official instructions here:

  https://software.intel.com/en-us/connecting-to-intel-edison-board-using-ethernet-over-usb

NOTE: the USB must be in slave mode, where the switch between the USB connectors is AWAY from the USB-A port (towards the center of the board). You therefore cannot use this mode and access the UPC scanner. at the same time.


1.6) OPTIONAL: Update UPM to fix bug for buzzer music 

If you have the earlier Edison image (<= 2.0), you will need to update UPM to 2.0 to a fix fatal buzzer music driver issue. Since we already have set up the repository, we can check for updates and install new versions with the commands:

  # echo "src intel-iotdk http://iotdk.intel.com/repos/1.1/intelgalactic" > /etc/opkg/intel-iotdk.conf
  # opkg update
  # opkg upgrade


2. Preparing the Cloud Server

Set up the Amazon server connection using an SSH reverse tunnel from the target. This will support connections from behind NAT firewalls.

  # cp /path/to/roadshow-linux.pem .
  $ ssh -R 7000:localhost:3490 -i ./roadshow-linux.pem ec2-user@ec2-52-24-244-202.us-west-2.compute.amazonaws.com


3. Preparing the Follow Me Cart

3.1 Add the application files to the target

Here is the repository:

  https://github.com/jbrotsos/repo/tree/master/roadshow/onboard_gui

Here are the required files:

  onboard_gui.js    (Follow Cart executive)
  motor.js 	        (manages the motor interface)
  sonor.js          (manages the sonar interface)
  scanner_agent.py  (manages the IPC scanner)

 
3.2 Attach the hardware

  (a) Add the buttons+LCD+Buffer connectors to the Edison
  (b) Set the USB-A port to "master mode" by move the adjacent switch towards that USB-A connector
  (c) Attach the UPC scanner to the USB-A port
  (d) Connect the sonar sensors to A0 and A1
  (e) Connect PWD signals to the motor shield (TBD)
  

3.3 Start the target executive

Start the onboard GUI with all devices enabled, else remove the "-Ag" option.

  # node onboard_gui.js --client=52.24.244.202:8081 --server=3490 -Ag


3.4 Start the Amazon server

With the login from #2, do this:

  $ node cloud_agent.js --client=localhost:7000 --server=0.0.0.0:8081


4. Creating a custom Edison Image

There is no official Intel documentation on how to prepare your own Edison image, but I found some instructions on the Internet and updated them to match the 2.1 release.

4.1 Build the Image

On your Linux host, do the following operations:

  $ wget http://downloadmirror.intel.com/25028/eng/edison-src-ww25.5-15.tgz
  $ tar -xzf edison-src-ww25.5-15.tgz 
  $ cd edison-src
  $ make setup
  $ cd /opt/dreyna/maker/edison/edison-src/out/linux64
  $ source poky/oe-init-build-env
  $ bitbake edison-image
  $ cd ../../..
  $ make uboot
  $ ls out/current/build/toFlash/
  edison_dnx_fwr.bin	        edison_ifwi-dbg-04.bin      flashall.sh
  edison_dnx_osr.bin	        edison_ifwi-dbg-04-dfu.bin	FlashEdison.json
  edison_ifwi-dbg-00.bin	    edison_ifwi-dbg-05.bin	    helper
  edison_ifwi-dbg-00-dfu.bin  edison_ifwi-dbg-05-dfu.bin	ota_update.scr
  edison_ifwi-dbg-01.bin	    edison_ifwi-dbg-06.bin	    package-list.txt
  edison_ifwi-dbg-01-dfu.bin  edison_ifwi-dbg-06-dfu.bin	u-boot-edison.bin
  edison_ifwi-dbg-02.bin	    edison-image-edison.ext4	u-boot-edison.img
  edison_ifwi-dbg-02-dfu.bin  edison-image-edison.hddimg	u-boot-envs
  edison_ifwi-dbg-03.bin	    filter-dfu-out.js
  edison_ifwi-dbg-03-dfu.bin  flashall.bat
  $
  

4.2 Prepare the Edison Flash Files

  $ cd out/current/build/toFlash
  $ zip -r -Zb edison_dlr.zip *

Unzip the resulting file on the host you will use to flash the Edison.

NOTE: you will definitely want the "-Zb" to binzip the file, else it will be 500 Mbytes large than needed.
  

4.3 Flash the custom image

You have to use the official Intel firmware loader (see 1.2 above). 


4.4 Prepare the system

This image will function identically as the normal image, so follow the regular instructions in #1 above.

This image worked perfectly for me, with the single exception that the "configure_edison --version" does not return a value (simply because there is no "/etc/version" file populated).

