import React, { useState, useRef, useEffect } from 'react';
import Viewport from './Viewport';

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

export default function App() {
  const [objUrl, setObjUrl] = useState(null);
  const [backendStatus, setBackendStatus] = useState("Waiting for mesh...");
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mergeExportHulls, setMergeExportHulls] = useState(true);
  
  const [analysisTooltip, setAnalysisTooltip] = useState(null);
  
  const [isGeneratingHulls, setIsGeneratingHulls] = useState(false);
  const [generationTimer, setGenerationTimer] = useState(0);
  const timerIntervalRef = useRef(null);
  
  const [hullsData, setHullsData] = useState(null);
  const [activeMode, setActiveMode] = useState('hard-surface');
  const [maxHulls, setMaxHulls] = useState(50);
  const [mergeTolerance, setMergeTolerance] = useState(5);
  const [decimationTarget, setDecimationTarget] = useState(15000);
  const [skipDecimation, setSkipDecimation] = useState(false);

  const [activeTool, setActiveTool] = useState('analyze'); 
  const [featuresHistory, setFeaturesHistory] = useState([[]]); 
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);

  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });
  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));

  const [showMesh, setShowMesh] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(0.4);
  const [showHulls, setShowHulls] = useState(true);
  
  // LIVE POLLING SYSTEM FOR CONSOLE
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
      } catch (err) {
        // Silently fail if server isn't running yet
      }
    };
    
    const interval = setInterval(pollLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll console to bottom when logs update
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
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

  const handleFeatureExtracted = (featureData) => {
    const newFeature = { ...featureData, id: Math.random().toString(36).substr(2, 9) };
    commitFeatures([...currentFeatures, newFeature]);
  };

  const handleFeatureDelete = (id) => {
    if (activeTool !== 'delete') return;
    const filtered = currentFeatures.filter(f => f.id !== id);
    commitFeatures(filtered);
  };

  const handleClearAllFeatures = () => {
    if (currentFeatures.length === 0) return;
    commitFeatures([]);
  };

  const handleAutoExtract = async () => {
    setIsAutoExtracting(true);
    try {
      const res = await fetch('http://localhost:8000/auto-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_size: minFeatureSize })
      });
      const data = await res.json();

      if (res.ok) {
        const newFeatures = data.features.map(f => ({ ...f, id: Math.random().toString(36).substr(2, 9) }));
        commitFeatures([...currentFeatures, ...newFeatures]);
      }
    } catch (err) {
      console.error(err);
    }
    setIsAutoExtracting(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setAnalysisTooltip(null);
    setHullsData(null);
    setFeaturesHistory([[]]);
    setHistoryIndex(0);

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
    } catch (err) {
      setBackendStatus("Connection Error!");
    }
    setIsUploading(false);
    event.target.value = ''; 
  };

  const handleSaveProject = () => {
    const projectData = {
      hullsData,
      features: currentFeatures,
      settings: { activeMode, maxHulls, mergeTolerance, decimationTarget, skipDecimation, minFeatureSize, symmetry, mergeExportHulls }
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
        if (data.hullsData) setHullsData(data.hullsData);
        if (data.features) {
          setFeaturesHistory([data.features]);
          setHistoryIndex(0);
        }
        if (data.settings) {
          if (data.settings.activeMode) setActiveMode(data.settings.activeMode);
          if (data.settings.maxHulls) setMaxHulls(data.settings.maxHulls);
          if (data.settings.mergeTolerance) setMergeTolerance(data.settings.mergeTolerance);
          if (data.settings.decimationTarget) setDecimationTarget(data.settings.decimationTarget);
          if (data.settings.skipDecimation !== undefined) setSkipDecimation(data.settings.skipDecimation);
          if (data.settings.minFeatureSize) setMinFeatureSize(data.settings.minFeatureSize);
          if (data.settings.symmetry) setSymmetry(data.settings.symmetry);
          if (data.settings.mergeExportHulls !== undefined) setMergeExportHulls(data.settings.mergeExportHulls);
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleModeChange = (mode) => {
    setActiveMode(mode);
    if (mode === 'organic') {
      setMaxHulls(15); setMergeTolerance(30); setDecimationTarget(4000); setSkipDecimation(false);
    } else {
      setMaxHulls(50); setMergeTolerance(5); setDecimationTarget(15000); setSkipDecimation(false);
    }
  };

  const handleGenerateHulls = async () => {
    setIsGeneratingHulls(true);
    setGenerationTimer(0);
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => setGenerationTimer(((Date.now() - startTime) / 1000).toFixed(1)), 100);

    try {
      const res = await fetch('http://localhost:8000/generate-hulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_hulls: maxHulls, threshold_pct: mergeTolerance, decimation_target: decimationTarget, skip_decimation: skipDecimation })
      });
      const data = await res.json();
      clearInterval(timerIntervalRef.current);

      if (res.ok) {
        setHullsData(data.hulls);
      }
    } catch (err) {
      clearInterval(timerIntervalRef.current);
    }
    setIsGeneratingHulls(false);
  };

  const handleExportSTEP = async () => {
    if (!hullsData && currentFeatures.length === 0) return;

    setIsExporting(true);

    try {
      const res = await fetch('http://localhost:8000/export-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hulls: hullsData || [], features: currentFeatures, merge_hulls: mergeExportHulls })
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
    } catch (err) {
      console.error(err);
    }
    setIsExporting(false);
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-zinc-900 text-zinc-100 font-sans">
      
      <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-10 shrink-0">
        
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h1 className="text-lg font-bold tracking-wider text-white">RetopoCAD</h1>
          {isUploading && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>}
        </div>

        <div className="flex flex-col gap-3 p-3 flex-1 overflow-y-auto custom-scrollbar">
          
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
             <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Curves Extraction</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 text-zinc-400">Min Size</span>
                  <input type="range" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value))} disabled={isAutoExtracting} className="flex-1 accent-emerald-500 h-1" />
                  <span className="text-[10px] text-emerald-400 w-8 text-right font-mono">{minFeatureSize}</span>
                </div>
                <div className="flex gap-1.5 mt-0.5">
                  <button onClick={handleAutoExtract} disabled={isAutoExtracting} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/50 transition-colors">
                    Auto
                  </button>
                  <button onClick={handleClearAllFeatures} disabled={isAutoExtracting || currentFeatures.length === 0} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Clear
                  </button>
                </div>
             </div>
          )}

          {objUrl && (
             <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Auto-Blocker</span>
                </div>
                
                <div className="flex bg-zinc-950 rounded border border-zinc-800 p-0.5">
                  <button onClick={() => handleModeChange('organic')} disabled={isGeneratingHulls} className={`flex-1 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded transition-colors ${activeMode === 'organic' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Organic</button>
                  <button onClick={() => handleModeChange('hard-surface')} disabled={isGeneratingHulls} className={`flex-1 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded transition-colors ${activeMode === 'hard-surface' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Hard Surface</button>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 text-zinc-400">Blocks</span>
                  <input type="range" min="1" max="100" value={maxHulls} onChange={(e) => setMaxHulls(parseInt(e.target.value))} disabled={isGeneratingHulls} className="flex-1 accent-indigo-500 h-1" />
                  <span className="text-[10px] text-indigo-400 w-8 text-right font-mono">{maxHulls}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 text-zinc-400">Merge</span>
                  <input type="range" min="1" max="100" value={mergeTolerance} onChange={(e) => setMergeTolerance(parseInt(e.target.value))} disabled={isGeneratingHulls} className="flex-1 accent-indigo-500 h-1" />
                  <span className="text-[10px] text-indigo-400 w-8 text-right font-mono">{mergeTolerance}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] w-14 text-zinc-400">Detail</span>
                  <input type="range" min="1000" max="30000" step="1000" value={decimationTarget} onChange={(e) => setDecimationTarget(parseInt(e.target.value))} disabled={isGeneratingHulls || skipDecimation} className={`flex-1 accent-indigo-500 h-1 ${skipDecimation ? 'opacity-50 grayscale' : ''}`} />
                  <span className={`text-[10px] text-indigo-400 w-8 text-right font-mono ${skipDecimation ? 'line-through opacity-50' : ''}`}>{decimationTarget/1000}k</span>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <input type="checkbox" id="skipDec" checked={skipDecimation} onChange={(e) => setSkipDecimation(e.target.checked)} disabled={isGeneratingHulls} className="accent-red-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                  <label htmlFor="skipDec" className="text-[9px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Skip Decimation (Raw)</label>
                </div>
                
                <button onClick={handleGenerateHulls} disabled={isGeneratingHulls} className={`w-full py-1.5 mt-1 rounded text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${isGeneratingHulls ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow'}`}>
                  {isGeneratingHulls ? `Processing (${generationTimer}s)` : 'Generate'}
                </button>
             </div>
          )}

          {objUrl && (
             <div className="mt-auto pt-2 border-t border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="mergeHulls" checked={mergeExportHulls} onChange={(e) => setMergeExportHulls(e.target.checked)} disabled={isExporting} className="accent-emerald-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                  <label htmlFor="mergeHulls" className="text-[10px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Merge Hulls (Boolean)</label>
                </div>
                <button onClick={handleExportSTEP} disabled={isExporting} className={`w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isExporting ? 'bg-emerald-900 text-emerald-400 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  {isExporting ? 'Building STEP...' : 'Export STEP'}
                </button>
             </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative bg-zinc-900">
        
        <div className="flex-1 relative overflow-hidden">
          <Viewport 
            objUrl={objUrl} 
            symmetry={symmetry} 
            activeTool={activeTool}
            onAnalyze={(data) => setAnalysisTooltip(data)} 
            onFeatureExtracted={handleFeatureExtracted}
            onFeatureDelete={handleFeatureDelete}
            extractedFeatures={currentFeatures}
            hullsData={hullsData} 
            showMesh={showMesh} 
            showWireframe={showWireframe}
            meshOpacity={meshOpacity}
            showHulls={showHulls} 
          />

          {analysisTooltip && (
             <div 
                style={{ left: Math.min(analysisTooltip.x + 15, window.innerWidth - 250), top: Math.min(analysisTooltip.y + 15, window.innerHeight - 150) }} 
                className="absolute bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-lg shadow-2xl p-3 w-56 z-50 pointer-events-auto"
             >
                <div className="flex justify-between items-center mb-2 pb-1 border-b border-zinc-800">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-300">Surface Info</span>
                  <button onClick={() => setAnalysisTooltip(null)} className="text-zinc-500 hover:text-white">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex flex-col gap-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Type:</span>
                    <span className={analysisTooltip.type === 'planar' ? 'text-blue-400 font-bold uppercase' : 'text-green-400 font-bold uppercase'}>{analysisTooltip.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Faces:</span>
                    <span className="text-zinc-200">{analysisTooltip.face_count}</span>
                  </div>
                  {analysisTooltip.type === 'cylindrical' && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Radius:</span>
                      <span className="text-zinc-200">{analysisTooltip.radius?.toFixed(4)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Variance:</span>
                    <span className="text-zinc-200">{analysisTooltip.variance.toExponential(2)}</span>
                  </div>
                </div>
             </div>
          )}

          <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-10 items-start">
            <div className="flex gap-2">
              <button onClick={() => setShowMesh(!showMesh)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showMesh ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span className="text-xs font-semibold">Mesh</span>
              </button>

              <button onClick={() => setShowWireframe(!showWireframe)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showWireframe ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="text-xs font-semibold">Wireframe</span>
              </button>

              <button onClick={() => setShowHulls(!showHulls)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showHulls ? 'bg-blue-900/40 border-blue-700 text-blue-100' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                <span className="text-xs font-semibold">Hulls</span>
              </button>
            </div>
            
            {showMesh && (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Opacity</span>
                <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value))} className="w-24 accent-zinc-300 h-1" />
              </div>
            )}
          </div>

          <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-2 z-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-2">
            
            <button title="Surface Info" onClick={() => setActiveTool('analyze')} className={`p-2.5 rounded-md transition-all ${activeTool === 'analyze' ? 'bg-blue-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>

            <button title="Smart Curve Extract (Manual)" onClick={() => setActiveTool('extract')} className={`p-2.5 rounded-md transition-all ${activeTool === 'extract' ? 'bg-emerald-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </button>

            <div className="w-full h-px bg-zinc-800 my-1"></div>

            <button title="Select & Delete Shape" onClick={() => setActiveTool('delete')} className={`p-2.5 rounded-md transition-all ${activeTool === 'delete' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}>
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>

            <div className="w-full h-px bg-zinc-800 my-1"></div>

            <button title="Undo" onClick={handleUndo} disabled={historyIndex === 0} className="p-2.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            </button>
            <button title="Redo" onClick={handleRedo} disabled={historyIndex === featuresHistory.length - 1} className="p-2.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-20 disabled:cursor-not-allowed transition-all">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg>
            </button>

          </div>

          <div className="absolute top-4 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-md shadow-2xl p-2 w-40 z-10 flex flex-col gap-1.5">
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
          <div className="flex-1 p-2 overflow-y-auto custom-scrollbar font-mono text-[11px] text-zinc-400 leading-relaxed flex flex-col justify-start">
            {serverLogs.map((log, i) => (
              <div key={i} className={log.includes('[Error]') ? 'text-red-400' : log.includes('[Success]') || log.includes('[CAD]') ? 'text-emerald-400' : log.includes('[Warning]') ? 'text-yellow-400' : ''}>
                <span className="opacity-30 select-none mr-2">{'>'}</span>{log}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>

      </div>
    </div>
  );
}