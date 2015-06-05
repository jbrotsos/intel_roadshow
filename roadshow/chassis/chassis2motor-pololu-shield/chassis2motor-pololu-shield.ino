#include <DRV8835MotorShield.h>

#define LED_PIN 13
#define SPEED 200

DRV8835MotorShield motors;

void setup()
{
  pinMode(LED_PIN, OUTPUT);
  
  // uncomment if direction need to be flipped
  //motors.flipM1(true);
  motors.flipM2(true);
}

void move (int speed, int secs, bool forwardLeft, bool forwardRight)
{
  int lspeed = speed;
  int rspeed = speed;
  
  if (!forwardLeft)
  {
  lspeed = -lspeed;
  }
  if (!forwardRight)
  {
  rspeed = -rspeed;
  }
  
motors.setSpeeds (lspeed, rspeed);
delay (secs * 1000);
motors.setSpeeds (0, 0);
}

void forward (int speed, int secs)
{
  move (speed, secs, true, true);
}

void backwards (int speed, int secs)
{
  move (speed, secs, false, false);
}

void turn_right ()
{
  move (SPEED, 3, true, false);
}

void turn_left ()
{
  move (SPEED, 3, false, true);
}

void loop()
{
  forward (SPEED, 5);
  backwards (SPEED, 5);
  turn_right();
  turn_left();
}
