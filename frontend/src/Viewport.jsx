import React, { Suspense, useEffect, useRef, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, Edges, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';

function HullMesh({ vertices, faces, centerOffset, material }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array(vertices.flat());
    const indices = new Uint32Array(faces.flat());
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    geo.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
    return geo;
  }, [vertices, faces, centerOffset]);

  return <mesh geometry={geometry} material={material} />;
}

function CircleCurve({ feature, centerOffset, activeTool, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const { id, center, normal, radius } = feature;

  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
    }
    return pts;
  }, [radius]);

  const geometry = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  
  const quaternion = useMemo(() => {
    const up = new THREE.Vector3(0, 0, 1);
    const n = new THREE.Vector3(...normal).normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, n);
  }, [normal]);

  const pos = new THREE.Vector3(...center).sub(centerOffset);
  const isDeleteMode = activeTool === 'delete';
  const color = isDeleteMode && hovered ? '#ef4444' : '#10b981';

  return (
    <line 
      geometry={geometry} 
      position={pos} 
      quaternion={quaternion}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        if (isDeleteMode) {
          e.stopPropagation();
          onDelete(id);
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={hovered ? 3 : 2} depthTest={false} />
    </line>
  );
}

function PlanarCurve({ feature, centerOffset, activeTool, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const { id, points } = feature;

  const geometry = useMemo(() => {
    const pts = points.map(p => new THREE.Vector3(...p).sub(centerOffset));
    if (pts.length > 0) pts.push(pts[0].clone()); 
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [points, centerOffset]);

  const isDeleteMode = activeTool === 'delete';
  const color = isDeleteMode && hovered ? '#ef4444' : '#10b981';

  return (
    <line 
      geometry={geometry}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        if (isDeleteMode) {
          e.stopPropagation();
          onDelete(id);
        }
      }}
    >
      <lineBasicMaterial color={color} linewidth={hovered ? 3 : 2} depthTest={false} />
    </line>
  );
}

function GhostModel({ url, symmetry, activeTool, onAnalyze, onFeatureExtracted, onFeatureDelete, extractedFeatures, hullsData, showMesh, showWireframe, meshOpacity, showHulls }) {
  const obj = useLoader(OBJLoader, url);
  const cursorGroupRef = useRef(); 
  const cursorRef = useRef();
  const mirroredCursorRefs = useRef([]); 
  
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
      if (child.isMesh) {
        const geom = child.geometry.clone();
        geom.translate(-center.x, -center.y, -center.z);
        geom.computeBoundingBox();
        geom.computeBoundingSphere();
        extracted.push({ ...child, geometry: geom });
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

  const handlePointerMove = (e) => {
    e.stopPropagation(); 
    if (activeTool === 'delete') return;

    if (cursorRef.current && cursorGroupRef.current) {
      const worldPoint = e.point.clone();
      const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
      
      cursorRef.current.position.copy(localPoint);
      cursorRef.current.visible = true;
      
      mirroredCursorRefs.current.forEach((ref, index) => {
        if (ref && activeScales[index]) {
          const scale = activeScales[index];
          ref.position.set(localPoint.x * scale[0], localPoint.y * scale[1], localPoint.z * scale[2]);
          ref.visible = true;
        }
      });
    }
  };

  const handlePointerOut = () => {
    if (cursorRef.current) cursorRef.current.visible = false;
    mirroredCursorRefs.current.forEach(ref => {
      if (ref) ref.visible = false;
    });
  };

  const handleClick = async (e) => {
    e.stopPropagation(); 
    if (!cursorGroupRef.current || activeTool === 'delete') return;

    const worldPoint = e.point.clone();
    const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
    const rawPoint = localPoint.clone().add(centerOffset);
    
    // FIX: Bulletproof screen coordinate extraction to prevent tool death
    const screenX = e.clientX !== undefined ? e.clientX : (e.nativeEvent?.clientX || window.innerWidth / 2);
    const screenY = e.clientY !== undefined ? e.clientY : (e.nativeEvent?.clientY || window.innerHeight / 2);

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
        {showMesh && meshes.map((mesh, index) => (
          <mesh key={`base-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} onPointerMove={handlePointerMove} onPointerOut={handlePointerOut} onClick={handleClick}>
            <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
            {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
          </mesh>
        ))}
        {showHulls && hullsData && hullsData.map((hull, idx) => (
          <HullMesh key={`base-hull-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
        ))}
        
        {extractedFeatures.map((feat) => (
          feat.type === 'circle' 
            ? <CircleCurve key={feat.id} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
            : <PlanarCurve key={feat.id} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
        ))}
      </group>

      {activeScales.map((scale, groupIndex) => (
        <group key={`mirror-group-${groupIndex}`} scale={scale}>
          {showMesh && meshes.map((mesh, index) => (
            <mesh key={`mirror-${groupIndex}-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale}>
              <meshStandardMaterial color="#cccccc" transparent opacity={meshOpacity} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
              {showWireframe && <Edges raycast={() => null} threshold={15} color="#18181b" />}
            </mesh>
          ))}
          {showHulls && hullsData && hullsData.map((hull, idx) => (
             <HullMesh key={`mirror-hull-${groupIndex}-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
          ))}
          
          {extractedFeatures.map((feat) => (
             feat.type === 'circle' 
              ? <CircleCurve key={`mirror-circ-${groupIndex}-${feat.id}`} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
              : <PlanarCurve key={`mirror-plan-${groupIndex}-${feat.id}`} feature={feat} centerOffset={centerOffset} activeTool={activeTool} onDelete={onFeatureDelete} />
          ))}
        </group>
      ))}

      {showMesh && activeTool !== 'delete' && (
        <>
          <mesh ref={cursorRef} visible={false} renderOrder={1}>
            <sphereGeometry args={[cursorRadius, 16, 16]} />
            <meshBasicMaterial color={mainCursorColor} depthTest={false} /> 
          </mesh>

          {activeScales.map((_, i) => (
            <mesh key={`cursor-${i}`} ref={(el) => (mirroredCursorRefs.current[i] = el)} visible={false} renderOrder={1}>
              <sphereGeometry args={[cursorRadius, 16, 16]} />
              <meshBasicMaterial color="#ef4444" depthTest={false} />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

export default function Viewport({ objUrl, symmetry, activeTool, onAnalyze, onFeatureExtracted, onFeatureDelete, extractedFeatures, hullsData, showMesh, showWireframe, meshOpacity, showHulls }) {
  return (
    <Canvas camera={{ position: [5, 5, 5], fov: 45 }} gl={{ antialias: true }} raycaster={{ params: { Line: { threshold: 0.2 } } }}>
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
                onAnalyze={onAnalyze} 
                onFeatureExtracted={onFeatureExtracted}
                onFeatureDelete={onFeatureDelete}
                extractedFeatures={extractedFeatures}
                hullsData={hullsData} 
                showMesh={showMesh} 
                showWireframe={showWireframe}
                meshOpacity={meshOpacity}
                showHulls={showHulls} 
              />
            </Bounds>
            {symmetry.x && <mesh rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#ef4444" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry.y && <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#22c55e" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry.z && <mesh rotation={[0, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#3b82f6" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
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