import {source, type Config} from '../config/schema';
export type Vec=[number,number,number];
export type Kind='container'|'rack'|'pack'|'cell'|'ancillary';
export type Node={id:string,kind:Kind,parent?:string,position:Vec,size:Vec,row?:number,column?:number,order?:number,bank?:number};
export type Port={id:string,node:string,kind:'positive'|'negative'|'supply'|'return'|'earth'|'communication',position:Vec;localPosition:Vec};
export type Edge={id:string,from:string,to:string,kind:'busbar'|'hv'|'coolantSupply'|'coolantReturn'|'coldPlate'|'earth'|'bms',points:Vec[]};
export type Graph={ports:Record<string,Port>,edges:Edge[]};
export type Warning={code:string,level:'error'|'warning'|'info',text:string};
/**
 * What each studio check is called where it is shown. Prettifying the code gave "Ac Current" and
 * "Pcs Review": the terms of art misspelt, in the panel an engineer opens to check the design.
 */
export const studioWarningTitles:Record<string,string>={
 'source-energy':'Pack label against the calculated energy',
 'pcs-review':'Converter compatibility unverified',
 'voltage-unknown':'Equipment voltage limit not set',
 overvoltage:'String voltage above the equipment limit',
 undervoltage:'String voltage below the equipment minimum',
 'pcs-current':'Aggregate current above the equipment rating',
 'constant-current':'Constant DC demand at minimum voltage',
 'ac-current':'AC target and auxiliaries at minimum voltage',
 'fit-length':'Racks do not fit the enclosure length',
 'fit-height':'Racks do not fit the enclosure height',
 'fit-width':'Racks do not fit the enclosure width',
 aisle:'Service aisle below the required width',
 connector:'Connector allowance below the bend radius',
 'rack-collision':'Rack gap below the routing clearance',
 'service-interference':'Service bay interferes with ancillaries',
 'route-intersection':'Routes pass through cell bodies',
};
/** The check's own name where it has one, and a readable form of its code where it does not. */
export const studioWarningTitle=(code:string)=>studioWarningTitles[code]??code.replaceAll('-',' ');
export const m=(mm:number)=>mm/1000;
export const add=(a:Vec,b:Vec):Vec=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
export function worldPort(node:Node|undefined,local:Vec):Vec{return node?add(node.position,[local[0],local[1],local[2]*(node.bank===1?-1:1)]):local;}
export const idn=(n:number)=>String(n+1).padStart(2,'0');
export function calculate(c:Config){const s=c.preset==='reference'?4:3,p=48/s,cellEnergy=source.cellVoltage*source.cellAh/1000,packVoltage=source.cellVoltage*104,packEnergy=packVoltage*source.cellAh/1000,packPower=packVoltage*source.current/1000,energy=48*packEnergy,power=48*packPower,minVoltage=source.packMinVoltage*s,maxVoltage=source.packMaxVoltage*s,voltage=packVoltage*s,current=source.current*p;const u=c.usable;const duration=u.soc!==null&&u.efficiency!==null&&u.auxKW!==null&&u.acKW!==null?energy*u.soc*u.efficiency/(u.acKW+u.auxKW):null;const requestedDC=u.constantDCKW;const acDC=u.acKW!==null&&u.auxKW!==null&&u.efficiency!==null?(u.acKW+u.auxKW)/u.efficiency:null;return {seriesPacks:s,parallelStrings:p,racks:p,packs:48,cells:4992,cellEnergy,packVoltage,packEnergy,packPower,cRate:source.current/source.cellAh,energy,power,hours:energy/power,minVoltage,maxVoltage,voltage,current,capacity:source.cellAh*p,equivalent:`${104*s}S${p}P`,duration,requestedDC,acDC,currentAtMin:requestedDC!==null?requestedDC*1000/minVoltage:null,currentAtMax:requestedDC!==null?requestedDC*1000/maxVoltage:null,acCurrentAtMin:acDC!==null?acDC*1000/minVoltage:null,powerAtMin:minVoltage*current/1000,powerAtMax:maxVoltage*current/1000};}
export function dimensions(c:Config){const a=c.assumptions;const body:Vec=[8*m(a.cellWidth),m(a.cellHeight),13*m(source.cellThickness)];const pack:Vec=[body[0]+7*m(a.rowGap)+2*m(a.wall),body[1]+m(a.coldPlate+a.terminalClearance+2*a.wall),body[2]+12*m(a.cellGap)+2*m(a.compression+a.wall)+m(a.connector)];const calc=calculate(c);const pitch=pack[0]+m(a.rackGap),rackHeight=calc.seriesPacks*(pack[1]+m(a.verticalGap))+.18;const required:Vec=[calc.racks/2*pitch+2*m(a.endBay),Math.max(2.4,rackHeight+.25),2*pack[2]+m(a.aisle)+.16];const enclosure:Vec=a.manual?[m(a.length),m(a.height),m(a.width)]:required;return {body,pack,pitch,rackHeight,required,enclosure,aisle:m(a.aisle)};}
export type Model=ReturnType<typeof buildModel>;
export function buildModel(c:Config){const stats=calculate(c),d=dimensions(c),a=c.assumptions,nodes:Node[]=[{id:'BESS',kind:'container',position:[0,0,0],size:d.enclosure}],electrical:Graph={ports:{},edges:[]},hydraulic:Graph={ports:{},edges:[]};
 const port=(g:Graph,node:string,key:string,kind:Port['kind'],position:Vec)=>{const id=`${node}:${key}`;const owner=nodes.find(n=>n.id===node);const localPosition:Vec=owner?[position[0]-owner.position[0],position[1]-owner.position[1],(position[2]-owner.position[2])*(owner.bank===1?-1:1)]:position;g.ports[id]={id,node,kind,localPosition,position:worldPort(owner,localPosition)};return id;};
 const edge=(g:Graph,from:string,to:string,kind:Edge['kind'],via:Vec[]=[])=>{g.edges.push({id:`${from}>${to}`,from,to,kind,points:[g.ports[from].position,...via,g.ports[to].position]});};
 const racks:Node[]=[],packs:Node[]=[],cells:Node[]=[];
 const serviceX=-d.required[0]/2+m(a.endBay)*.45;
 const system:Node[]=[{id:'DC-COMBINER',kind:'ancillary',position:[serviceX,1.04,0],size:[.48,1.7,.5]},{id:'CHILLER',kind:'ancillary',position:[serviceX,.55,-d.required[2]/2+.4],size:[.6,1,.6]},{id:'SYSTEM-BMS',kind:'ancillary',position:[serviceX,1.95,0],size:[.36,.16,.26]}];nodes.push(...system);
 port(electrical,'DC-COMBINER','+', 'positive',[serviceX,.55,.3]);port(electrical,'DC-COMBINER','-', 'negative',[serviceX,.55,-.3]);port(electrical,'PCS','+', 'positive',[-d.required[0]/2-.2,.55,.3]);port(electrical,'PCS','-', 'negative',[-d.required[0]/2-.2,.55,-.3]);for(const pol of ['+','-'])edge(electrical,`DC-COMBINER:${pol}`,`PCS:${pol}`,'hv');
 port(hydraulic,'CHILLER','supply','supply',[serviceX,.24,-.34]);port(hydraulic,'CHILLER','return','return',[serviceX,.16,-.34]);
 port(hydraulic,'SUPPLY-HEADER','main','supply',[serviceX,.24,0]);port(hydraulic,'RETURN-HEADER','main','return',[serviceX,.16,.06]);edge(hydraulic,'CHILLER:supply','SUPPLY-HEADER:main','coolantSupply');edge(hydraulic,'RETURN-HEADER:main','CHILLER:return','coolantReturn');edge(hydraulic,'CHILLER:return','CHILLER:supply','coldPlate');
 port(electrical,'SYSTEM-BMS','com','communication',[serviceX,1.95,.15]);port(electrical,'EARTH','main','earth',[serviceX,.12,0]);
 for(let r=0;r<stats.racks;r++){const bank=r<stats.racks/2?0:1,sign=bank===0?1:-1,col=r%(stats.racks/2),x=-d.required[0]/2+m(a.endBay)+d.pitch*(col+.5),z=-sign*(d.aisle/2+d.pack[2]/2);const rid=`R${idn(r)}`,rack:Node={id:rid,kind:'rack',parent:'BESS',position:[x,0,z],size:[d.pack[0]+.06,d.rackHeight,d.pack[2]],bank};racks.push(rack);nodes.push(rack);
 const front=z+sign*(d.pack[2]/2+.035),corridor=sign===1?-d.aisle/2+.15:d.aisle/2-.15;
 port(electrical,rid,'earth','earth',[x,.12,front]);edge(electrical,'EARTH:main',`${rid}:earth`,'earth',[[serviceX,.12,corridor],[x,.12,corridor]]);
 port(electrical,rid,'com','communication',[x,d.rackHeight,front]);edge(electrical,'SYSTEM-BMS:com',`${rid}:com`,'bms',[[serviceX,d.rackHeight,corridor],[x,d.rackHeight,corridor]]);
 port(hydraulic,rid,'supply','supply',[x-.48,.24,front]);port(hydraulic,rid,'return','return',[x+.48,.16,front]);edge(hydraulic,'SUPPLY-HEADER:main',`${rid}:supply`,'coolantSupply',[[serviceX,.24,corridor],[x-.48,.24,corridor]]);edge(hydraulic,`${rid}:return`,'RETURN-HEADER:main','coolantReturn',[[x+.48,.16,corridor],[serviceX,.16,corridor]]);
 const rackPacks:Node[]=[];
 for(let p=0;p<stats.seriesPacks;p++){const pid=`${rid}/P${idn(p)}`,baseY=.18+p*(d.pack[1]+m(a.verticalGap)),pack:Node={id:pid,kind:'pack',parent:rid,position:[x,baseY,z],size:d.pack,bank};packs.push(pack);nodes.push(pack);rackPacks.push(pack);
 const cy=baseY+m(a.wall+a.coldPlate)+m(a.cellHeight)/2,top=cy+m(a.cellHeight)/2,packCells:Node[]=[];
 for(let row=0;row<8;row++){for(let j=0;j<13;j++){const order=row*13+j,column=row%2===0?j:12-j,cell:Node={id:`${pid}/C${String(order+1).padStart(3,'0')}`,kind:'cell',parent:pid,position:[x-d.body[0]/2-7*m(a.rowGap)/2+m(a.cellWidth)/2+row*m(a.cellWidth+a.rowGap),cy,z-sign*m(a.connector)/2+sign*(-(13*m(source.cellThickness)+12*m(a.cellGap))/2+m(source.cellThickness)/2+column*m(source.cellThickness+a.cellGap))],size:[m(a.cellWidth),m(a.cellHeight),m(source.cellThickness)],row,column,order,bank};cells.push(cell);nodes.push(cell);packCells.push(cell);const direction=(row%2===0?1:-1)*sign;port(electrical,cell.id,'-','negative',add(cell.position,[0,m(a.cellHeight)/2+.004,-direction*m(source.cellThickness)*.3]));port(electrical,cell.id,'+','positive',add(cell.position,[0,m(a.cellHeight)/2+.004,direction*m(source.cellThickness)*.3]));}}
 for(let j=0;j<103;j++){const from=`${packCells[j].id}:+`,to=`${packCells[j+1].id}:-`,f=electrical.ports[from].position,t=electrical.ports[to].position;edge(electrical,from,to,'busbar',[[f[0],top+.012,f[2]],[t[0],top+.012,t[2]]]);}
 for(const pol of ['-','+'] as const){port(electrical,pid,pol,pol==='+'?'positive':'negative',[x+(pol==='+'?.28:-.28),baseY+d.pack[1]-.014,front]);const cell=pol==='-'?packCells[0]:packCells[103];const cp=electrical.ports[`${cell.id}:${pol}`].position;edge(electrical,`${cell.id}:${pol}`,`${pid}:${pol}`,'busbar',[[cp[0],top+.019,cp[2]],[x+(pol==='+'?.28:-.28),top+.019,front]]);}
 port(electrical,pid,'com','communication',[x+.58,baseY+d.pack[1]-.04,front]);edge(electrical,`${pid}:com`,`${rid}:com`,'bms',[[x+.61,baseY+d.pack[1]-.04,front+.02*sign],[x+.61,d.rackHeight,front+.02*sign]]);
 port(hydraulic,pid,'supply','supply',[x-.48,baseY+m(a.wall)+m(a.coldPlate)/2,front]);port(hydraulic,pid,'return','return',[x+.48,baseY+m(a.wall)+m(a.coldPlate)/2,front]);edge(hydraulic,`${rid}:supply`,`${pid}:supply`,'coolantSupply',[[x-.53,.24,front+.035*sign],[x-.53,baseY+m(a.wall)+m(a.coldPlate)/2,front+.035*sign]]);edge(hydraulic,`${pid}:return`,`${rid}:return`,'coolantReturn',[[x+.53,baseY+m(a.wall)+m(a.coldPlate)/2,front+.07*sign],[x+.53,.16,front+.07*sign]]);edge(hydraulic,`${pid}:supply`,`${pid}:return`,'coldPlate');
 }
 for(let p=0;p<rackPacks.length-1;p++){const f=`${rackPacks[p].id}:+`,t=`${rackPacks[p+1].id}:-`,fp=electrical.ports[f].position,tp=electrical.ports[t].position;edge(electrical,f,t,'hv',[[fp[0],fp[1],corridor],[tp[0],tp[1],corridor]]);}
 // Each string has conceptual fuse, contactor, precharge and sensing, with no asserted rating.
 const protection=`${rid}/PROTECTION`;nodes.push({id:protection,kind:'ancillary',parent:rid,position:[x,d.rackHeight-.09,front],size:[.4,.12,.08],bank});
 for(const [i,type] of ['Fuse-disconnect','Contactor','Precharge circuit','Current sensor'].entries())nodes.push({id:`${rid}/${type.toUpperCase().replaceAll(' ','-')}`,kind:'ancillary',parent:rid,position:[x-.15+i*.1,d.rackHeight-.09,z+sign*(d.pack[2]/2+.045)],size:[.065,.075,.03],bank});
 port(electrical,protection,'in','positive',[x-.14,d.rackHeight-.09,front+.06*sign]);port(electrical,protection,'out','positive',[x+.14,d.rackHeight-.09,front+.06*sign]);const last=`${rackPacks.at(-1)!.id}:+`,lp=electrical.ports[last].position;edge(electrical,last,`${protection}:in`,'hv',[[lp[0],lp[1],corridor],[x-.14,d.rackHeight-.09,corridor]]);edge(electrical,`${protection}:in`,`${protection}:out`,'hv');edge(electrical,`${protection}:out`,'DC-COMBINER:+','hv',[[x+.14,d.rackHeight+.035,corridor],[serviceX,d.rackHeight+.035,corridor],[serviceX,.55,corridor]]);const first=`${rackPacks[0].id}:-`,fp=electrical.ports[first].position;edge(electrical,first,'DC-COMBINER:-','hv',[[fp[0],fp[1],corridor+.04*sign],[serviceX,fp[1],corridor+.04*sign],[serviceX,.55,corridor+.04*sign]]);
 }
 const warnings:Warning[]=[{code:'source-energy',level:'warning',text:`Source pack label 104.45 kWh differs from calculated ${stats.packEnergy.toFixed(4)} kWh (+${(stats.packEnergy-source.packEnergyLabel).toFixed(4)}).`},{code:'pcs-review',level:'info',text:'PCS compatibility unverified: operating voltage, current, fault and insulation ratings require review.'}];
 if(c.equipment.maxVoltage===null)warnings.push({code:'voltage-unknown',level:'warning',text:'Maximum equipment voltage is unset. Voltage compatibility is unverified.'});else if(stats.maxVoltage>c.equipment.maxVoltage)warnings.push({code:'overvoltage',level:'error',text:`${stats.maxVoltage.toLocaleString()} V exceeds the ${c.equipment.maxVoltage.toLocaleString()} V equipment limit by ${(stats.maxVoltage-c.equipment.maxVoltage).toFixed(1)} V.`});
 if(c.equipment.minVoltage!==null&&stats.minVoltage<c.equipment.minVoltage)warnings.push({code:'undervoltage',level:'error',text:'String minimum voltage falls below the PCS operating minimum.'});
 if(c.equipment.maxCurrent!==null&&stats.current>c.equipment.maxCurrent)warnings.push({code:'pcs-current',level:'error',text:'Aggregate current exceeds the specified equipment current rating.'});
 if(stats.currentAtMin!==null&&stats.currentAtMin>stats.current)warnings.push({code:'constant-current',level:'error',text:`Constant DC demand needs ${stats.currentAtMin.toFixed(1)} A at minimum voltage; supplied aggregate current is ${stats.current.toFixed(0)} A.`});
 if(stats.acCurrentAtMin!==null&&stats.acCurrentAtMin>Math.min(stats.current,c.equipment.maxCurrent??Infinity))warnings.push({code:'ac-current',level:'error',text:'AC target plus auxiliaries exceeds the available current at minimum voltage.'});
 for(const [i,label] of [[0,'length'],[1,'height'],[2,'width']] as const)if(d.enclosure[i]+1e-8<d.required[i])warnings.push({code:`fit-${label}`,level:'error',text:`Enclosure ${label} ${d.enclosure[i].toFixed(3)} m is below required ${d.required[i].toFixed(3)} m. Rack / service bounds penetrate the envelope.`});
 if(a.aisle<a.requiredAisle)warnings.push({code:'aisle',level:'error',text:'Service aisle is below the specified required width.'});
 if(a.connector<2*a.bendRadius)warnings.push({code:'connector',level:'error',text:'Connector allowance is smaller than twice the assumed cable bend radius.'});
 if(a.rackGap<2*a.bendRadius+30)warnings.push({code:'rack-collision',level:'error',text:'Rack gap does not provide the specified frame and routing clearances.'});
 if(a.endBay<700)warnings.push({code:'service-interference',level:'error',text:'Service bay interferes with proposed 0.6 m ancillary equipment and 0.1 m clearance.'});
 const intersections=cellRouteCollisions(cells,packs,[electrical,hydraulic]);if(intersections.length)warnings.push({code:'route-intersection',level:'error',text:`${intersections.length} routes intersect cell bodies. Review routing clearances.`});return {config:c,stats,dimensions:d,nodes,racks,packs,cells,electrical,hydraulic,warnings,intersections};
}
export function segmentIntersectsBox(a:Vec,b:Vec,min:Vec,max:Vec){let lo=0,hi=1;for(let i=0;i<3;i++){const delta=b[i]-a[i];if(Math.abs(delta)<1e-10){if(a[i]<min[i]||a[i]>max[i])return false;}else{const t1=(min[i]-a[i])/delta,t2=(max[i]-a[i])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;}}return true;}

export function cellRouteCollisions(cells:Node[],packs:Node[],graphs:Graph[]){const grouped=packs.map(p=>{const group=cells.filter(c=>c.parent===p.id);const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];const boxes=group.map(c=>{const a=c.position.map((v,i)=>v-c.size[i]/2+.0001) as Vec,b=c.position.map((v,i)=>v+c.size[i]/2-.0001) as Vec;for(let i=0;i<3;i++){min[i]=Math.min(min[i],a[i]);max[i]=Math.max(max[i],b[i]);}return {min:a,max:b};});return {min,max,boxes};});const hits=new Set<string>();for(const graph of graphs)for(const edge of graph.edges){if(edge.kind==='coldPlate')continue;for(let j=1;j<edge.points.length;j++){const a=edge.points[j-1],b=edge.points[j];for(const pack of grouped){if(!segmentIntersectsBox(a,b,pack.min,pack.max))continue;if(pack.boxes.some(box=>segmentIntersectsBox(a,b,box.min,box.max)))hits.add(edge.id);}}}return [...hits];}
