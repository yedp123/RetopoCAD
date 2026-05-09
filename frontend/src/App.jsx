import React, { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Bounds, Edges, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';

// --- VIEWPORT COMPONENTS ---

function HullMesh({ vertices, faces, centerOffset, material }) {
  const geometry = useMemo(() => {
    if (!vertices?.length || !faces?.length) return null;
    try {
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array(vertices.flat());
        const indices = new Uint32Array(faces.flat());
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.setIndex(new THREE.BufferAttribute(indices, 1));
        geo.computeVertexNormals();
        if (centerOffset) {
            geo.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
        }
        return geo;
    } catch (e) {
        console.error("Geometry build error:", e);
        return null;
    }
  }, [vertices, faces, centerOffset]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}

function CircleCurve({ feature, centerOffset, activeTool, onDelete, customColor, hoveredOverride }) {
  const [hovered, setHovered] = useState(false);
  const { id, center, normal, radius } = feature;

  const points = useMemo(() => {
    if (!center || !normal || radius === undefined) return [];
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
    }
    return pts;
  }, [radius, center, normal]);

  const geometry = useMemo(() => {
    if (!points.length) return null;
    try {
        return new THREE.BufferGeometry().setFromPoints(points);
    } catch(e) { return null; }
  }, [points]);
  
  const quaternion = useMemo(() => {
    if (!normal) return new THREE.Quaternion();
    const up = new THREE.Vector3(0, 0, 1);
    const n = new THREE.Vector3(...normal).normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, n);
  }, [normal]);

  if (!geometry || !center) return null;

  const pos = new THREE.Vector3(...center);
  if (centerOffset) pos.sub(centerOffset);
  
  const isDeleteMode = activeTool === 'delete';
  const color = customColor ? customColor : (isDeleteMode && hovered ? '#ef4444' : '#10b981');
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <line 
      geometry={geometry} 
      position={pos} 
      quaternion={quaternion}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        if (isDeleteMode && onDelete) {
          e.stopPropagation();
          onDelete(id);
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={finalHover ? 3 : 2} depthTest={false} />
    </line>
  );
}

function PlanarCurve({ feature, centerOffset, activeTool, onDelete, customColor, hoveredOverride }) {
  const [hovered, setHovered] = useState(false);
  const { id, points } = feature;

  const geometry = useMemo(() => {
    if (!points?.length) return null;
    try {
        const pts = points.map(p => new THREE.Vector3(...p));
        if (centerOffset) {
            pts.forEach(p => p.sub(centerOffset));
        }
        if (pts.length > 0) pts.push(pts[0].clone()); 
        return new THREE.BufferGeometry().setFromPoints(pts);
    } catch (e) { return null; }
  }, [points, centerOffset]);

  if (!geometry) return null;

  const isDeleteMode = activeTool === 'delete';
  const color = customColor ? customColor : (isDeleteMode && hovered ? '#ef4444' : '#10b981');
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <line 
      geometry={geometry}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        if (isDeleteMode && onDelete) {
          e.stopPropagation();
          onDelete(id);
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={finalHover ? 3 : 2} depthTest={false} />
    </line>
  );
}

function GhostModel({ 
  url, symmetry, activeTool, activeTab, 
  onAnalyze, onFeatureExtracted, onFeatureDelete, onSelectLoop, onSelectSolid,
  extractedFeatures, hullsData, showMesh, showWireframe, meshOpacity, showHulls,
  selectedLoops, rebuildHistory, selectedSolidIndex 
}) {
  const obj = useLoader(OBJLoader, url);
  const cursorGroupRef = useRef(); 
  const cursorRef = useRef();
  const mirroredCursorRefs = useRef([]); 
  
  const [scoutLoop, setScoutLoop] = useState(null);
  const scoutTimeout = useRef(null);
  
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  const activeScales = useMemo(() => {
    const scales = [];
    const xArr = symmetry.x ? [1, -1] : [1];
    const yArr = symmetry.y ? [1, -1] : [1];
    const zArr = symmetry.z ? [1, -1] : [1];
    
    for (let x of xArr) {
      for (let y of yArr) {
        for (let z of zArr) {
          if (x === 1 && y === 1 && z === 1) continue; 
          scales.push([x, y, z]);
        }
      }
    }
    return scales;
  }, [symmetry]);

  const { meshes, cursorRadius, centerOffset } = useMemo(() => {
    const extracted = [];
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDimension = Math.max(size.x, size.y, size.z);
    const calculatedRadius = maxDimension * 0.015;

    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geom = child.geometry.clone();
        geom.translate(-center.x, -center.y, -center.z);
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        extracted.push({ 
           geometry: geom, 
           position: child.position.clone(), 
           rotation: child.rotation.clone(), 
           scale: child.scale.clone() 
        });
      }
    });
    
    return { meshes: extracted, cursorRadius: calculatedRadius, centerOffset: center };
  }, [obj]);

  const hullMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#3b82f6", 
    transparent: true,
    opacity: 0.6,
    roughness: 0.4,
    side: THREE.DoubleSide
  }), []);

  const solidMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#3b82f6", 
    transparent: true,
    opacity: 0.8,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide
  }), []);

  const sheetMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#4ade80", 
    transparent: true,
    opacity: 0.8,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide
  }), []);

  const selectedSolidMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#f97316", // Amber / Orange indicating targeted
    emissive: "#ea580c",
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.9,
    roughness: 0.2,
    metalness: 0.3,
    side: THREE.DoubleSide
  }), []);

  const handlePointerMove = (e) => {
    e.stopPropagation(); 
    if (activeTool === 'delete') return;

    if (cursorGroupRef.current) {
      const worldPoint = e.point.clone();
      const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
      const rawPoint = localPoint.clone().add(centerOffset);
      
      if (cursorRef.current) {
        cursorRef.current.position.copy(localPoint);
        cursorRef.current.visible = true;
      }
      
      mirroredCursorRefs.current.forEach((ref, index) => {
        if (ref && activeScales[index]) {
          const scale = activeScales[index];
          ref.position.set(localPoint.x * scale[0], localPoint.y * scale[1], localPoint.z * scale[2]);
          ref.visible = true;
        }
      });

      // Topogun-Style Fast Preview for Precision Rebuild Tab
      if (activeTab === 'rebuild' && activeTool !== 'analyze') {
        clearTimeout(scoutTimeout.current);
        scoutTimeout.current = setTimeout(async () => {
          try {
            const res = await fetch(`http://localhost:8000/scout-loop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ x: rawPoint.x, y: rawPoint.y, z: rawPoint.z })
            });
            if (res.ok) {
              const data = await res.json();
              setScoutLoop(data);
            }
          } catch(err) {}
        }, 50); // High-speed hover debounce
      }
    }
  };

  const handlePointerOut = () => {
    if (cursorRef.current) cursorRef.current.visible = false;
    mirroredCursorRefs.current.forEach(ref => {
      if (ref) ref.visible = false;
    });
    setScoutLoop(null);
    clearTimeout(scoutTimeout.current);
  };

  const handleClick = async (e) => {
    e.stopPropagation(); 
    if (!cursorGroupRef.current || activeTool === 'delete') return;

    const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
    const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);

    // Precision Rebuild Click -> Commit to Stack
    if (activeTab === 'rebuild') {
      if (scoutLoop) {
        onSelectLoop(scoutLoop, { x: screenX, y: screenY });
        setScoutLoop(null);
      }
      return;
    }

    // Quick Prototype Clicks
    const worldPoint = e.point.clone();
    const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
    const rawPoint = localPoint.clone().add(centerOffset);

    if (activeTool === 'analyze') {
      try {
        const res = await fetch(`http://localhost:8000/analyze-surface`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: rawPoint.x, y: rawPoint.y, z: rawPoint.z })
        });
        if (res.ok) {
          const data = await res.json();
          onAnalyze({ ...data, x: screenX, y: screenY });
        }
      } catch (err) { console.error(err); }
    } 
    else if (activeTool === 'extract') {
      try {
        const res = await fetch(`http://localhost:8000/extract-feature`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: rawPoint.x, y: rawPoint.y, z: rawPoint.z })
        });
        if (res.ok) onFeatureExtracted(await res.json());
      } catch (err) { console.error(err); }
    }
  };

  const mainCursorColor = activeTool === 'extract' ? "#10b981" : "#3b82f6";

  return (
    <group ref={cursorGroupRef}>
      
      <group>
        {showMesh && meshes?.map((mesh, index) => (
          <mesh key={`base-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} onPointerMove={handlePointerMove} onPointerOut={handlePointerOut} onClick={handleClick}>
            <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
            {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
          </mesh>
        ))}

        {/* Prototype Renderings */}
        {activeTab === 'prototype' && showHulls && hullsData && hullsData.map((hull, idx) => (
          <HullMesh key={`base-hull-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
        ))}
        {activeTab === 'prototype' && extractedFeatures?.map((feat) => (
          feat.type === 'circle' 
            ? <CircleCurve key={feat.id} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
            : <PlanarCurve key={feat.id} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
        ))}

        {/* Precision Rebuild Renderings */}
        {activeTab === 'rebuild' && (
          <>
            {/* Ghost Preview - Orange */}
            {scoutLoop && <PlanarCurve feature={scoutLoop} centerOffset={centerOffset} customColor="#f97316" hoveredOverride={true} />}
            
            {/* Selected Loops - Blue */}
            {selectedLoops?.map((feat, idx) => (
              <PlanarCurve key={`sel-${feat.id}-${idx}`} feature={feat} centerOffset={centerOffset} customColor="#38bdf8" hoveredOverride={true} />
            ))}
            
            {/* Built Geometry (Solids & Sheets) */}
            {rebuildHistory?.map((geo, idx) => {
               const isSelected = idx === selectedSolidIndex;
               const mat = geo.type === 'sheet' ? sheetMaterial : (isSelected ? selectedSolidMaterial : solidMaterial);
               return (
                 <group 
                   key={`geo-${idx}`} 
                   onClick={(e) => { 
                      e.stopPropagation(); 
                      const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
                      const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
                      if (onSelectSolid) onSelectSolid(idx, { x: screenX, y: screenY }); 
                   }}
                 >
                   <HullMesh 
                     vertices={geo.vertices} 
                     faces={geo.faces} 
                     centerOffset={centerOffset} 
                     material={mat} 
                   />
                 </group>
               );
            })}
          </>
        )}
      </group>

      {/* Mirror Groups */}
      {activeScales?.map((scale, groupIndex) => {
        const mirrorKey = scale.join(',');
        return (
          <group key={`mirror-group-${mirrorKey}`} scale={scale}>
            {showMesh && meshes?.map((mesh, index) => (
              <mesh key={`mirror-${mirrorKey}-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale}>
                <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
                {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
              </mesh>
            ))}
            {activeTab === 'prototype' && showHulls && hullsData && hullsData.map((hull, idx) => (
               <HullMesh key={`mirror-hull-${mirrorKey}-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
            ))}
            {activeTab === 'prototype' && extractedFeatures?.map((feat) => (
               feat.type === 'circle' 
                ? <CircleCurve key={`mirror-circ-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
                : <PlanarCurve key={`mirror-plan-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
            ))}
            {activeTab === 'rebuild' && rebuildHistory?.map((geo, idx) => (
               <HullMesh 
                 key={`mirror-geo-${mirrorKey}-${idx}`} 
                 vertices={geo.vertices} 
                 faces={geo.faces} 
                 centerOffset={centerOffset} 
                 material={geo.type === 'sheet' ? sheetMaterial : solidMaterial} 
               />
            ))}
          </group>
        );
      })}

      {showMesh && activeTool !== 'delete' && (
        <>
          <mesh ref={cursorRef} visible={false} renderOrder={1}>
            <sphereGeometry args={[cursorRadius, 16, 16]} />
            <meshBasicMaterial color={mainCursorColor} depthTest={false} /> 
          </mesh>

          {activeScales?.map((scale, i) => (
            <mesh key={`cursor-${scale.join(',')}`} ref={(el) => { if(el) mirroredCursorRefs.current[i] = el; }} visible={false} renderOrder={1}>
              <sphereGeometry args={[cursorRadius, 16, 16]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function Viewport({ 
  objUrl, symmetry, activeTool, activeTab, 
  onAnalyze, onFeatureExtracted, onFeatureDelete, onSelectLoop, onSelectSolid,
  extractedFeatures, hullsData, showMesh, showWireframe, meshOpacity, showHulls,
  selectedLoops, rebuildHistory, selectedSolidIndex 
}) {
  return (
    <Canvas camera={{ position: [5, 5, 5], fov: 45 }} gl={{ antialias: true }} raycaster={{ params: { Line: { threshold: 0.5 } } }}>
      <color attach="background" args={['#18181b']} />
      <ambientLight intensity={0.4} />
      <hemisphereLight skyColor="#ffffff" groundColor="#444444" intensity={0.6} />
      <directionalLight position={[10, 10, 10]} castShadow />
      <Grid infiniteGrid fadeDistance={50} sectionColor="#3f3f46" cellColor="#27272a" position={[0, -0.01, 0]} />

      <Suspense fallback={null}>
        {objUrl && (
          <>
            <Bounds fit clip margin={1.2}>
              <GhostModel 
                url={objUrl} 
                symmetry={symmetry} 
                activeTool={activeTool}
                activeTab={activeTab}
                onAnalyze={onAnalyze} 
                onFeatureExtracted={onFeatureExtracted}
                onFeatureDelete={onFeatureDelete}
                onSelectLoop={onSelectLoop}
                onSelectSolid={onSelectSolid}
                extractedFeatures={extractedFeatures}
                hullsData={hullsData} 
                showMesh={showMesh} 
                showWireframe={showWireframe}
                meshOpacity={meshOpacity}
                showHulls={showHulls} 
                selectedLoops={selectedLoops}
                rebuildHistory={rebuildHistory}
                selectedSolidIndex={selectedSolidIndex}
              />
            </Bounds>
            {symmetry?.x && <mesh rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#ef4444" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry?.y && <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#22c55e" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry?.z && <mesh rotation={[0, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#3b82f6" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
          </>
        )}
      </Suspense>

      <OrbitControls makeDefault enablePan={true} />

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="white" />
      </GizmoHelper>

    </Canvas>
  );
}

// --- APP & UI COMPONENTS ---

// SVG Icons for the Action Ring
const IconExtrude = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;
const IconLoft = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polygon points="12 12 2 17 12 22 22 17 12 12"></polygon></svg>;
const IconSheet = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 8 12 3 21 8 12 13 3 8"></polygon></svg>;
const IconClear = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconCut = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><line x1="20" y1="4" x2="8.12" y2="15.88"></line><line x1="14.47" y1="14.48" x2="20" y2="20"></line><line x1="8.12" y1="8.12" x2="12" y2="12"></line></svg>;

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

// v1.0 Context-Aware Action Ring
function ActionRing({ anchorPos, selectedLoops, selectedSolidIndex, extrudeDepth, setExtrudeDepth, onExtrude, onLoft, onSheet, onCut, onClear }) {
  // Smart Visibility Requirement: 
  if ((!selectedLoops || selectedLoops.length === 0) && selectedSolidIndex === null) return null;

  const radius = 70; 
  const buttons = [
    { label: 'Extrude', icon: <IconExtrude />, angle: -90, action: onExtrude, disabled: selectedLoops.length !== 1, color: 'text-blue-400' },
    { label: 'Loft', icon: <IconLoft />, angle: 0, action: onLoft, disabled: selectedLoops.length !== 2, color: 'text-blue-400' },
    { label: 'Sheet', icon: <IconSheet />, angle: 90, action: onSheet, disabled: selectedLoops.length !== 1, color: 'text-green-400' },
    { label: 'Clear', icon: <IconClear />, angle: 180, action: onClear, disabled: false, color: 'text-red-400' },
  ];

  if (selectedSolidIndex !== null) {
      // Add Boolean trigger capability dynamically
      buttons.push({ label: 'Cut', icon: <IconCut />, angle: -45, action: onCut, disabled: selectedLoops.length !== 1, color: 'text-orange-400' });
  }

  return (
    <div style={{ left: anchorPos?.x || 0, top: anchorPos?.y || 0 }} className="fixed pointer-events-none z-50 flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
       <div className="absolute w-40 h-40 rounded-full border border-zinc-600/20 bg-zinc-900/30 backdrop-blur-md animate-in zoom-in duration-150 pointer-events-none" />
       
       {/* HUD-Integrated Dynamic Depth Input */}
       <div className="absolute pointer-events-auto flex flex-col items-center justify-center w-12 h-12 rounded-full bg-zinc-800/90 border border-zinc-600 shadow-xl backdrop-blur-md animate-in zoom-in">
         <span className="text-[7px] font-black uppercase text-zinc-400 tracking-tighter leading-none mb-0.5 mt-1">Depth</span>
         <input 
           type="number" 
           value={extrudeDepth} 
           onChange={(e) => setExtrudeDepth(parseFloat(e.target.value) || 0)}
           className="w-10 bg-transparent text-center text-[10px] font-mono text-white outline-none focus:bg-zinc-700/50 rounded"
           step="0.5"
         />
       </div>

       {buttons.map((btn, i) => {
          const rad = (btn.angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          return (
             <button
               key={i}
               onClick={(e) => { e.stopPropagation(); btn.action(); }}
               disabled={btn.disabled}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               className={`absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all shadow-xl backdrop-blur-md border 
                 ${btn.disabled ? 'bg-zinc-800/80 text-zinc-600 border-zinc-700/50 cursor-not-allowed' : `bg-zinc-800/90 border-zinc-600 hover:bg-zinc-700 hover:scale-110 hover:border-zinc-300 ${btn.color}`}`}
             >
               <span className="mb-0.5 pointer-events-none">{btn.icon}</span>
               <span className="text-[7px] font-black uppercase tracking-tighter text-zinc-300 pointer-events-none">{btn.label}</span>
             </button>
          );
       })}
    </div>
  );
}

export default function App() {
  // Global States
  const [activeTab, setActiveTab] = useState('rebuild'); // 'prototype' | 'rebuild'
  const [objUrl, setObjUrl] = useState(null);
  const [backendStatus, setBackendStatus] = useState("Waiting for mesh...");
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mergeExportHulls, setMergeExportHulls] = useState(true);
  
  // Track continuous mouse movement for general needs
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 
  // Anchor tracking specifically for static UI elements (Action Ring)
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  
  // Quick Prototype States
  const [analysisTooltip, setAnalysisTooltip] = useState(null);
  const [isGeneratingHulls, setIsGeneratingHulls] = useState(false);
  const [generationTimer, setGenerationTimer] = useState(0);
  const timerIntervalRef = useRef(null);
  const [hullsData, setHullsData] = useState(null);
  const [activeMode, setActiveMode] = useState('hard-surface');
  const [maxHulls, setMaxHulls] = useState(250);
  const [detailLevel, setDetailLevel] = useState(85);
  const [decimationTarget, setDecimationTarget] = useState(15000);
  const [skipDecimation, setSkipDecimation] = useState(false);
  const [activeTool, setActiveTool] = useState('extract'); 
  const [featuresHistory, setFeaturesHistory] = useState([[]]); 
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);

  // Precision Rebuild States
  const [selectedLoops, setSelectedLoops] = useState([]);
  const [rebuildHistory, setRebuildHistory] = useState([]); // Unified Solids + Sheets
  const [selectedSolidIndex, setSelectedSolidIndex] = useState(null); // Target solid targeting
  const [extrudeDepth, setExtrudeDepth] = useState(5.0);
  const [isCommitting, setIsCommitting] = useState(false);

  // Viewport Overrides
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
      } catch (err) {}
    };
    const interval = setInterval(pollLogs, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serverLogs]);

  // PROTOTYPE FUNCTIONS
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
    } catch (err) { console.error(err); }
    setIsAutoExtracting(false);
  };

  // REBUILD FUNCTIONS
  const handleSelectLoop = (loopData, clickPos) => {
    setSelectedLoops(prev => [...prev, loopData]);
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor(mousePos); 
  };

  const handleSelectSolid = (idx, clickPos) => {
    setSelectedSolidIndex(idx);
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor(mousePos); 
  };

  const handleUndoGeometry = async () => {
    if (rebuildHistory.length === 0) return;
    try {
      const res = await fetch('http://localhost:8000/undo-geometry', { method: 'POST' });
      if (res.ok) {
        setRebuildHistory(prev => prev.slice(0, -1));
        setSelectedSolidIndex(null);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (activeTab === 'rebuild') handleUndoGeometry();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, rebuildHistory, historyIndex]);

  const executeGeometryOperation = async (endpoint, payload, type) => {
    setIsCommitting(true);
    try {
      const res = await fetch(`http://localhost:8000/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const geometryData = await res.json();
        setRebuildHistory(prev => [...prev, { ...geometryData, type }]);
        // Auto-Reset interaction state
        setSelectedLoops([]); 
        setSelectedSolidIndex(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail || 'Unknown CAD Engine crash.'}`]);
      }
    } catch (err) { 
        setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); 
    }
    setIsCommitting(false);
  };

  const handleExtrude = () => executeGeometryOperation('commit-geometry', { operation: 'extrude', loops: selectedLoops, extrude_depth: extrudeDepth }, 'solid');
  const handleLoft = () => executeGeometryOperation('commit-geometry', { operation: 'loft', loops: selectedLoops }, 'solid');
  const handleSheet = () => executeGeometryOperation('create-sheet', { operation: 'sheet', loops: selectedLoops }, 'sheet');

  const handleCut = async () => {
    setIsCommitting(true);
    try {
      const res = await fetch(`http://localhost:8000/boolean-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loops: selectedLoops, extrude_depth: extrudeDepth, target_index: selectedSolidIndex })
      });
      if (res.ok) {
        const geometryData = await res.json();
        setRebuildHistory(prev => {
            const newHistory = [...prev];
            newHistory[selectedSolidIndex] = { ...geometryData, type: 'solid' };
            return newHistory;
        });
        setSelectedLoops([]); 
        setSelectedSolidIndex(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail}`]);
      }
    } catch (err) { console.error(err); }
    setIsCommitting(false);
  };

  // SHARED FUNCTIONS
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setAnalysisTooltip(null);
    setHullsData(null);
    setFeaturesHistory([[]]);
    setHistoryIndex(0);
    setSelectedLoops([]);
    setSelectedSolidIndex(null);
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
      rebuildHistory,
      settings: { activeMode, maxHulls, detailLevel, decimationTarget, skipDecimation, minFeatureSize, symmetry, mergeExportHulls }
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
        if (data.rebuildHistory) setRebuildHistory(data.rebuildHistory);
        if (data.features) {
          setFeaturesHistory([data.features]);
          setHistoryIndex(0);
        }
        if (data.settings) {
          if (data.settings.activeMode) setActiveMode(data.settings.activeMode);
          if (data.settings.maxHulls) setMaxHulls(data.settings.maxHulls);
          if (data.settings.detailLevel) setDetailLevel(data.settings.detailLevel);
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
      setMaxHulls(50); setDetailLevel(40); setDecimationTarget(4000); setSkipDecimation(false);
    } else {
      setMaxHulls(250); setDetailLevel(85); setDecimationTarget(15000); setSkipDecimation(false);
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
        body: JSON.stringify({ max_hulls: maxHulls, detail_level: detailLevel, decimation_target: decimationTarget, skip_decimation: skipDecimation })
      });
      const data = await res.json();
      clearInterval(timerIntervalRef.current);
      if (res.ok) setHullsData(data.hulls);
    } catch (err) {
      clearInterval(timerIntervalRef.current);
    }
    setIsGeneratingHulls(false);
  };

  const handleExportSTEP = async () => {
    if (!hullsData && currentFeatures.length === 0 && rebuildHistory.length === 0) return;
    setIsExporting(true);

    try {
      const res = await fetch('http://localhost:8000/export-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Append symmetry configuration into payload
        body: JSON.stringify({ hulls: hullsData || [], features: currentFeatures, merge_hulls: mergeExportHulls, symmetry: symmetry })
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

  const handleGlobalPointerMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="absolute inset-0 flex overflow-hidden bg-zinc-900 text-zinc-100 font-sans" onPointerMove={handleGlobalPointerMove}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
      
      {/* V1.0 CONTEXT-AWARE ACTION RING (Using anchored position instead of live tracking) */}
      {activeTab === 'rebuild' && (
        <ActionRing 
          anchorPos={menuAnchor} 
          selectedLoops={selectedLoops} 
          selectedSolidIndex={selectedSolidIndex}
          extrudeDepth={extrudeDepth}
          setExtrudeDepth={setExtrudeDepth}
          onExtrude={handleExtrude}
          onLoft={handleLoft}
          onSheet={handleSheet}
          onCut={handleCut}
          onClear={() => { setSelectedLoops([]); setSelectedSolidIndex(null); }}
        />
      )}

      <div className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-black tracking-wider text-white">RetopoCAD</h1>
          {isUploading && <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></div>}
        </div>

        <div className="flex bg-zinc-900 border-b border-zinc-800 shrink-0">
          <button 
            onClick={() => setActiveTab('prototype')} 
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'prototype' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            Quick Prototype
          </button>
          <button 
            onClick={() => setActiveTab('rebuild')} 
            className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'rebuild' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
          >
            Precision Rebuild
          </button>
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

          {/* TAB 1: QUICK PROTOTYPE */}
          {activeTab === 'prototype' && objUrl && (
             <div className="flex flex-col gap-3 animate-in fade-in duration-200">
               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Curves Extraction</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-zinc-400">Min Size</span>
                    <input type="range" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value))} disabled={isAutoExtracting} className="flex-1 accent-emerald-500 h-1" />
                    <input type="number" min="0.1" max="10.0" step="0.1" value={minFeatureSize} onChange={(e) => setMinFeatureSize(parseFloat(e.target.value) || 0)} disabled={isAutoExtracting} className="text-[10px] text-emerald-400 w-10 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-emerald-500" />
                  </div>
                  <div className="flex gap-1.5 mt-0.5">
                    <button onClick={handleAutoExtract} disabled={isAutoExtracting} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-600/50 transition-colors">
                      Auto Detect
                    </button>
                    <button onClick={handleClearAllFeatures} disabled={isAutoExtracting || currentFeatures.length === 0} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      Clear
                    </button>
                  </div>
               </div>

               <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-2 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Auto-Blocker</span>
                  </div>
                  
                  <div className="text-[9px] text-red-400 uppercase tracking-widest font-bold border border-red-900/50 bg-red-900/10 p-1.5 rounded flex items-start gap-1.5 leading-tight">
                    <svg className="w-3 h-3 shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    Rough / Experimental. Best for collision meshes. Use Rebuild tab for precision.
                  </div>

                  <div className="flex bg-zinc-950 rounded border border-zinc-800 p-0.5 mt-1">
                    <button onClick={() => handleModeChange('organic')} disabled={isGeneratingHulls} className={`flex-1 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded transition-colors ${activeMode === 'organic' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Organic</button>
                    <button onClick={() => handleModeChange('hard-surface')} disabled={isGeneratingHulls} className={`flex-1 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded transition-colors ${activeMode === 'hard-surface' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>Hard Surface</button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-zinc-400">Blocks</span>
                    <input type="range" min="1" max="500" value={maxHulls} onChange={(e) => setMaxHulls(parseInt(e.target.value))} disabled={isGeneratingHulls} className="flex-1 accent-indigo-500 h-1" />
                    <input type="number" min="1" max="500" value={maxHulls} onChange={(e) => setMaxHulls(parseInt(e.target.value) || 0)} disabled={isGeneratingHulls} className="text-[10px] text-indigo-400 w-10 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-zinc-400">Detail</span>
                    <input type="range" min="1" max="100" value={detailLevel} onChange={(e) => setDetailLevel(parseInt(e.target.value))} disabled={isGeneratingHulls} className="flex-1 accent-indigo-500 h-1" />
                    <div className="flex items-center bg-zinc-950 border border-zinc-700 rounded px-1 focus-within:border-indigo-500 w-12 justify-end transition-colors">
                      <input type="number" min="1" max="100" value={detailLevel} onChange={(e) => setDetailLevel(parseInt(e.target.value) || 0)} disabled={isGeneratingHulls} className="text-[10px] text-indigo-400 w-full text-right font-mono bg-transparent outline-none" />
                      <span className="text-[10px] text-indigo-400 ml-0.5">%</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] w-14 text-zinc-400">Resol.</span>
                    <input type="range" min="1000" max="30000" step="1000" value={decimationTarget} onChange={(e) => setDecimationTarget(parseInt(e.target.value))} disabled={isGeneratingHulls || skipDecimation} className={`flex-1 accent-indigo-500 h-1 ${skipDecimation ? 'opacity-50 grayscale' : ''}`} />
                    <input type="number" min="1000" max="100000" step="1000" value={decimationTarget} onChange={(e) => setDecimationTarget(parseInt(e.target.value) || 0)} disabled={isGeneratingHulls || skipDecimation} className={`text-[10px] text-indigo-400 w-14 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-indigo-500 ${skipDecimation ? 'line-through opacity-50' : ''}`} />
                  </div>

                  <div className="flex items-center gap-2 mt-1">
                    <input type="checkbox" id="skipDec" checked={skipDecimation} onChange={(e) => setSkipDecimation(e.target.checked)} disabled={isGeneratingHulls} className="accent-red-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                    <label htmlFor="skipDec" className="text-[9px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Skip Decimation (Raw)</label>
                  </div>
                  
                  <button onClick={handleGenerateHulls} disabled={isGeneratingHulls} className={`w-full py-1.5 mt-1 rounded text-[11px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2 ${isGeneratingHulls ? 'bg-zinc-800 text-zinc-500 cursor-wait' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow'}`}>
                    {isGeneratingHulls ? `Processing (${generationTimer}s)` : 'Generate'}
                  </button>
               </div>
             </div>
          )}

          {/* TAB 2: PRECISION REBUILD */}
          {activeTab === 'rebuild' && objUrl && (
             <div className="flex flex-col gap-3 animate-in fade-in duration-200">
               <div className="bg-zinc-900 rounded border border-amber-900/50 p-2 flex flex-col gap-2">
                 <div className="flex justify-between items-center pb-1 border-b border-zinc-800">
                    <span className="text-[10px] font-bold uppercase text-amber-500 tracking-wider">Selection Stack</span>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded">{selectedLoops.length} Items</span>
                 </div>
                 
                 <p className="text-[9px] text-zinc-400 italic">Hover mesh to preview loops. Click to add to stack.</p>

                 <div className="min-h-16 max-h-32 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded p-1 flex flex-col gap-1 custom-scrollbar">
                    {selectedLoops.length === 0 ? (
                      <span className="text-zinc-600 text-[10px] text-center mt-4">Stack is empty.</span>
                    ) : (
                      selectedLoops.map((loop, i) => (
                        <div key={i} className="flex justify-between items-center bg-zinc-800/50 px-2 py-1 rounded text-[10px] font-mono text-zinc-300">
                          <span>Loop #{loop.id.split('_')[1]}</span>
                          <span className="text-amber-500">[{loop.points.length} pts]</span>
                        </div>
                      ))
                    )}
                 </div>
               </div>
               
               {rebuildHistory.length > 0 && (
                 <div className="bg-zinc-900 rounded border border-zinc-800 p-2 flex flex-col gap-1.5">
                   <div className="flex justify-between items-center mb-1">
                     <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Built Geometry</span>
                     <span className="text-[10px] font-mono text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-800">{rebuildHistory.length}</span>
                   </div>
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Solids</span>
                     <span className="text-[11px] font-mono font-bold text-blue-400">{rebuildHistory.filter(h => h.type === 'solid').length}</span>
                   </div>
                   <div className="flex justify-between items-center px-1">
                     <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Surface Sheets</span>
                     <span className="text-[11px] font-mono font-bold text-green-400">{rebuildHistory.filter(h => h.type === 'sheet').length}</span>
                   </div>
                 </div>
               )}
             </div>
          )}

          {/* SHARED EXPORT FOOTER */}
          {objUrl && (
             <div className="mt-auto pt-2 border-t border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <input type="checkbox" id="mergeHulls" checked={mergeExportHulls} onChange={(e) => setMergeExportHulls(e.target.checked)} disabled={isExporting} className="accent-emerald-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                  <label htmlFor="mergeHulls" className="text-[10px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Merge Solids (Boolean)</label>
                </div>
                <button onClick={handleExportSTEP} disabled={isExporting || (!hullsData && currentFeatures.length === 0 && rebuildHistory.length === 0)} className={`w-full py-2.5 rounded text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isExporting ? 'bg-emerald-900 text-emerald-400 cursor-wait' : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:shadow-none'}`}>
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
            activeTab={activeTab}
            onAnalyze={(data) => setAnalysisTooltip(data)} 
            onFeatureExtracted={handleFeatureExtracted}
            onFeatureDelete={handleFeatureDelete}
            onSelectLoop={handleSelectLoop}
            onSelectSolid={handleSelectSolid}
            extractedFeatures={currentFeatures}
            hullsData={hullsData} 
            showMesh={showMesh} 
            showWireframe={showWireframe}
            meshOpacity={meshOpacity}
            showHulls={showHulls} 
            selectedLoops={selectedLoops}
            rebuildHistory={rebuildHistory}
            selectedSolidIndex={selectedSolidIndex}
          />

          {analysisTooltip && activeTab === 'prototype' && (
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
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                <span className="text-xs font-semibold">Wireframe</span>
              </button>

              <button onClick={() => setShowHulls(!showHulls)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showHulls ? 'bg-blue-900/40 border-blue-700 text-blue-100' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                <span className="text-xs font-semibold">Solids</span>
              </button>
            </div>
            
            {showMesh && (
              <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md pointer-events-auto">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Opacity</span>
                <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value))} className="w-24 accent-zinc-300 h-1" />
                <input type="number" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value) || 0)} className="text-[10px] text-zinc-300 w-10 text-right font-mono bg-zinc-950 border border-zinc-700 rounded px-1 outline-none focus:border-zinc-500" />
              </div>
            )}
          </div>

          {activeTab === 'prototype' && (
            <div className="absolute top-1/2 left-4 -translate-y-1/2 flex flex-col gap-2 z-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-lg shadow-2xl p-2 pointer-events-auto">
              
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
          )}

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