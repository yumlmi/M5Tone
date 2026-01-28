from m5stack import *
from m5stack_ui import *
from uiflow import *


screen = M5Screen()
screen.clean_screen()
screen.set_screen_bg_color(0xFFFFFF)








from m5stack import lcd, btnB
from machine import I2C, Pin
from mpu6886 import MPU6886
import time, math

i2c=I2C(0,scl=Pin(22),sda=Pin(21))
imu=MPU6886(i2c)

DIRS=["LEFT","RIGHT","FORWARD","BACKWARD"]
DEAD=15
TH=20
HOLD_MS=800
ROUNDS=8
last="FORWARD"

def read_dir():
    global last
    ax,ay,az=imu.acceleration()
    lr=-math.degrees(math.atan2(ax,az))
    fb= math.degrees(math.atan2(ay,az))
    if abs(lr)<DEAD and abs(fb)<DEAD:
        return last
    if abs(lr)>abs(fb):
        last="RIGHT" if lr>0 else "LEFT"
    else:
        last="FORWARD" if fb>0 else "BACKWARD"
    return last

lcd.clear();lcd.print("Tilt Game",10,10);lcd.print("Press B",10,30)
while not btnB.isPressed(): time.sleep(0.05)
time.sleep(0.2)
score=0
for r in range(ROUNDS):
    target=DIRS[(time.ticks_ms()>>4)%4]
    lcd.clear();lcd.print("Round %d/%d"%(r+1,ROUNDS),10,10)
    lcd.print("Tilt: %s"%target,10,30)
    start=None;ok=False;t0=time.ticks_ms()
    while time.ticks_diff(time.ticks_ms(),t0)<2000:
        if read_dir()==target:
            if start is None: start=time.ticks_ms()
            if time.ticks_diff(time.ticks_ms(),start)>HOLD_MS:
                ok=True;break
        else:
            start=None
        time.sleep(0.1)
    lcd.clear()
    if ok: score+=1; lcd.print("SUCCESS",20,30)
    else: lcd.print("FAIL",20,30)
    time.sleep(0.8)

lcd.clear();lcd.print("Game Over",10,10)
lcd.print("Score %d/%d"%(score,ROUNDS),10,30)