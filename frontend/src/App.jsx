import React, { useState, useRef, useEffect, Suspense, useMemo, useLayoutEffect } from 'react';
import Viewport from './Viewport';

// --- ICONS ---
const IconExtrude = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const IconCylinderFill = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5"></path></svg>;
const IconLoft = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polygon points="12 12 2 17 12 22 22 17 12 12"></polygon></svg>;
const IconSheet = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 8 12 3 21 8 12 13 3 8"></polygon></svg>;
const IconClear = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconCut = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>;
const IconEye = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>;
const IconEyeOff = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>;
const IconSquare = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>;
const IconCylinderOutline = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6c0 1.657 3.582 3 8 3s8-1.343 8-3M4 6c0-1.657 3.582-3 8-3s8 1.343 8 3m-16 0v12c0 1.657 3.582 3 8 3s8-1.343 8-3V6"></path></svg>;
const IconSphere = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>;
const IconCone = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 20h20L12 2z"></path></svg>;
const IconTorus = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="4"></circle></svg>;
const IconWave = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c-2.66 0-4.33-3-7-3s-4.34 3-7 3-4.33-3-7-3"></path></svg>;
const IconTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
const IconCursor = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>;
const IconMove = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M19 9l3 3-3 3M9 19l3 3 3 3M2 12h20M12 2v20"/></svg>;
const IconRotate = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>;
const IconScale = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 3l-6 6M21 3v6M21 3h-6M3 21l6-6M3 21v-6M3 21h6M14 10L10 14"/></svg>;
const IconLink = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>;
const IconFlip = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line></svg>;
const IconPatch = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path></svg>;
const IconSew = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12c1.5-1.5 3.5-1.5 5 0 1.5 1.5 3.5 1.5 5 0s3.5-1.5 5 0"></path><line x1="9" y1="4" x2="9" y2="20"></line><line x1="15" y1="4" x2="15" y2="20"></line></svg>;
const IconMagicWand = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l18-18"></path><path d="M12.22 7.78l4 4"></path><path d="M8 8l-2 2"></path><path d="M16 16l-2 2"></path><path d="M4 4l2-2"></path><path d="M20 20l2-2"></path></svg>;

const applySnap = (value, snapThreshold) => {
    if (!snapThreshold || snapThreshold <= 0) return value;
    return Math.round(value / snapThreshold) * snapThreshold;
};

function ActionRing({ anchorPos, selectedLoops, selectedItemsData, extrudeDepth, setExtrudeDepth, onExtrude, onLoft, onSheet, onPatch, onMagicPatch, onSew, onCut, onSubtract, onClear, onPromote, onExtractCurve, onDeleteItem, onUpdateDepth, patchAnalysis, setPatchAnalysis, onCreatePrimitive, onCreateBlade, linearSnap, transformMode }) {
  const [pos, setPos] = useState({ x: -1000, y: -1000 });
  const [keepTool, setKeepTool] = useState(false);

  const isSingleExtrusion = selectedItemsData.length === 1 && (
      selectedItemsData[0].payload?.operation === 'extrude' || 
      selectedItemsData[0].type === 'blade' ||
      (selectedItemsData[0].payload?.primitive_type === 'plane' && selectedItemsData[0].payload?.extrude_depth !== undefined) || 
      selectedItemsData[0].payload?.operation === 'extrude_sheet'
  );
                           
  const [localDepth, setLocalDepth] = useState(extrudeDepth);

  useEffect(() => {
    if (isSingleExtrusion && selectedItemsData[0]) {
        setLocalDepth(selectedItemsData[0].payload?.extrude_depth || 0);
    } else {
        setLocalDepth(extrudeDepth);
    }
  }, [selectedItemsData, extrudeDepth, isSingleExtrusion]);

  useEffect(() => {
    if (!anchorPos) return;
    
    const transformActive = transformMode !== null;
    const offset = transformActive ? 320 : 120;
    const ringSize = 135; 

    let targetX = anchorPos.x + offset + (selectedItemsData.length > 0 ? 160 : 0);
    let targetY = anchorPos.y + offset;

    if (targetX + ringSize > window.innerWidth) targetX = anchorPos.x - offset - (selectedItemsData.length > 0 ? 160 : 0); 
    if (targetY + ringSize > window.innerHeight) targetY = anchorPos.y - offset;

    setPos({ x: targetX, y: targetY });
  }, [anchorPos, selectedItemsData, transformMode]);

  if ((!selectedLoops || selectedLoops.length === 0) && selectedItemsData.length === 0) return null;

  const planeCount = selectedLoops.filter(l => l.type !== 'circle' && !l.patch_faces).length;
  const circleCount = selectedLoops.filter(l => l.type === 'circle').length;
  const faceSelectionCount = selectedLoops.filter(l => l.patch_faces && !l.type).length;
  const hasPatchFaces = selectedLoops.length === 1 && selectedLoops[0].patch_faces;
  
  let selectionText = [];
  if (faceSelectionCount > 0) selectionText.push(`${faceSelectionCount} Face${faceSelectionCount > 1 ? 's' : ''}`);
  if (planeCount > 0) selectionText.push(`${planeCount} Wire${planeCount > 1 ? 's' : ''}`);
  if (circleCount > 0) selectionText.push(`${circleCount} Cylinder${circleCount > 1 ? 's' : ''}`);
  
  if (selectedItemsData.length > 0) {
      const typeCounts = {};
      selectedItemsData.forEach(i => typeCounts[i.type === 'sheet' ? 'face' : i.type] = (typeCounts[i.type === 'sheet' ? 'face' : i.type] || 0) + 1);
      Object.entries(typeCounts).forEach(([type, count]) => {
          selectionText.push(`${count} ${type.charAt(0).toUpperCase() + type.slice(1)}${count > 1 ? 's' : ''}`);
      });
  }
  const selectionString = selectionText.length > 0 ? `Selected: ${selectionText.join(', ')}` : '';

  const isCylinderLoop = selectedLoops.length === 1 && selectedLoops[0].type === 'circle';
  const extrudeLabel = isCylinderLoop ? 'Cylinder' : 'Extrude';
  const scoutedCount = selectedLoops.filter(l => l.clickPoint).length;

  const radius = 70; 
  const outerRadius = 135; 
  const buttons = [];
  const outerButtons = [];

  const isSingleSheet = selectedItemsData.length === 1 && selectedItemsData[0].type === 'sheet';
  const hasVolume = selectedItemsData.some(i => i.type === 'solid' || i.type === 'blade');
  const isTwoVolumes = selectedItemsData.length === 2 && 
      selectedItemsData.every(i => i.type === 'solid' || i.type === 'blade');
  const isLoopAndSolid = selectedLoops.length === 1 && selectedItemsData.length === 1 && selectedItemsData[0].type === 'solid';
  const hasFaces = selectedItemsData.length > 0 && selectedItemsData.every(i => i.type === 'sheet');

  if (selectedLoops.length > 0 && selectedItemsData.length === 0) {
      if (selectedLoops.length === 1) {
          buttons.push({ label: extrudeLabel, icon: isCylinderLoop ? <IconCylinderFill /> : <IconExtrude />, angle: -90, action: onExtrude, disabled: false, color: 'text-blue-400' });
          
          if (patchAnalysis) {
              buttons.push({ label: 'Create\nPrimitive', icon: <IconExtrude />, angle: 0, action: onCreatePrimitive, disabled: false, color: 'text-emerald-400' });
              if (patchAnalysis.type === 'plane' || patchAnalysis.type === 'planar') {
                  buttons.push({ label: 'Create\nBlade', icon: <IconSquare />, angle: 45, action: onCreateBlade, disabled: false, color: 'text-amber-400' });
              }
          } else {
              buttons.push({ label: 'Face', icon: <IconSheet />, angle: 90, action: onSheet, disabled: false, color: 'text-green-400' });
          }

          if (hasPatchFaces) {
              buttons.push({ label: 'Magic\nPatch', icon: <IconMagicWand />, angle: 180, action: onMagicPatch, disabled: false, color: 'text-indigo-400', glow: true });
          }

          if (scoutedCount > 0) {
              buttons.push({ label: 'Extract\nCurve', icon: <IconWave />, angle: -135, action: onExtractCurve, disabled: false, color: 'text-purple-400' });
          }
      }

      if (selectedLoops.length === 2) {
          buttons.push({ label: 'Loft', icon: <IconLoft />, angle: 0, action: onLoft, disabled: false, color: 'text-blue-400' });
      }

      if (selectedLoops.length > 1 && faceSelectionCount === 0) {
          const isFour = selectedLoops.length === 4;
          buttons.push({ 
              label: 'Patch\nWires', 
              icon: <IconPatch />, 
              angle: 45, 
              action: onPatch, 
              disabled: false, 
              color: isFour ? 'text-emerald-300' : 'text-emerald-500',
              glow: isFour 
          });
      }
  } 

  if (isSingleSheet || hasFaces) {
      buttons.push({ label: 'Sew\nSurfaces', icon: <IconSew />, angle: 45, action: onSew, disabled: selectedItemsData.length < 2, color: 'text-blue-400' });
      if (isSingleSheet) {
          buttons.push({ label: 'Promote to\nSolid', icon: <IconExtrude />, angle: -45, action: () => onPromote(selectedItemsData[0].id, 'solid'), disabled: false, color: 'text-emerald-400' });
          buttons.push({ label: 'Convert to\nBlade', icon: <IconSquare />, angle: -135, action: () => onPromote(selectedItemsData[0].id, 'blade'), disabled: false, color: 'text-amber-400' });
      }
  } else if (isSingleExtrusion) {
      buttons.push({ label: 'Flip\nDirection', icon: <IconFlip />, angle: 90, action: () => onUpdateDepth(selectedItemsData[0].id, (selectedItemsData[0].payload?.extrude_depth || extrudeDepth) * -1), disabled: false, color: 'text-amber-400' });
  }

  if (isTwoVolumes) {
      buttons.push({ label: 'Subtract', icon: <IconCut />, angle: -90, action: () => onSubtract(keepTool), disabled: false, color: 'text-orange-400' });
  }
  
  if (hasVolume) {
      outerButtons.push({ 
          label: keepTool ? 'Keep Tool:\nON' : 'Keep Tool:\nOFF', 
          icon: <IconLink />, 
          angle: -45, 
          action: () => setKeepTool(!keepTool), 
          disabled: false, 
          color: keepTool ? 'text-emerald-400' : 'text-zinc-500' 
      });
  }

  if (isLoopAndSolid) {
      buttons.push({ label: 'Cut', icon: <IconCut />, angle: -45, action: onCut, disabled: false, color: 'text-orange-400' });
  }

  if (selectedLoops.length > 0 || selectedItemsData.length > 0) {
      outerButtons.push({ 
          label: 'Delete', 
          icon: <IconTrash />, 
          angle: -135, 
          action: () => onDeleteItem([...selectedItemsData.map(i => i.id), ...selectedLoops.map(l => l.id).filter(Boolean)]), 
          disabled: selectedItemsData.length === 0 && selectedLoops.filter(l => l.id).length === 0, 
          color: 'text-red-500' 
      });
      outerButtons.push({ label: 'Clear\nSelection', icon: <IconClear />, angle: 45, action: onClear, disabled: false, color: 'text-zinc-400' });
  }

  return (
    <div style={{ left: pos.x, top: pos.y }} className="fixed pointer-events-none z-40 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all duration-200">
       
       <div className="absolute bottom-[130px] flex flex-col items-center gap-1.5 pointer-events-none w-80 text-center">
          {selectionString && (
            <span className={`font-black px-3 py-1 rounded text-[10px] uppercase tracking-widest ${isSingleExtrusion ? 'bg-amber-600 text-white border border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.5)]' : 'bg-amber-500 text-zinc-950 border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}>
              {selectionString}
            </span>
          )}
          
          {patchAnalysis && selectedLoops.length === 1 && (
             <div className="flex flex-col items-center gap-1 pointer-events-auto mt-1">
                <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-700 backdrop-blur-md shadow-lg">
                   Suggested: <span className="text-amber-400">{patchAnalysis.type}</span>
                </span>
                <div className="flex gap-1.5 mt-0.5">
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'plane'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'plane' || patchAnalysis.type === 'planar' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Plane"><IconSquare /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'cylinder'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'cylinder' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Cylinder"><IconCylinderOutline /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'sphere'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'sphere' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Sphere"><IconSphere /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'cone'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'cone' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Cone"><IconCone /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'torus'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'torus' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Torus"><IconTorus /></button>
                </div>
             </div>
          )}
       </div>

       <div className="absolute w-[160px] h-[160px] rounded-full border border-zinc-600/30 bg-zinc-900/40 backdrop-blur-md animate-in zoom-in duration-150 pointer-events-none" />
       
       <div 
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full border shadow-xl backdrop-blur-md animate-in zoom-in transition-colors ${isSingleExtrusion ? 'bg-zinc-800/95 border-amber-500/50' : 'bg-zinc-800/90 border-zinc-600'}`}
       >
         {isCylinderLoop && (
             <span className="text-[7.5px] font-black uppercase text-emerald-400 tracking-tighter leading-none mb-1">R: {selectedLoops[0].radius.toFixed(2)}</span>
         )}
         <span className={`text-[7px] font-black uppercase tracking-tighter leading-none mb-0.5 mt-0.5 ${isSingleExtrusion ? 'text-amber-400' : 'text-zinc-400'}`}>Depth</span>
         <input 
           type="number" 
           value={localDepth} 
           onChange={(e) => setLocalDepth(parseFloat(e.target.value) || 0)}
           onBlur={(e) => {
               const snappedVal = applySnap(parseFloat(e.target.value) || 0, linearSnap);
               setLocalDepth(snappedVal);
               if (isSingleExtrusion && selectedItemsData[0]) {
                   if (snappedVal !== (selectedItemsData[0].payload?.extrude_depth || 0)) {
                       onUpdateDepth(selectedItemsData[0].id, snappedVal);
                   }
               } else {
                   setExtrudeDepth(snappedVal);
               }
           }}
           onKeyDown={(e) => {
               if (e.key === 'Enter') e.target.blur();
           }}
           className={`w-10 bg-transparent text-center text-[10px] font-mono outline-none focus:bg-zinc-700/50 rounded transition-colors ${isSingleExtrusion ? 'text-amber-400 font-bold' : 'text-white'}`}
           step={linearSnap > 0 ? linearSnap : 0.5}
         />
       </div>

       {outerButtons.map((btn, i) => {
          const rad = (btn.angle * Math.PI) / 180;
          const x = Math.cos(rad) * outerRadius;
          const y = Math.sin(rad) * outerRadius;
          return (
             <button
               key={`outer-${i}`}
               onClick={(e) => { e.stopPropagation(); btn.action(); }}
               disabled={btn.disabled}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               className={`absolute pointer-events-auto flex flex-col items-center justify-center w-12 h-12 transition-all drop-shadow-2xl 
                 ${btn.disabled ? 'text-zinc-600/50 cursor-not-allowed opacity-50' : `hover:scale-110 hover:text-white ${btn.color}`}`}
             >
               <span className="mb-0.5 pointer-events-none scale-125">{btn.icon}</span>
               <span className="text-[6.5px] font-black uppercase tracking-tighter pointer-events-none mt-1 leading-none text-center whitespace-pre-line">{btn.label}</span>
             </button>
          );
       })}

       {buttons.map((btn, i) => {
          const rad = (btn.angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          const glowClass = btn.glow ? 'shadow-[0_0_15px_rgba(16,185,129,0.8)] border-emerald-400' : 'shadow-xl border-zinc-600';
          return (
             <button
               key={`inner-${i}`}
               onClick={(e) => { e.stopPropagation(); btn.action(); }}
               disabled={btn.disabled}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               className={`absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all backdrop-blur-md border 
                 ${glowClass}
                 ${btn.disabled ? 'bg-zinc-800/80 text-zinc-600 border-zinc-700/50 cursor-not-allowed' : `bg-zinc-800/90 hover:bg-zinc-700 hover:scale-110 hover:border-zinc-300 ${btn.color}`}`}
             >
               <span className="mb-0.5 pointer-events-none">{btn.icon}</span>
               <span className="text-[6.5px] font-black uppercase tracking-tighter text-zinc-300 pointer-events-none text-center whitespace-pre-line leading-tight mt-0.5">{btn.label}</span>
             </button>
          );
       })}
    </div>
  );
}

export default function App() {
  const [objUrl, setObjUrl] = useState(null);
  const [fileName, setFileName] = useState("Imported.obj");
  const [backendStatus, setBackendStatus] = useState("Waiting for mesh...");
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mergeExportHulls, setMergeExportHulls] = useState(true);
  const [cursorScale, setCursorScale] = useState(0.005); 
  const [sharpnessAngle, setSharpnessAngle] = useState(30);
  const [edgeSmoothing, setEdgeSmoothing] = useState(50); 
  
  const [decimationTarget, setDecimationTarget] = useState(25000);
  const [sharpeningIters, setSharpeningIters] = useState(3);
  const [linearSnap, setLinearSnap] = useState(0); 
  const [angleSnap, setAngleSnap] = useState(0); 
  
  const [transformMode, setTransformMode] = useState(null);
  const [selectionMode, setSelectionMode] = useState('curve-extract');
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  
  const [featuresHistory, setFeaturesHistory] = useState([[]]); 
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);

  const [selectedLoops, setSelectedLoops] = useState([]);
  const [rebuildHistory, setRebuildHistory] = useState([]); 
  const [selectedItemIds, setSelectedItemIds] = useState([]); 
  const [extrudeDepth, setExtrudeDepth] = useState(5.0);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const [patchAnalysis, setPatchAnalysis] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false); // NEW BATCH MODAL STATE

  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });
  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));
  const [showMesh, setShowMesh] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(0.4);
  
  const [outlinerExpanded, setOutlinerExpanded] = useState({ mesh: true, curves: true, sheets: true, solids: true, shells: true });
  const toggleOutliner = (key) => setOutlinerExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  const [hiddenCurveIds, setHiddenCurveIds] = useState([]);
  
  const [serverLogs, setServerLogs] = useState(["System initialized. Ready for operations..."]);
  const consoleEndRef = useRef(null);

  useEffect(() => {
    const pollLogs = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/logs');
        if (res.ok) {
          const data = await res.json();
          if (data.logs && data.logs.length > 0) {
            setServerLogs(data.logs);
          }
        }
      } catch (err) {}
    };
    const interval = setInterval(pollLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [serverLogs]);

  const currentFeatures = featuresHistory[historyIndex];

  const commitFeatures = (newFeatures) => {
    const newHistory = featuresHistory.slice(0, historyIndex + 1);
    newHistory.push(newFeatures);
    setFeaturesHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleGlobalUndo = async () => {
    if (rebuildHistory.length > 0) {
        try {
            const res = await fetch('http://localhost:8000/undo-geometry', { method: 'POST' });
            if (res.ok) {
                setRebuildHistory(prev => prev.slice(0, -1));
                setSelectedItemIds([]);
            }
        } catch (err) { console.error(err); }
    } else if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1);
    }
  };

  const handleGlobalRedo = () => {
    if (historyIndex < featuresHistory.length - 1) {
        setHistoryIndex(prev => prev + 1);
    }
  };

  const handleGlobalDelete = (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    setRebuildHistory(prev => prev.map(geo => idList.includes(geo.id) ? { ...geo, deleted: true } : geo));
    setSelectedItemIds(prev => prev.filter(id => !idList.includes(id)));
    
    const newFeatures = currentFeatures.filter(f => !idList.includes(f.id));
    if (newFeatures.length !== currentFeatures.length) {
        commitFeatures(newFeatures);
    }
    setSelectedLoops(prev => prev.filter(l => !idList.includes(l.id)));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      
      const key = e.key.toLowerCase();
      
      if (key === 'q') setTransformMode(null);
      if (key === 'w') setTransformMode('translate');
      if (key === 'e') setTransformMode('rotate');
      if (key === 'r') setTransformMode('scale');

      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          handleGlobalUndo();
        } else if (key === 'y') {
          e.preventDefault();
          handleGlobalRedo();
        }
      }

      if (key === 'delete' || key === 'backspace') {
         e.preventDefault();
         const idsToDelete = [...selectedItemIds, ...selectedLoops.map(l => l.id).filter(Boolean)];
         if (idsToDelete.length > 0) {
             handleGlobalDelete(idsToDelete);
         }
         setPatchAnalysis(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, featuresHistory.length, rebuildHistory, selectedItemIds, selectedLoops, currentFeatures]);

  const handleDeleteFeature = (id) => handleGlobalDelete(id);
  const handleDeleteGeometry = (ids) => handleGlobalDelete(ids);

  const handleClearAllFeatures = () => {
    if (currentFeatures.length === 0) return;
    commitFeatures([]);
  };

  const handleHideAllWires = (e) => {
    e.stopPropagation();
    const allVisible = currentFeatures.length > 0 && hiddenCurveIds.length !== currentFeatures.length;
    if (allVisible) {
        setHiddenCurveIds(currentFeatures.map(f => f.id));
    } else {
        setHiddenCurveIds([]);
    }
  };

  const toggleCurveVisibility = (id) => {
    setHiddenCurveIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleExtractCurveFromRing = async () => {
    const scoutedLoops = selectedLoops.filter(l => l.clickPoint);
    if (scoutedLoops.length === 0) return;
    setIsCommitting(true);
    const newFeatures = [];
    
    for (const loop of scoutedLoops) {
      try {
        const res = await fetch(`http://localhost:8000/extract-feature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            x: loop.clickPoint.x, y: loop.clickPoint.y, z: loop.clickPoint.z, 
            sharpness_angle: sharpnessAngle,
            edge_smoothing: edgeSmoothing / 100.0
          })
        });
        if (res.ok) {
          newFeatures.push(await res.json());
        } 
      } catch (e) { }
    }

    if (newFeatures.length > 0) {
      const mapped = newFeatures.map(f => ({ ...f, id: f.id || Math.random().toString(36).substr(2, 9) }));
      commitFeatures([...currentFeatures, ...mapped]);
    }
    
    setSelectedLoops([]);
    setPatchAnalysis(null);
    setIsCommitting(false);
  };

  const executeGeometryOperation = async (endpoint, payload, type, defaultName) => {
    setIsCommitting(true);
    
    const geoId = payload.geo_id || Math.random().toString(36).substr(2, 9);
    const finalPayload = { edge_smoothing: edgeSmoothing / 100.0, ...payload, geo_id: geoId };

    try {
      const res = await fetch(`http://localhost:8000/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalPayload)
      });
      if (res.ok) {
        const geometryData = await res.json();
        
        setRebuildHistory(prev => {
            const existingIdx = prev.findIndex(g => g.id === geoId);
            if (existingIdx >= 0) {
                const newArr = [...prev];
                newArr[existingIdx] = { ...newArr[existingIdx], ...geometryData, type, payload: finalPayload, endpoint };
                return newArr;
            } else {
                return [...prev, { ...geometryData, type, id: geoId, visible: true, name: `${defaultName} ${prev.length + 1}`, payload: finalPayload, endpoint }];
            }
        });

        setSelectedLoops([]); 
        setSelectedItemIds(prev => prev.includes(geoId) ? prev : [geoId]); 
        setPatchAnalysis(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail || 'Unknown CAD Engine crash.'}`]);
      }
    } catch (err) { setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); }
    setIsCommitting(false);
  };

  const handleCreatePatch = () => {
    if (selectedLoops.length < 1) return;
    const payloadLoops = selectedLoops.map(loop => ({
        ...loop,
        type: loop.type || 'planar'
    }));
    executeGeometryOperation('create-patch', { loops: payloadLoops, sharpness_angle: sharpnessAngle }, 'sheet', 'Patch');
  };

  const handleMagicPatch = () => {
    if (selectedLoops.length < 1 || !selectedLoops[0].patch_faces) return;
    executeGeometryOperation('magic-patch', { patch_faces: selectedLoops[0].patch_faces, sharpness_angle: sharpnessAngle }, 'sheet', 'Patch');
  };

  // --- EXISTING ORGANIC BATCH PIPELINE ---
  const handleBatchMagicPatch = async () => {
    setIsCommitting(true);
    setServerLogs(prev => [...prev, `[System] Initiating Organic Surface Extraction...`]);
    try {
        const res = await fetch('http://localhost:8000/batch-magic-patch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              sharpness_angle: sharpnessAngle,
              edge_smoothing: edgeSmoothing / 100.0
            })
        });
        if (res.ok) {
            const data = await res.json();
            
            const newGeometries = data.geometries.map(geo => ({
                ...geo,
                visible: true,
            }));
            
            setRebuildHistory(prev => [...prev, ...newGeometries]);
            
            setOutlinerExpanded(prev => ({...prev, solids: true}));
            setSelectedItemIds(newGeometries.map(g => g.id));
            setServerLogs(prev => [...prev, `[Success] Extracted ${newGeometries.length} surfaces. Ready for Booleans.`]);
        } else {
            const err = await res.json();
            setServerLogs(prev => [...prev, `[Error] Surface extraction failed: ${err.detail}`]);
        }
    } catch (err) {
        setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]);
    }
    setIsCommitting(false);
  };

  // --- NEW STRUCTURED MASTER SKELETON PIPELINE ---
  const handleStructuredPipeline = async () => {
    setIsCommitting(true);
    setServerLogs(prev => [...prev, `[System] Initiating Structured CAD Pipeline (3-Pass Classification)...`]);

    try {
        // Step 1: Extract Base Skeleton
        setServerLogs(prev => [...prev, `[System] Step 1/3: Extracting underlying wireframe...`]);
        let res = await fetch('http://localhost:8000/build-skeleton', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sharpness_angle: sharpnessAngle, edge_smoothing: edgeSmoothing / 100.0 })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }

        // Step 2: Refine/Classify 3D Curves
        setServerLogs(prev => [...prev, `[System] Step 2/3: Running Andrew's 3-Pass Classification (Circles -> Lines -> Splines)...`]);
        res = await fetch('http://localhost:8000/refine-skeleton', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ circle_tolerance: 0.05, line_tolerance: 0.05 })
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        let refData = await res.json();
        setServerLogs(prev => [...prev, `[System] Found: ${refData.metrics.circle} Circles, ${refData.metrics.line} Lines, ${refData.metrics.spline} Splines.`]);

        // Step 3: Inject Faces & Sew Shell
        setServerLogs(prev => [...prev, `[System] Step 3/3: Surfacing Curve Network...`]);
        res = await fetch('http://localhost:8000/generate-shell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        let geoData = await res.json();

        setRebuildHistory(prev => [...prev, { ...geoData, type: geoData.is_solid ? 'solid' : 'shell', visible: true, name: `Structured_${geoData.id.substring(0,4)}` }]);
        setSelectedItemIds([geoData.id]);
        setOutlinerExpanded(prev => ({...prev, solids: true, shells: true}));
        setServerLogs(prev => [...prev, `[Success] Master Skeleton surfacing complete. Result: ${geoData.is_solid ? 'Solid' : 'Shell'}`]);

    } catch (err) {
        setServerLogs(prev => [...prev, `[Error] Pipeline Halted: ${err.message || 'Unknown network error'}`]);
    }
    setIsCommitting(false);
  };

  const handleSew = async () => {
    if (selectedItemIds.length < 2) return;
    setIsCommitting(true);
    const geoId = Math.random().toString(36).substr(2, 9);
    setServerLogs(prev => [...prev, `[System] Sewing ${selectedItemIds.length} faces...`]);
    try {
        const res = await fetch(`http://localhost:8000/sew-surfaces`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ geo_id: geoId, target_ids: selectedItemIds, edge_smoothing: edgeSmoothing / 100.0 })
        });
        if (res.ok) {
            const geometryData = await res.json();
            setRebuildHistory(prev => {
                let newHistory = prev.map(geo => selectedItemIds.includes(geo.id) ? { ...geo, deleted: true } : geo);
                newHistory.push({ 
                    ...geometryData, 
                    type: geometryData.is_solid ? 'solid' : 'shell', 
                    id: geoId, 
                    visible: true, 
                    name: `Sewn_${geoId}`, 
                    endpoint: 'sew-surfaces', 
                    payload: { target_ids: selectedItemIds, edge_smoothing: edgeSmoothing / 100.0 } 
                });
                return newHistory;
            });
            setSelectedItemIds([geoId]);
            setSelectedLoops([]);
        } else {
            const err = await res.json();
            setServerLogs(prev => [...prev, `[Error] ${err.detail}`]);
        }
    } catch (err) {
        setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]);
    }
    setIsCommitting(false);
  };

  const handleCreatePrimitive = async () => {
    if (selectedLoops.length === 0 || !patchAnalysis) return;
    const loop = selectedLoops[0];
    if (!loop.patch_faces) return;
    
    const payload = {
        patch_faces: loop.patch_faces,
        primitive_type: patchAnalysis.type,
        sharpness_angle: sharpnessAngle,
        symmetry: symmetry,
        extrude_depth: 0.0
    };
    executeGeometryOperation('create-primitive', payload, patchAnalysis.type === 'plane' || patchAnalysis.type === 'planar' ? 'sheet' : 'solid', patchAnalysis.type.charAt(0).toUpperCase() + patchAnalysis.type.slice(1));
  };

  const handleCreateBlade = async () => {
    if (selectedLoops.length === 0 || !patchAnalysis) return;
    const loop = selectedLoops[0];
    if (!loop.patch_faces) return;

    const payload = {
        patch_faces: loop.patch_faces,
        primitive_type: patchAnalysis.type,
        sharpness_angle: sharpnessAngle,
        symmetry: symmetry,
        extrude_depth: extrudeDepth 
    };
    executeGeometryOperation('create-primitive', payload, 'blade', 'Blade');
  };

  const handleAutoExtract = async () => {
    setIsAutoExtracting(true);
    try {
      const res = await fetch('http://localhost:8000/auto-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_size: minFeatureSize, sharpness_angle: sharpnessAngle, edge_smoothing: edgeSmoothing / 100.0 })
      });
      const data = await res.json();
      if (res.ok) {
        const newFeatures = data.features.map(f => ({ ...f, id: Math.random().toString(36).substr(2, 9) }));
        commitFeatures([...currentFeatures, ...newFeatures]);
      }
    } catch (err) { console.error(err); }
    setIsAutoExtracting(false);
  };

  const handleSelectLoop = async (loopData, clickPos) => {
    setSelectedLoops(prev => {
        if (prev.some(l => l.id === loopData.id)) return prev;
        return [...prev, loopData];
    });
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

    if (loopData.clickPoint) {
      try {
        const res = await fetch(`http://localhost:8000/classify-patch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            x: loopData.clickPoint.x, 
            y: loopData.clickPoint.y, 
            z: loopData.clickPoint.z, 
            sharpness_angle: sharpnessAngle,
            edge_smoothing: edgeSmoothing / 100.0
          })
        });
        if (res.ok) {
          const data = await res.json();
          setPatchAnalysis({
            type: data.best_match,
            errors: data.errors,
            radius: data.radius,
            face_count: data.face_count
          });
        }
      } catch (err) {
        console.error("Analysis fetch error:", err);
      }
    }
  };

  const handleSelectSolid = (id, clickPos) => {
    setSelectedItemIds(prev => {
        return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    });
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor({ x: window.innerWidth / 2, y: window.innerHeight / 2 }); 
  };

  const toggleItemVisibility = (id) => {
    setRebuildHistory(prev => prev.map(geo => 
      geo.id === id ? { ...geo, visible: geo.visible === false ? true : geo.visible !== false ? false : true } : geo
    ));
  };


  const handleExtrude = () => {
      const payloadLoops = selectedLoops.map(loop => ({
          ...loop,
          type: patchAnalysis && selectedLoops.length === 1 ? patchAnalysis.type : loop.type
      }));
      executeGeometryOperation('commit-geometry', { operation: 'extrude', loops: payloadLoops, extrude_depth: extrudeDepth }, 'solid', 'Extrude');
  };
  
  const handleLoft = () => executeGeometryOperation('commit-geometry', { operation: 'loft', loops: selectedLoops }, 'solid', 'Loft');
  const handleSheet = () => executeGeometryOperation('create-sheet', { operation: 'sheet', loops: selectedLoops }, 'sheet', 'Sheet');

  const handleTransformEnd = async (id, dP, dR, dS, absoluteCenter) => {
    const item = rebuildHistory.find(geo => geo.id === id);
    if (!item) return;
    
    setIsCommitting(true);
    try {
        const res = await fetch('http://localhost:8000/transform-geometry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target_id: id,
                dx: dP.x, dy: dP.y, dz: dP.z,
                rx: dR[0], ry: dR[1], rz: dR[2],
                sx: dS.x, sy: dS.y, sz: dS.z,
                px: absoluteCenter.x, py: absoluteCenter.y, pz: absoluteCenter.z
            })
        });
        if (res.ok) {
            const data = await res.json();
            setRebuildHistory(prev => prev.map(geoItem => geoItem.id === id ? { ...geoItem, vertices: data.vertices, faces: data.faces } : geoItem));
            setServerLogs(prev => [...prev, `[Success] Solid structurally transformed.`]);
        } else {
            const err = await res.json();
            setServerLogs(prev => [...prev, `[Error] Transform failed: ${err.detail}`]);
        }
    } catch (e) {
        setServerLogs(prev => [...prev, `[Error] Network Failure during transform.`]);
    }
    setIsCommitting(false);
  };

  const handleUpdateHistoryItemDepth = async (id, newDepth) => {
    const item = rebuildHistory.find(i => i.id === id);
    if (!item || !item.payload) return;
    
    const isExtrude = item.payload.operation === 'extrude' || 
                      item.type === 'blade' ||
                      (item.payload.primitive_type === 'plane' && item.payload.extrude_depth !== undefined) || 
                      item.payload.operation === 'extrude_sheet';
    
    if (!isExtrude) return;
    
    executeGeometryOperation(item.endpoint, { ...item.payload, geo_id: item.id, extrude_depth: newDepth }, item.type, item.name);
  };

  const handleCut = async () => {
    if (selectedItemIds.length !== 1) return;
    const targetId = selectedItemIds[0];
    
    const payloadLoops = selectedLoops.map(loop => ({
        ...loop,
        type: patchAnalysis && selectedLoops.length === 1 ? patchAnalysis.type : loop.type
    }));
    
    executeGeometryOperation('boolean-cut', { geo_id: targetId, target_id: targetId, loops: payloadLoops, extrude_depth: extrudeDepth }, 'solid', 'Solid');
  };

  const handleSubtract = async (keepTool) => {
    if (selectedItemIds.length !== 2) return;
    
    // Selection order strictly dictates Target vs Tool
    const targetId = selectedItemIds[0];
    const toolId = selectedItemIds[1];

    setIsCommitting(true);
    try {
        const res = await fetch(`http://localhost:8000/boolean-op`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                geo_id: targetId,
                target_id: targetId, 
                tool_id: toolId, 
                keep_tool: keepTool,
                operation: 'subtract',
                edge_smoothing: edgeSmoothing / 100.0
            })
        });
        if (res.ok) {
            const geometryData = await res.json();
            setRebuildHistory(prev => {
                let newHistory = [...prev];
                
                const tIndex = newHistory.findIndex(geo => geo.id === targetId);
                const toIndex = newHistory.findIndex(geo => geo.id === toolId);
                
                newHistory[tIndex] = { 
                    ...newHistory[tIndex], 
                    ...geometryData, 
                    name: newHistory[tIndex].name + ' (Subtracted)',
                    endpoint: 'boolean-op',
                    payload: { operation: 'subtract', geo_id: targetId, target_id: targetId, tool_id: toolId, keep_tool: keepTool, edge_smoothing: edgeSmoothing / 100.0 }
                };
                if (!keepTool && toIndex >= 0) {
                    newHistory[toIndex] = { ...newHistory[toIndex], deleted: true };
                }
                return newHistory;
            });
            setSelectedItemIds([targetId]);
        } else {
            const errData = await res.json();
            setServerLogs(prev => [...prev, `[Error] ${errData.detail}`]);
        }
    } catch (err) { console.error(err); }
    setIsCommitting(false);
  };

  const handlePromoteSheet = async (idToPromote, targetType = 'solid') => {
    const targetId = typeof idToPromote === 'string' ? idToPromote : selectedItemIds[0];
    if (!targetId) return;
    
    const item = rebuildHistory.find(geo => geo.id === targetId);
    if (!item) return;

    let targetEndpoint = item.endpoint;
    const newPayload = { ...item.payload, geo_id: targetId, target_id: targetId, extrude_depth: extrudeDepth };

    if (targetEndpoint === 'create-sheet') {
        targetEndpoint = 'commit-geometry';
        newPayload.operation = 'extrude';
    }

    executeGeometryOperation(targetEndpoint, newPayload, targetType, (item.name || `Sheet_${item.id}`).replace('Sheet', targetType === 'blade' ? 'Blade' : 'Solid').replace('Plane', targetType === 'blade' ? 'Blade' : 'Solid'));
  };

  const applyPreprocessing = async () => {
    try {
      setServerLogs(prev => [...prev, `[System] Updating Pre-Processing settings...`]);
      await fetch('http://localhost:8000/preprocess-mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decimation_target: decimationTarget, sharpening_iters: sharpeningIters })
      });
    } catch (err) {
      setServerLogs(prev => [...prev, `[Error] Failed to connect to backend for preprocessing.`]);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setFileName(file.name);
    setFeaturesHistory([[]]);
    setHistoryIndex(0);
    setSelectedLoops([]);
    setSelectedItemIds([]);
    setPatchAnalysis(null);
    setRebuildHistory([]);

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    setBackendStatus("Syncing with Python Brain...");

    try {
      const res = await fetch('http://localhost:8000/upload-mesh', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setBackendStatus(`Loaded: ${data.faces.toLocaleString()} faces`);
      } else {
        setBackendStatus(`Error: ${data.detail}`);
      }
    } catch (err) { setBackendStatus("Connection Error!"); }
    setIsUploading(false);
    event.target.value = ''; 
  };

  const handleSaveProject = () => {
    const projectData = {
      features: currentFeatures, rebuildHistory,
      settings: { minFeatureSize, symmetry, mergeExportHulls, cursorScale, sharpnessAngle, edgeSmoothing, decimationTarget, sharpeningIters, linearSnap, angleSnap }
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "RetopoCAD_Session.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.rebuildHistory) setRebuildHistory(data.rebuildHistory);
        if (data.features) { setFeaturesHistory([data.features]); setHistoryIndex(0); }
        if (data.settings) {
          if (data.settings.minFeatureSize) setMinFeatureSize(data.settings.minFeatureSize);
          if (data.settings.symmetry) setSymmetry(data.settings.symmetry);
          if (data.settings.mergeExportHulls !== undefined) setMergeExportHulls(data.settings.mergeExportHulls);
          if (data.settings.cursorScale) setCursorScale(data.settings.cursorScale);
          if (data.settings.sharpnessAngle) setSharpnessAngle(data.settings.sharpnessAngle);
          if (data.settings.edgeSmoothing !== undefined) setEdgeSmoothing(data.settings.edgeSmoothing);
          if (data.settings.decimationTarget) setDecimationTarget(data.settings.decimationTarget);
          if (data.settings.sharpeningIters !== undefined) setSharpeningIters(data.settings.sharpeningIters);
          if (data.settings.linearSnap !== undefined) setLinearSnap(data.settings.linearSnap);
          if (data.settings.angleSnap !== undefined) setAngleSnap(data.settings.angleSnap);
        }
      } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExportSTEP = async () => {
    if (currentFeatures.length === 0 && rebuildHistory.length === 0) return;
    setIsExporting(true);

    try {
      const res = await fetch('http://localhost:8000/export-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            hulls: [], 
            features: currentFeatures, 
            merge_hulls: mergeExportHulls, 
            symmetry: symmetry,
            active_geo_ids: rebuildHistory.filter(h => !h.deleted).map(h => h.id)
        })
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'RetopoCAD_Export.step';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) { console.error(err); }
    setIsExporting(false);
  };

  const sheets = rebuildHistory.filter(h => (h.type === 'sheet' || h.type === 'face') && !h.deleted);
  const solids = rebuildHistory.filter(h => (h.type === 'solid' || h.type === 'blade') && !h.deleted);
  const selectedItemsData = selectedItemIds.map(id => rebuildHistory.find(h => h.id === id && !h.deleted)).filter(Boolean);

  return (
    <div 
      className="fixed inset-0 flex flex-row overflow-hidden bg-zinc-900 text-zinc-100 font-sans" 
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <style>{`
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; overscroll-behavior: none; }
      `}</style>

      {/* --- NEW MODAL FOR BATCH MAGIC WAND --- */}
      {showBatchModal && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={() => setShowBatchModal(false)}>
            <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl shadow-2xl flex flex-col gap-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-white uppercase tracking-wider border-b border-zinc-800 pb-2">Select Processing Method</h3>

                <button
                    onClick={() => { setShowBatchModal(false); handleBatchMagicPatch(); }}
                    className="flex flex-col text-left p-4 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-indigo-600/20 hover:border-indigo-500 transition-colors"
                >
                    <span className="text-sm font-bold text-indigo-400">Organic (Surface Stitching)</span>
                    <span className="text-xs text-zinc-400 mt-1 leading-relaxed">Extracts patches and aggressively sews them together. Best for organic shapes, scans, and complex curved topology. Tolerant of small mesh errors.</span>
                </button>

                <button
                    onClick={() => { setShowBatchModal(false); handleStructuredPipeline(); }}
                    className="flex flex-col text-left p-4 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-emerald-600/20 hover:border-emerald-500 transition-colors"
                >
                    <span className="text-sm font-bold text-emerald-400">Structured (CAD Wireframe)</span>
                    <span className="text-xs text-zinc-400 mt-1 leading-relaxed">Extracts a master skeleton, classifies 3D curves (Circles/Lines), and surfaces the perfect network. <strong className="text-amber-500 font-bold">Requires a perfectly Watertight mesh.</strong></span>
                </button>

                <button onClick={() => setShowBatchModal(false)} className="mt-2 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-widest self-center transition-colors">Cancel</button>
            </div>
        </div>
      )}
      
      <ActionRing 
        anchorPos={menuAnchor} 
        selectedLoops={selectedLoops} 
        selectedItemsData={selectedItemsData}
        extrudeDepth={extrudeDepth}
        setExtrudeDepth={setExtrudeDepth}
        onExtrude={handleExtrude}
        onLoft={handleLoft}
        onSheet={handleSheet}
        onPatch={handleCreatePatch}
        onMagicPatch={handleMagicPatch}
        onSew={handleSew}
        onCut={handleCut}
        onSubtract={handleSubtract}
        onPromote={handlePromoteSheet}
        onExtractCurve={handleExtractCurveFromRing}
        onDeleteItem={(ids) => handleDeleteGeometry(ids)}
        onClear={() => { setSelectedLoops([]); setSelectedItemIds([]); setPatchAnalysis(null); }}
        onUpdateDepth={handleUpdateHistoryItemDepth}
        patchAnalysis={patchAnalysis}
        setPatchAnalysis={setPatchAnalysis}
        onCreatePrimitive={handleCreatePrimitive}
        onCreateBlade={handleCreateBlade}
        linearSnap={linearSnap}
        transformMode={transformMode}
      />

      {/* LEFT COLUMN 1: TOOLS & SETTINGS */}
      <div className="w-48 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20 shrink-0 shadow-2xl p-2.5 gap-2.5">
        
        <div className="flex justify-between items-center pb-1.5 border-b border-zinc-800 shrink-0">
          <div className="text-xs font-black tracking-widest text-zinc-300 uppercase">RetopoCAD</div>
          {isUploading && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></div>}
        </div>

        <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto">
          
          <div className="bg-zinc-900 border border-zinc-800 rounded p-1.5 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[8px] font-bold uppercase text-zinc-400 tracking-wider">Import Mesh</span>
              <label className={`px-2 py-1 rounded text-[8px] font-bold text-white cursor-pointer transition-colors shadow ${isUploading ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                {isUploading ? 'WAIT...' : 'UPLOAD .OBJ'}
                <input type="file" accept=".obj" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            </div>
            {objUrl && <span className="text-[7.5px] font-mono text-emerald-400 leading-tight block truncate">{backendStatus}</span>}

            {objUrl && (
              <div className="flex gap-1 mt-1 pt-1.5 border-t border-zinc-800">
                <button onClick={handleSaveProject} className="flex-1 py-1 rounded text-[7.5px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700">
                  Save Session
                </button>
                <label className="flex-1 flex items-center justify-center py-1 rounded text-[7.5px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white cursor-pointer transition-colors border border-zinc-700">
                  Load Session
                  <input type="file" accept=".json" onChange={handleLoadProject} className="hidden" />
                </label>
              </div>
            )}
          </div>

          {objUrl && (
             <div className="flex flex-col gap-2.5 animate-in fade-in duration-200">
               
               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                  <div>
                    <span className="text-[8px] font-bold uppercase text-zinc-400 tracking-wider mb-1 block">Pre-Processing</span>
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 font-mono">
                        <span>Sharpness (Dihedral)</span>
                        <span className="text-white">{sharpnessAngle}°</span>
                      </div>
                      <input 
                        type="range" min="0" max="180" 
                        value={sharpnessAngle} 
                        onChange={(e) => setSharpnessAngle(parseInt(e.target.value))} 
                        className="w-full accent-indigo-500 h-1 mt-1 mb-2" 
                      />
                      
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 font-mono">
                        <span>Decimation (Faces)</span>
                        <span className="text-white">{decimationTarget.toLocaleString()}</span>
                      </div>
                      <input 
                        type="range" min="5000" max="100000" step="1000" 
                        value={decimationTarget} 
                        onChange={(e) => setDecimationTarget(parseInt(e.target.value))} 
                        onMouseUp={applyPreprocessing}
                        className="w-full accent-indigo-500 h-1 mt-1 mb-2" 
                      />
                      
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 font-mono">
                        <span>Sharpening (Iters)</span>
                        <span className="text-white">{sharpeningIters}</span>
                      </div>
                      <input 
                        type="range" min="0" max="10" step="1" 
                        value={sharpeningIters} 
                        onChange={(e) => setSharpeningIters(parseInt(e.target.value))} 
                        onMouseUp={applyPreprocessing}
                        className="w-full accent-indigo-500 h-1 mt-1 mb-1" 
                      />
                      
                      <button onClick={applyPreprocessing} className="w-full py-1.5 mt-2 bg-zinc-800 hover:bg-zinc-700 text-[8px] font-bold uppercase text-white rounded border border-zinc-700 transition-colors">
                        Apply Filters
                      </button>
                    </div>
                  </div>
               </div>

               {/* NEW: PATCHING CONTROLS */}
               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                  <span className="text-[8px] font-bold uppercase text-zinc-400 tracking-wider mb-1">Patching Controls</span>
                  <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[8px] text-zinc-400 font-mono">
                          <span>Edge Smoothing</span>
                          <span className="text-white">{edgeSmoothing}%</span>
                      </div>
                      <input
                          type="range" min="0" max="100"
                          value={edgeSmoothing}
                          onChange={(e) => setEdgeSmoothing(parseInt(e.target.value))}
                          className="w-full accent-indigo-500 h-1 mt-1 mb-1"
                      />
                      <span className="text-[7px] text-zinc-500 italic mt-1 leading-tight">
                          0% strictly follows mesh triangles (can be wobbly). 100% simplifies curves for perfectly smooth CAD edges (can lose detail).
                      </span>
                  </div>
               </div>

               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                  <span className="text-[8px] font-bold uppercase text-zinc-400 tracking-wider mb-1">Curves Extraction</span>

                  <div className="flex items-center gap-2">
                    <span className="text-[8px] w-12 text-zinc-400">Min Size</span>
                    <input type="range" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value))} disabled={isAutoExtracting} className="flex-1 accent-emerald-500 h-1" />
                    <input type="number" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value) || 0)} disabled={isAutoExtracting} className="text-[8px] text-emerald-400 w-8 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-emerald-500" />
                  </div>
                  
                  <div className="flex gap-1 mt-0.5">
                    <button onClick={handleAutoExtract} disabled={isAutoExtracting} className="flex-1 py-1 rounded text-[8px] font-bold uppercase tracking-wide bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/50 transition-colors">
                      Auto Detect
                    </button>
                    
                    <button title="Clear All Curves" onClick={handleClearAllFeatures} disabled={isAutoExtracting || currentFeatures.length === 0} className="w-6 py-1 flex items-center justify-center rounded text-[8px] font-bold uppercase tracking-wide bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <IconClear />
                    </button>
                  </div>
               </div>
             </div>
          )}
        </div>
        
        {objUrl && (
          <div className="mt-auto pt-2 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
             <div className="flex items-center gap-1.5 px-1">
               <input type="checkbox" id="mergeHulls" checked={mergeExportHulls} onChange={(e) => setMergeExportHulls(e.target.checked)} disabled={isExporting} className="accent-emerald-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
               <label htmlFor="mergeHulls" className="text-[8px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Merge Solids</label>
             </div>
             <button onClick={handleExportSTEP} disabled={isExporting || (currentFeatures.length === 0 && rebuildHistory.length === 0)} className={`w-full py-2 rounded text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isExporting ? 'bg-emerald-900 text-emerald-400 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:shadow-none'}`}>
               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4-4m4 4V4" /></svg>
               {isExporting ? 'WAIT...' : 'Export STEP'}
             </button>
          </div>
        )}
      </div>

      {/* LEFT COLUMN 2: OUTLINER */}
      {objUrl && (
        <div className="w-56 bg-[#0c0c0e] border-r border-zinc-800 flex flex-col z-10 shrink-0 shadow-xl animate-in slide-in-from-left duration-200">
          <div className="p-2 border-b border-zinc-800 shrink-0 flex items-center justify-between">
            <h2 className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">Outliner</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-2">
            
            <div className="flex flex-col gap-0.5">
               <button onClick={() => toggleOutliner('mesh')} className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors group">
                  <div className="flex items-center gap-1.5">
                     <span className="text-zinc-500 group-hover:text-zinc-300 scale-75"><IconEye /></span>
                     <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">Ref Mesh</span>
                  </div>
                  <span className="text-zinc-600 text-[7px]">{outlinerExpanded.mesh ? '▼' : '▶'}</span>
               </button>
               {outlinerExpanded.mesh && (
                 <div className="flex flex-col gap-0.5 pl-3 pr-1 mt-0.5">
                    <div className="flex items-center justify-between px-2 py-1.5 bg-zinc-900 rounded border border-zinc-800">
                      <span className="text-[9px] text-zinc-300 truncate w-24">{fileName}</span>
                      <button onClick={() => setShowMesh(!showMesh)} className="text-zinc-500 hover:text-zinc-300 transition-colors scale-75">
                        {showMesh ? <IconEye /> : <IconEyeOff />}
                      </button>
                    </div>
                 </div>
               )}
            </div>

            <div className="flex flex-col gap-0.5">
               <div className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors group cursor-pointer" onClick={() => toggleOutliner('curves')}>
                  <div className="flex items-center gap-1.5">
                     <span className="text-purple-500/80 scale-75"><IconWave /></span>
                     <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">Wires</span>
                  </div>
                  <div className="flex items-center gap-2">
                     <button 
                        onClick={handleHideAllWires} 
                        className="text-[7px] px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors pointer-events-auto"
                     >
                        {hiddenCurveIds.length === currentFeatures.length && currentFeatures.length > 0 ? 'SHOW ALL' : 'HIDE ALL'}
                     </button>
                     <span className="text-zinc-600 text-[7px]">{outlinerExpanded.curves ? '▼' : '▶'}</span>
                  </div>
               </div>
               {outlinerExpanded.curves && (
                 <div className="flex flex-col gap-0.5 pl-3 pr-1 mt-0.5">
                    {currentFeatures.length === 0 ? <span className="px-2 text-[8px] text-zinc-600 italic">Empty</span> : currentFeatures.map((feat) => {
                      const isHidden = hiddenCurveIds.includes(feat.id);
                      const isSelected = selectedLoops.some(l => l.id === feat.id);
                      return (
                        <div 
                          key={feat.id} 
                          onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLoops(prev => {
                                  if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                      return prev.some(l => l.id === feat.id) ? prev.filter(l => l.id !== feat.id) : [...prev, feat];
                                  }
                                  return [feat];
                              });
                              setMenuAnchor({ x: e.clientX, y: e.clientY });
                          }}
                          className={`flex items-center justify-between px-2 py-1 rounded border cursor-pointer transition-colors ${isSelected ? 'bg-zinc-800 border-purple-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                        >
                          <span className="text-[9px] text-zinc-300 font-mono truncate">{feat.type === 'circle' ? 'Circle' : 'Curve'}_{feat.id?.substring(0,4) || 'xxx'}</span>
                          <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); toggleCurveVisibility(feat.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0 scale-75">
                              {!isHidden ? <IconEye /> : <IconEyeOff />}
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteFeature(feat.id); }} className="text-zinc-500 hover:text-red-400 shrink-0 scale-75">
                              <IconTrash />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               )}
            </div>

            <div className="flex flex-col gap-0.5">
               <button onClick={() => toggleOutliner('shells')} className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors group">
                  <div className="flex items-center gap-1.5">
                     <span className="text-indigo-500/80 scale-75"><IconMagicWand /></span>
                     <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">Shell Construction</span>
                  </div>
                  <span className="text-zinc-600 text-[7px]">{outlinerExpanded.shells ? '▼' : '▶'}</span>
               </button>
               {outlinerExpanded.shells && (
                 <div className="flex flex-col gap-0.5 pl-3 pr-1 mt-0.5">
                    {rebuildHistory.filter(h => h.type === 'shell' && !h.deleted).length === 0 ? <span className="px-2 text-[8px] text-zinc-600 italic">Empty</span> : rebuildHistory.filter(h => h.type === 'shell' && !h.deleted).map((geo) => (
                      <div 
                        key={geo.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemIds(prev => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  return prev.includes(geo.id) ? prev.filter(x => x !== geo.id) : [...prev, geo.id];
                              }
                              return [geo.id];
                          });
                        }} 
                        className={`flex items-center justify-between px-2 py-1 rounded border cursor-pointer transition-colors ${selectedItemIds.includes(geo.id) ? 'bg-zinc-800 border-indigo-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                      >
                        <span className="text-[9px] text-zinc-300 font-mono truncate w-20">{geo.name || `Shell_${geo.id}`}</span>
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0 scale-75">
                            {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteGeometry(geo.id); }} className="text-zinc-500 hover:text-red-400 shrink-0 scale-75">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>

            <div className="flex flex-col gap-0.5">
               <button onClick={() => toggleOutliner('sheets')} className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors group">
                  <div className="flex items-center gap-1.5">
                     <span className="text-green-500/80 scale-75"><IconSquare /></span>
                     <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">Faces</span>
                  </div>
                  <span className="text-zinc-600 text-[7px]">{outlinerExpanded.sheets ? '▼' : '▶'}</span>
               </button>
               {outlinerExpanded.sheets && (
                 <div className="flex flex-col gap-0.5 pl-3 pr-1 mt-0.5">
                    {sheets.length === 0 ? <span className="px-2 text-[8px] text-zinc-600 italic">Empty</span> : sheets.map((geo) => (
                      <div 
                        key={geo.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemIds(prev => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  return prev.includes(geo.id) ? prev.filter(x => x !== geo.id) : [...prev, geo.id];
                              }
                              return [geo.id];
                          });
                        }} 
                        className={`flex items-center justify-between px-2 py-1 rounded border cursor-pointer transition-colors ${selectedItemIds.includes(geo.id) ? 'bg-zinc-800 border-green-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                      >
                        <span className="text-[9px] text-zinc-300 font-mono truncate w-20">{geo.name || `Face_${geo.id}`}</span>
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0 scale-75">
                            {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteGeometry(geo.id); }} className="text-zinc-500 hover:text-red-400 shrink-0 scale-75">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>

            <div className="flex flex-col gap-0.5">
               <button onClick={() => toggleOutliner('solids')} className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/50 rounded transition-colors group">
                  <div className="flex items-center gap-1.5">
                     <span className="text-blue-500/80 scale-75"><IconCylinderOutline /></span>
                     <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 group-hover:text-zinc-200">Solids & Blades</span>
                  </div>
                  <span className="text-zinc-600 text-[7px]">{outlinerExpanded.solids ? '▼' : '▶'}</span>
               </button>
               {outlinerExpanded.solids && (
                 <div className="flex flex-col gap-0.5 pl-3 pr-1 mt-0.5">
                    {solids.length === 0 ? <span className="px-2 text-[8px] text-zinc-600 italic">Empty</span> : solids.map((geo) => (
                      <div 
                        key={geo.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemIds(prev => {
                              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                  return prev.includes(geo.id) ? prev.filter(x => x !== geo.id) : [...prev, geo.id];
                              }
                              return [geo.id];
                          });
                        }}  
                        className={`flex items-center justify-between px-2 py-1 rounded border cursor-pointer transition-colors ${selectedItemIds.includes(geo.id) ? (geo.type === 'blade' ? 'bg-zinc-800 border-amber-500/50' : 'bg-zinc-800 border-blue-500/50') : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                      >
                        <span className="text-[9px] text-zinc-300 font-mono truncate w-20">{geo.name || `${geo.type === 'blade' ? 'Blade' : 'Solid'}_${geo.id}`}</span>
                        <div className="flex gap-1">
                          <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0 scale-75">
                            {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteGeometry(geo.id); }} className="text-zinc-500 hover:text-red-400 shrink-0 scale-75">
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>

          </div>
        </div>
      )}

      {/* CENTER COLUMN: VIEWPORT */}
      <div className="flex-1 flex flex-col relative bg-zinc-900 overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <Viewport 
            objUrl={objUrl} 
            symmetry={symmetry} 
            onSelectLoop={handleSelectLoop}
            onSelectSolid={handleSelectSolid}
            onTransformEnd={handleTransformEnd}
            extractedFeatures={currentFeatures}
            showMesh={showMesh} 
            showWireframe={showWireframe}
            meshOpacity={meshOpacity}
            selectedLoops={selectedLoops}
            
            rebuildHistory={rebuildHistory.filter(h => !h.deleted)}
            
            selectedItemIds={selectedItemIds}
            cursorScale={cursorScale}
            showSheetsFolder={outlinerExpanded.sheets}
            showSolidsFolder={outlinerExpanded.solids}
            showCurvesFolder={outlinerExpanded.curves}
            hiddenCurveIds={hiddenCurveIds}
            sharpnessAngle={sharpnessAngle}
            linearSnap={linearSnap}
            setLinearSnap={setLinearSnap}
            angleSnap={angleSnap}
            setAngleSnap={setAngleSnap}
            toggleSymmetry={toggleSymmetry}
            transformMode={transformMode}
            setTransformMode={setTransformMode}
            outlinerExpanded={outlinerExpanded}
            selectionMode={selectionMode}
            setSelectionMode={setSelectionMode}
          />

          <div 
             onPointerDown={(e) => e.stopPropagation()} 
             className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 items-start pointer-events-auto"
          >
            <div className="flex gap-2">
              <button onClick={() => setShowMesh(!showMesh)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showMesh ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span className="text-xs font-semibold">Mesh</span>
              </button>

              <button onClick={() => setShowWireframe(!showWireframe)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showWireframe ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="text-xs font-semibold">Wireframe</span>
              </button>
            </div>
            
            {showMesh && (
              <div className="flex gap-2">
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Opacity</span>
                  <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value))} className="w-20 accent-zinc-300 h-1" />
                </div>
                
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cursor</span>
                  <input type="range" min="0.005" max="0.05" step="0.001" value={cursorScale} onChange={(e) => setCursorScale(parseFloat(e.target.value))} className="w-16 accent-zinc-300 h-1" />
                </div>
              </div>
            )}
          </div>

          {/* LEFT FLOATING TOOLBAR */}
          <div 
            onPointerDown={(e) => e.stopPropagation()} 
            className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-2 z-10 pointer-events-auto bg-zinc-900/80 border border-zinc-800 p-1.5 rounded-lg shadow-xl backdrop-blur-md"
          >
            <button onClick={() => setTransformMode(null)} className={`p-2 rounded transition-all ${transformMode === null ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Select (Q)"><IconCursor /></button>
            <button onClick={() => setTransformMode('translate')} className={`p-2 rounded transition-all ${transformMode === 'translate' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Move (W)"><IconMove /></button>
            <button onClick={() => setTransformMode('rotate')} className={`p-2 rounded transition-all ${transformMode === 'rotate' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Rotate (E)"><IconRotate /></button>
            <button onClick={() => setTransformMode('scale')} className={`p-2 rounded transition-all ${transformMode === 'scale' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`} title="Scale (R)"><IconScale /></button>
            
            <div className="w-full h-px bg-zinc-700/50 my-1"></div>
            
            {/* UPDATED: BATCH MAGIC WAND NOW OPENS MODAL */}
            <button 
              title="Batch Magic Patch" 
              onClick={() => setShowBatchModal(true)} 
              disabled={isCommitting}
              className={`p-2 rounded transition-all flex justify-center items-center ${isCommitting ? 'bg-indigo-900 text-indigo-400 opacity-50' : 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-600 hover:text-white hover:border-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.3)]'}`}
            >
              <IconMagicWand />
            </button>

            <div className="w-full h-px bg-zinc-700/50 my-1"></div>

            <button title="Undo Solid/Curve (Ctrl+Z)" onClick={handleGlobalUndo} disabled={historyIndex === 0 && rebuildHistory.length === 0} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button title="Redo Curve Action (Ctrl+Y)" onClick={handleGlobalRedo} disabled={historyIndex === featuresHistory.length - 1} className="p-2 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
            </button>
          </div>
        </div>

        <div className="h-28 bg-[#0a0a0c] border-t border-zinc-800 shrink-0 flex flex-col shadow-[inset_0_4px_6px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between px-3 py-1 bg-zinc-900 border-b border-zinc-800">
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Output Console
            </span>
          </div>
          <div className="flex-1 p-2 overflow-y-auto font-mono text-[11px] text-zinc-400 leading-relaxed flex flex-col justify-start">
            {serverLogs.map((log, i) => (
              <div key={i} className={log.includes('[Error]') ? 'text-red-400' : log.includes('[Success]') || log.includes('[CAD]') ? 'text-emerald-400' : log.includes('[Warning]') ? 'text-yellow-400' : ''}>
                <span className="opacity-30 select-none mr-2">{'>'}</span>{log}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: INSPECTOR */}
      <div className="w-[260px] bg-zinc-950 border-l border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Inspector</h2>
        </div>

        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
          <div className="bg-zinc-900 rounded border border-amber-900/50 p-2 flex flex-col gap-2">
             <div className="flex justify-between items-center pb-1 border-b border-zinc-800">
                <span className="text-[10px] font-bold uppercase text-amber-500 tracking-wider">Selection Stack</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded">{selectedLoops.length + selectedItemIds.length} Items</span>
             </div>
             
             <p className="text-[9px] text-zinc-400 italic">Select tool: hover mesh and click loops or geometries to add to stack. Use Shift/Ctrl in outliner for multi-select.</p>

             <div className="min-h-16 max-h-40 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded p-1 flex flex-col gap-1">
                {selectedLoops.length === 0 && selectedItemIds.length === 0 ? (
                  <span className="text-zinc-600 text-[10px] text-center mt-4 mb-4">Stack is empty.</span>
                ) : (
                  <>
                    {selectedLoops.map((loop, i) => (
                      <div key={`loop-${i}`} className="flex justify-between items-center bg-zinc-800/50 px-2 py-1 rounded text-[10px] font-mono text-zinc-300">
                        <span>Curve #{loop.id?.split('_')[1] || i}</span>
                        <span className="text-purple-400">[{loop.points?.length || 'Analytic'}]</span>
                      </div>
                    ))}
                    {selectedItemsData.map((item, i) => (
                      <div key={`item-${i}`} className="flex justify-between items-center bg-zinc-800/50 px-2 py-1 rounded text-[10px] font-mono text-zinc-300">
                        <span className="truncate w-32">{item.name}</span>
                        <span className={item.type === 'sheet' || item.type === 'face' ? 'text-green-400' : item.type === 'blade' ? 'text-amber-400' : 'text-blue-400'}>{item.type.toUpperCase()}</span>
                      </div>
                    ))}
                  </>
                )}
             </div>
          </div>

          {patchAnalysis && (
            <div className="bg-zinc-900 rounded border border-blue-900/50 p-3 flex flex-col gap-2">
               <div className="flex justify-between items-center pb-1 border-b border-zinc-800">
                  <span className="text-[10px] font-bold uppercase text-blue-400 tracking-wider">Surface Analysis</span>
                  <span className="text-[10px] font-bold bg-blue-900/30 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded uppercase tracking-widest">{patchAnalysis.type}</span>
               </div>
               <div className="flex justify-between items-center text-[10px] font-mono text-zinc-300">
                  <span className="text-zinc-500">Face Count</span>
                  <span>{patchAnalysis.face_count}</span>
               </div>
               {patchAnalysis.radius > 0 && (
                  <div className="flex justify-between items-center text-[10px] font-mono text-zinc-300">
                     <span className="text-zinc-500">Radius</span>
                     <span>{patchAnalysis.radius.toFixed(4)}</span>
                  </div>
               )}
               <div className="mt-1 pt-2 border-t border-zinc-800">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Fitting Errors</span>
                  <div className="flex flex-col gap-1 mt-1.5 text-[10px] font-mono">
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Plane</span>
                        <span className={patchAnalysis.type === 'plane' || patchAnalysis.type === 'planar' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.plane?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Cylinder</span>
                        <span className={patchAnalysis.type === 'cylinder' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.cylinder?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Sphere</span>
                        <span className={patchAnalysis.type === 'sphere' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.sphere?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Cone</span>
                        <span className={patchAnalysis.type === 'cone' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.cone?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Torus</span>
                        <span className={patchAnalysis.type === 'torus' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.torus?.toExponential(2) || 'N/A'}</span>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {selectedItemsData.length === 1 ? (
            <div className="bg-zinc-900 rounded border border-zinc-800 p-3 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Classification</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${selectedItemsData[0].type === 'sheet' || selectedItemsData[0].type === 'face' ? 'bg-green-900/30 text-green-400 border border-green-800' : selectedItemsData[0].type === 'blade' ? 'bg-amber-900/30 text-amber-400 border border-amber-800' : 'bg-blue-900/30 text-blue-400 border border-blue-800'}`}>
                  {selectedItemsData[0].type}
                </span>
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Properties</span>
                
                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                  <span className="text-[10px] font-mono text-zinc-500">Name</span>
                  <input 
                    className="text-[10px] font-mono text-zinc-300 bg-transparent text-right outline-none w-32 border-b border-transparent focus:border-indigo-500 transition-colors"
                    value={selectedItemsData[0].name || `${selectedItemsData[0].type}_${selectedItemsData[0].id}`}
                    onChange={(e) => setRebuildHistory(prev => prev.map(geo => geo.id === selectedItemsData[0].id ? { ...geo, name: e.target.value } : geo))}
                  />
                </div>

                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                  <span className="text-[10px] font-mono text-zinc-500">Faces Count</span>
                  <span className="text-[10px] font-mono text-zinc-300">{selectedItemsData[0].faces?.length || 0}</span>
                </div>
              </div>

              {selectedItemsData[0].type === 'blade' && (
                <div className="mt-2 pt-3 border-t border-zinc-800">
                  <button 
                    onClick={() => {
                      const currentDepth = selectedItemsData[0].payload?.extrude_depth || extrudeDepth;
                      handleUpdateHistoryItemDepth(selectedItemsData[0].id, currentDepth * -1);
                    }}
                    className="w-full py-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700 rounded text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                  >
                    <IconFlip />
                    Flip Extrude Direction
                  </button>
                </div>
              )}
            </div>
          ) : selectedItemsData.length > 1 ? (
             <div className="text-[10px] text-zinc-600 text-center italic mt-2">
               Multiple items selected. Use the Action Ring for bulk operations.
             </div>
          ) : (
            <div className="text-[10px] text-zinc-600 text-center italic mt-2">
              Select an object in the viewport or outliner to edit properties.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}