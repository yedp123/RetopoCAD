import React, { useState, useRef, useEffect, Suspense } from 'react';
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
const IconWave = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12c-2.66 0-4.33-3-7-3s-4.34 3-7 3-4.33-3-7-3"></path></svg>;
const IconTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;

function CompactSymmetryToggle({ label, active, onClick, colorClass }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-between w-full px-3 py-1.5 rounded transition-colors ${active ? 'bg-zinc-700/50 text-white' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'}`}>
      <span className="font-medium text-[10px] uppercase tracking-wider">{label}</span>
      <div className={`w-6 h-3 rounded-full relative transition-colors ${active ? colorClass : 'bg-zinc-800'}`}>
        <div className={`absolute top-0.5 left-0.5 w-2 h-2 rounded-full bg-white transition-transform ${active ? 'translate-x-3' : ''}`}></div>
      </div>
    </button>
  );
}

function ActionRing({ anchorPos, selectedLoops, selectedItemData, extrudeDepth, setExtrudeDepth, onExtrude, onLoft, onSheet, onCut, onClear, onPromote, onExtractCurve, onDeleteItem, onUpdateDepth, patchAnalysis, setPatchAnalysis, onCreatePrimitive }) {
  const [pos, setPos] = useState({ x: -1000, y: -1000 });
  const isEditingExtrude = selectedItemData?.payload?.operation === 'extrude';
  const [localDepth, setLocalDepth] = useState(extrudeDepth);

  useEffect(() => {
    if (isEditingExtrude) {
        setLocalDepth(selectedItemData.payload.extrude_depth);
    } else {
        setLocalDepth(extrudeDepth);
    }
  }, [selectedItemData, extrudeDepth, isEditingExtrude]);

  useEffect(() => {
    if (!anchorPos) return;
    const offset = 120;
    const ringSize = 135; 

    let targetX = anchorPos.x + offset;
    let targetY = anchorPos.y + offset;

    if (targetX + ringSize > window.innerWidth) targetX = anchorPos.x - offset; 
    if (targetY + ringSize > window.innerHeight) targetY = anchorPos.y - offset;

    setPos({ x: targetX, y: targetY });
  }, [anchorPos]);

  if ((!selectedLoops || selectedLoops.length === 0) && !selectedItemData) return null;

  const planeCount = selectedLoops.filter(l => l.type !== 'circle').length;
  const circleCount = selectedLoops.filter(l => l.type === 'circle').length;
  let selectionText = [];
  if (planeCount > 0) selectionText.push(`${planeCount} Plane${planeCount > 1 ? 's' : ''}`);
  if (circleCount > 0) selectionText.push(`${circleCount} Cylinder${circleCount > 1 ? 's' : ''}`);
  if (selectedItemData && selectedLoops.length === 0) {
      selectionText.push(`1 ${selectedItemData.type === 'sheet' ? 'Sheet' : 'Solid'}`);
  }
  const selectionString = selectionText.length > 0 ? `Selected: ${selectionText.join(', ')}` : '';

  const isCylinderLoop = selectedLoops.length === 1 && selectedLoops[0].type === 'circle';
  const extrudeLabel = isCylinderLoop ? 'Cylinder' : 'Extrude';

  const radius = 70; 
  const outerRadius = 135; 
  const buttons = [];
  const outerButtons = [];

  // Inner tools
  if (selectedLoops.length > 0) {
      buttons.push({ label: extrudeLabel, icon: isCylinderLoop ? <IconCylinderFill /> : <IconExtrude />, angle: -90, action: onExtrude, disabled: selectedLoops.length !== 1, color: 'text-blue-400' });
      buttons.push({ label: 'Loft', icon: <IconLoft />, angle: 0, action: onLoft, disabled: selectedLoops.length !== 2, color: 'text-blue-400' });
      
      // Dynamic Sheet / Create Primitive button
      if (patchAnalysis) {
          buttons.push({ label: 'Create\nPrimitive', icon: <IconExtrude />, angle: 90, action: onCreatePrimitive, disabled: false, color: 'text-emerald-400' });
      } else {
          buttons.push({ label: 'Sheet', icon: <IconSheet />, angle: 90, action: onSheet, disabled: selectedLoops.length !== 1, color: 'text-green-400' });
      }
      
      buttons.push({ label: 'Extract\nCurve', icon: <IconWave />, angle: 180, action: onExtractCurve, disabled: selectedLoops.length === 0, color: 'text-purple-400' });
      
      if (selectedItemData) {
          buttons.push({ label: 'Cut', icon: <IconCut />, angle: -45, action: onCut, disabled: selectedLoops.length !== 1, color: 'text-orange-400' });
      }
  } else if (selectedItemData) {
      if (selectedItemData.type === 'sheet') {
          buttons.push({ label: 'Extrude', icon: <IconExtrude />, angle: -90, action: () => onPromote(selectedItemData.id), disabled: false, color: 'text-emerald-400' });
      }
      buttons.push({ label: 'Cut', icon: <IconCut />, angle: -45, action: onCut, disabled: true, color: 'text-orange-400' });
  }

  // Outer tools
  if (selectedLoops.length > 0 || selectedItemData) {
      outerButtons.push({ label: 'Delete', icon: <IconTrash />, angle: -45, action: onDeleteItem, disabled: !selectedItemData, color: 'text-red-500' });
      outerButtons.push({ label: 'Clear\nSelection', icon: <IconClear />, angle: 45, action: onClear, disabled: false, color: 'text-zinc-400' });
  }

  return (
    <div style={{ left: pos.x, top: pos.y }} className="fixed pointer-events-none z-50 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all duration-200">
       
       <div className="absolute bottom-[130px] flex flex-col items-center gap-1.5 pointer-events-none w-64 text-center">
          {selectionString && (
            <span className={`font-black px-3 py-1 rounded text-[10px] uppercase tracking-widest ${isEditingExtrude ? 'bg-amber-600 text-white border border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.5)]' : 'bg-amber-500 text-zinc-950 border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}>
              {selectionString}
            </span>
          )}
          
          {patchAnalysis && selectedLoops.length === 1 && (
             <div className="flex flex-col items-center gap-1 pointer-events-auto mt-1">
                <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider bg-zinc-900/80 px-2 py-0.5 rounded border border-zinc-700 backdrop-blur-md shadow-lg">
                   Suggested: <span className="text-amber-400">{patchAnalysis.type}</span>
                </span>
                <div className="flex gap-1.5 mt-0.5">
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'plane'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'plane' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Plane"><IconSquare /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'cylinder'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'cylinder' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Cylinder"><IconCylinderOutline /></button>
                   <button onClick={(e) => { e.stopPropagation(); setPatchAnalysis(prev => ({...prev, type: 'sphere'})); }} className={`p-1.5 rounded-full border transition-all ${patchAnalysis.type === 'sphere' ? 'bg-amber-500 text-zinc-900 border-amber-400' : 'bg-zinc-800 text-zinc-400 border-zinc-600 hover:text-white hover:bg-zinc-700'}`} title="Override to Sphere"><IconSphere /></button>
                </div>
             </div>
          )}
       </div>

       <div className="absolute w-[160px] h-[160px] rounded-full border border-zinc-600/30 bg-zinc-900/40 backdrop-blur-md animate-in zoom-in duration-150 pointer-events-none" />
       
       <div className={`absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full border shadow-xl backdrop-blur-md animate-in zoom-in transition-colors ${isEditingExtrude ? 'bg-zinc-800/95 border-amber-500/50' : 'bg-zinc-800/90 border-zinc-600'}`}>
         {isCylinderLoop && (
             <span className="text-[7.5px] font-black uppercase text-emerald-400 tracking-tighter leading-none mb-1">R: {selectedLoops[0].radius.toFixed(2)}</span>
         )}
         <span className={`text-[7px] font-black uppercase tracking-tighter leading-none mb-0.5 mt-0.5 ${isEditingExtrude ? 'text-amber-400' : 'text-zinc-400'}`}>Depth</span>
         <input 
           type="number" 
           value={localDepth} 
           onChange={(e) => setLocalDepth(parseFloat(e.target.value) || 0)}
           onBlur={(e) => {
               if (isEditingExtrude) {
                   if (localDepth !== selectedItemData.payload.extrude_depth) {
                       onUpdateDepth(selectedItemData.id, localDepth);
                   }
               } else {
                   setExtrudeDepth(localDepth);
               }
           }}
           onKeyDown={(e) => {
               if (e.key === 'Enter') e.target.blur();
           }}
           className={`w-10 bg-transparent text-center text-[10px] font-mono outline-none focus:bg-zinc-700/50 rounded transition-colors ${isEditingExtrude ? 'text-amber-400 font-bold' : 'text-white'}`}
           step="0.5"
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
          return (
             <button
               key={`inner-${i}`}
               onClick={(e) => { e.stopPropagation(); btn.action(); }}
               disabled={btn.disabled}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               className={`absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all shadow-xl backdrop-blur-md border 
                 ${btn.disabled ? 'bg-zinc-800/80 text-zinc-600 border-zinc-700/50 cursor-not-allowed' : `bg-zinc-800/90 border-zinc-600 hover:bg-zinc-700 hover:scale-110 hover:border-zinc-300 ${btn.color}`}`}
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
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  
  const [featuresHistory, setFeaturesHistory] = useState([[]]); 
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);

  const [selectedLoops, setSelectedLoops] = useState([]);
  const [rebuildHistory, setRebuildHistory] = useState([]); 
  const [selectedItemId, setSelectedItemId] = useState(null); 
  const [extrudeDepth, setExtrudeDepth] = useState(5.0);
  const [isCommitting, setIsCommitting] = useState(false);
  
  const [patchAnalysis, setPatchAnalysis] = useState(null);

  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });
  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));
  const [showMesh, setShowMesh] = useState(true);
  const [showSheetsFolder, setShowSheetsFolder] = useState(true);
  const [showSolidsFolder, setShowSolidsFolder] = useState(true);
  const [showCurvesFolder, setShowCurvesFolder] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(0.4);
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

  const handleUndo = () => { if (historyIndex > 0) setHistoryIndex(historyIndex - 1); };
  const handleRedo = () => { if (historyIndex < featuresHistory.length - 1) setHistoryIndex(historyIndex + 1); };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (historyIndex > 0) setHistoryIndex(prev => prev - 1);
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          if (historyIndex < featuresHistory.length - 1) setHistoryIndex(prev => prev + 1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, featuresHistory.length]);

  const handleDeleteFeature = (id) => {
    const filtered = currentFeatures.filter(f => f.id !== id);
    commitFeatures(filtered);
  };

  const handleDeleteGeometry = (id) => {
    setRebuildHistory(prev => prev.filter(geo => geo.id !== id));
    if (selectedItemId === id) setSelectedItemId(null);
  };

  const handleClearAllFeatures = () => {
    if (currentFeatures.length === 0) return;
    commitFeatures([]);
  };

  const toggleCurveVisibility = (id) => {
    setHiddenCurveIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleExtractCurveFromRing = async () => {
    if (selectedLoops.length === 0) return;
    setIsCommitting(true);
    const newFeatures = [];
    
    for (const loop of selectedLoops) {
      if (loop.clickPoint) {
        try {
          const res = await fetch(`http://localhost:8000/extract-feature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              x: loop.clickPoint.x, y: loop.clickPoint.y, z: loop.clickPoint.z, 
              sharpness_angle: sharpnessAngle 
            })
          });
          if (res.ok) {
            newFeatures.push(await res.json());
          } else {
            newFeatures.push(loop); 
          }
        } catch (e) { newFeatures.push(loop); }
      } else {
         newFeatures.push(loop);
      }
    }

    if (newFeatures.length > 0) {
      const mapped = newFeatures.map(f => ({ ...f, id: Math.random().toString(36).substr(2, 9) }));
      commitFeatures([...currentFeatures, ...mapped]);
    }
    
    setSelectedLoops([]);
    setPatchAnalysis(null);
    setIsCommitting(false);
  };

  const handleCreatePrimitive = async () => {
    if (selectedLoops.length === 0 || !patchAnalysis) return;
    const loop = selectedLoops[0];
    if (!loop.patch_faces) return;
    
    setIsCommitting(true);
    try {
        const payload = {
            patch_faces: loop.patch_faces,
            primitive_type: patchAnalysis.type,
            sharpness_angle: sharpnessAngle,
            symmetry: symmetry
        };
        
        const res = await fetch(`http://localhost:8000/create-primitive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            const geometryData = await res.json();
            const type = patchAnalysis.type === 'plane' ? 'sheet' : 'solid';
            const defaultName = patchAnalysis.type.charAt(0).toUpperCase() + patchAnalysis.type.slice(1);
            setRebuildHistory(prev => [...prev, { 
              ...geometryData, type, id: Math.random().toString(36).substr(2, 9), 
              visible: true, name: `${defaultName} ${prev.length + 1}`, payload: { operation: 'primitive', primitive_type: patchAnalysis.type }, endpoint: 'create-primitive' 
            }]);
            setSelectedLoops([]); 
            setSelectedItemId(null);
            setPatchAnalysis(null);
        } else {
            const errData = await res.json();
            setServerLogs(prev => [...prev, `[Error] ${errData.detail}`]);
        }
    } catch (err) {
        setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]);
    }
    setIsCommitting(false);
  };

  const handleAutoExtract = async () => {
    setIsAutoExtracting(true);
    try {
      const res = await fetch('http://localhost:8000/auto-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_size: minFeatureSize, sharpness_angle: sharpnessAngle })
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
    else setMenuAnchor(mousePos); 

    if (loopData.clickPoint) {
      try {
        const res = await fetch(`http://localhost:8000/classify-patch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            x: loopData.clickPoint.x, 
            y: loopData.clickPoint.y, 
            z: loopData.clickPoint.z, 
            sharpness_angle: sharpnessAngle 
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
    setSelectedItemId(id);
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor(mousePos); 
  };

  const toggleItemVisibility = (id) => {
    setRebuildHistory(prev => prev.map(geo => 
      geo.id === id ? { ...geo, visible: geo.visible === false ? true : false } : geo
    ));
  };

  const executeGeometryOperation = async (endpoint, payload, type, defaultName) => {
    setIsCommitting(true);
    try {
      const res = await fetch(`http://localhost:8000/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const geometryData = await res.json();
        setRebuildHistory(prev => [...prev, { 
          ...geometryData, type, id: Math.random().toString(36).substr(2, 9), 
          visible: true, name: `${defaultName} ${prev.length + 1}`, payload, endpoint 
        }]);
        setSelectedLoops([]); 
        setSelectedItemId(null);
        setPatchAnalysis(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail || 'Unknown CAD Engine crash.'}`]);
      }
    } catch (err) { setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); }
    setIsCommitting(false);
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

  const handleUpdateHistoryItemDepth = async (id, newDepth) => {
    const item = rebuildHistory.find(i => i.id === id);
    if (!item || !item.payload || item.payload.operation !== 'extrude') return;
    
    setIsCommitting(true);
    try {
      const res = await fetch(`http://localhost:8000/${item.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item.payload, extrude_depth: newDepth })
      });
      if (res.ok) {
        const geo = await res.json();
        setRebuildHistory(prev => prev.map(geoItem => geoItem.id === id ? { 
            ...geoItem, vertices: geo.vertices, faces: geo.faces, payload: { ...geoItem.payload, extrude_depth: newDepth } 
        } : geoItem));
        setServerLogs(prev => [...prev, `[Success] Entity successfully rebuilt with new depth.`]);
      } else {
        setServerLogs(prev => [...prev, `[Error] Failed to update geometry.`]);
      }
    } catch (err) { setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); }
    setIsCommitting(false);
  };

  const handleUpdateHistoryItemRadius = async (id, newRadius) => {
    const item = rebuildHistory.find(i => i.id === id);
    if (!item || !item.payload || !item.payload.loops || item.payload.loops[0].type !== 'circle') return;
    
    setIsCommitting(true);
    const newPayload = { ...item.payload };
    newPayload.loops = [{ ...newPayload.loops[0], radius: newRadius }];
    
    try {
      const res = await fetch(`http://localhost:8000/${item.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayload)
      });
      if (res.ok) {
        const geo = await res.json();
        setRebuildHistory(prev => prev.map(geoItem => geoItem.id === id ? { 
            ...geoItem, vertices: geo.vertices, faces: geo.faces, payload: newPayload 
        } : geoItem));
        setServerLogs(prev => [...prev, `[Success] Entity successfully rebuilt with new radius.`]);
      } else {
        setServerLogs(prev => [...prev, `[Error] Failed to update geometry radius.`]);
      }
    } catch (err) { setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); }
    setIsCommitting(false);
  };

  const handleCut = async () => {
    const targetIndex = rebuildHistory.findIndex(geo => geo.id === selectedItemId);
    if (targetIndex === -1) return;

    setIsCommitting(true);
    try {
      const payloadLoops = selectedLoops.map(loop => ({
          ...loop,
          type: patchAnalysis && selectedLoops.length === 1 ? patchAnalysis.type : loop.type
      }));
      const res = await fetch(`http://localhost:8000/boolean-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loops: payloadLoops, extrude_depth: extrudeDepth, target_index: targetIndex })
      });
      if (res.ok) {
        const geometryData = await res.json();
        setRebuildHistory(prev => {
            const newHistory = [...prev];
            newHistory[targetIndex] = { 
              ...geometryData, type: 'solid', id: prev[targetIndex].id, visible: prev[targetIndex].visible, 
              name: prev[targetIndex].name + ' (Cut)', payload: prev[targetIndex].payload, endpoint: prev[targetIndex].endpoint
            };
            return newHistory;
        });
        setSelectedLoops([]); 
        setSelectedItemId(null);
        setPatchAnalysis(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail}`]);
      }
    } catch (err) { console.error(err); }
    setIsCommitting(false);
  };

  const handlePromoteSheet = (idToPromote) => {
    const targetId = typeof idToPromote === 'string' ? idToPromote : selectedItemId;
    if (!targetId) return;
    setRebuildHistory(prev => prev.map(geo => {
      if (geo.id === targetId && geo.type === 'sheet') {
        return { ...geo, type: 'solid', name: (geo.name || `Sheet_${geo.id}`).replace('Sheet', 'Solid') };
      }
      return geo;
    }));
    setSelectedItemId(null);
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
    setSelectedItemId(null);
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
      settings: { minFeatureSize, symmetry, mergeExportHulls, cursorScale, sharpnessAngle }
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
        body: JSON.stringify({ hulls: [], features: currentFeatures, merge_hulls: mergeExportHulls, symmetry: symmetry })
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

  const handleGlobalPointerMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });

  const sheets = rebuildHistory.filter(h => h.type === 'sheet');
  const solids = rebuildHistory.filter(h => h.type === 'solid');
  const selectedItemData = rebuildHistory.find(geo => geo.id === selectedItemId);

  return (
    <div 
      className="fixed inset-0 flex flex-row overflow-hidden bg-zinc-900 text-zinc-100 font-sans" 
      onPointerMove={handleGlobalPointerMove}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <style>{`
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; overscroll-behavior: none; }
      `}</style>
      
      <ActionRing 
        anchorPos={menuAnchor} 
        selectedLoops={selectedLoops} 
        selectedItemData={selectedItemData}
        extrudeDepth={extrudeDepth}
        setExtrudeDepth={setExtrudeDepth}
        onExtrude={handleExtrude}
        onLoft={handleLoft}
        onSheet={handleSheet}
        onCut={handleCut}
        onPromote={handlePromoteSheet}
        onExtractCurve={handleExtractCurveFromRing}
        onDeleteItem={() => handleDeleteGeometry(selectedItemId)}
        onClear={() => { setSelectedLoops([]); setSelectedItemId(null); setPatchAnalysis(null); }}
        onUpdateDepth={handleUpdateHistoryItemDepth}
        patchAnalysis={patchAnalysis}
        setPatchAnalysis={setPatchAnalysis}
        onCreatePrimitive={handleCreatePrimitive}
      />

      {/* LEFT COLUMN: OUTLINER */}
      <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-black tracking-wider text-white">RetopoCAD</h1>
          {isUploading && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>}
        </div>

        <div className="flex flex-col gap-3 p-3 flex-1 overflow-y-auto">
          
          <div className="bg-zinc-900 border border-zinc-800 rounded p-2 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Import Mesh</span>
              <label className={`px-2 py-1 rounded text-[10px] font-bold text-white cursor-pointer transition-colors shadow ${isUploading ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
                {isUploading ? 'WAIT...' : 'UPLOAD .OBJ'}
                <input type="file" accept=".obj" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
              </label>
            </div>
            {objUrl && <span className="text-[9px] font-mono text-emerald-400 leading-tight block truncate">{backendStatus}</span>}

            <div className="flex gap-1.5 mt-1 pt-2 border-t border-zinc-800">
              <button onClick={handleSaveProject} disabled={!objUrl} className="flex-1 py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700">
                Save Session
              </button>
              <label className={`flex-1 flex items-center justify-center py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 transition-colors border border-zinc-700 ${!objUrl ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-700 hover:text-white cursor-pointer'}`}>
                Load Session
                <input type="file" accept=".json" onChange={handleLoadProject} disabled={!objUrl} className="hidden" />
              </label>
            </div>
          </div>

          {objUrl && (
             <div className="flex flex-col gap-4 animate-in fade-in duration-200">
               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider mb-1">Curves Extraction</span>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-zinc-400">Min Size</span>
                    <input type="range" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value))} disabled={isAutoExtracting} className="flex-1 accent-emerald-500 h-1" />
                    <input type="number" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value) || 0)} disabled={isAutoExtracting} className="text-[10px] text-emerald-400 w-10 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-emerald-500" />
                  </div>
                  
                  <div className="flex gap-1.5 mt-0.5">
                    <button onClick={handleAutoExtract} disabled={isAutoExtracting} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/50 transition-colors">
                      Auto Detect
                    </button>
                    
                    <button title="Clear All Curves" onClick={handleClearAllFeatures} disabled={isAutoExtracting || currentFeatures.length === 0} className="w-8 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <IconClear />
                    </button>
                  </div>
               </div>
               
               <div className="flex flex-col gap-1">
                 <div className="flex items-center justify-between px-2 py-1">
                   <div className="flex items-center gap-2 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                     Reference Mesh
                   </div>
                   <button onClick={() => setShowMesh(!showMesh)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                     {showMesh ? <IconEye /> : <IconEyeOff />}
                   </button>
                 </div>
                 <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 rounded border border-zinc-800 transition-colors">
                    <span className="text-[11px] text-zinc-300 truncate w-40">{fileName}</span>
                 </div>
               </div>

               <div className="flex flex-col gap-1">
                 <div className="flex items-center justify-between px-2 py-1">
                   <div className="flex items-center gap-2 text-purple-500/80 font-bold uppercase tracking-wider text-[10px]">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12c-2.66 0-4.33-3-7-3s-4.34 3-7 3-4.33-3-7-3" /></svg>
                     Extracted Curves
                   </div>
                   <button onClick={() => setShowCurvesFolder(!showCurvesFolder)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                     {showCurvesFolder ? <IconEye /> : <IconEyeOff />}
                   </button>
                 </div>
                 {showCurvesFolder && (
                   currentFeatures.length === 0 ? <span className="px-3 text-[10px] text-zinc-600 italic">Empty</span> : currentFeatures.map((feat) => {
                     const isHidden = hiddenCurveIds.includes(feat.id);
                     return (
                       <div key={feat.id} className={`flex items-center justify-between px-3 py-1.5 rounded border transition-colors bg-zinc-900 border-zinc-800 hover:border-zinc-600`}>
                         <div className="flex items-center gap-2 overflow-hidden">
                           <span className="text-zinc-500 shrink-0"><IconWave /></span>
                           <span className="text-[11px] text-zinc-300 font-mono truncate">{feat.type === 'circle' ? 'Circle' : 'Curve'}_{feat.id.substring(0,4)}</span>
                         </div>
                         <div className="flex gap-2">
                           <button onClick={(e) => { e.stopPropagation(); toggleCurveVisibility(feat.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                             {!isHidden ? <IconEye /> : <IconEyeOff />}
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); handleDeleteFeature(feat.id); }} className="text-zinc-500 hover:text-red-400 shrink-0">
                             <IconTrash />
                           </button>
                         </div>
                       </div>
                     );
                   })
                 )}
               </div>

               <div className="flex flex-col gap-1">
                 <div className="flex items-center justify-between px-2 py-1">
                   <div className="flex items-center gap-2 text-green-500/80 font-bold uppercase tracking-wider text-[10px]">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                     Surface Sheets
                   </div>
                   <button onClick={() => setShowSheetsFolder(!showSheetsFolder)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                     {showSheetsFolder ? <IconEye /> : <IconEyeOff />}
                   </button>
                 </div>
                 {sheets.length === 0 ? <span className="px-3 text-[10px] text-zinc-600 italic">Empty</span> : sheets.map((geo) => {
                   const isCylindrical = geo.payload?.loops?.[0]?.type === 'circle' || geo.sub_type === 'cylinder';
                   return (
                     <div 
                       key={geo.id} onClick={() => setSelectedItemId(geo.id)}
                       className={`flex items-center justify-between px-3 py-1.5 rounded border cursor-pointer transition-colors ${selectedItemId === geo.id ? 'bg-zinc-800 border-green-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                     >
                       <div className="flex items-center gap-2 overflow-hidden">
                         <span className="text-zinc-500 shrink-0">{isCylindrical ? <IconCylinderOutline /> : <IconSquare />}</span>
                         <span className="text-[11px] text-zinc-300 font-mono truncate">{geo.name || `Sheet_${geo.id}`}</span>
                       </div>
                       <div className="flex gap-2">
                         <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                           {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); handleDeleteGeometry(geo.id); }} className="text-zinc-500 hover:text-red-400 shrink-0">
                           <IconTrash />
                         </button>
                       </div>
                     </div>
                   );
                 })}
               </div>

               <div className="flex flex-col gap-1">
                 <div className="flex items-center justify-between px-2 py-1">
                   <div className="flex items-center gap-2 text-blue-500/80 font-bold uppercase tracking-wider text-[10px]">
                     <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                     CAD Solids
                   </div>
                   <button onClick={() => setShowSolidsFolder(!showSolidsFolder)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                     {showSolidsFolder ? <IconEye /> : <IconEyeOff />}
                   </button>
                 </div>
                 {solids.length === 0 ? <span className="px-3 text-[10px] text-zinc-600 italic">Empty</span> : solids.map((geo) => {
                   const isCylindrical = geo.payload?.loops?.[0]?.type === 'circle' || geo.sub_type === 'cylinder';
                   return (
                     <div 
                       key={geo.id} onClick={() => setSelectedItemId(geo.id)}
                       className={`flex items-center justify-between px-3 py-1.5 rounded border cursor-pointer transition-colors ${selectedItemId === geo.id ? 'bg-zinc-800 border-blue-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                     >
                       <div className="flex items-center gap-2 overflow-hidden">
                         <span className="text-zinc-500 shrink-0">{isCylindrical ? <IconCylinderOutline /> : <IconSquare />}</span>
                         <span className="text-[11px] text-zinc-300 font-mono truncate">{geo.name || `Solid_${geo.id}`}</span>
                       </div>
                       <div className="flex gap-2">
                         <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                           {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                         </button>
                         <button onClick={(e) => { e.stopPropagation(); handleDeleteGeometry(geo.id); }} className="text-zinc-500 hover:text-red-400 shrink-0">
                           <IconTrash />
                         </button>
                       </div>
                     </div>
                   );
                 })}
               </div>

             </div>
          )}
        </div>
        
        {objUrl && (
             <div className="p-3 border-t border-zinc-800 flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="mergeHulls" checked={mergeExportHulls} onChange={(e) => setMergeExportHulls(e.target.checked)} disabled={isExporting} className="accent-emerald-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                  <label htmlFor="mergeHulls" className="text-[10px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Merge Solids (Boolean)</label>
                </div>
                <button onClick={handleExportSTEP} disabled={isExporting || (currentFeatures.length === 0 && rebuildHistory.length === 0)} className={`w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isExporting ? 'bg-emerald-900 text-emerald-400 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:shadow-none'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {isExporting ? 'Building STEP...' : 'Export STEP'}
                </button>
             </div>
        )}
      </div>

      {/* CENTER COLUMN: VIEWPORT */}
      <div className="flex-1 flex flex-col relative bg-zinc-900 overflow-hidden">
        <div className="flex-1 relative overflow-hidden">
          <Viewport 
            objUrl={objUrl} 
            symmetry={symmetry} 
            onSelectLoop={handleSelectLoop}
            onSelectSolid={handleSelectSolid}
            extractedFeatures={currentFeatures}
            showMesh={showMesh} 
            showWireframe={showWireframe}
            meshOpacity={meshOpacity}
            selectedLoops={selectedLoops}
            rebuildHistory={rebuildHistory}
            selectedSolidIndex={selectedItemId}
            cursorScale={cursorScale}
            showSheetsFolder={showSheetsFolder}
            showSolidsFolder={showSolidsFolder}
            showCurvesFolder={showCurvesFolder}
            hiddenCurveIds={hiddenCurveIds}
            sharpnessAngle={sharpnessAngle}
          />

          <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 items-start">
            <div className="flex gap-2">
              <button onClick={() => setShowMesh(!showMesh)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showMesh ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span className="text-xs font-semibold">Mesh</span>
              </button>

              <button onClick={() => setShowWireframe(!showWireframe)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showWireframe ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="text-xs font-semibold">Wireframe</span>
              </button>
            </div>
            
            {showMesh && (
              <div className="flex gap-2">
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md pointer-events-auto">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Opacity</span>
                  <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value))} className="w-20 accent-zinc-300 h-1" />
                </div>
                
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md pointer-events-auto">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cursor</span>
                  <input type="range" min="0.005" max="0.05" step="0.001" value={cursorScale} onChange={(e) => setCursorScale(parseFloat(e.target.value))} className="w-16 accent-zinc-300 h-1" />
                </div>
              </div>
            )}
          </div>

          {/* DEDICATED UNDO/REDO BUTTONS */}
          <div className="absolute bottom-4 left-4 flex gap-2 z-10 pointer-events-auto">
            <button title="Undo Curve Action (Ctrl+Z)" onClick={handleUndo} disabled={historyIndex === 0} className="p-2.5 rounded-md bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-lg transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button title="Redo Curve Action (Ctrl+Y)" onClick={handleRedo} disabled={historyIndex === featuresHistory.length - 1} className="p-2.5 rounded-md bg-zinc-900/80 backdrop-blur-md border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed shadow-lg transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
            </button>
          </div>

          <div className="absolute top-4 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-md shadow-2xl p-2 w-40 z-10 flex flex-col gap-1.5 pointer-events-auto">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-1.5 mb-0.5 text-center">Mirror Planes</span>
            <CompactSymmetryToggle label="X (YZ)" active={symmetry.x} onClick={() => toggleSymmetry('x')} colorClass="bg-red-500" />
            <CompactSymmetryToggle label="Y (XZ)" active={symmetry.y} onClick={() => toggleSymmetry('y')} colorClass="bg-green-500" />
            <CompactSymmetryToggle label="Z (XY)" active={symmetry.z} onClick={() => toggleSymmetry('z')} colorClass="bg-blue-500" />
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
      <div className="w-64 bg-zinc-950 border-l border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Inspector</h2>
        </div>

        <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-4">
          
          <div className="bg-zinc-900 rounded border border-zinc-800 p-3 flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Environment</span>
            <div className="flex flex-col gap-1 mt-2">
              <div className="flex justify-between items-center text-[10px] text-zinc-400 font-mono">
                <span>Sharpness (Dihedral)</span>
                <span className="text-white">{sharpnessAngle}°</span>
              </div>
              <input 
                type="range" 
                min="0" max="180" 
                value={sharpnessAngle} 
                onChange={(e) => setSharpnessAngle(parseInt(e.target.value))} 
                className="w-full accent-indigo-500 h-1 mt-1" 
              />
            </div>
          </div>

          <div className="bg-zinc-900 rounded border border-amber-900/50 p-2 flex flex-col gap-2">
             <div className="flex justify-between items-center pb-1 border-b border-zinc-800">
                <span className="text-[10px] font-bold uppercase text-amber-500 tracking-wider">Selection Stack</span>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded">{selectedLoops.length} Items</span>
             </div>
             
             <p className="text-[9px] text-zinc-400 italic">Select tool: hover mesh and click loops to add to stack.</p>

             <div className="min-h-16 max-h-40 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded p-1 flex flex-col gap-1">
                {selectedLoops.length === 0 ? (
                  <span className="text-zinc-600 text-[10px] text-center mt-4 mb-4">Stack is empty.</span>
                ) : (
                  selectedLoops.map((loop, i) => (
                    <div key={i} className="flex justify-between items-center bg-zinc-800/50 px-2 py-1 rounded text-[10px] font-mono text-zinc-300">
                      <span>Loop #{loop.id.split('_')[1] || i}</span>
                      <span className="text-amber-500">[{loop.points.length} pts]</span>
                    </div>
                  ))
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
                        <span className={patchAnalysis.type === 'plane' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.plane?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Cylinder</span>
                        <span className={patchAnalysis.type === 'cylinder' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.cylinder?.toExponential(2) || 'N/A'}</span>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-zinc-400">Sphere</span>
                        <span className={patchAnalysis.type === 'sphere' ? 'text-amber-400 font-bold bg-amber-900/20 px-1 rounded' : 'text-zinc-300'}>{patchAnalysis.errors?.sphere?.toExponential(2) || 'N/A'}</span>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {selectedItemData ? (
            <div className="bg-zinc-900 rounded border border-zinc-800 p-3 flex flex-col gap-3">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Classification</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${selectedItemData.type === 'sheet' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-blue-900/30 text-blue-400 border border-blue-800'}`}>
                  {selectedItemData.type}
                </span>
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Properties</span>
                
                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                  <span className="text-[10px] font-mono text-zinc-500">Name</span>
                  <input 
                    className="text-[10px] font-mono text-zinc-300 bg-transparent text-right outline-none w-32 border-b border-transparent focus:border-indigo-500 transition-colors"
                    value={selectedItemData.name || `${selectedItemData.type}_${selectedItemData.id}`}
                    onChange={(e) => setRebuildHistory(prev => prev.map(geo => geo.id === selectedItemId ? { ...geo, name: e.target.value } : geo))}
                  />
                </div>

                <div className="flex justify-between items-center bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                  <span className="text-[10px] font-mono text-zinc-500">Faces Count</span>
                  <span className="text-[10px] font-mono text-zinc-300">{selectedItemData.faces?.length || 0}</span>
                </div>

                {selectedItemData.payload && selectedItemData.payload.operation === 'extrude' && (
                  <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                     <span className="text-[10px] font-mono text-zinc-500">Depth</span>
                     <input 
                       type="number"
                       className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-indigo-500 text-right font-mono"
                       defaultValue={selectedItemData.payload.extrude_depth}
                       onBlur={(e) => {
                           const newDepth = parseFloat(e.target.value) || 0;
                           if (newDepth !== selectedItemData.payload.extrude_depth) {
                                handleUpdateHistoryItemDepth(selectedItemId, newDepth);
                           }
                       }}
                       onKeyDown={(e) => {
                           if (e.key === 'Enter') e.target.blur();
                       }}
                       disabled={isCommitting}
                       step="0.1"
                     />
                  </div>
                )}

                {selectedItemData.payload && selectedItemData.payload.loops?.[0]?.type === 'circle' && (
                  <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800 mt-1">
                     <span className="text-[10px] font-mono text-zinc-500">Radius</span>
                     <input 
                       type="number"
                       className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-indigo-500 text-right font-mono"
                       defaultValue={selectedItemData.payload.loops[0].radius}
                       onBlur={(e) => {
                           const newRadius = parseFloat(e.target.value) || 0;
                           if (newRadius !== selectedItemData.payload.loops[0].radius) {
                                handleUpdateHistoryItemRadius(selectedItemId, newRadius);
                           }
                       }}
                       onKeyDown={(e) => {
                           if (e.key === 'Enter') e.target.blur();
                       }}
                       disabled={isCommitting}
                       step="0.1"
                     />
                  </div>
                )}
                
                {(selectedItemData.payload?.operation === 'extrude' || selectedItemData.payload?.loops?.[0]?.type === 'circle') && (
                    <span className="text-[8px] text-zinc-600 italic mt-1 px-1">Press Enter or Unfocus to rebuild</span>
                )}
              </div>

              {selectedItemData.type === 'sheet' && (
                <div className="mt-2 pt-3 border-t border-zinc-800">
                  <button 
                    onClick={() => handlePromoteSheet(selectedItemId)}
                    className="w-full py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-600/50 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                  >
                    Promote to Solid
                  </button>
                  <p className="text-[9px] text-zinc-500 text-center mt-2">Applies thickness and moves to CAD Solids</p>
                </div>
              )}
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