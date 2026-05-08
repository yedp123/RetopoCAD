import uvicorn
import trimesh
import numpy as np
import io
import tempfile
import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
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
    
    smooth_threshold = 0.5
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
    
    if variance < 1e-2:
        return {
            "type": "planar", "face_count": len(target_region),
            "variance": float(variance)
        }
    else:
        try:
            cyl = submesh.bounding_cylinder
            radius = cyl.primitive.radius if hasattr(cyl, 'primitive') else cyl.radius
            return {
                "type": "cylindrical", "face_count": len(target_region),
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
    smooth_edges = mesh.face_adjacency[mesh.face_adjacency_angles < 0.5]
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
                
                if fit_error < 0.15: 
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
    
    smooth_edges = mesh.face_adjacency[mesh.face_adjacency_angles < 0.5]
    components = trimesh.graph.connected_components(edges=smooth_edges, nodes=np.arange(len(mesh.faces)))
    
    for comp in components:
        if len(comp) < 3: 
            continue
            
        region_normals = mesh.face_normals[comp]
        region_normal = np.mean(region_normals, axis=0)
        variance = np.var(region_normals, axis=0).sum()
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


@app.post("/export-step")
async def export_step(payload: dict):
    try:
        import build123d as b3d
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    except ImportError:
        raise HTTPException(status_code=500, detail="Missing build123d or OCP. Run: pip install build123d")
        
    shapes = []
    
    # 1. Convert Hull Meshes to Solid BREP Bodies (Robust Sewing Logic)
    hulls = payload.get("hulls", [])
    for hull in hulls:
        try:
            pts = [b3d.Vector(v) for v in hull["vertices"]]
            faces = []
            for f in hull["faces"]:
                poly_pts = [pts[i] for i in f]
                if len(poly_pts) >= 3:
                    poly_pts.append(poly_pts[0]) # explicitly close the wire loop
                    wire = b3d.Wire.make_polygon(poly_pts)
                    faces.append(b3d.Face(wire))
            
            # Use OpenCASCADE Sewing API to forcefully stitch microscopic gaps together!
            sewer = BRepBuilderAPI_Sewing()
            sewer.SetTolerance(1e-2) # 0.01 tolerance bridges floating point inaccuracies
            for face in faces:
                sewer.Add(face.wrapped)
            sewer.Perform()
            sewed_shape = sewer.SewedShape()
            
            # Try to cast the perfectly stitched shell back into a solid body
            sewed_b3d = b3d.Shape(sewed_shape)
            
            if isinstance(sewed_b3d, b3d.Shell):
                try:
                    shapes.append(b3d.Solid.make_solid(sewed_b3d))
                except:
                    shapes.append(sewed_b3d) # Fallback to a clean shell if solid fails
            elif isinstance(sewed_b3d, b3d.Compound):
                # Sometimes sewing returns multiple distinct shells
                for shell in sewed_b3d.shells():
                    try:
                        shapes.append(b3d.Solid.make_solid(shell))
                    except:
                        shapes.append(shell)
            else:
                shapes.append(sewed_b3d)

        except Exception as e:
            print(f"[Export Warning] Failed to sew/process a hull: {e}")
            
    # 2. Convert Extracted Curves to 1D Wire/Edge Sketches
    features = payload.get("features", [])
    for feat in features:
        try:
            if feat["type"] == "circle":
                c = b3d.Vector(feat["center"])
                n = b3d.Vector(feat["normal"])
                p = b3d.Plane(origin=c, z_dir=n)
                shapes.append(b3d.Edge.make_circle(radius=feat["radius"], plane=p))
                
            elif feat["type"] == "planar":
                pts = [b3d.Vector(p) for p in feat["points"]]
                if (pts[0] - pts[-1]).length > 1e-5:
                    pts.append(pts[0])
                shapes.append(b3d.Wire.make_polygon(pts))
        except Exception as e:
            print(f"[Export Warning] Failed to build a curve feature: {e}")
            
    if not shapes:
        raise HTTPException(status_code=400, detail="No geometry found to export.")
        
    fd, path = tempfile.mkstemp(suffix=".step")
    os.close(fd)
    
    # Safe compound builder for build123d API
    try:
        try:
            comp = b3d.Compound(children=shapes)
        except Exception:
            comp = b3d.Compound(shapes)
            
        if hasattr(comp, 'export_step'):
            comp.export_step(path)
        elif hasattr(b3d, 'export_step'):
            b3d.export_step(comp, path)
        else:
            from build123d import exporters3d
            exporters3d.export_step(comp, path)
            
    except Exception as export_error:
        print(f"[Export Error Fatal] {export_error}")
        raise HTTPException(status_code=500, detail=f"Failed during STEP compilation: {str(export_error)}")
    
    return FileResponse(path, media_type="application/octet-stream", filename="RetopoCAD_Export.step")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)