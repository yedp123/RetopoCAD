import React, { Suspense, useEffect, useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Bounds, Edges, Grid } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import * as THREE from 'three';

// Custom component to dynamically render a single Convex Hull returned from Python
function HullMesh({ vertices, faces, centerOffset, material }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    
    // Flatten the Python nested arrays into 1D TypedArrays for WebGL
    const verts = new Float32Array(vertices.flat());
    const indices = new Uint32Array(faces.flat());
    
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    
    // Offset the hull so it aligns perfectly with our locally centered ghost mesh
    geo.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);
    
    return geo;
  }, [vertices, faces, centerOffset]);

  return <mesh geometry={geometry} material={material} />;
}

function GhostModel({ url, symmetry, onAnalyze, hullsData }) {
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

  // Unified Material for all Auto-Block Hulls
  const hullMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: "#3b82f6", // tailwind blue-500
    transparent: true,
    opacity: 0.6,
    roughness: 0.4,
    side: THREE.DoubleSide
  }), []);

  const handlePointerMove = (e) => {
    e.stopPropagation(); 
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
    if (!cursorGroupRef.current) return;

    const worldPoint = e.point.clone();
    const localPoint = cursorGroupRef.current.worldToLocal(worldPoint);
    const rawPoint = localPoint.clone().add(centerOffset);

    try {
      const res = await fetch('http://localhost:8000/analyze-surface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: rawPoint.x, y: rawPoint.y, z: rawPoint.z })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (onAnalyze) onAnalyze(data);
      }
    } catch (err) {
      console.error("Failed to reach Python backend", err);
    }
  };

  return (
    <group ref={cursorGroupRef}>
      {/* Base Interactive Mesh Group */}
      <group>
        {meshes.map((mesh, index) => (
          <mesh key={`base-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale} onPointerMove={handlePointerMove} onPointerOut={handlePointerOut} onClick={handleClick}>
            <meshStandardMaterial color="#cccccc" transparent opacity={0.5} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
            <Edges raycast={() => null} threshold={15} color="#18181b" />
          </mesh>
        ))}
        {/* Render Base Hulls */}
        {hullsData && hullsData.map((hull, idx) => (
          <HullMesh key={`base-hull-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
        ))}
      </group>

      {/* Mirrored Mesh Instances */}
      {activeScales.map((scale, groupIndex) => (
        <group key={`mirror-group-${groupIndex}`} scale={scale}>
          {meshes.map((mesh, index) => (
            <mesh key={`mirror-${groupIndex}-${index}`} geometry={mesh.geometry} position={mesh.position} rotation={mesh.rotation} scale={mesh.scale}>
              <meshStandardMaterial color="#cccccc" transparent opacity={0.5} roughness={0.6} metalness={0.2} side={THREE.DoubleSide} depthWrite={true} />
              <Edges raycast={() => null} threshold={15} color="#18181b" />
            </mesh>
          ))}
          {/* Render Mirrored Hulls */}
          {hullsData && hullsData.map((hull, idx) => (
             <HullMesh key={`mirror-hull-${groupIndex}-${idx}`} vertices={hull.vertices} faces={hull.faces} centerOffset={centerOffset} material={hullMaterial} />
          ))}
        </group>
      ))}

      <mesh ref={cursorRef} visible={false} renderOrder={1}>
        <sphereGeometry args={[cursorRadius, 16, 16]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} /> 
      </mesh>

      {activeScales.map((_, i) => (
        <mesh key={`cursor-${i}`} ref={(el) => (mirroredCursorRefs.current[i] = el)} visible={false} renderOrder={1}>
          <sphereGeometry args={[cursorRadius, 16, 16]} />
          <meshBasicMaterial color="#ef4444" depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}

export default function Viewport({ objUrl, symmetry, onAnalyze, hullsData }) {
  return (
    <Canvas camera={{ position: [5, 5, 5], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={['#18181b']} />
      <ambientLight intensity={0.4} />
      <hemisphereLight skyColor="#ffffff" groundColor="#444444" intensity={0.6} />
      <directionalLight position={[10, 10, 10]} castShadow />
      <Grid infiniteGrid fadeDistance={50} sectionColor="#3f3f46" cellColor="#27272a" position={[0, -0.01, 0]} />

      <Suspense fallback={null}>
        {objUrl && (
          <>
            <Bounds fit clip observe margin={1.2}>
              <GhostModel url={objUrl} symmetry={symmetry} onAnalyze={onAnalyze} hullsData={hullsData} />
            </Bounds>
            {symmetry.x && <mesh rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#ef4444" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry.y && <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#22c55e" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
            {symmetry.z && <mesh rotation={[0, 0, 0]}><planeGeometry args={[5000, 5000]} /><meshBasicMaterial color="#3b82f6" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
          </>
        )}
      </Suspense>

      <OrbitControls makeDefault />
    </Canvas>
  );
}