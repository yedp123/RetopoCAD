import React, { useState, useRef } from 'react';
import Viewport from './Viewport';

function CompactSymmetryToggle({ label, active, onClick, colorClass }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-between w-full px-3 py-1.5 rounded transition-colors ${active ? 'bg-zinc-700/50 text-white' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'}`}>
      <span className="font-medium text-xs">{label}</span>
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
  const [analysisData, setAnalysisData] = useState(null);
  
  const [isGeneratingHulls, setIsGeneratingHulls] = useState(false);
  const [generationTimer, setGenerationTimer] = useState(0);
  const timerIntervalRef = useRef(null);
  
  const [hullsData, setHullsData] = useState(null);
  const [activeMode, setActiveMode] = useState('hard-surface');
  const [maxHulls, setMaxHulls] = useState(50);
  const [mergeTolerance, setMergeTolerance] = useState(5);
  const [decimationTarget, setDecimationTarget] = useState(15000);
  const [skipDecimation, setSkipDecimation] = useState(false);

  // Tooling & History
  const [activeTool, setActiveTool] = useState('analyze'); 
  const [featuresHistory, setFeaturesHistory] = useState([[]]); 
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Auto-Extract States
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);

  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });
  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));

  const [showMesh, setShowMesh] = useState(true);
  const [showHulls, setShowHulls] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState(["System initialized. Ready for operations..."]);

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
    setConsoleLogs(prev => [...prev, `[CAD] Extracted ${featureData.type} curve.`]);
  };

  const handleFeatureDelete = (id) => {
    if (activeTool !== 'delete') return;
    const filtered = currentFeatures.filter(f => f.id !== id);
    commitFeatures(filtered);
    setConsoleLogs(prev => [...prev, `[CAD] Curve deleted.`]);
  };

  const handleClearAllFeatures = () => {
    if (currentFeatures.length === 0) return;
    commitFeatures([]);
    setConsoleLogs(prev => [...prev, `[System] Cleared all extracted curves.`]);
  };

  const handleAutoExtract = async () => {
    setIsAutoExtracting(true);
    setConsoleLogs(prev => [...prev, `[System] Scanning entire mesh for curves > ${minFeatureSize} units...`]);
    
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
        setConsoleLogs(prev => [...prev, `[Success] Auto-extracted ${newFeatures.length} curves from mesh!`]);
      } else {
        setConsoleLogs(prev => [...prev, `[Error] Auto-extract failed.`]);
      }
    } catch (err) {
      setConsoleLogs(prev => [...prev, `[Error] Could not connect to Python backend.`]);
    }
    setIsAutoExtracting(false);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setAnalysisData(null);
    setHullsData(null);
    setFeaturesHistory([[]]);
    setHistoryIndex(0);

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    setBackendStatus("Syncing with Python Brain...");
    setConsoleLogs(prev => [...prev, `[System] Uploading ${file.name}...`]);

    try {
      const res = await fetch('http://localhost:8000/upload-mesh', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setBackendStatus(`Brain Sync: ${data.faces.toLocaleString()} faces loaded`);
        setConsoleLogs(prev => [...prev, `[Success] Mesh loaded. Faces: ${data.faces.toLocaleString()}`]);
      } else {
        setBackendStatus(`Error: ${data.detail}`);
      }
    } catch (err) {
      setBackendStatus("Connection Error: Is the Python server running?");
    }
    setIsUploading(false);
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
    setConsoleLogs(prev => [...prev, `[CoACD] Initiating hull generation...`]);
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
      const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);

      if (res.ok) {
        setHullsData(data.hulls);
        setConsoleLogs(prev => [...prev, `[Success] Generated ${data.hulls.length} volumetric hulls in ${finalTime}s.`]);
      } else {
        setConsoleLogs(prev => [...prev, `[Error] Generation failed.`]);
      }
    } catch (err) {
      clearInterval(timerIntervalRef.current);
      alert("Failed to connect to backend");
    }
    setIsGeneratingHulls(false);
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-zinc-900 text-zinc-100 font-sans">
      
      <div className="w-80 bg-zinc-950 border-r border-zinc-800 p-4 flex flex-col gap-4 z-10 shrink-0 overflow-y-auto custom-scrollbar">
        <div><h1 className="text-2xl font-bold tracking-wider text-white">RetopoCAD</h1></div>
        <div className="h-px bg-zinc-800 w-full"></div>

        {/* Importer */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Import CAD Data</label>
          <label className={`flex items-center justify-center w-full px-3 py-2 text-white rounded cursor-pointer transition-colors shadow-lg ${isUploading ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            <svg className="w-4 h-4 mr-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span className="font-medium text-sm">{isUploading ? 'Uploading...' : 'Upload .obj File'}</span>
            <input type="file" accept=".obj" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
          {objUrl && (
            <div className="mt-1 p-2 bg-zinc-900/50 rounded border border-zinc-800 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 ${isUploading ? 'bg-yellow-400 animate-pulse' : (backendStatus.includes("Error") ? 'bg-red-500' : 'bg-emerald-400')}`}></div>
              <span className="text-[10px] font-mono text-zinc-300 leading-tight">{backendStatus}</span>
            </div>
          )}
        </div>

        {/* Smart Curve Tooling */}
        {objUrl && (
          <div className="flex flex-col gap-2">
             <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Feature Extraction</label>
             <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col gap-3">
                
                {/* Auto-Extract Batch Operation */}
                <div className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-200">Min. Feature Size</span>
                    <span className="text-emerald-400">{minFeatureSize} units</span>
                  </div>
                  <input type="range" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value))} disabled={isAutoExtracting} className="w-full accent-emerald-500" />
                  
                  <button onClick={handleAutoExtract} disabled={isAutoExtracting} className={`mt-2 w-full py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 ${isAutoExtracting ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/50 shadow-sm'}`}>
                    {isAutoExtracting ? 'Scanning Mesh...' : 'Auto-Extract All'}
                  </button>

                  <button 
                    onClick={handleClearAllFeatures} 
                    disabled={isAutoExtracting || currentFeatures.length === 0} 
                    className={`mt-2 w-full py-1.5 rounded text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 ${isAutoExtracting || currentFeatures.length === 0 ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed border border-transparent' : 'bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 shadow-sm'}`}
                  >
                    Clear All Curves
                  </button>
                  <span className="text-[9px] text-zinc-500 mt-1 leading-tight text-center">
                    Scans mesh and extracts all curves larger than the threshold.
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-zinc-400">Manual Tools:</span>
                  <span className="text-xs text-zinc-500">Use toolbar in viewport</span>
                </div>

             </div>
          </div>
        )}

        {/* Auto-Blocker */}
        {objUrl && (
          <div className="flex flex-col gap-2 mt-auto">
             <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Auto-Blocker</label>
             <div className="p-3 bg-zinc-900 rounded border border-zinc-800 flex flex-col gap-3">
                <div className="flex bg-zinc-950 rounded p-1 border border-zinc-800">
                  <button onClick={() => handleModeChange('organic')} disabled={isGeneratingHulls} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${activeMode === 'organic' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}>Organic</button>
                  <button onClick={() => handleModeChange('hard-surface')} disabled={isGeneratingHulls} className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${activeMode === 'hard-surface' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}>Hard Surface</button>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">Max Blocks</span>
                      <span className="text-indigo-400">{maxHulls}</span>
                    </div>
                    <input type="range" min="1" max="100" value={maxHulls} onChange={(e) => setMaxHulls(parseInt(e.target.value))} disabled={isGeneratingHulls} className="w-full accent-indigo-500" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">Merge Tolerance</span>
                      <span className="text-indigo-400">{mergeTolerance}%</span>
                    </div>
                    <input type="range" min="1" max="100" value={mergeTolerance} onChange={(e) => setMergeTolerance(parseInt(e.target.value))} disabled={isGeneratingHulls} className="w-full accent-indigo-500" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span className="font-semibold text-zinc-200">Math Resolution</span>
                      <span className={`text-indigo-400 ${skipDecimation ? 'line-through opacity-50' : ''}`}>{decimationTarget.toLocaleString()}</span>
                    </div>
                    <input type="range" min="1000" max="30000" step="1000" value={decimationTarget} onChange={(e) => setDecimationTarget(parseInt(e.target.value))} disabled={isGeneratingHulls || skipDecimation} className={`w-full accent-indigo-500 ${skipDecimation ? 'opacity-50 grayscale' : ''}`} />
                    
                    <div className="flex items-center gap-2 mt-1 bg-zinc-950 p-1.5 rounded border border-zinc-800">
                      <input type="checkbox" id="skipDec" checked={skipDecimation} onChange={(e) => setSkipDecimation(e.target.checked)} disabled={isGeneratingHulls} className="accent-red-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                      <label htmlFor="skipDec" className="text-[10px] text-zinc-300 font-medium cursor-pointer select-none">Skip Decimation (Raw Mesh)</label>
                    </div>
                  </div>
                </div>
                <button onClick={handleGenerateHulls} disabled={isGeneratingHulls} className={`w-full py-1.5 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2 ${isGeneratingHulls ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700 shadow-lg'}`}>
                  {isGeneratingHulls ? `Processing... (${generationTimer}s)` : 'Generate Hulls'}
                </button>
             </div>
          </div>
        )}

        {/* Surface Analysis */}
        {objUrl && (
          <div className="flex flex-col gap-2 mt-auto">
            <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Surface Analysis</label>
            <div className="p-3 bg-zinc-900 rounded border border-zinc-800 min-h-[100px] flex flex-col justify-center">
              {!analysisData ? (
                <div className="text-zinc-500 text-center text-xs italic">Select info tool and click on mesh.</div>
              ) : (
                <div className="flex flex-col gap-1.5 text-xs font-mono">
                  <div className="flex justify-between border-b border-zinc-800 pb-1">
                    <span className="text-zinc-400">Type:</span>
                    <span className={analysisData.type === 'planar' ? 'text-blue-400 font-bold uppercase' : (analysisData.type === 'cylindrical' ? 'text-green-400 font-bold uppercase' : 'text-orange-400 font-bold uppercase')}>{analysisData.type}</span>
                  </div>
                  <div className="flex justify-between border-b border-zinc-800 pb-1">
                    <span className="text-zinc-400">Faces:</span>
                    <span className="text-zinc-200">{analysisData.face_count}</span>
                  </div>
                  {analysisData.type === 'cylindrical' && (
                    <div className="flex justify-between border-b border-zinc-800 pb-1">
                      <span className="text-zinc-400">Radius:</span>
                      <span className="text-zinc-200">{analysisData.radius.toFixed(4)} units</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Variance:</span>
                    <span className="text-zinc-200">{analysisData.variance.toExponential(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area (Viewport + Console) */}
      <div className="flex-1 flex flex-col relative bg-zinc-900">
        
        <div className="flex-1 relative">
          <Viewport 
            objUrl={objUrl} 
            symmetry={symmetry} 
            activeTool={activeTool}
            onAnalyze={(data) => setAnalysisData(data)} 
            onFeatureExtracted={handleFeatureExtracted}
            onFeatureDelete={handleFeatureDelete}
            extractedFeatures={currentFeatures}
            hullsData={hullsData} 
            showMesh={showMesh} 
            showHulls={showHulls} 
          />

          {/* Floating UI: Top Left Rendering Toggles */}
          <div className="absolute top-4 left-4 flex gap-2 z-10">
            <button onClick={() => setShowMesh(!showMesh)} className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-lg border backdrop-blur-md transition-all ${showMesh ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              <span className="text-xs font-semibold">Ghost Mesh</span>
            </button>
            <button onClick={() => setShowHulls(!showHulls)} className={`flex items-center gap-2 px-3 py-2 rounded-md shadow-lg border backdrop-blur-md transition-all ${showHulls ? 'bg-blue-900/40 border-blue-700 text-blue-100' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              <span className="text-xs font-semibold">Hulls</span>
            </button>
          </div>

          {/* Floating UI: Vertical Tools Toolbar (Middle Left) */}
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

          {/* Floating UI: Symmetry Tools */}
          <div className="absolute top-4 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-md shadow-2xl p-3 w-48 z-10 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-2 mb-1">Mirror Planes</span>
            <CompactSymmetryToggle label="X (YZ)" active={symmetry.x} onClick={() => toggleSymmetry('x')} colorClass="bg-red-500" />
            <CompactSymmetryToggle label="Y (XZ)" active={symmetry.y} onClick={() => toggleSymmetry('y')} colorClass="bg-green-500" />
            <CompactSymmetryToggle label="Z (XY)" active={symmetry.z} onClick={() => toggleSymmetry('z')} colorClass="bg-blue-500" />
          </div>
        </div>

        {/* Bottom Console Panel */}
        <div className="h-32 bg-[#0a0a0c] border-t border-zinc-800 shrink-0 flex flex-col shadow-[inset_0_4px_6px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-b border-zinc-800">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Output Console
            </span>
          </div>
          <div className="flex-1 p-3 overflow-y-auto custom-scrollbar font-mono text-xs text-zinc-400 leading-relaxed flex flex-col justify-end">
            {consoleLogs.slice(-15).map((log, i) => (
              <div key={i} className={log.includes('[Error]') ? 'text-red-400' : log.includes('[Success]') || log.includes('[CAD]') ? 'text-emerald-400' : ''}>
                <span className="opacity-30 select-none mr-3">{'>'}</span>{log}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}