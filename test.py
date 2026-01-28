from m5stack import *
from m5stack_ui import *
from uiflow import *
import urequests
import imu
import wifiCfg
import time


screen = M5Screen()
screen.clean_screen()
screen.set_screen_bg_color(0xFFFFFF)


score = None
y = None
x = None
url = None
i = None
gasurl = None
roopSpeed = None
nowGame = None
long2 = None

imu0 = imu.IMU()

label0 = M5Label('label0', x=125, y=31, color=0x000, font=FONT_MONT_14, parent=None)
label7 = M5Label('label7', x=129, y=101, color=0x000, font=FONT_MONT_14, parent=None)
label6 = M5Label('label6', x=130, y=189, color=0x000, font=FONT_MONT_14, parent=None)

from numbers import Number


def testSound():
  global score, y, x, url, i, gasurl, roopSpeed, nowGame, long2
  if x < -20:
    score = (str(score) + str(1))
  elif x > 20:
    score = (str(score) + str(2))
  elif y < -20:
    score = (str(score) + str(3))
  elif y > 20:
    score = (str(score) + str(4))
  else:
    score = (str(score) + str(5))
  label7.set_text(str(i))
  label0.set_text(str(score))

def postScore(score):
  global y, x, url, i, gasurl, roopSpeed, nowGame, long2
  try:
    req = urequests.request(method='POST', url=url,json={'url':gasurl,'data':'start'})
    label6.set_text('fin,ok')
    gc.collect()
    req.close()
  except:
    label6.set_text('fin,false')

def dosomething():
  global score, y, x, url, i, gasurl, roopSpeed, nowGame, long2
  try:
    req = urequests.request(method='POST', url=url,json={'url':gasurl,'data':'test'})
    initgame()
    gc.collect()
    req.close()
  except:
    label6.set_text('fin,false')

def initgame():
  global score, y, x, url, i, gasurl, roopSpeed, nowGame, long2
  if 'start' != (req.text):
    pass
  else:
    score = ''
    i = 0
    label6.set_text('null')
    timerSch.run('rooptest', roopSpeed, 0x00)
    nowGame = True
    label7.set_text('')


@timerSch.event('rooptest')
def trooptest():
  global y, x, score, url, i, gasurl, roopSpeed, nowGame, long2
  y = imu0.gyro[0]
  x = imu0.gyro[1]
  testSound()
  if i == long2:
    nowGame = False
    label6.set_text('fin')
    postScore(score)
    timerSch.stop('rooptest')
    timerSch.run('Polling', (roopSpeed * 10), 0x00)
  i = (i if isinstance(i, Number) else 0) + 1
  pass


while not (wifiCfg.wlan_sta.isconnected()):
  wifiCfg.doConnect('KUDOS_IoT', 'KuD0s10T2017')
  wait_ms(10)
url = 'https://46la4d7sd0.execute-api.ap-northeast-1.amazonaws.com/dev2'
gasurl = 'https://script.google.com/macros/s/AKfycbzlFbdctcrm5l0qEhC18cRJdCMxXQpez-ukQv731nGmZE-tYGjcvhXwi3UD9FpYP4Qa7Q/exec'
roopSpeed = 1000
score = ''
nowGame = False
i = 0
long2 = 10
label7.set_text('m5tone')
label6.set_text('touch B button')
label0.set_text('')
timerSch.setTimer('rooptest', roopSpeed, 0x00)
while not nowGame:
  wait(10)
  dosomething()
