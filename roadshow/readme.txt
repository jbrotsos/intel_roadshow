Readme for the "Follow-Me-Cart"

[ Preparing the Edison target ]

1) Connect to network

  # ifconfig usb0 down
  # ifconfig wlan0 down
  # ifconfig wlan0 up
  # configure_edison --setup

2) Install Johnny-five

  # npm install galileo-io johnny-five

3) Fix bug for buzzer music 

Update UPM to 2.0 to fix fatal buzzer musing driver. Since we already have set up the repository, we can check for updates and install new versions with the commands:

  # echo "src intel-iotdk http://iotdk.intel.com/repos/1.1/intelgalactic" > /etc/opkg/intel-iotdk.conf
  # opkg update
  # opkg upgrade
  
[ Preparing the cloud server ]

4) Start Amazon server over SSH reverse tunnel from target

  # cp /path/to/roadshow-linux.pem .
  $ ssh -R 7000:localhost:3490 -i ./roadshow-linux.pem ec2-user@ec2-52-24-244-202.us-west-2.compute.amazonaws.com
  $ node cloud_agent.js --client=localhost:7000 --server=0.0.0.0:8081

[ Starting the robot app ]

5) Start the Cart application

Start the onboard GUI with all devices enabled, else remove the "-Ag" option.

  # node onboard_gui.js --client=52.24.244.202:8081 --server=3490 -Ag
