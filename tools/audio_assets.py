import wave, math, random, os, shutil
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','assets','audio');os.makedirs(OUT,exist_ok=True)
random.seed(42)
def sound(name,duration,kind):
    rate=22050;count=int(rate*duration);data=bytearray();last=0
    for i in range(count):
        t=i/rate;u=i/count;noise=random.uniform(-1,1);last=.7*last+.3*noise
        if kind=='boom':v=(last*.8+math.sin(t*math.tau*(45-20*u))*.4)*(1-u)**3
        elif kind=='swish':v=noise*math.sin(u*math.pi)**2*.22
        elif kind=='splash':v=last*(1-u)*.65+noise*(1-u)**3*.12
        else:v=math.sin(t*math.tau*(523 if u<.3 else 659 if u<.6 else 784))*math.sin(u*math.pi)*.18
        sample=max(-32767,min(32767,int(v*24000)));data.extend(sample.to_bytes(2,'little',signed=True))
    with wave.open(os.path.join(OUT,name+'.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(data)
for name,dur,kind in [('explosion',.7,'boom'),('swish',.25,'swish'),('splash',.6,'splash'),('finish',.9,'finish')]:sound(name,dur,kind)
for source,target in [('footstep_grass_000.ogg','step1.ogg'),('footstep_grass_001.ogg','step2.ogg'),('impactWood_medium_000.ogg','strike.ogg'),('impactSoft_medium_000.ogg','hit.ogg')]:
    source=os.path.join(ROOT,'artifacts','tools','impacts','Audio',source)
    if os.path.exists(source):shutil.copyfile(source,os.path.join(OUT,target))
shutil.copyfile(os.path.join(ROOT,'artifacts','tools','ui','Audio','switch1.ogg'),os.path.join(OUT,'pickup.ogg'))
for pack in ['impacts','ui']:shutil.copyfile(os.path.join(ROOT,'artifacts','tools',pack,'License.txt'),os.path.join(OUT,pack+'-LICENSE.txt'))
rate=22050;duration=16;data=bytearray();notes=[48,55,60,64,53,57,60,65,50,57,62,65,55,59,62,67]
for i in range(rate*duration):
    t=i/rate;beat=t*2;step=int(beat*2);phase=(beat*2)%1
    note=notes[(step//4)%16]+(12 if step%4 in [1,3] else 0);freq=440*2**((note-69)/12)
    melody=(math.sin(t*math.tau*freq)+.2*math.sin(t*math.tau*freq*2))*math.exp(-phase*6)*.10
    kick=math.sin(t*math.tau*(55+60*math.exp(-(beat%1)*15)))*math.exp(-(beat%1)*20)*.11
    hat=random.uniform(-1,1)*math.exp(-phase*35)*.025
    sample=int(max(-1,min(1,melody+kick+hat))*25000);data.extend(sample.to_bytes(2,'little',signed=True))
with wave.open(os.path.join(OUT,'clubhouse-loop.wav'),'wb') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes(data)
