'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play,X} from 'lucide-react';
import type {Model} from '../domain/model';
import type {Config} from '../config/schema';
import {useStudio} from '../state/store';
import {walkSteps} from '../domain/tour';

const STEP_MS=11000;

/** Someone who has asked not to be moved around gets the narration without the timer. */
const reducedMotion=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Walkthrough({model,onClose}:{model:Model;onClose:()=>void}){
  const {update,focus}=useStudio();
  const steps=walkSteps(model);
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(!reducedMotion());
  const [elapsed,setElapsed]=useState(0);
  // Held as a ref as well as state: the timer effect re-runs on every step change, and reading the
  // state there would give it the previous step's clock and race the step straight past.
  const elapsedRef=useRef(0);
  // What the studio looked like before the walk started, so leaving puts it back.
  const before=useRef<Pick<Config,'visibility'|'explode'|'highlight'>|null>(null);
  if(!before.current){const c=useStudio.getState().config;before.current={visibility:{...c.visibility},explode:c.explode,highlight:c.highlight};}

  const step=steps[index];
  useEffect(()=>{
    update(c=>{Object.assign(c.visibility,step.visibility);c.explode=step.explode;c.highlight=step.highlight;});
    focus(step.target);
    elapsedRef.current=0;setElapsed(0);
  },[index]);   // eslint-disable-line react-hooks/exhaustive-deps

  const leave=useCallback(()=>{
    const restore=before.current;
    if(restore)update(c=>{Object.assign(c.visibility,restore.visibility);c.explode=restore.explode;c.highlight=restore.highlight;});
    focus('BESS');
    onClose();
  },[focus,onClose,update]);

  // The timer advances the walk and drives the progress bar; it stops on the last step rather than
  // looping, so nobody is left watching it go round.
  useEffect(()=>{
    if(!playing)return;
    const started=Date.now()-elapsedRef.current;
    const id=setInterval(()=>{
      const next=Date.now()-started;
      if(next>=STEP_MS){
        if(index<steps.length-1)setIndex(i=>i+1);
        else{setPlaying(false);elapsedRef.current=STEP_MS;setElapsed(STEP_MS);}
        return;
      }
      elapsedRef.current=next;setElapsed(next);
    },90);
    return()=>clearInterval(id);
  },[playing,index]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key==='Escape')leave();
      else if(e.key==='ArrowRight'&&index<steps.length-1){setPlaying(false);setIndex(i=>i+1);}
      else if(e.key==='ArrowLeft'&&index>0){setPlaying(false);setIndex(i=>i-1);}
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[index,leave,steps.length]);

  return <div className="walk" role="region" aria-label="Guided walk through the assembly">
    <div className="walk-progress"><i style={{width:`${playing?elapsed/STEP_MS*100:index===steps.length-1?100:0}%`}}/></div>
    <div className="walk-body">
      <span className="walk-eyebrow">{step.eyebrow}</span>
      <h2>{step.title}</h2>
      <p>{step.body}</p>
    </div>
    <div className="walk-controls">
      <div className="walk-dots">{steps.map((s,i)=>
        <button key={s.id} aria-label={s.title} aria-current={i===index} className={i===index?'active':i<index?'done':''}
          onClick={()=>{setPlaying(false);setIndex(i);}}/>)}</div>
      <button className="walk-step" aria-label="Previous step" disabled={index===0} onClick={()=>{setPlaying(false);setIndex(i=>i-1);}}><ChevronLeft size={16}/></button>
      <button className="walk-step" aria-label={playing?'Pause':'Play'} onClick={()=>setPlaying(p=>!p)}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
      {index<steps.length-1
        ? <button className="walk-next" onClick={()=>{setPlaying(false);setIndex(i=>i+1);}}>Next <ChevronRight size={15}/></button>
        : <button className="walk-next" onClick={leave}>Explore it yourself</button>}
      <button className="walk-step" aria-label="Leave the walk" onClick={leave}><X size={16}/></button>
    </div>
  </div>;
}
