import uvicorn
import trimesh
import numpy as np
import io
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="RetopoCAD Brain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AppState:
    mesh = None

state = AppState()

class Point3D(BaseModel):
    x: float
    y: float
    z: float

class HullParams(BaseModel):
    max_hulls: int
    threshold_pct: float
    decimation_target: int
    skip_decimation: bool = False

@app.post("/upload-mesh")
async def upload_mesh(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        mesh = trimesh.load(io.BytesIO(contents), file_type='obj', force='mesh')
        state.mesh = mesh
        return {"message": "Mesh successfully loaded", "faces": len(mesh.faces)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to load mesh: {str(e)}")

@app.post("/analyze-surface")
async def analyze_surface(point: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    
    mesh = state.mesh
    target_pt = np.array([[point.x, point.y, point.z]])
    
    closest_points, distances, face_ids = mesh.nearest.on_surface(target_pt)
    if len(face_ids) == 0:
        raise HTTPException(status_code=404, detail="Could not snap to a face.")
        
    start_face = face_ids[0]
    adjacency = mesh.face_adjacency
    angles = mesh.face_adjacency_angles
    
    smooth_threshold = 0.35
    smooth_edges = adjacency[angles < smooth_threshold]
    
    components = trimesh.graph.connected_components(
        edges=smooth_edges, nodes=np.arange(len(mesh.faces))
    )
    
    target_region = None
    for comp in components:
        if start_face in comp:
            target_region = comp
            break
            
    if target_region is None or len(target_region) == 0:
        target_region = [start_face] 

    region_normals = mesh.face_normals[target_region]
    variance = np.var(region_normals, axis=0).sum()
    submesh = mesh.submesh([target_region], append=True)
    
    if variance < 1e-4:
        bounds = submesh.bounds
        return {
            "type": "planar", "face_count": len(target_region),
            "bounds": {"min": bounds[0].tolist(), "max": bounds[1].tolist()},
            "variance": float(variance)
        }
    else:
        try:
            cyl = submesh.bounding_cylinder
            radius = cyl.primitive.radius if hasattr(cyl, 'primitive') else cyl.radius
            return {
                "type": "cylindrical", "face_count": len(target_region),
                "axis": cyl.direction.tolist(), "center": cyl.transform[:3, 3].tolist(),
                "radius": float(radius), "variance": float(variance)
            }
        except Exception:
            return {"type": "complex_curved", "face_count": len(target_region), "variance": float(variance)}

@app.post("/generate-hulls")
def generate_hulls(params: HullParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    
    try:
        import coacd
    except ImportError:
        raise HTTPException(status_code=500, detail="coacd module not found.")

    try:
        math_mesh = state.mesh
        coacd_threshold = 0.01 + (params.threshold_pct / 100.0) * 0.14

        # Honor the new Skip Decimation toggle
        if not params.skip_decimation and len(math_mesh.faces) > params.decimation_target:
            print(f"\n[Brain] Decimating mesh to ~{params.decimation_target} faces...")
            try:
                import fast_simplification
                result = fast_simplification.simplify(
                    math_mesh.vertices, math_mesh.faces, target_count=params.decimation_target
                )
                math_mesh = trimesh.Trimesh(vertices=result[0], faces=result[1])
                print(f"[Brain] Decimation complete. New face count: {len(math_mesh.faces)}")
            except Exception as e:
                print(f"[Brain] Decimation skipped: {e}")
        else:
            if params.skip_decimation:
                print(f"\n[Brain] WARNING: Decimation skipped by user. Processing {len(math_mesh.faces)} raw faces.")
            print(f"[Brain] Feeding faces into CoACD...")

        print(f"[Brain] CoACD parameters: max_hulls={params.max_hulls}, threshold={coacd_threshold:.3f}")
        coacd.set_log_level("info")
        coacd_mesh = coacd.Mesh(math_mesh.vertices, math_mesh.faces)
        
        parts = coacd.run_coacd(coacd_mesh, max_convex_hull=params.max_hulls, threshold=coacd_threshold)
        
        serialized_hulls = []
        for vertices, faces in parts:
            serialized_hulls.append({
                "vertices": np.array(vertices).tolist(),
                "faces": np.array(faces).tolist()
            })
            
        print(f"[Brain] CoACD finished. Generated {len(serialized_hulls)} precise hulls.\n")
        return {"hulls": serialized_hulls}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CoACD failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)