#!/usr/bin/env python
# scanner_agent.py, for onboard_gui.js

##########################################################################
#
# written by Cesare Pizzi
#
# MCR12 barcode reader interface
#
# This little program is built to read data from USB barcode reader when
# it's in HID (Human Interface Device) mode.
# I decoded most of the data and stored in an associative array
#
# It's probably better to run it with sudo, to be able to reade the 
# device
#
##########################################################################

import traceback
import socket
import os
import socket

##########################################################
# Define the values returned by the barcode reader
##########################################################

barcmd = {}

barcmd['0']="00002700000000000000000000000000"
barcmd['1']="00001e00000000000000000000000000"
barcmd['2']="00001f00000000000000000000000000"
barcmd['3']="00002000000000000000000000000000"
barcmd['4']="00002100000000000000000000000000"
barcmd['5']="00002200000000000000000000000000"
barcmd['6']="00002300000000000000000000000000"
barcmd['7']="00002400000000000000000000000000"
barcmd['8']="00002500000000000000000000000000"
barcmd['9']="00002600000000000000000000000000"
barcmd['a']="00000400000000000000000000000000"
barcmd['b']="00000500000000000000000000000000"
barcmd['c']="00000600000000000000000000000000"
barcmd['d']="00000700000000000000000000000000"
barcmd['e']="00000800000000000000000000000000"
barcmd['f']="00000900000000000000000000000000"
barcmd['g']="00000a00000000000000000000000000"
barcmd['h']="00000b00000000000000000000000000"
barcmd['i']="00000c00000000000000000000000000"
barcmd['j']="00000d00000000000000000000000000"
barcmd['k']="00000e00000000000000000000000000"
barcmd['l']="00000f00000000000000000000000000"
barcmd['m']="00001000000000000000000000000000"
barcmd['n']="00001100000000000000000000000000"
barcmd['o']="00001200000000000000000000000000"
barcmd['p']="00001300000000000000000000000000"
barcmd['q']="00001400000000000000000000000000"
barcmd['r']="00001500000000000000000000000000"
barcmd['s']="00001600000000000000000000000000"
barcmd['t']="00001700000000000000000000000000"
barcmd['u']="00001800000000000000000000000000"
barcmd['v']="00001900000000000000000000000000"
barcmd['w']="00001a00000000000000000000000000"
barcmd['x']="00001b00000000000000000000000000"
barcmd['y']="00001c00000000000000000000000000"
barcmd['z']="00001d00000000000000000000000000"
barcmd['A']="02000400000000000000000000000000"
barcmd['B']="02000500000000000000000000000000"
barcmd['C']="02000600000000000000000000000000"
barcmd['D']="02000700000000000000000000000000"
barcmd['E']="02000800000000000000000000000000"
barcmd['F']="02000900000000000000000000000000"
barcmd['G']="02000a00000000000000000000000000"
barcmd['H']="02000b00000000000000000000000000"
barcmd['I']="02000c00000000000000000000000000"
barcmd['J']="02000d00000000000000000000000000"
barcmd['K']="02000e00000000000000000000000000"
barcmd['L']="02000f00000000000000000000000000"
barcmd['M']="02001000000000000000000000000000"
barcmd['N']="02001100000000000000000000000000"
barcmd['O']="02001200000000000000000000000000"
barcmd['P']="02001300000000000000000000000000"
barcmd['Q']="02001400000000000000000000000000"
barcmd['R']="02001500000000000000000000000000"
barcmd['S']="02001600000000000000000000000000"
barcmd['T']="02001700000000000000000000000000"
barcmd['U']="02001800000000000000000000000000"
barcmd['V']="02001900000000000000000000000000"
barcmd['W']="02001a00000000000000000000000000"
barcmd['X']="02001b00000000000000000000000000"
barcmd['Y']="02001c00000000000000000000000000"
barcmd['Z']="02001d00000000000000000000000000"
barcmd['!']="02001e00000000000000000000000000"
barcmd['"']="02003400000000000000000000000000"
barcmd['#']="02002000000000000000000000000000"
barcmd['$']="02002100000000000000000000000000"
barcmd['%']="02002200000000000000000000000000"
barcmd['&']="02002400000000000000000000000000"
barcmd['\\']="00003100000000000000000000000000"
barcmd['\'']="00003400000000000000000000000000"
barcmd['(']="02002600000000000000000000000000"
barcmd[')']="02002700000000000000000000000000"
barcmd['*']="02002500000000000000000000000000"
barcmd['+']="02002e00000000000000000000000000"
barcmd[',']="00003600000000000000000000000000"
barcmd['-']="00002d00000000000000000000000000"
barcmd['.']="00003700000000000000000000000000"
barcmd['/']="00003800000000000000000000000000"
barcmd[':']="02003300000000000000000000000000"
barcmd[';']="00003300000000000000000000000000"
barcmd['?']="02003800000000000000000000000000"
barcmd['@']="02001f00000000000000000000000000"
barcmd['[']="00002f00000000000000000000000000"
barcmd[']']="00003000000000000000000000000000"
barcmd['^']="02002300000000000000000000000000"
barcmd['_']="02002d00000000000000000000000000"
barcmd['|']="02003100000000000000000000000000"

barcmd['EOT1']="00002800000000000000000000000000"
barcmd['EOT2']="01000d00000000000000000000000000"



import os

def getSock():
    HOST = "52.24.244.202"    # The remote host
    PORT = 8080              # The same port as used by the server
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect((HOST, PORT))

    return s

def getDev():
    hidrawList = [f for f in os.listdir("/dev") if "hidraw" in f]
    hidrawList.sort()
    return "/dev/" + hidrawList[-1]

def get_barcode(hiddev ):
    if dev == "":
        print "SCAN_ERROR:CAN NOT FIND DEV"
        return

    looping = True
    barcode = ""

    while looping:

        usbraw = hiddev.read(16)
        usbhex = usbraw.encode("hex")

        for key in barcmd:
            if barcmd[key] == usbhex:
                barcode += key
                break
            elif barcmd['EOT1'] == usbhex:
                # End of buffer reached
                looping = False

                break
    return barcode

##########
# MAIN 
##########

#filename="/tmp/barcode.txt"

dev = open(getDev(),"rb")

##sock = getSock()

import time
import sys
 
try :
    while 1:
        code =  get_barcode(dev)
        # NOTE: you have to flush the buffer to force it out
        sys.stdout.write("SCANNER_READ:"+code+"\n")
        sys.stdout.flush()
        # NOTE: stderr has automatic flushing
#        sys.stderr.write("SCANNER_READ:"+code+"\n")
#       target = open(filename, 'w')
#       target.write(code)
#       target.write("\n")
#       target.flush()
#       target.close()
#       time.sleep(1)
##      sock.sendall(code)
    
except KeyboardInterrupt:
    # Exit on CTRL-C
    dev.close()
##  sock.close()
    print "\nExiting...\n"
finally:
    dev.close()
    print "SCAN_CLOSE"
##  sock.close()
