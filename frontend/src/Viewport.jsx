import React, { Suspense, useEffect, useRef, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, Edges, Grid, GizmoHelper, GizmoViewport, TransformControls, Html } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as THREE from 'three';

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

function SplashHighlight({ feature, originalMeshes, centerOffset }) {
  const result = useMemo(() => {
    if (!feature) return null;
    
    if (feature.patch_vertices && feature.patch_faces) {
        try {
            const geo = new THREE.BufferGeometry();
            const verts = new Float32Array(feature.patch_vertices.flat());
            const indices = new Uint32Array(feature.patch_faces.flat());
            geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
            geo.setIndex(new THREE.BufferAttribute(indices, 1));
            geo.computeVertexNormals();
            if (centerOffset) geo.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
            return { geo, meshParams: null };
        } catch(e) { return null; }
    }

    if (feature.patch_faces && originalMeshes && originalMeshes.length > 0) {
        try {
          const baseMesh = originalMeshes[0];
          const baseGeo = baseMesh.geometry;
          const posAttr = baseGeo.getAttribute('position');
          const indexAttr = baseGeo.getIndex();
          
          const newPos = [];
          
          for (let i = 0; i < feature.patch_faces.length; i++) {
            const faceIdx = feature.patch_faces[i];
            if (indexAttr) {
              const a = indexAttr.getX(faceIdx * 3);
              const b = indexAttr.getX(faceIdx * 3 + 1);
              const c = indexAttr.getX(faceIdx * 3 + 2);
              
              if (a !== undefined && b !== undefined && c !== undefined) {
                newPos.push(
                  posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
                  posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
                  posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c)
                );
              }
            } else {
              const a = faceIdx * 3;
              const b = faceIdx * 3 + 1;
              const c = faceIdx * 3 + 2;
              
              if (a < posAttr.count && c < posAttr.count) {
                newPos.push(
                  posAttr.getX(a), posAttr.getY(a), posAttr.getZ(a),
                  posAttr.getX(b), posAttr.getY(b), posAttr.getZ(b),
                  posAttr.getX(c), posAttr.getY(c), posAttr.getZ(c)
                );
              }
            }
          }
          
          if (newPos.length === 0) return null;

          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(newPos), 3));
          geo.computeVertexNormals();
          return { geo, meshParams: baseMesh };
        } catch(e) { return null; }
    }
    return null;
  }, [feature, originalMeshes, centerOffset]);

  const color = useMemo(() => {
    const hash = feature.id ? feature.id.toString().split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0) : 0;
    const colors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f43f5e", "#06b6d4"];
    return colors[Math.abs(hash) % colors.length];
  }, [feature.id]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, depthTest: true
  }), [color]);

  if (!result || !result.geo) return null;

  if (result.meshParams) {
      return <mesh geometry={result.geo} material={material} position={result.meshParams.position} rotation={result.meshParams.rotation} scale={result.meshParams.scale} />;
  }
  return <mesh geometry={result.geo} material={material} />;
}

function CircleCurve({ feature, centerOffset, hoveredOverride, onSelect, originalMeshes, disabled }) {
  const [hovered, setHovered] = useState(false);
  const { center, normal, radius } = feature;

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
    try { return new THREE.BufferGeometry().setFromPoints(points); } catch(e) { return null; }
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
  
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <group>
      {finalHover && <SplashHighlight feature={feature} originalMeshes={originalMeshes} centerOffset={centerOffset} />}
      <line 
        geometry={geometry} position={pos} quaternion={quaternion}
        onPointerOver={(e) => { 
          if (disabled) return; 
          e.stopPropagation(); 
          setHovered(true); 
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          if (disabled) return;
          if (e.delta > 5) return; // Prevent selection if dragging camera/gizmo
          e.stopPropagation();
          if (onSelect) {
            const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
            const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
            onSelect(feature, { x: screenX, y: screenY });
          }
        }}
      >
        <lineBasicMaterial color="#10b981" linewidth={finalHover ? 3 : 2} depthTest={false} />
      </line>
    </group>
  );
}

function PlanarCurve({ feature, centerOffset, customColor, hoveredOverride, onSelect, originalMeshes, disabled }) {
  const [hovered, setHovered] = useState(false);
  const { points } = feature;

  const geometry = useMemo(() => {
    if (!points?.length) return null;
    try {
        const pts = points.map(p => new THREE.Vector3(...p));
        if (centerOffset) pts.forEach(p => p.sub(centerOffset));
        if (pts.length > 0) pts.push(pts[0].clone()); 
        return new THREE.BufferGeometry().setFromPoints(pts);
    } catch (e) { return null; }
  }, [points, centerOffset]);

  if (!geometry) return null;

  const color = customColor ? customColor : '#10b981';
  const finalHover = hoveredOverride !== undefined ? hoveredOverride : hovered;

  return (
    <group>
      {finalHover && <SplashHighlight feature={feature} originalMeshes={originalMeshes} centerOffset={centerOffset} />}
      <line 
        geometry={geometry}
        onPointerOver={(e) => { 
          if (disabled) return; 
          e.stopPropagation(); 
          setHovered(true); 
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          if (disabled) return;
          if (e.delta > 5) return; // Prevent selection if dragging camera/gizmo
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
    </group>
  );
}

// Highly isolated Transform component. Disconnected from React's continuous render cycle to stop drag-fights.
function ActiveTransformSolid({ geo, material, centerOffset, transformMode, linearSnap, setLinearSnap, angleSnap, setAngleSnap, onSelect }) {
  const groupRef = useRef();
  const inputRef = useRef(null);
  const isDraggingRef = useRef(false);
  
  const startPos = useRef(new THREE.Vector3());
  const startRot = useRef(new THREE.Euler());
  const startScale = useRef(new THREE.Vector3());
  const dominantAxis = useRef('x');

  // Calculates the true volumetric centroid to anchor the Gizmo perfectly
  const { localPivot, absoluteCenter } = useMemo(() => {
    if (!geo.vertices || geo.vertices.length === 0) {
        return { localPivot: new THREE.Vector3(), absoluteCenter: new THREE.Vector3() };
    }
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const pt of geo.vertices) {
        const x = pt[0], y = pt[1], z = pt[2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const absCenter = new THREE.Vector3((minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2);
    const pivot = absCenter.clone().sub(centerOffset);
    return { localPivot: pivot, absoluteCenter: absCenter };
  }, [geo.vertices, centerOffset]);

  // Initial Placement
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(localPivot);
      groupRef.current.rotation.set(0, 0, 0);
      groupRef.current.scale.set(1, 1, 1);
    }
  }, [localPivot]);

  useEffect(() => {
    if (groupRef.current) {
      startPos.current.copy(groupRef.current.position);
      startRot.current.copy(groupRef.current.rotation);
      startScale.current.copy(groupRef.current.scale);
      if (inputRef.current) inputRef.current.value = '0';
    }
  }, [transformMode]);

  const handleChange = () => {
    if (!groupRef.current || !isDraggingRef.current) return;
    
    let maxDelta = 0;
    if (transformMode === 'translate') {
      const diff = groupRef.current.position.clone().sub(startPos.current);
      const absX = Math.abs(diff.x), absY = Math.abs(diff.y), absZ = Math.abs(diff.z);
      maxDelta = diff.x; dominantAxis.current = 'x';
      if (absY > absX && absY > absZ) { maxDelta = diff.y; dominantAxis.current = 'y'; }
      if (absZ > absX && absZ > absY) { maxDelta = diff.z; dominantAxis.current = 'z'; }
    } else if (transformMode === 'rotate') {
      const diffX = groupRef.current.rotation.x - startRot.current.x;
      const diffY = groupRef.current.rotation.y - startRot.current.y;
      const diffZ = groupRef.current.rotation.z - startRot.current.z;
      const absX = Math.abs(diffX), absY = Math.abs(diffY), absZ = Math.abs(diffZ);
      maxDelta = diffX; dominantAxis.current = 'x';
      if (absY > absX && absY > absZ) { maxDelta = diffY; dominantAxis.current = 'y'; }
      if (absZ > absX && absZ > absY) { maxDelta = diffZ; dominantAxis.current = 'z'; }
      maxDelta = maxDelta * 180 / Math.PI;
    } else if (transformMode === 'scale') {
      const diff = groupRef.current.scale.clone().sub(startScale.current);
      const absX = Math.abs(diff.x), absY = Math.abs(diff.y), absZ = Math.abs(diff.z);
      maxDelta = diff.x; dominantAxis.current = 'x';
      if (absY > absX && absY > absZ) { maxDelta = diff.y; dominantAxis.current = 'y'; }
      if (absZ > absX && absZ > absY) { maxDelta = diff.z; dominantAxis.current = 'z'; }
    }

    if (inputRef.current) {
      const unit = transformMode === 'rotate' ? '°' : ' units';
      inputRef.current.value = maxDelta > 0 ? `+${maxDelta.toFixed(2)}${unit}` : `${maxDelta.toFixed(2)}${unit}`;
    }
  };

  const handleDraggingChanged = (e) => {
    isDraggingRef.current = e.value;
    if (e.value && groupRef.current) {
      startPos.current.copy(groupRef.current.position);
      startRot.current.copy(groupRef.current.rotation);
      startScale.current.copy(groupRef.current.scale);
      if (inputRef.current) inputRef.current.value = '0';
    }
  };

  const handleManualInput = (e) => {
    if (e.key === 'Enter') {
      const val = parseFloat(inputRef.current.value.replace(/[^0-9.-]/g, '')) || 0;
      if (transformMode === 'translate') {
        const newPos = startPos.current.clone();
        newPos[dominantAxis.current] += val;
        groupRef.current.position.copy(newPos);
        startPos.current.copy(newPos);
      } else if (transformMode === 'rotate') {
        const newRot = startRot.current.clone();
        newRot[dominantAxis.current] += (val * Math.PI / 180);
        groupRef.current.rotation.copy(newRot);
        startRot.current.copy(newRot);
      } else if (transformMode === 'scale') {
        const newScale = startScale.current.clone();
        newScale[dominantAxis.current] += val;
        groupRef.current.scale.copy(newScale);
        startScale.current.copy(newScale);
      }
      if (inputRef.current) inputRef.current.value = '0';
      e.target.blur();
    }
  };

  return (
    <TransformControls
      mode={transformMode}
      space="local"
      translationSnap={linearSnap > 0 ? linearSnap : null}
      rotationSnap={angleSnap > 0 ? angleSnap * Math.PI / 180 : null}
      scaleSnap={linearSnap > 0 ? linearSnap : null}
      onChange={handleChange}
      onDraggingChanged={handleDraggingChanged}
    >
      <group ref={groupRef} onClick={onSelect}>
        <HullMesh vertices={geo.vertices} faces={geo.faces} centerOffset={absoluteCenter} material={material} />
        
        <Html center position={[0, 1.5, 0]} zIndexRange={[100, 0]}>
          <div 
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="bg-zinc-900/95 border border-zinc-700 p-2 rounded shadow-2xl backdrop-blur-md font-mono text-[10px] w-40 flex flex-col gap-1.5 pointer-events-auto"
          >
            <div className="flex justify-between items-center text-zinc-400">
              <span className="uppercase tracking-wider font-bold">Snap</span>
              <select 
                value={transformMode === 'rotate' ? angleSnap : linearSnap} 
                onChange={(e) => transformMode === 'rotate' ? setAngleSnap(parseFloat(e.target.value)) : setLinearSnap(parseFloat(e.target.value))}
                className="w-16 bg-zinc-950 border border-zinc-700 text-right text-white outline-none focus:border-blue-500 rounded px-1 py-0.5"
              >
                {transformMode === 'rotate' ? (
                  <>
                    <option value={0}>None</option>
                    <option value={5}>5°</option>
                    <option value={15}>15°</option>
                    <option value={45}>45°</option>
                    <option value={90}>90°</option>
                  </>
                ) : (
                  <>
                    <option value={0}>None</option>
                    <option value={1}>1.0</option>
                    <option value={0.5}>0.5</option>
                    <option value={0.1}>0.1</option>
                  </>
                )}
              </select>
            </div>
            <div className="flex justify-between items-center text-amber-400 font-bold">
              <span className="uppercase tracking-wider">Delta</span>
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  defaultValue="0"
                  onKeyDown={handleManualInput}
                  className="w-16 bg-zinc-950 border border-zinc-700 text-right text-amber-400 outline-none focus:border-amber-500 rounded px-1 py-0.5"
                />
              </div>
            </div>
          </div>
        </Html>
      </group>
    </TransformControls>
  );
}

function GhostModel({ 
  url, symmetry, onSelectLoop, onSelectSolid,
  extractedFeatures, showMesh, showWireframe, meshOpacity,
  selectedLoops, rebuildHistory, selectedSolidIndex, cursorScale,
  showSheetsFolder, showSolidsFolder, showCurvesFolder, hiddenCurveIds, sharpnessAngle,
  transformMode, linearSnap, setLinearSnap, angleSnap, setAngleSnap
}) {
  const obj = useLoader(OBJLoader, url);
  const cursorGroupRef = useRef(); 
  const cursorRef = useRef();
  const mirroredCursorRefs = useRef([]); 
  
  const [scoutLoop, setScoutLoop] = useState(null);
  const scoutTimeout = useRef(null);
  
  useEffect(() => { return () => URL.revokeObjectURL(url); }, [url]);

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
    
    const calculatedRadius = maxDimension * (cursorScale || 0.015);

    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geom = child.geometry.clone();
        geom.translate(-center.x, -center.y, -center.z);
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        extracted.push({ geometry: geom, position: child.position.clone(), rotation: child.rotation.clone(), scale: child.scale.clone() });
      }
    });
    
    return { meshes: extracted, cursorRadius: calculatedRadius, centerOffset: center };
  }, [obj, cursorScale]);

  const solidMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#3b82f6", transparent: true, opacity: 0.8, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide }), []);
  const sheetMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#4ade80", transparent: true, opacity: 0.8, roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide }), []);
  const selectedSolidMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f97316", emissive: "#ea580c", emissiveIntensity: 0.4, transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.3, side: THREE.DoubleSide }), []);

  const handlePointerMove = (e) => {
    if (transformMode) {
      if (scoutLoop) setScoutLoop(null);
      return; // Do not stop propagation if tool is active, let it pass to gizmos
    }
    
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

      clearTimeout(scoutTimeout.current);
      scoutTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`http://localhost:8000/scout-loop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ x: rawPoint.x, y: rawPoint.y, z: rawPoint.z, sharpness_angle: sharpnessAngle })
          });
          if (res.ok) {
            const data = await res.json();
            setScoutLoop(data);
          }
        } catch(err) {}
      }, 50); 
    }
  };

  const handlePointerOut = () => {
    if (cursorRef.current) cursorRef.current.visible = false;
    mirroredCursorRefs.current.forEach(ref => { if (ref) ref.visible = false; });
    if (scoutLoop) setScoutLoop(null);
    clearTimeout(scoutTimeout.current);
  };

  const handleClick = async (e) => {
    if (transformMode) return;
    if (e.delta > 5) return; // Prevent selection if dragging camera/gizmo
    
    e.stopPropagation(); 
    if (!cursorGroupRef.current) return;

    const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
    const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);

    if (scoutLoop) {
      const worldPoint = e.point.clone();
      const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
      const rawPoint = localPoint.clone().add(centerOffset);
      onSelectLoop({ ...scoutLoop, clickPoint: { x: rawPoint.x, y: rawPoint.y, z: rawPoint.z } }, { x: screenX, y: screenY });
      setScoutLoop(null);
    }
  };

  return (
    <group ref={cursorGroupRef}>
      <group>
        {meshes?.map((mesh, index) => (
          <mesh 
            key={`base-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} 
            onPointerMove={handlePointerMove} onPointerOut={handlePointerOut} onClick={handleClick} visible={showMesh}
          >
            <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
            <Edges raycast={() => null} threshold={15} color="#18181b" visible={showWireframe} />
          </mesh>
        ))}

        {showCurvesFolder && extractedFeatures?.map((feat) => {
          if (hiddenCurveIds?.includes(feat.id)) return null;
          const isSelected = selectedLoops?.some(l => l.id === feat.id);
          if (isSelected) return null; 
          return feat.type === 'circle' 
            ? <CircleCurve key={feat.id} feature={feat} centerOffset={centerOffset} onSelect={onSelectLoop} originalMeshes={meshes} disabled={!!transformMode} />
            : <PlanarCurve key={feat.id} feature={feat} centerOffset={centerOffset} onSelect={onSelectLoop} originalMeshes={meshes} disabled={!!transformMode} />
        })}

        {scoutLoop && <PlanarCurve feature={scoutLoop} centerOffset={centerOffset} customColor="#f97316" hoveredOverride={true} originalMeshes={meshes} disabled={!!transformMode} />}
        
        {selectedLoops?.map((feat, idx) => (
          <PlanarCurve key={`sel-${feat.id}-${idx}`} feature={feat} centerOffset={centerOffset} customColor="#38bdf8" hoveredOverride={true} originalMeshes={meshes} disabled={!!transformMode} />
        ))}
        
        {rebuildHistory?.map((geo, idx) => {
           const isVisible = geo.visible !== false &&
             !(geo.type === 'sheet' && !showSheetsFolder) &&
             !(geo.type === 'solid' && !showSolidsFolder);
           if (!isVisible) return null;

           const isSelected = geo.id === selectedSolidIndex;
           const mat = geo.type === 'sheet' ? (isSelected ? selectedSolidMaterial : sheetMaterial) : (isSelected ? selectedSolidMaterial : solidMaterial);
           
           const handleSelect = (e) => { 
              if (e.delta > 5) return; // Prevent selection if dragging camera/gizmo
              e.stopPropagation(); 
              const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
              const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);
              if (onSelectSolid) onSelectSolid(geo.id, { x: screenX, y: screenY }); 
           };

           if (isSelected && transformMode && (transformMode === 'translate' || transformMode === 'rotate' || transformMode === 'scale')) {
               return (
                  <ActiveTransformSolid 
                     key={`geo-${geo.id || idx}`}
                     geo={geo}
                     material={mat}
                     centerOffset={centerOffset}
                     transformMode={transformMode}
                     linearSnap={linearSnap}
                     setLinearSnap={setLinearSnap}
                     angleSnap={angleSnap}
                     setAngleSnap={setAngleSnap}
                     onSelect={handleSelect}
                  />
               );
           }

           return (
             <group key={`geo-${geo.id || idx}`} onClick={handleSelect}>
               <HullMesh vertices={geo.vertices} faces={geo.faces} centerOffset={centerOffset} material={mat} />
             </group>
           );
        })}
      </group>

      {activeScales?.map((scale, groupIndex) => {
        const mirrorKey = scale.join(',');
        return (
          <group key={`mirror-group-${mirrorKey}`} scale={scale}>
            {meshes?.map((mesh, index) => (
              <mesh 
                key={`mirror-${mirrorKey}-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} visible={showMesh}
              >
                <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
                <Edges raycast={() => null} threshold={15} color="#18181b" visible={showWireframe} />
              </mesh>
            ))}
            {showCurvesFolder && extractedFeatures?.map((feat) => {
               if (hiddenCurveIds?.includes(feat.id)) return null;
               return feat.type === 'circle' 
                ? <CircleCurve key={`mirror-circ-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} originalMeshes={meshes} disabled={!!transformMode} />
                : <PlanarCurve key={`mirror-plan-${mirrorKey}-${feat.id}`} feature={feat} centerOffset={centerOffset} originalMeshes={meshes} disabled={!!transformMode} />
            })}
            {rebuildHistory?.map((geo, idx) => {
               const isVisible = geo.visible !== false &&
                 !(geo.type === 'sheet' && !showSheetsFolder) &&
                 !(geo.type === 'solid' && !showSolidsFolder);
               if (!isVisible) return null;
               return (
                 <group key={`mirror-geo-${mirrorKey}-${idx}`}>
                     <HullMesh vertices={geo.vertices} faces={geo.faces} centerOffset={centerOffset} material={geo.type === 'sheet' ? sheetMaterial : solidMaterial} />
                 </group>
               );
            })}
          </group>
        );
      })}

      {showMesh && !transformMode && (
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

export default function Viewport(props) {
  const { 
     objUrl, cleanedObjUrl, symmetry, onSelectLoop, onSelectSolid,
     extractedFeatures, showMesh, showWireframe, meshOpacity,
     selectedLoops, rebuildHistory, selectedSolidIndex, cursorScale,
     showSheetsFolder, showSolidsFolder, showCurvesFolder, hiddenCurveIds, sharpnessAngle,
     linearSnap, setLinearSnap, angleSnap, setAngleSnap, toggleSymmetry,
     transformMode, setTransformMode
  } = props;

  const [previewMode, setPreviewMode] = useState('reference');

  return (
    <div className="relative w-full h-full">
      <Canvas camera={{ position: [5, 5, 5], fov: 45 }} gl={{ antialias: true }} raycaster={{ params: { Line: { threshold: 0.15 } } }}>
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
                  {...props}
                  transformMode={transformMode}
                  url={previewMode === 'cleaned' && cleanedObjUrl ? cleanedObjUrl : objUrl}
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
    </div>
  );
}