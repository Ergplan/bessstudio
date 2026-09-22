'use client';
import {Component,forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Canvas,useFrame,useThree,type ThreeEvent} from '@react-three/fiber';
import {OrbitControls,Html,ContactShadows} from '@react-three/drei';
import * as THREE from 'three';
import {useStudio} from '../state/store';
import {primitives,type Primitive,belongs,displacement} from '../geometry/primitives';
import {planSite,sitePrimitives} from '../geometry/site';
import {centreOf,keeps,type Cut} from './section';
import {pick as pickPoint,say as sayLength,spanOf} from './measure';
import {type Model,type Vec,add} from '../domain/model';
import {brand} from '../brand/brand';
import {qualification} from '../config/schema';
export type ViewerHandle={png:(width:number,height:number)=>Promise<Blob>;camera:()=>{position:Vec;target:Vec;zoom:number};profile:()=>Promise<{fps:number;drawCalls:number;triangles:number;renderer:string;userAgent:string}>};
const boxGeo=new THREE.BoxGeometry(1,1,1),cylinderGeo=new THREE.CylinderGeometry(1,1,1,8);
/**
 * The section plane. One plane, shared by every material, moved in place — so turning the tool on
 * and off never rebuilds a material. Parked at a constant nothing can reach when it is off.
 */
const sectionPlane=new THREE.Plane(new THREE.Vector3(-1,0,0),1e6);
const PARKED=1e6;
/** Scene captions are captions; the canvas under them is what the pointer is for. */
const NO_POINTER={pointerEvents:'none'} as const;
const dummy=new THREE.Object3D();
function Batch({items,selected}:{items:Primitive[];selected:string}){const ref=useRef<THREE.InstancedMesh>(null!);const pick=useStudio(s=>s.select),focus=useStudio(s=>s.focus),scope=useStudio(s=>s.scope);const material=useMemo(()=>new THREE.MeshStandardMaterial({color:'white',roughness:items[0].metal?.42:.7,metalness:items[0].metal?.5:.12,clippingPlanes:[sectionPlane],clipShadows:true}),[items[0].metal]);useEffect(()=>()=>material.dispose(),[material]);
 useLayoutEffect(()=>{items.forEach((p,i)=>{dummy.position.set(...p.position);dummy.scale.set(...p.size);if(p.rotation)dummy.quaternion.set(...p.rotation);else dummy.quaternion.identity();dummy.updateMatrix();ref.current.setMatrixAt(i,dummy.matrix);ref.current.setColorAt(i,selected!=='BESS'&&selected!=='SITE'&&p.owner===selected?new THREE.Color(p.color).lerp(new THREE.Color('#bedc78'),.3):new THREE.Color(p.color));});ref.current.instanceMatrix.needsUpdate=true;if(ref.current.instanceColor)ref.current.instanceColor.needsUpdate=true;ref.current.computeBoundingSphere();},[items,selected]);
 const id=(e:ThreeEvent<MouseEvent>)=>items[e.instanceId??0]?.owner;
 return <instancedMesh ref={ref} args={[items[0].shape==='box'?boxGeo:cylinderGeo,material,items.length]} onClick={e=>{e.stopPropagation();const st=useStudio.getState();
   if(st.measure.on){st.setMeasure(m=>pickPoint(m,e.point.toArray() as Vec));return;}
   pick(id(e));}} onDoubleClick={e=>{e.stopPropagation();const owner=id(e);focus(scope==='SITE'?(owner.startsWith('UNIT-')?'BESS':scope):owner);}} castShadow receiveShadow frustumCulled={false} />;
}
function Branding({model}:{model:Model}){const brandName=useStudio(s=>s.brandName)||brand.vendorShort.toUpperCase();const tex=useMemo(()=>{const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#213e50';ctx.font='600 114px Arial';ctx.textAlign='center';ctx.fillText(brandName,512,155);const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;if(model.config.logo){const img=new Image();img.onload=()=>{ctx.clearRect(0,0,1024,256);const scale=Math.min(1024/img.width,256/img.height);ctx.drawImage(img,(1024-img.width*scale)/2,(256-img.height*scale)/2,img.width*scale,img.height*scale);t.needsUpdate=true;};img.src=model.config.logo;}return t;},[model.config.logo,brandName]);useEffect(()=>()=>tex.dispose(),[tex]);return <mesh position={[model.dimensions.enclosure[0]/2+.04,model.dimensions.enclosure[1]*.66,0]} rotation={[0,Math.PI/2,0]}><planeGeometry args={[model.dimensions.enclosure[2]*.76,model.dimensions.enclosure[2]*.19]}/><meshBasicMaterial map={tex} transparent side={THREE.DoubleSide}/></mesh>;}
/**
 * Moves the shared plane to where the section control asks, in the units of whatever is on screen:
 * the control speaks in fractions, so the same slider cuts a cell and a site.
 */
function SectionPlane({cut}:{cut:Cut}){
  const {invalidate}=useThree();
  useEffect(()=>{
    if(!cut){sectionPlane.constant=PARKED;invalidate();return;}
    sectionPlane.normal.set(cut.axis===0?-1:0,cut.axis===1?-1:0,cut.axis===2?-1:0);
    sectionPlane.constant=cut.at;
    invalidate();
  },[cut,invalidate]);
  useEffect(()=>()=>{sectionPlane.constant=PARKED;},[]);
  return null;
}

/**
 * The measurement itself: a bar between the two picked points, a marker at each, and the distance
 * with its axis components — an installer wants the clearance in one direction, not the diagonal.
 */
function Measurement({reach}:{reach:number}){
  const measure=useStudio(s=>s.measure);
  const material=useMemo(()=>new THREE.MeshBasicMaterial({color:'#E3C64A',toneMapped:false,depthTest:false}),[]);
  useEffect(()=>()=>material.dispose(),[material]);
  if(!measure.on||!measure.a)return null;
  const dot=Math.max(.01,reach*.008);
  const marks=[measure.a,measure.b].filter(Boolean) as Vec[];
  const span=measure.b?spanOf(measure.a,measure.b):null;
  const mid=measure.b?measure.a.map((v,i)=>(v+measure.b![i])/2) as Vec:null;
  return <group renderOrder={10}>
    {marks.map((p,i)=><mesh key={i} geometry={boxGeo} material={material} position={p} scale={[dot,dot,dot]}/>)}
    {measure.b&&<Line from={measure.a} to={measure.b} width={dot*.34} material={material}/>}
    {span&&mid&&<Html center position={mid} style={NO_POINTER} zIndexRange={[16777273,16777273]}><span className="measure-label"><b>{sayLength(span.distance)}</b>
      <i>X {sayLength(span.delta[0])} · Y {sayLength(span.delta[1])} · Z {sayLength(span.delta[2])}</i></span></Html>}
  </group>;
}

/** A bar between two points, since WebGL will not draw a line thicker than one pixel. */
function Line({from,to,width,material}:{from:Vec;to:Vec;width:number;material:THREE.Material}){
  const {position,quaternion,length}=useMemo(()=>{
    const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),dir=b.clone().sub(a);
    const length=dir.length()||1e-6;
    const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize());
    return {position:a.clone().add(b).multiplyScalar(.5),quaternion,length};
  },[from,to]);
  return <mesh geometry={boxGeo} material={material} position={position} quaternion={quaternion} scale={[width,length,width]}/>;
}

/**
 * A box around whatever is selected.
 *
 * Selection was a slight tint on the component's own colour, which is legible when the component
 * fills the canvas and invisible when it is one of four thousand. WebGL ignores line width, so the
 * box is built from twelve thin bars sized against the component — a cell gets an outline it can
 * carry and a container does not get a hairline. Clipped by the section plane like everything else.
 */
function SelectionBox({node}:{node:{position:Vec;size:Vec;kind?:string}|null}){
  const material=useMemo(()=>new THREE.MeshBasicMaterial({color:'#c6ed5a',clippingPlanes:[sectionPlane],toneMapped:false}),[]);
  useEffect(()=>()=>material.dispose(),[material]);
  const bars=useMemo(()=>{
    if(!node)return [];
    const [x,y,z]=node.size.map(v=>v*1.07) as Vec;
    const t=Math.max(.004,Math.min(x,y,z)*.075);
    const out:{key:string;position:Vec;scale:Vec}[]=[];
    for(const sy of [-1,1])for(const sz of [-1,1])out.push({key:`x${sy}${sz}`,position:[0,sy*y/2,sz*z/2],scale:[x+t,t,t]});
    for(const sx of [-1,1])for(const sz of [-1,1])out.push({key:`y${sx}${sz}`,position:[sx*x/2,0,sz*z/2],scale:[t,y+t,t]});
    for(const sx of [-1,1])for(const sy of [-1,1])out.push({key:`z${sx}${sy}`,position:[sx*x/2,sy*y/2,0],scale:[t,t,z+t]});
    return out;
  },[node]);
  if(!node)return null;
  return <group position={centreOf(node)}>{bars.map(b=>
    <mesh key={b.key} geometry={boxGeo} material={material} position={b.position} scale={b.scale}/>)}</group>;
}

const enclosureBox=(e:Vec)=>new THREE.Box3(new THREE.Vector3(-e[0]/2,0,-e[2]/2),new THREE.Vector3(e[0]/2,e[1],e[2]/2));

/**
 * Dimension runs on whatever is in view.
 *
 * The layer used to be one line of text under the container, which is not what anybody means by
 * turning dimensions on. It now measures the three axes of the current bounds with an offset run,
 * end ticks and a value — millimetres at component scale, metres once a plot is in view, because
 * "50,800 mm" is not how anybody talks about a site.
 */
function Dimensions({bounds}:{bounds:THREE.Box3}){
  const size=bounds.getSize(new THREE.Vector3()),min=bounds.min,max=bounds.max;
  const reach=Math.max(size.x,size.y,size.z);
  const off=Math.max(.12,reach*.06),bar=Math.max(.004,reach*.0022),tick=off*.55;
  const say=(m:number)=>reach>5?`${m.toFixed(m<10?2:1)} m`:`${(m*1000).toFixed(m<.3?1:0)} mm`;
  const runs:{key:string;length:number;centre:[number,number,number];scale:[number,number,number];ticks:[number,number,number][];label:[number,number,number]}[]=[
    {key:'X',length:size.x,centre:[(min.x+max.x)/2,min.y-off,max.z+off],scale:[size.x,bar,bar],
      ticks:[[min.x,min.y-off,max.z+off],[max.x,min.y-off,max.z+off]],label:[(min.x+max.x)/2,min.y-off-tick*.6,max.z+off]},
    {key:'Z',length:size.z,centre:[max.x+off,min.y-off,(min.z+max.z)/2],scale:[bar,bar,size.z],
      ticks:[[max.x+off,min.y-off,min.z],[max.x+off,min.y-off,max.z]],label:[max.x+off+tick*.6,min.y-off-tick*.3,(min.z+max.z)/2]},
    {key:'Y',length:size.y,centre:[max.x+off,(min.y+max.y)/2,max.z+off],scale:[bar,size.y,bar],
      ticks:[[max.x+off,min.y,max.z+off],[max.x+off,max.y,max.z+off]],label:[max.x+off+tick*.5,(min.y+max.y)/2,max.z+off+tick*.5]},
  ];
  return <group>{runs.filter(r=>r.length>1e-3).map(r=><group key={r.key}>
    <mesh position={r.centre} scale={r.scale}><boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#6d8494"/></mesh>
    {r.ticks.map((t,i)=><mesh key={i} position={t} scale={r.key==='Y'?[bar,tick*.5,tick]:[r.key==='X'?bar:tick,tick*.5,r.key==='X'?tick:bar]}>
      <boxGeometry args={[1,1,1]}/><meshBasicMaterial color="#8ea6b4"/></mesh>)}
    <Html center position={r.label} style={NO_POINTER}><span className="dimension-label">{r.key} {say(r.length)}</span></Html>
  </group>)}</group>;
}

function Scene({model,api}:{model:Model;api:React.Ref<ViewerHandle>}){const {scope,selected,revision,config,select,site}=useStudio(),{camera,gl,scene,size,invalidate}=useThree(),controls=useRef<any>(null);
 const plan=useMemo(()=>site?planSite(site):null,[site]);
 const ps=useMemo(()=>scope==='SITE'&&plan?sitePrimitives(plan,selected):primitives(model,scope),[model,scope,plan,selected]);
 const section=useStudio(s=>s.section);const batches=useMemo(()=>{const map=new Map<string,Primitive[]>();ps.forEach(p=>{const key=`${p.shape}-${!!p.metal}`;const batch=map.get(key);if(batch)batch.push(p);else map.set(key,[p]);});return [...map.values()];},[ps]);
 const bounds=useMemo(()=>{const b=new THREE.Box3();ps.forEach(p=>{const transform=new THREE.Matrix4().compose(new THREE.Vector3(...p.position),new THREE.Quaternion(...(p.rotation??[0,0,0,1])),new THREE.Vector3(...p.size));const local=new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(),p.shape==='box'?new THREE.Vector3(1,1,1):new THREE.Vector3(2,1,2));b.union(local.applyMatrix4(transform));});return b.isEmpty()?new THREE.Box3(new THREE.Vector3(-1,0,-1),new THREE.Vector3(1,2,1)):b;},[ps]);
 const cut=useMemo<Cut>(()=>{
   if(!section.on)return null;
   const min=bounds.min.toArray()[section.axis],max=bounds.max.toArray()[section.axis],pad=(max-min)*.02;
   return {axis:section.axis,at:min-pad+(max-min+2*pad)*section.at};
 },[section,bounds]);
 const inCut=keeps(cut);
 // Only when something inside the current scope is picked out — outlining the scope itself would
 // just draw a box round the whole canvas.
 const selectedNode=useMemo(()=>{
   if(selected===scope)return null;
   if(scope==='SITE')return plan?.placements.find(p=>p.id===selected)??null;
   const n=model.nodes.find(n=>n.id===selected);
   return n?{position:n.position,size:n.size,kind:n.kind}:null;
 },[selected,scope,plan,model]);
 const fit=()=>{const center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3()),distance=Math.max(...extent.toArray())*1.7+1;const views:Record<string,Vec>={iso:[1,.78,1.15],top:[0,1,.0001],front:[0,.12,1],side:[1,.12,0]};camera.position.copy(center).add(new THREE.Vector3(...views[config.camera.view]).normalize().multiplyScalar(distance));camera.up.set(0,1,0);camera.lookAt(center);if(camera instanceof THREE.OrthographicCamera){camera.updateMatrixWorld(true);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}const headroom=config.presentation?90:210;camera.zoom=Math.min(size.width*.82/Math.max(.3,maxX-minX),Math.max(120,size.height-headroom)/Math.max(.3,maxY-minY));camera.updateProjectionMatrix();}controls.current?.target.copy(center);controls.current?.update();invalidate();};
 useEffect(fit,[scope,revision,config.preset,config.presentation,config.camera.view,size.width,size.height,model.dimensions.pack.join(),model.dimensions.enclosure.join()]);
 useEffect(()=>{if(config.camera.position&&config.camera.target){camera.position.set(...config.camera.position);controls.current?.target.set(...config.camera.target);if(camera instanceof THREE.OrthographicCamera){camera.zoom=config.camera.zoom;camera.updateProjectionMatrix();}controls.current?.update();}},[]);
 useImperativeHandle(api,()=>({camera:()=>({position:camera.position.toArray() as Vec,target:controls.current.target.toArray() as Vec,zoom:camera.zoom}),profile:async()=>{const start=performance.now();let frames=0;await new Promise<void>(resolve=>{const frame=()=>{gl.render(scene,camera);frames++;if(performance.now()-start<3000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});const context=gl.getContext(),debug=context.getExtension('WEBGL_debug_renderer_info');return {fps:frames*1000/(performance.now()-start),drawCalls:gl.info.render.calls,triangles:gl.info.render.triangles,renderer:debug?context.getParameter(debug.UNMASKED_RENDERER_WEBGL):'unavailable',userAgent:navigator.userAgent};},png:async(width,height)=>{const max=gl.capabilities.maxTextureSize;if(width>max||height>max)throw new Error(`Requested image exceeds device texture limit ${max}.`);const oldSize=gl.getSize(new THREE.Vector2()),ratio=gl.getPixelRatio();const ortho=camera as THREE.OrthographicCamera;const old={left:ortho.left,right:ortho.right,top:ortho.top,bottom:ortho.bottom};try{gl.setPixelRatio(1);gl.setSize(width,height,false);const viewHeight=(old.top-old.bottom)/ortho.zoom,viewWidth=(old.right-old.left)/ortho.zoom,scale=Math.max(viewWidth/width,viewHeight/(height-160));ortho.left=-width*scale*ortho.zoom/2;ortho.right=-ortho.left;ortho.top=height*scale*ortho.zoom/2;ortho.bottom=-ortho.top;ortho.updateProjectionMatrix();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));gl.render(scene,camera);const output=document.createElement('canvas');output.width=width;output.height=height;const ctx=output.getContext('2d')!;ctx.drawImage(gl.domElement,0,0);const k=width/1920;ctx.fillStyle='#142e40';ctx.fillRect(0,0,width,70*k);ctx.fillStyle='#fff';ctx.font=`600 ${25*k}px Arial`;ctx.fillText(`${useStudio.getState().brandName||brand.vendorShort.toUpperCase()}  /  ${brand.platform.toUpperCase()}`,32*k,44*k);ctx.font=`${18*k}px Arial`;const product=useStudio.getState().product;ctx.fillText(scope==='SITE'&&site?`${site.units} units  ·  ${site.energyMWh.toFixed(2)} MWh DC  ·  ${site.powerMW.toFixed(2)} MW  ·  Site layout`:(product&&!product.modelled?`Reference assembly — not the ${product.model}  ·  ${scope}`:`${model.stats.equivalent}  ·  ${model.stats.energy.toFixed(4)} kWh  ·  ${scope}`),width*.56,44*k);if(config.logo){const img=new Image();img.src=config.logo;await img.decode();ctx.fillStyle='#fff';ctx.fillRect(18*k,8*k,250*k,53*k);const scale=Math.min(230*k/img.width,45*k/img.height);ctx.drawImage(img,26*k,12*k,img.width*scale,img.height*scale);}
 ctx.fillStyle='#142e40';ctx.font=`${16*k}px Arial`;if(config.visibility.labels&&!config.presentation){const labels=(scope==='BESS'?model.racks:model.packs.filter(p=>belongs(p.id,scope))).filter(inCut);for(const n of labels){const p=new THREE.Vector3(...add(n.position,[0,n.size[1]+.1,0])).project(camera);const x=(p.x+1)/2*width,y=(-p.y+1)/2*height;if(x>50*k&&x<width-120*k&&y>85*k&&y<height-125*k)ctx.fillText(n.id,x,y);}}
 ctx.fillStyle='#f5f7f8';ctx.fillRect(0,height-108*k,width,108*k);ctx.fillStyle='#142e40';ctx.font=`${16*k}px Arial`;ctx.fillText(qualification,30*k,height-72*k);ctx.fillText(`Custom enclosure ${model.dimensions.enclosure.map(x=>x.toFixed(3)).join(' × ')} m (X × Y × Z) • ${model.warnings.filter(w=>w.level==='error').length} active errors • Illustrative terminals and cable diameters`,30*k,height-43*k);ctx.fillStyle='#a23a22';ctx.fillText(model.warnings.find(w=>w.level==='error')?.text??'PCS compatibility remains unverified.',30*k,height-16*k);return await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed.')),'image/png'));}finally{Object.assign(ortho,old);ortho.updateProjectionMatrix();gl.setPixelRatio(ratio);gl.setSize(oldSize.x,oldSize.y,false);invalidate();}}}),[model,scope,config,bounds]);
 return <><color attach="background" args={['#0B0F14']}/><ambientLight intensity={1.5}/><hemisphereLight args={['#E4EDF2','#1A232A',1.35]}/><directionalLight position={[2,12,5]} intensity={3} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-.0002}/><directionalLight position={[-8,5,-6]} intensity={1.8}/><group>{batches.map((items,i)=><Batch key={`${i}-${items.length}`} items={items} selected={selected}/>)}{scope==='BESS'&&<Branding model={model}/>}</group><mesh rotation={[-Math.PI/2,0,0]} position={[0,-.19,0]} receiveShadow><planeGeometry args={[200,200]}/><shadowMaterial opacity={.34}/></mesh><gridHelper args={[40,80,'#2A3843','#182027']} position={[0,-.195,0]}/>
 {!config.presentation&&config.visibility.labels&&(scope==='SITE'?(plan?.placements.filter(p=>p.kind==='container')??[]).map(p=>({id:p.id,kind:'container' as const,position:p.position,size:p.size})):scope==='BESS'?model.racks:scope.includes('/C')?model.cells.filter(n=>n.id===scope):model.packs.filter(n=>belongs(n.id,scope))).filter(inCut).map(n=><Html key={n.id} center position={add(add(n.position,[0,n.size[1]+.1,0]),displacement(n,model))} distanceFactor={undefined} style={NO_POINTER}><button className="scene-label" onClick={()=>select(n.id)} onDoubleClick={()=>useStudio.getState().focus(n.id)}>{n.id}</button></Html>)}
 {!config.presentation&&config.visibility.labels&&scope!=='BESS'&&model.packs.filter(p=>belongs(p.id,scope)&&inCut(p)).flatMap(p=>['+','-'].map(pol=><Html key={`${p.id}${pol}`} center position={add(model.electrical.ports[`${p.id}:${pol}`].position,displacement(p,model))} style={NO_POINTER}><span className="polarity-label">{pol}</span></Html>))}
 <SectionPlane cut={cut}/>
 <SelectionBox node={selectedNode}/>
 <Measurement reach={Math.max(...bounds.getSize(new THREE.Vector3()).toArray())}/>
{config.visibility.dimensions&&<Dimensions bounds={scope==='BESS'?enclosureBox(model.dimensions.enclosure):bounds}/>}
 <OrbitControls ref={controls} onEnd={()=>useStudio.getState().update(c=>{c.camera.position=camera.position.toArray() as Vec;c.camera.target=controls.current.target.toArray() as Vec;c.camera.zoom=camera.zoom;})} makeDefault enableDamping dampingFactor={.12} minZoom={3} maxZoom={2800}/></>;
}
class Boundary extends Component<{children:ReactNode},{error:string}>{state={error:''};static getDerivedStateFromError(e:Error){return {error:e.message};}render(){return this.state.error?<div className="fallback"><h2>3D viewer unavailable</h2><p>{this.state.error}</p><p>Engineering data, configuration and schedules remain available.</p></div>:this.props.children;}}
export const Viewer=forwardRef<ViewerHandle,{model:Model}>(({model},ref)=>{const [available]=useState(()=>{try{const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl;}catch{return false;}});return <Boundary>{available?<Canvas shadows={{type:THREE.PCFShadowMap}} orthographic camera={{position:[10,9,12],zoom:55,near:.01,far:300}} dpr={[1,1.5]} gl={{antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance',localClippingEnabled:true}}><Scene model={model} api={ref}/></Canvas>:<div className="fallback"><h2>WebGL 2 is unavailable</h2><p>Enable hardware acceleration to explore the 3D model. All calculations and data exports remain available.</p></div>}</Boundary>;});
