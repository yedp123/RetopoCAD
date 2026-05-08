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

class FeatureParams(BaseModel):
    x: float
    y: float
    z: float

class AutoExtractParams(BaseModel):
    min_size: float

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
    
    # Relaxed tolerance for planarity to catch slightly imperfect CAD exports
    if variance < 1e-2:
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


@app.post("/extract-feature")
async def extract_feature(params: FeatureParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    try:
        import scipy.optimize
        import networkx as nx
    except ImportError:
        raise HTTPException(status_code=500, detail="Missing libraries.")

    mesh = state.mesh
    target_pt = np.array([[params.x, params.y, params.z]])
    
    closest_points, distances, face_ids = mesh.nearest.on_surface(target_pt)
    if len(face_ids) == 0:
        raise HTTPException(status_code=404, detail="Could not snap to a face.")
        
    start_face = face_ids[0]
    smooth_edges = mesh.face_adjacency[mesh.face_adjacency_angles < 0.35]
    components = trimesh.graph.connected_components(edges=smooth_edges, nodes=np.arange(len(mesh.faces)))
    
    target_region = next((comp for comp in components if start_face in comp), [start_face])
    region_normals = mesh.face_normals[target_region]
    region_normal = np.mean(region_normals, axis=0)
    
    variance = np.var(region_normals, axis=0).sum()
    is_planar = variance < 1e-2

    faces = mesh.faces[target_region]
    edges = trimesh.geometry.faces_to_edges(faces)
    edges_sorted = np.sort(edges, axis=1)
    unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
    boundary_edges = unique_edges[counts == 1]
    
    if len(boundary_edges) == 0:
        raise HTTPException(status_code=400, detail="No boundaries found on this panel.")

    G = nx.Graph()
    G.add_edges_from(boundary_edges)
    loops = list(nx.connected_components(G))
    
    min_dist = float('inf')
    best_loop_nodes = None
    best_subgraph = None
    
    for loop in loops:
        loop_verts = mesh.vertices[list(loop)]
        dist = np.min(np.linalg.norm(loop_verts - target_pt, axis=1))
        if dist < min_dist:
            min_dist = dist
            best_loop_nodes = list(loop)
            best_subgraph = G.subgraph(loop)

    is_circle = False
    if not is_planar:
        loop_points = mesh.vertices[best_loop_nodes]
        if len(loop_points) >= 3:
            try:
                center_guess = np.mean(loop_points, axis=0)
                cov = np.cov(loop_points.T)
                evals, evecs = np.linalg.eigh(cov)
                
                normal = evecs[:, 0]
                u = evecs[:, 1]
                v = evecs[:, 2]
                
                p2d = np.column_stack((np.dot(loop_points - center_guess, u), np.dot(loop_points - center_guess, v)))
                
                def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
                def f_2(c): Ri = calc_R(c); return Ri - Ri.mean()
                    
                c2d_guess = np.mean(p2d, axis=0)
                res = scipy.optimize.least_squares(f_2, c2d_guess)
                radii = calc_R(res.x)
                radius = float(radii.mean())
                fit_error = np.std(radii) / radius
                
                if fit_error < 0.15: # Good circular fit
                    center_3d = center_guess + res.x[0]*u + res.x[1]*v
                    if np.dot(normal, region_normal) < 0: normal = -normal

                    is_circle = True
                    return {
                        "type": "circle",
                        "center": center_3d.tolist(),
                        "radius": radius,
                        "normal": normal.tolist()
                    }
            except:
                pass

    if not is_circle:
        try:
            try:
                cycle = nx.find_cycle(best_subgraph)
                ordered_nodes = [u for u, v in cycle]
            except:
                ordered_nodes = list(nx.dfs_preorder_nodes(best_subgraph))
                
            ordered_points = mesh.vertices[ordered_nodes]
            return {
                "type": "planar",
                "points": ordered_points.tolist(),
                "normal": region_normal.tolist()
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to trace shape boundary.")


@app.post("/auto-extract")
def auto_extract(params: AutoExtractParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    try:
        import scipy.optimize
        import networkx as nx
    except ImportError:
        raise HTTPException(status_code=500, detail="Missing libraries.")

    mesh = state.mesh
    extracted_features = []
    
    smooth_edges = mesh.face_adjacency[mesh.face_adjacency_angles < 0.35]
    components = trimesh.graph.connected_components(edges=smooth_edges, nodes=np.arange(len(mesh.faces)))
    
    for comp in components:
        # Reduced from 10 to 3. Many large rectangular CAD panels only consist of 2-4 triangles!
        if len(comp) < 3: 
            continue
            
        region_normals = mesh.face_normals[comp]
        region_normal = np.mean(region_normals, axis=0)
        variance = np.var(region_normals, axis=0).sum()
        
        # Relaxed tolerance
        is_planar = variance < 1e-2

        faces = mesh.faces[comp]
        edges = trimesh.geometry.faces_to_edges(faces)
        edges_sorted = np.sort(edges, axis=1)
        unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
        boundary_edges = unique_edges[counts == 1]
        
        if len(boundary_edges) == 0: 
            continue

        G = nx.Graph()
        G.add_edges_from(boundary_edges)
        loops = list(nx.connected_components(G))
        
        for loop in loops:
            loop_nodes = list(loop)
            loop_points = mesh.vertices[loop_nodes]
            
            bounding_box_size = np.ptp(loop_points, axis=0)
            if np.max(bounding_box_size) < params.min_size:
                continue

            subgraph = G.subgraph(loop)
            is_circle = False
            
            if not is_planar:
                try:
                    center_guess = np.mean(loop_points, axis=0)
                    cov = np.cov(loop_points.T)
                    evals, evecs = np.linalg.eigh(cov)
                    
                    normal = evecs[:, 0]
                    u = evecs[:, 1]
                    v = evecs[:, 2]
                    
                    p2d = np.column_stack((np.dot(loop_points - center_guess, u), np.dot(loop_points - center_guess, v)))
                    
                    def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
                    def f_2(c): Ri = calc_R(c); return Ri - Ri.mean()
                        
                    c2d_guess = np.mean(p2d, axis=0)
                    res = scipy.optimize.least_squares(f_2, c2d_guess)
                    radii = calc_R(res.x)
                    radius = float(radii.mean())
                    fit_error = np.std(radii) / radius
                    
                    if (radius * 2) >= params.min_size and fit_error < 0.15: 
                        center_3d = center_guess + res.x[0]*u + res.x[1]*v
                        if np.dot(normal, region_normal) < 0: normal = -normal

                        extracted_features.append({
                            "type": "circle",
                            "center": center_3d.tolist(),
                            "radius": radius,
                            "normal": normal.tolist()
                        })
                        is_circle = True
                except:
                    pass
            
            if not is_circle:
                try:
                    try:
                        cycle = nx.find_cycle(subgraph)
                        ordered_nodes = [u for u, v in cycle]
                    except:
                        ordered_nodes = list(nx.dfs_preorder_nodes(subgraph))
                    
                    ordered_points = mesh.vertices[ordered_nodes]
                    extracted_features.append({
                        "type": "planar",
                        "points": ordered_points.tolist(),
                        "normal": region_normal.tolist()
                    })
                except:
                    pass
                    
    print(f"[Brain] Auto-Extract complete. Found {len(extracted_features)} valid features.\n")
    return {"features": extracted_features}


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

        if not params.skip_decimation and len(math_mesh.faces) > params.decimation_target:
            try:
                import fast_simplification
                result = fast_simplification.simplify(
                    math_mesh.vertices, math_mesh.faces, target_count=params.decimation_target
                )
                math_mesh = trimesh.Trimesh(vertices=result[0], faces=result[1])
            except Exception as e:
                pass

        coacd.set_log_level("info")
        coacd_mesh = coacd.Mesh(math_mesh.vertices, math_mesh.faces)
        
        parts = coacd.run_coacd(coacd_mesh, max_convex_hull=params.max_hulls, threshold=coacd_threshold)
        
        serialized_hulls = []
        for vertices, faces in parts:
            serialized_hulls.append({
                "vertices": np.array(vertices).tolist(),
                "faces": np.array(faces).tolist()
            })
            
        return {"hulls": serialized_hulls}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CoACD failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)