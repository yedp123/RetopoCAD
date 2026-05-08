import React, { useState } from 'react';
import Viewport from './Viewport';

function SymmetryToggle({ label, active, onClick, colorClass }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-md transition-colors shadow-sm border ${
        active 
          ? 'bg-zinc-800 border-zinc-700 text-white' 
          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      <span className="font-medium text-sm">{label}</span>
      <div className={`w-8 h-4 rounded-full relative transition-colors ${active ? colorClass : 'bg-zinc-700'}`}>
        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${active ? 'translate-x-4' : ''}`}></div>
      </div>
    </button>
  );
}

export default function App() {
  const [objUrl, setObjUrl] = useState(null);
  const [backendStatus, setBackendStatus] = useState("Waiting for mesh...");
  const [isUploading, setIsUploading] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  
  const [maxHulls, setMaxHulls] = useState(10);
  const [isGeneratingHulls, setIsGeneratingHulls] = useState(false);
  const [hullsData, setHullsData] = useState(null);

  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });

  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setAnalysisData(null);
    setHullsData(null);

    const formData = new FormData();
    formData.append('file', file);
    setIsUploading(true);
    setBackendStatus("Syncing with Python Brain...");

    try {
      const res = await fetch('http://localhost:8000/upload-mesh', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) setBackendStatus(`Brain Sync: ${data.faces.toLocaleString()} faces loaded`);
      else setBackendStatus(`Error: ${data.detail}`);
    } catch (err) {
      setBackendStatus("Connection Error: Is the Python server running?");
    }
    setIsUploading(false);
    event.target.value = ''; 
  };

  const handleGenerateHulls = async () => {
    setIsGeneratingHulls(true);
    
    try {
      const res = await fetch('http://localhost:8000/generate-hulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_hulls: maxHulls })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setHullsData(data.hulls);
      } else {
        alert(`Failed to generate hulls: ${data.detail}`);
      }
    } catch (err) {
      alert("Failed to connect to backend to generate hulls.");
    }
    setIsGeneratingHulls(false);
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-zinc-900 text-zinc-100 font-sans">
      <div className="w-80 bg-zinc-950 border-r border-zinc-800 p-6 flex flex-col gap-6 z-10 shadow-2xl shrink-0 overflow-y-auto custom-scrollbar">
        <div>
          <h1 className="text-2xl font-bold tracking-wider text-white">RetopoCAD</h1>
          <p className="text-sm text-zinc-400 mt-1">Phase 4: CoACD Auto-Block</p>
        </div>

        <div className="h-px bg-zinc-800 w-full"></div>

        {/* Importer */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Import CAD Data</label>
          <label className={`flex items-center justify-center w-full px-4 py-3 text-white rounded-md cursor-pointer transition-colors shadow-lg ${isUploading ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            <svg className="w-5 h-5 mr-2 shrink-0" style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span className="font-medium">{isUploading ? 'Uploading...' : 'Upload .obj File'}</span>
            <input type="file" accept=".obj" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
          {objUrl && (
            <div className="mt-1 p-3 bg-zinc-900/50 rounded border border-zinc-800 flex items-start gap-2">
              <div className={`w-2 h-2 mt-1 rounded-full shrink-0 ${isUploading ? 'bg-yellow-400 animate-pulse' : (backendStatus.includes("Error") ? 'bg-red-500' : 'bg-emerald-400')}`}></div>
              <span className="text-xs font-mono text-zinc-300 leading-tight">{backendStatus}</span>
            </div>
          )}
        </div>

        {/* Auto-Blocker */}
        {objUrl && (
          <div className="flex flex-col gap-2">
             <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wide flex justify-between">
                Auto-Blocker
                <span className="text-indigo-400">{maxHulls} Hulls</span>
             </label>
             <div className="p-4 bg-zinc-900 rounded-md border border-zinc-800 flex flex-col gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="50" 
                  value={maxHulls} 
                  onChange={(e) => setMaxHulls(parseInt(e.target.value))}
                  disabled={isGeneratingHulls}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <button 
                  onClick={handleGenerateHulls}
                  disabled={isGeneratingHulls}
                  className={`w-full py-2 rounded font-medium transition-colors flex items-center justify-center gap-2 ${isGeneratingHulls ? 'bg-zinc-700 text-zinc-400 cursor-wait' : 'bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700'}`}
                >
                  {isGeneratingHulls && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-zinc-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isGeneratingHulls ? 'Computing (Check Terminal)...' : 'Generate Hulls'}
                </button>
             </div>
          </div>
        )}

        {/* Surface Analysis */}
        {objUrl && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Surface Analysis</label>
            <div className="p-4 bg-zinc-900 rounded-md border border-zinc-800 min-h-[120px]">
              {!analysisData ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-center text-sm italic">
                  Click anywhere on the mesh to analyze geometry.
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-sm font-mono">
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

        {/* Symmetry Tools */}
        <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-zinc-800">
          <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">Symmetry Planes</label>
          <SymmetryToggle label="X-Axis (YZ Plane)" active={symmetry.x} onClick={() => toggleSymmetry('x')} colorClass="bg-red-500" />
          <SymmetryToggle label="Y-Axis (XZ Plane)" active={symmetry.y} onClick={() => toggleSymmetry('y')} colorClass="bg-green-500" />
          <SymmetryToggle label="Z-Axis (XY Plane)" active={symmetry.z} onClick={() => toggleSymmetry('z')} colorClass="bg-blue-500" />
        </div>
      </div>

      <div className="flex-1 relative bg-zinc-900">
        <Viewport objUrl={objUrl} symmetry={symmetry} onAnalyze={(data) => setAnalysisData(data)} hullsData={hullsData} />
      </div>
    </div>
  );
}