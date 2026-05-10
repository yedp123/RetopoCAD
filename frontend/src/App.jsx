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

function CircleCurve({ feature, centerOffset, customColor, hoveredOverride, onSelect }) {
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
  
  const color = customColor ? customColor : (hovered ? '#10b981' : '#059669');
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <line 
      geometry={geometry} 
      position={pos} 
      quaternion={quaternion}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) {
            const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
            const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
            onSelect(feature, { x: screenX, y: screenY });
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={finalHover ? 3 : 2} depthTest={false} />
    </line>
  );
}

function PlanarCurve({ feature, centerOffset, customColor, hoveredOverride, onSelect }) {
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

  const color = customColor ? customColor : (hovered ? '#10b981' : '#059669');
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <line 
      geometry={geometry}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) {
            const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
            const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
            onSelect(feature, { x: screenX, y: screenY });
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={finalHover ? 3 : 2} depthTest={false} />
    </line>
  );
}

function GhostModel({ 
  url, symmetry, activeTool, 
  onSelectLoop, onSelectSolid,
  showMesh, showWireframe, meshOpacity,
  selectedLoops, rebuildHistory, selectedItemId, cursorScale,
  extractedFeatures
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
    
    const calculatedRadius = maxDimension * (cursorScale || 0.005);

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
  }, [obj, cursorScale]);

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

  const selectedMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#f97316", 
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

      if (activeTool !== 'analyze') {
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
        }, 50); 
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
    if (!cursorGroupRef.current) return;

    const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
    const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);

    if (scoutLoop) {
      onSelectLoop(scoutLoop, { x: screenX, y: screenY });
      setScoutLoop(null);
    }
  };

  return (
    <group ref={cursorGroupRef}>
      <group>
        {showMesh && meshes?.map((mesh, index) => (
          <mesh key={`base-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} onPointerMove={handlePointerMove} onPointerOut={handlePointerOut} onClick={handleClick}>
            <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
            {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
          </mesh>
        ))}

        {extractedFeatures?.map((feat) => {
          const isSelected = selectedLoops?.some(l => l.id === feat.id);
          if (isSelected) return null; 
          return feat.type === 'circle' 
            ? <CircleCurve key={feat.id} feature={feat} centerOffset={centerOffset} onSelect={onSelectLoop} />
            : <PlanarCurve key={feat.id} feature={feat} centerOffset={centerOffset} onSelect={onSelectLoop} />
        })}

        {scoutLoop && <PlanarCurve feature={scoutLoop} centerOffset={centerOffset} customColor="#f97316" hoveredOverride={true} />}
        
        {selectedLoops?.map((feat, idx) => (
          <PlanarCurve key={`sel-${feat.id}-${idx}`} feature={feat} centerOffset={centerOffset} customColor="#38bdf8" hoveredOverride={true} />
        ))}
        
        {rebuildHistory?.map((geo) => {
            if (geo.visible === false) return null;
            const isSelected = geo.id === selectedItemId;
            const mat = geo.type === 'sheet' ? (isSelected ? selectedMaterial : sheetMaterial) : (isSelected ? selectedMaterial : solidMaterial);
            return (
              <group 
                key={`geo-${geo.id}`} 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
                  const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
                  if (onSelectSolid) onSelectSolid(geo.id, { x: screenX, y: screenY }); 
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
      </group>

      {activeScales?.map((scale) => {
        const mirrorKey = scale.join(',');
        return (
          <group key={`mirror-group-${mirrorKey}`} scale={scale}>
            {showMesh && meshes?.map((mesh, index) => (
              <mesh key={`mirror-${mirrorKey}-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale}>
                <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
                {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
              </mesh>
            ))}
            {extractedFeatures?.map((feat) => {
              return feat.type === 'circle' 
                ? <CircleCurve key={`mirror-circ-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} />
                : <PlanarCurve key={`mirror-plan-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} />
            })}
            {rebuildHistory?.map((geo) => {
               if (geo.visible === false) return null;
               return (
                 <HullMesh 
                   key={`mirror-geo-${mirrorKey}-${geo.id}`} 
                   vertices={geo.vertices} 
                   faces={geo.faces} 
                   centerOffset={centerOffset} 
                   material={geo.type === 'sheet' ? sheetMaterial : solidMaterial} 
                 />
               );
            })}
          </group>
        );
      })}

      {showMesh && (
        <>
          <mesh ref={cursorRef} visible={false} renderOrder={1}>
            <sphereGeometry args={[cursorRadius, 16, 16]} />
            <meshBasicMaterial color="#3b82f6" depthTest={false} /> 
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
  objUrl, symmetry, activeTool,
  onSelectLoop, onSelectSolid,
  showMesh, showWireframe, meshOpacity,
  selectedLoops, rebuildHistory, selectedItemId, cursorScale,
  extractedFeatures
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
                onSelectLoop={onSelectLoop}
                onSelectSolid={onSelectSolid}
                showMesh={showMesh} 
                showWireframe={showWireframe}
                meshOpacity={meshOpacity}
                selectedLoops={selectedLoops}
                rebuildHistory={rebuildHistory}
                selectedItemId={selectedItemId}
                cursorScale={cursorScale}
                extractedFeatures={extractedFeatures}
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

function ActionRing({ anchorPos, selectedLoops, selectedItemId, extrudeDepth, setExtrudeDepth, onExtrude, onLoft, onSheet, onCut, onClear }) {
  const [pos, setPos] = useState({ x: -1000, y: -1000 });

  useEffect(() => {
    if (!anchorPos) return;
    const offset = 120;
    const ringSize = 120; 

    let targetX = anchorPos.x + offset;
    let targetY = anchorPos.y + offset;

    if (targetX + ringSize > window.innerWidth) targetX = anchorPos.x - offset; 
    if (targetY + ringSize > window.innerHeight) targetY = anchorPos.y - offset;

    setPos({ x: targetX, y: targetY });
  }, [anchorPos]);

  if ((!selectedLoops || selectedLoops.length === 0) && !selectedItemId) return null;

  const isCylinderLoop = selectedLoops.length === 1 && selectedLoops[0].type === 'circle';
  const extrudeLabel = isCylinderLoop ? 'Cylinder' : 'Extrude';

  const radius = 70; 
  const buttons = [
    { label: extrudeLabel, icon: isCylinderLoop ? <IconCylinderFill /> : <IconExtrude />, angle: -90, action: onExtrude, disabled: selectedLoops.length !== 1, color: 'text-blue-400' },
    { label: 'Loft', icon: <IconLoft />, angle: 0, action: onLoft, disabled: selectedLoops.length !== 2, color: 'text-blue-400' },
    { label: 'Sheet', icon: <IconSheet />, angle: 90, action: onSheet, disabled: selectedLoops.length !== 1, color: 'text-green-400' },
    { label: 'Clear', icon: <IconClear />, angle: 180, action: onClear, disabled: false, color: 'text-red-400' },
  ];

  if (selectedItemId !== null) {
      buttons.push({ label: 'Cut', icon: <IconCut />, angle: -45, action: onCut, disabled: selectedLoops.length !== 1, color: 'text-orange-400' });
  }

  return (
    <div style={{ left: pos.x, top: pos.y }} className="fixed pointer-events-none z-50 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-all duration-200">
       <div className="absolute w-40 h-40 rounded-full border border-zinc-600/20 bg-zinc-900/30 backdrop-blur-md animate-in zoom-in duration-150 pointer-events-none" />
       
       <div className="absolute pointer-events-auto flex flex-col items-center justify-center w-14 h-14 rounded-full bg-zinc-800/90 border border-zinc-600 shadow-xl backdrop-blur-md animate-in zoom-in">
         {isCylinderLoop && (
             <span className="text-[7.5px] font-black uppercase text-emerald-400 tracking-tighter leading-none mb-1">R: {selectedLoops[0].radius.toFixed(2)}</span>
         )}
         <span className="text-[7px] font-black uppercase text-zinc-400 tracking-tighter leading-none mb-0.5">Depth</span>
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
  const [objUrl, setObjUrl] = useState(null);
  const [backendStatus, setBackendStatus] = useState("Waiting for mesh...");
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [mergeExportHulls, setMergeExportHulls] = useState(true);
  const [cursorScale, setCursorScale] = useState(0.005); 
  const [sharpnessAngle, setSharpnessAngle] = useState(30);
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState('rebuild'); 

  // Feature Extraction States
  const [isAutoExtracting, setIsAutoExtracting] = useState(false);
  const [minFeatureSize, setMinFeatureSize] = useState(2.0);
  const [extractedFeatures, setExtractedFeatures] = useState([]);

  // Rebuild / Outliner States
  const [selectedLoops, setSelectedLoops] = useState([]);
  const [rebuildHistory, setRebuildHistory] = useState([]); 
  const [selectedItemId, setSelectedItemId] = useState(null); 
  const [extrudeDepth, setExtrudeDepth] = useState(5.0);
  const [isCommitting, setIsCommitting] = useState(false);

  // Viewport Overrides
  const [symmetry, setSymmetry] = useState({ x: false, y: false, z: false });
  const toggleSymmetry = (axis) => setSymmetry(prev => ({ ...prev, [axis]: !prev[axis] }));
  const [showMesh, setShowMesh] = useState(true);
  const [showWireframe, setShowWireframe] = useState(true);
  const [meshOpacity, setMeshOpacity] = useState(0.4);
  
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

  const handleSelectLoop = (loopData, clickPos) => {
    // If the loop doesn't exist in selection, add it.
    setSelectedLoops(prev => {
        if (prev.some(l => l.id === loopData.id)) return prev;
        return [...prev, loopData];
    });
    if (clickPos) setMenuAnchor(clickPos);
    else setMenuAnchor(mousePos); 
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

  const handleUndoGeometry = async () => {
    if (rebuildHistory.length === 0) return;
    try {
      const res = await fetch('http://localhost:8000/undo-geometry', { method: 'POST' });
      if (res.ok) {
        setRebuildHistory(prev => prev.slice(0, -1));
        setSelectedItemId(null);
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoGeometry();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rebuildHistory]);

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
        setExtractedFeatures(prev => [...prev, ...newFeatures]);
      }
    } catch (err) { console.error(err); }
    setIsAutoExtracting(false);
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
          ...geometryData, 
          type, 
          id: Math.random().toString(36).substr(2, 9), 
          visible: true, 
          name: `${defaultName} ${prev.length + 1}`, 
          payload, 
          endpoint 
        }]);
        setSelectedLoops([]); 
        setSelectedItemId(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail || 'Unknown CAD Engine crash.'}`]);
      }
    } catch (err) { 
        setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]); 
    }
    setIsCommitting(false);
  };

  const handleExtrude = () => executeGeometryOperation('commit-geometry', { operation: 'extrude', loops: selectedLoops, extrude_depth: extrudeDepth }, 'solid', 'Extrude');
  const handleLoft = () => executeGeometryOperation('commit-geometry', { operation: 'loft', loops: selectedLoops }, 'solid', 'Loft');
  const handleSheet = () => executeGeometryOperation('create-sheet', { operation: 'sheet', loops: selectedLoops }, 'sheet', 'Sheet');

  const handleUpdateHistoryItem = async (id, newDepth) => {
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
            ...geoItem, 
            vertices: geo.vertices, 
            faces: geo.faces, 
            payload: { ...geoItem.payload, extrude_depth: newDepth } 
        } : geoItem));
        setServerLogs(prev => [...prev, `[Success] Entity successfully rebuilt with new parameters.`]);
      } else {
        setServerLogs(prev => [...prev, `[Error] Failed to update geometry.`]);
      }
    } catch (err) {
      setServerLogs(prev => [...prev, `[Error] Network Failure connecting to Backend.`]);
    }
    setIsCommitting(false);
  };

  const handleCut = async () => {
    if (!selectedItemId) return;
    const targetIndex = rebuildHistory.findIndex(geo => geo.id === selectedItemId);
    if (targetIndex === -1) return;

    setIsCommitting(true);
    try {
      const res = await fetch(`http://localhost:8000/boolean-cut`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loops: selectedLoops, extrude_depth: extrudeDepth, target_index: targetIndex })
      });
      if (res.ok) {
        const geometryData = await res.json();
        setRebuildHistory(prev => {
            const newHistory = [...prev];
            newHistory[targetIndex] = { 
              ...geometryData, 
              type: 'solid', 
              id: prev[targetIndex].id, 
              visible: prev[targetIndex].visible, 
              name: prev[targetIndex].name + ' (Cut)',
              payload: prev[targetIndex].payload,
              endpoint: prev[targetIndex].endpoint
            };
            return newHistory;
        });
        setSelectedLoops([]); 
        setSelectedItemId(null);
      } else {
        const errData = await res.json();
        setServerLogs(prev => [...prev, `[Error] ${errData.detail}`]);
      }
    } catch (err) { console.error(err); }
    setIsCommitting(false);
  };

  const handlePromoteSheet = () => {
    if (!selectedItemId) return;
    setRebuildHistory(prev => prev.map(geo => {
      if (geo.id === selectedItemId && geo.type === 'sheet') {
        return { ...geo, type: 'solid', name: geo.name + ' (Solid)' };
      }
      return geo;
    }));
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.toLowerCase().endsWith('.obj')) return;

    const url = URL.createObjectURL(file);
    setObjUrl(url);
    setSelectedLoops([]);
    setSelectedItemId(null);
    setRebuildHistory([]);
    setExtractedFeatures([]);

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

  const handleExportSTEP = async () => {
    if (rebuildHistory.length === 0) return;
    setIsExporting(true);

    try {
      const res = await fetch('http://localhost:8000/export-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: [], merge_hulls: mergeExportHulls, symmetry: symmetry })
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

  const sheets = rebuildHistory.filter(h => h.type === 'sheet');
  const solids = rebuildHistory.filter(h => h.type === 'solid');
  const selectedItemData = rebuildHistory.find(geo => geo.id === selectedItemId);

  // Using fixed inset-0 to prevent document scrolling / layout bouncing
  return (
    <div 
      className="fixed inset-0 flex flex-row overflow-hidden bg-zinc-900 text-zinc-100 font-sans" 
      onPointerMove={handleGlobalPointerMove}
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <style>{`
        input[type=number]::-webkit-inner-spin-button, 
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; overscroll-behavior: none; }
      `}</style>
      
      <ActionRing 
        anchorPos={menuAnchor} 
        selectedLoops={selectedLoops} 
        selectedItemId={selectedItemId}
        extrudeDepth={extrudeDepth}
        setExtrudeDepth={setExtrudeDepth}
        onExtrude={handleExtrude}
        onLoft={handleLoft}
        onSheet={handleSheet}
        onCut={handleCut}
        onClear={() => { setSelectedLoops([]); setSelectedItemId(null); }}
      />

      {/* LEFT PANEL: OUTLINER */}
      <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <h1 className="text-xl font-black tracking-wider text-white">RetopoCAD</h1>
          {isUploading && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>}
        </div>

        <div className="p-3 border-b border-zinc-800">
          <label className={`w-full py-2 flex items-center justify-center rounded text-[10px] font-bold text-white cursor-pointer transition-colors shadow ${isUploading ? 'bg-indigo-800 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            {isUploading ? 'WAIT...' : 'IMPORT MESH'}
            <input type="file" accept=".obj" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
          </label>
          {objUrl && <span className="text-[9px] font-mono text-emerald-400 leading-tight block truncate mt-2">{backendStatus}</span>}
        </div>

        {objUrl && (
          <div className="p-3 border-b border-zinc-800 bg-zinc-900/30 flex flex-col gap-2">
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
               <button onClick={() => setExtractedFeatures([])} disabled={isAutoExtracting || extractedFeatures.length === 0} className="flex-1 py-1 rounded text-[10px] font-bold uppercase tracking-wide bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white border border-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                 Clear
               </button>
             </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4">
          
          {/* Reference Mesh Folder */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2 py-1 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              Reference Mesh
            </div>
            {objUrl && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 rounded border border-zinc-800 group hover:border-zinc-600 transition-colors">
                <span className="text-[11px] text-zinc-300">Imported.obj</span>
                <button onClick={() => setShowMesh(!showMesh)} className="text-zinc-500 hover:text-zinc-300">
                  {showMesh ? <IconEye /> : <IconEyeOff />}
                </button>
              </div>
            )}
          </div>

          {/* Surface Sheets Folder */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2 py-1 text-green-500/80 font-bold uppercase tracking-wider text-[10px]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              Surface Sheets
            </div>
            {sheets.length === 0 ? <span className="px-3 text-[10px] text-zinc-600 italic">Empty</span> : sheets.map((geo, i) => {
              const isCylindrical = geo.payload?.loops?.[0]?.type === 'circle' || geo.sub_type === 'cylinder';
              return (
                <div 
                  key={geo.id} 
                  onClick={() => setSelectedItemId(geo.id)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded border cursor-pointer transition-colors ${selectedItemId === geo.id ? 'bg-zinc-800 border-green-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-zinc-500 shrink-0">{isCylindrical ? <IconCylinderOutline /> : <IconSquare />}</span>
                    <span className="text-[11px] text-zinc-300 font-mono truncate">{geo.name || `Sheet_${geo.id}`}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                    {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* CAD Solids Folder */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2 py-1 text-blue-500/80 font-bold uppercase tracking-wider text-[10px]">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
              CAD Solids
            </div>
            {solids.length === 0 ? <span className="px-3 text-[10px] text-zinc-600 italic">Empty</span> : solids.map((geo, i) => {
              const isCylindrical = geo.payload?.loops?.[0]?.type === 'circle' || geo.sub_type === 'cylinder';
              return (
                <div 
                  key={geo.id} 
                  onClick={() => setSelectedItemId(geo.id)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded border cursor-pointer transition-colors ${selectedItemId === geo.id ? 'bg-zinc-800 border-blue-500/50' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600'}`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-zinc-500 shrink-0">{isCylindrical ? <IconCylinderOutline /> : <IconSquare />}</span>
                    <span className="text-[11px] text-zinc-300 font-mono truncate">{geo.name || `Solid_${geo.id}`}</span>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleItemVisibility(geo.id); }} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                    {geo.visible !== false ? <IconEye /> : <IconEyeOff />}
                  </button>
                </div>
              );
            })}
          </div>

        </div>

        {objUrl && (
           <div className="p-3 border-t border-zinc-800 flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" id="mergeHulls" checked={mergeExportHulls} onChange={(e) => setMergeExportHulls(e.target.checked)} disabled={isExporting} className="accent-indigo-500 w-3 h-3 rounded bg-zinc-800 border-zinc-700" />
                <label htmlFor="mergeHulls" className="text-[10px] text-zinc-300 uppercase tracking-wide cursor-pointer select-none">Merge Geometry</label>
              </div>
              <button onClick={handleExportSTEP} disabled={isExporting || rebuildHistory.length === 0} className={`w-full py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isExporting ? 'bg-indigo-900 text-indigo-400 cursor-wait' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:shadow-none'}`}>
                {isExporting ? 'Building STEP...' : 'Export STEP'}
              </button>
           </div>
        )}
      </div>

      {/* CENTER PANEL: VIEWPORT */}
      <div className="flex-1 flex flex-col relative bg-zinc-900 overflow-hidden">
        
        <div className="flex-1 relative">
          <Viewport 
            objUrl={objUrl} 
            symmetry={symmetry} 
            activeTool={activeTool}
            onSelectLoop={handleSelectLoop}
            onSelectSolid={handleSelectSolid}
            showMesh={showMesh} 
            showWireframe={showWireframe}
            meshOpacity={meshOpacity}
            selectedLoops={selectedLoops}
            rebuildHistory={rebuildHistory}
            selectedItemId={selectedItemId}
            cursorScale={cursorScale}
            extractedFeatures={extractedFeatures}
          />

          <div className="absolute top-4 left-4 flex gap-2 z-10 items-start">
            <button onClick={() => setShowWireframe(!showWireframe)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md shadow-lg border backdrop-blur-md transition-all ${showWireframe ? 'bg-zinc-800/80 border-zinc-700 text-white' : 'bg-zinc-900/80 border-zinc-800 text-zinc-500'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              <span className="text-xs font-semibold">Wireframe</span>
            </button>
            
            {showMesh && (
              <>
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md pointer-events-auto">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Opacity</span>
                  <input type="range" min="0" max="1" step="0.05" value={meshOpacity} onChange={(e) => setMeshOpacity(parseFloat(e.target.value))} className="w-20 accent-zinc-300 h-1" />
                </div>
                <div className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-md shadow-lg backdrop-blur-md pointer-events-auto">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">Cursor</span>
                  <input type="range" min="0.001" max="0.02" step="0.001" value={cursorScale} onChange={(e) => setCursorScale(parseFloat(e.target.value))} className="w-16 accent-zinc-300 h-1" />
                </div>
              </>
            )}
          </div>

          <div className="absolute top-4 right-4 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 rounded-md shadow-2xl p-2 w-40 z-10 flex flex-col gap-1.5 pointer-events-auto">
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800/50 pb-1.5 mb-0.5 text-center">Mirror Planes</span>
            <CompactSymmetryToggle label="X (YZ)" active={symmetry.x} onClick={() => toggleSymmetry('x')} colorClass="bg-red-500" />
            <CompactSymmetryToggle label="Y (XZ)" active={symmetry.y} onClick={() => toggleSymmetry('y')} colorClass="bg-green-500" />
            <CompactSymmetryToggle label="Z (XY)" active={symmetry.z} onClick={() => toggleSymmetry('z')} colorClass="bg-blue-500" />
          </div>
        </div>

        <div className="h-28 bg-[#0a0a0c] border-t border-zinc-800 shrink-0 flex flex-col shadow-[inset_0_4px_6px_rgba(0,0,0,0.5)]">
          <div className="flex items-center px-3 py-1 bg-zinc-900 border-b border-zinc-800">
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

      {/* RIGHT PANEL: INSPECTOR */}
      <div className="w-64 bg-zinc-950 border-l border-zinc-800 flex flex-col z-10 shrink-0 shadow-2xl">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Inspector</h2>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {!selectedItemId ? (
            <div className="flex flex-col gap-3">
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
              <div className="text-[10px] text-zinc-600 mt-4 text-center italic px-4">
                Select an object in the viewport or outliner to view its properties.
              </div>
            </div>
          ) : selectedItemData ? (
            <div className="flex flex-col gap-3">
              <div className="bg-zinc-900 rounded border border-zinc-800 p-3 flex flex-col gap-3">
                
                <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Classification</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${selectedItemData.type === 'sheet' ? 'bg-green-900/30 text-green-400 border border-green-800' : 'bg-blue-900/30 text-blue-400 border border-blue-800'}`}>
                    {selectedItemData.type}
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">History & Properties</span>
                  
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
                </div>

                {selectedItemData.payload && selectedItemData.payload.operation === 'extrude' && (
                  <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Rebuild Param</span>
                          {isCommitting && <span className="text-[8px] text-indigo-400 animate-pulse uppercase tracking-wider">Building...</span>}
                      </div>
                      
                      <div className="flex items-center justify-between bg-zinc-950 p-2 rounded border border-zinc-800">
                         <span className="text-[10px] font-mono text-zinc-500">Depth</span>
                         <input 
                           type="number"
                           className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-indigo-500 text-right font-mono"
                           defaultValue={selectedItemData.payload.extrude_depth}
                           onBlur={(e) => {
                               const newDepth = parseFloat(e.target.value) || 0;
                               if (newDepth !== selectedItemData.payload.extrude_depth) {
                                    handleUpdateHistoryItem(selectedItemId, newDepth);
                               }
                           }}
                           onKeyDown={(e) => {
                               if (e.key === 'Enter') e.target.blur();
                           }}
                           disabled={isCommitting}
                           step="0.1"
                         />
                      </div>
                      <span className="text-[8px] text-zinc-600 italic text-right pr-1">Press Enter to re-run Extrude logic</span>
                  </div>
                )}

                {selectedItemData.type === 'sheet' && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <button 
                      onClick={handlePromoteSheet}
                      className="w-full py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-600/50 rounded text-[10px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Promote to Solid
                    </button>
                    <p className="text-[9px] text-zinc-500 text-center mt-2">Applies thickness and moves to CAD Solids</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600 text-center italic">Object not found.</div>
          )}
        </div>
      </div>
    </div>
  );
}