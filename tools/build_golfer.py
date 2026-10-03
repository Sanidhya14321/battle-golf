"""Original Battle Golf character and in-place animation library. Run with Blender -b -P.
All geometry, rig and clips in this file are authored for this project (CC0).
"""
import bpy, math, os
from mathutils import Vector, Matrix

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'public','assets'); os.makedirs(OUT,exist_ok=True)
def material(name,color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*color,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.78
    return m
skin=material('Skin',(0.77,.43,.25)); shirt=material('Team',(.97,.55,.28))
cream=material('Cream',(.98,.91,.72)); dark=material('Ink',(.035,.055,.055))
white=material('White',(.98,.98,.94)); shoe=material('Shoe',(.2,.29,.25))
metal=material('Club',(.55,.66,.67)); shorts=material('Shorts',(.12,.22,.22))
hat=material('Hat',(.97,.55,.28))
arm=bpy.data.armatures.new('GolferRig'); rig=bpy.data.objects.new('Golfer',arm)
bpy.context.collection.objects.link(rig); bpy.context.view_layer.objects.active=rig
rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
bones={
 'Root':((0,0,0),(0,0,.1),None),
 'Hips':((0,0,.83),(0,0,1.03),'Root'),
 'Spine':((0,0,1.03),(0,0,1.25),'Hips'),
 'Head':((0,0,1.3),(0,0,1.65),'Spine'),
}
for side,s in [('L',-1),('R',1)]:
    bones['UpperArm'+side]=((s*.26,0,1.26),(s*.36,0,1.01),'Spine')
    bones['Forearm'+side]=((s*.36,0,1.01),(s*.4,.02,.78),'UpperArm'+side)
    bones['Hand'+side]=((s*.4,.02,.78),(s*.4,.03,.7),'Forearm'+side)
    bones['Thigh'+side]=((s*.13,0,.85),(s*.15,0,.48),'Hips')
    bones['Shin'+side]=((s*.15,0,.48),(s*.15,0,.17),'Thigh'+side)
    bones['Foot'+side]=((s*.15,0,.17),(s*.15,.2,.09),'Shin'+side)
for name,(head,tail,parent) in bones.items():
    b=arm.edit_bones.new(name); b.head=head; b.tail=tail
    if parent:b.parent=arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
parts=[]
def ell(name,pos,scale,mat,bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=8,location=pos)
    o=bpy.context.object; o.name=name; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=True
    g=o.vertex_groups.new(name=bone); g.add(list(range(len(o.data.vertices))),1,'REPLACE')
    parts.append(o); return o
def limb(name,a,b,r,mat,bone):
    a,b=Vector(a),Vector(b); o=ell(name,(a+b)/2,(r,r,(a-b).length/2+r*.25),mat,bone)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o
ell('Polo torso',(0,0,1.15),(.28,.15,.26),shirt,'Spine')
ell('Shorts',(0,0,.87),(.23,.16,.18),shorts,'Hips')
ell('Collar',(0,.02,1.35),(.15,.12,.04),cream,'Spine')
ell('Neck',(0,0,1.37),(.09,.08,.12),skin,'Head')
ell('Head',(0,.025,1.57),(.245,.215,.245),skin,'Head')
ell('Nose',(0,.24,1.57),(.065,.065,.057),skin,'Head')
for s in [-1,1]:
    ell('Ear',(s*.24,.015,1.57),(.057,.046,.077),skin,'Head')
    ell('Eye white',(s*.094,.214,1.63),(.058,.023,.061),white,'Head')
    ell('Pupil',(s*.094,.236,1.63),(.025,.012,.032),dark,'Head')
    brow=ell('Brow',(s*.095,.21,1.709),(.066,.018,.017),dark,'Head'); brow.rotation_euler.y=s*.13
    ell('Cheek',(s*.13,.204,1.54),(.045,.015,.025),shirt,'Head')
ell('Smile',(0,.228,1.475),(.075,.012,.024),dark,'Head')
ell('Teeth',(0,.24,1.481),(.05,.008,.01),white,'Head')
ell('Cap crown',(0,.015,1.77),(.253,.218,.096),hat,'Head')
ell('Cap bill',(0,.226,1.744),(.21,.13,.023),hat,'Head')
for side,s in [('L',-1),('R',1)]:
    limb('Sleeve'+side,(s*.25,0,1.26),(s*.31,0,1.14),.098,shirt,'UpperArm'+side)
    limb('Arm'+side,(s*.29,0,1.17),(s*.36,0,1.01),.069,skin,'UpperArm'+side)
    limb('Forearm'+side,(s*.36,0,1.01),(s*.4,.02,.78),.064,skin,'Forearm'+side)
    ell('Hand'+side,(s*.4,.035,.755),(.079,.058,.079),cream,'Hand'+side)
    limb('Short leg'+side,(s*.13,0,.85),(s*.145,0,.66),.11,shorts,'Thigh'+side)
    limb('Knee'+side,(s*.145,0,.66),(s*.15,0,.48),.078,skin,'Thigh'+side)
    limb('Sock'+side,(s*.15,0,.48),(s*.15,0,.17),.071,cream,'Shin'+side)
    ell('Shoe'+side,(s*.15,.1,.09),(.125,.22,.105),shoe,'Foot'+side)
    ell('Sole'+side,(s*.15,.1,.035),(.131,.226,.031),cream,'Foot'+side)
limb('Club shaft',(.4,.035,.75),(.43,.12,.13),.013,metal,'HandR')
ell('Club head',(.43,.155,.13),(.09,.07,.036),metal,'HandR')
bpy.ops.object.select_all(action='DESELECT')
for p in parts:p.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); model=bpy.context.object
model.name='GolferMesh'; bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
model.shape_key_add(name='Basis')
for face in ['Focused','Surprised','Sleepy','Blink']:
    key=model.shape_key_add(name=face)
    for i,v in enumerate(model.data.vertices):
        x,y,z=v.co
        if abs(x)<.17 and .225<y<.255 and 1.57<z<1.69:
            key.data[i].co.z=1.63+(z-1.63)*(.03 if face=='Blink' else .35 if face=='Sleepy' else .75 if face=='Focused' else 1.12)
        if face!='Blink' and abs(x)<.08 and y>.225 and 1.445<z<1.51:
            key.data[i].co.z=1.475+(z-1.475)*(2.5 if face=='Surprised' else .55)
            if face=='Surprised':key.data[i].co.x*=.55
mod=model.modifiers.new('Skin','ARMATURE'); mod.object=rig; model.parent=rig
for b in rig.pose.bones:b.rotation_mode='XYZ'
bpy.context.scene.render.fps=24
def clip(name,duration,pose):
    action=bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action=action
    frames=max(2,round(duration*24))
    for frame in range(frames+1):
        t=frame/frames
        for b in rig.pose.bones:b.rotation_euler=(0,0,0); b.location=(0,0,0)
        pose(t)
        for b in rig.pose.bones:
            b.keyframe_insert(data_path='rotation_euler',frame=frame)
            b.keyframe_insert(data_path='location',frame=frame)
    track=rig.animation_data.nla_tracks.new(); track.name=name
    track.strips.new(name,0,action); track.mute=True
    rig.animation_data.action=None
def rot(b,x=0,y=0,z=0):rig.pose.bones[b].rotation_euler=(x,y,z)
def aim_bone(name,head,tail):
    direction=Vector(tail)-Vector(head)
    rig.pose.bones[name].matrix=Matrix.Translation(Vector(head)) @ direction.to_track_quat('Y','Z').to_matrix().to_4x4()
def grip(center,club_direction):
    bpy.context.view_layer.update()
    for side,s in [('L',-1),('R',1)]:
        shoulder=rig.pose.bones['UpperArm'+side].head.copy()
        hand=Vector(center)+Vector((-.055 if side=='L' else 0,.015 if side=='L' else 0,.035 if side=='L' else 0))
        # Two-link arm, analytically solved; elbows bend outward, both gloves meet the grip.
        a=arm.bones['UpperArm'+side].length;b=arm.bones['Forearm'+side].length
        axis=hand-shoulder;d=min(axis.length,a+b-.001);axis.normalize()
        hand=shoulder+axis*d;along=(a*a-b*b+d*d)/(2*d);height=math.sqrt(max(0,a*a-along*along))
        bend=Vector((s*.8,-.4,-.1));bend-=axis*bend.dot(axis);bend.normalize()
        elbow=shoulder+axis*along+bend*height
        aim_bone('UpperArm'+side,shoulder,elbow);bpy.context.view_layer.update()
        aim_bone('Forearm'+side,elbow,hand);bpy.context.view_layer.update()
        aim_bone('Hand'+side,hand,hand+Vector(club_direction)*.08)
def idle(t):
    rot('Spine',.02*math.sin(t*math.tau),0,.015*math.sin(t*math.tau))
    rot('Head',0,0,.03*math.sin(t*math.tau))
def run(t):
    a=math.sin(t*math.tau); rig.pose.bones['Hips'].location.z=.035*abs(a)
    rot('Spine',-.14)
    for side,s in [('L',1),('R',-1)]:
        rot('Thigh'+side,s*a*.65); rot('Shin'+side,max(0,-s*a)*.9)
        rot('UpperArm'+side,-s*a*.55); rot('Forearm'+side,-.6)
def address(t):
    rot('Spine',-.28,0,.08); rot('Head',.18)
    rot('UpperArmL',-.55,0,-.5); rot('ForearmL',-.25,0,-.3)
    rot('UpperArmR',-.5,0,.2); rot('ForearmR',-.25,0,.25)
    rot('ThighL',.12); rot('ThighR',.12); rot('ShinL',-.1); rot('ShinR',-.1)
    grip((.15,.2,.86),(0,.37,-.93))
def backswing(t):
    address(0); rot('Spine',-.28,-t*.6,.08)
    grip((.15-.12*t,.2-.3*t,.86+.67*t),(0,-t,.37-.93*(1-t)))
def swing(t):
    # Contact at 250 ms: frame 6 in a 24-frame / 1-second clip.
    k=max(0,1-t/.25) if t<.25 else -min(1,(t-.25)/.3)
    if k>=0:backswing(k)
    else:
        address(0);rot('Spine',-.28,-k*.6,.08)
        grip((.15+.2*k,.2,.86-.74*k),(0,.5,1))
def dive(t):
    a=math.sin(min(1,t/.7)*math.pi/2) if t<.7 else (1-t)/.3
    rot('Hips',-a*1.3); rot('UpperArmL',-a*2.4); rot('UpperArmR',-a*2.4)
    rot('ShinL',a*.7);rot('ShinR',a*.4)
def hit(t):
    a=math.sin(math.pi*t);rot('Hips',a*.9,0,a*.45); rot('Head',-a*.4)
    rot('UpperArmL',0,0,a*1.1);rot('UpperArmR',0,0,-a*1.1)
    rot('ThighL',a*.8);rot('ShinR',a*1.1)
def club(t):
    a=math.sin(t*math.pi);rot('Spine',0,-a*1.1)
    rot('UpperArmR',-a*1.4,0,-a*.9);rot('ForearmR',-a*.4)
def celebrate(t):
    a=math.sin(t*math.tau);rig.pose.bones['Hips'].location.z=max(0,a)*.13
    rot('UpperArmL',0,0,2.5);rot('UpperArmR',0,0,-2.5);rot('ForearmR',a*.3)
def drink(t):rot('UpperArmR',-math.sin(t*math.pi)*1.4);rot('ForearmR',-math.sin(t*math.pi)*1.4)
def throw(t):rot('UpperArmR',-math.sin(t*math.pi)*2.8);rot('Spine',0,math.sin(t*math.pi)*.3)
def rocket_aim(t):grip((.12,.22,1.12),(0,1,0));rot('Head',0,0,.06)
for name,dur,pose in [('idle',2,idle),('run',.6,run),('address',1,address),('backswing',1,backswing),('swing',1,swing),('dive',.6,dive),('hit',1.2,hit),('club',.7,club),('celebrate',1,celebrate),('drink',.8,drink),('throw',.6,throw),('rocketAim',1,rocket_aim)]:clip(name,dur,pose)
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0)
bpy.context.scene.frame_set(0)
SOURCE=os.path.join(ROOT,'assets','source');os.makedirs(SOURCE,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,'golfer.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'golfer.glb'),export_format='GLB',export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True)
print('GOLFER_EXPORT_COMPLETE')
