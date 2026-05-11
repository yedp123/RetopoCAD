import uvicorn
import trimesh
import numpy as np
import io
import tempfile
import os
import sys
import subprocess
import pickle
import traceback
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
    live_logs = []
    rebuild_geometry = [] 

state = AppState()

def broadcast_log(msg: str):
    print(msg)
    state.live_logs.append(msg)
    if len(state.live_logs) > 30:
        state.live_logs.pop(0)

class Point3D(BaseModel):
    x: float
    y: float
    z: float
    sharpness_angle: float = 30.0

class FeatureParams(BaseModel):
    x: float
    y: float
    z: float
    sharpness_angle: float = 30.0

class ClassifyParams(BaseModel):
    x: float
    y: float
    z: float
    sharpness_angle: float = 30.0

class AutoExtractParams(BaseModel):
    min_size: float
    sharpness_angle: float = 30.0

class HullParams(BaseModel):
    max_hulls: int
    detail_level: float
    decimation_target: int
    skip_decimation: bool = False

class CommitGeometryParams(BaseModel):
    operation: str
    loops: list
    extrude_depth: float = 2.0

class BooleanCutParams(BaseModel):
    loops: list
    extrude_depth: float
    target_index: int

@app.get("/api/logs")
async def get_logs():
    return {"logs": state.live_logs}

@app.post("/upload-mesh")
async def upload_mesh(file: UploadFile = File(...)):
    try:
        state.live_logs = [] 
        state.rebuild_geometry = [] 
        broadcast_log(f"[System] Receiving {file.filename}...")
        contents = await file.read()
        mesh = trimesh.load(io.BytesIO(contents), file_type='obj', force='mesh')
        state.mesh = mesh
        
        broadcast_log(f"[Success] Python parsed mesh. Faces: {len(mesh.faces):,}")
        return {"message": "Mesh successfully loaded", "faces": len(mesh.faces)}
    except Exception as e:
        broadcast_log(f"[Error] Failed to load mesh: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to load mesh: {str(e)}")

def get_patch_components(mesh, sharpness_angle_deg):
    if mesh is None: return []
    threshold_rad = np.radians(sharpness_angle_deg)
    adjacency = mesh.face_adjacency
    angles = mesh.face_adjacency_angles
    smooth_edges = adjacency[angles < threshold_rad]
    return list(trimesh.graph.connected_components(edges=smooth_edges, nodes=np.arange(len(mesh.faces))))

@app.post("/classify-patch")
async def classify_patch(params: ClassifyParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    import scipy.optimize
    mesh = state.mesh
    target_pt = np.array([[params.x, params.y, params.z]])
    
    _, _, face_ids = mesh.nearest.on_surface(target_pt)
    if len(face_ids) == 0:
        raise HTTPException(status_code=404)
        
    start_face = face_ids[0]
    components = get_patch_components(mesh, params.sharpness_angle)
    target_region = next((comp for comp in components if start_face in comp), [start_face])
    
    patch_verts_idx = np.unique(mesh.faces[target_region])
    pts = mesh.vertices[patch_verts_idx]
    
    if len(pts) < 4:
        return {"best_match": "planar", "errors": {"plane": 0, "cylinder": 999, "sphere": 999}}
        
    centroid = np.mean(pts, axis=0)
    
    _, _, vh = np.linalg.svd(pts - centroid)
    normal = vh[2, :]
    plane_err = float(np.mean(np.abs(np.dot(pts - centroid, normal))))
    
    def sphere_obj(c):
        r = np.linalg.norm(pts - c, axis=1)
        return r - np.mean(r)
    
    res_sph = scipy.optimize.least_squares(sphere_obj, centroid)
    r_sph = np.mean(np.linalg.norm(pts - res_sph.x, axis=1))
    sphere_err = float(np.std(np.linalg.norm(pts - res_sph.x, axis=1)))
    
    if r_sph > 10000 or r_sph < 1e-4: 
        sphere_err = float('inf')
        
    u = vh[0, :]
    v = vh[1, :]
    p2d = np.column_stack((np.dot(pts - centroid, u), np.dot(pts - centroid, v)))
    def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
    def cyl_obj(c): Ri = calc_R(c); return Ri - Ri.mean()
    
    c2d_guess = np.mean(p2d, axis=0)
    res_cyl = scipy.optimize.least_squares(cyl_obj, c2d_guess)
    radii = calc_R(res_cyl.x)
    r_cyl = np.mean(radii)
    cyl_err = float(np.std(radii))
    
    max_allowed_radius = max(100.0, np.ptp(pts)*10)
    if r_cyl > max_allowed_radius or r_cyl < 1e-4:
        cyl_err = float('inf')
        
    errors = {
        "plane": plane_err,
        "cylinder": cyl_err,
        "sphere": sphere_err
    }
    
    best_match = min(errors, key=errors.get)
    
    return {
        "best_match": best_match,
        "errors": errors,
        "radius": float(r_cyl) if best_match == 'cylinder' else float(r_sph) if best_match == 'sphere' else None
    }


@app.post("/analyze-surface")
async def analyze_surface(params: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    
    mesh = state.mesh
    target_pt = np.array([[params.x, params.y, params.z]])
    
    closest_points, distances, face_ids = mesh.nearest.on_surface(target_pt)
    if len(face_ids) == 0:
        raise HTTPException(status_code=404, detail="Could not snap to a face.")
        
    start_face = face_ids[0]
    components = get_patch_components(mesh, params.sharpness_angle)
    target_region = next((comp for comp in components if start_face in comp), [start_face])

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

@app.post("/scout-loop")
async def scout_loop(params: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400)
        
    try:
        import networkx as nx
        mesh = state.mesh
        target_pt = np.array([[params.x, params.y, params.z]])
        
        _, _, face_ids = mesh.nearest.on_surface(target_pt)
        if len(face_ids) == 0: raise HTTPException(status_code=404)
        
        start_face = face_ids[0]
        components = get_patch_components(mesh, params.sharpness_angle)
        target_region = next((comp for comp in components if start_face in comp), [start_face])
        
        # Consistent ID for Color Splash stability
        patch_id = f"patch_{min(target_region)}"
        
        faces = mesh.faces[target_region]
        edges = trimesh.geometry.faces_to_edges(faces)
        edges_sorted = np.sort(edges, axis=1)
        unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
        boundary_edges = unique_edges[counts == 1]
        
        if len(boundary_edges) == 0: raise HTTPException(status_code=400)

        G = nx.Graph()
        G.add_edges_from(boundary_edges)
        loops = list(nx.connected_components(G))
        
        min_dist = float('inf')
        best_loop = None
        best_subgraph = None
        
        for loop in loops:
            loop_verts = mesh.vertices[list(loop)]
            dist = np.min(np.linalg.norm(loop_verts - target_pt, axis=1))
            if dist < min_dist:
                min_dist = dist
                best_loop = list(loop)
                best_subgraph = G.subgraph(loop)

        try:
            cycle = nx.find_cycle(best_subgraph)
            ordered_nodes = [u for u, v in cycle]
        except:
            ordered_nodes = list(nx.dfs_preorder_nodes(best_subgraph))
            
        ordered_points = mesh.vertices[ordered_nodes]
        return {
            "id": patch_id,
            "type": "planar",
            "points": ordered_points.tolist(),
            "patch_faces": target_region.tolist() # Feed the UI Color Splash
        }
    except Exception as e:
        raise HTTPException(status_code=500)

def apply_pca_firewall(points):
    pts = np.array(points)
    centroid = np.mean(pts, axis=0)
    _, _, vh = np.linalg.svd(pts - centroid)
    normal = vh[2, :] 
    proj_pts = []
    for p in pts:
        dist = np.dot(p - centroid, normal)
        proj_pts.append(p - dist * normal)
    return proj_pts

def resample_loop(points, target_count=100):
    pts = np.array(points)
    if len(pts) < 2:
        return points
    
    diffs = np.diff(pts, axis=0)
    diffs = np.vstack([diffs, pts[0] - pts[-1]])
    
    dists = np.linalg.norm(diffs, axis=1)
    cum_dists = np.insert(np.cumsum(dists), 0, 0)
    total_len = cum_dists[-1]
    
    if total_len == 0:
        return points
    
    target_dists = np.linspace(0, total_len, target_count, endpoint=False)
    resampled = np.zeros((target_count, 3))
    
    for i in range(3):
        resampled[:, i] = np.interp(target_dists, cum_dists, np.append(pts[:, i], pts[0, i]))
        
    return resampled.tolist()

@app.post("/create-sheet")
async def create_sheet(params: CommitGeometryParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing SURFACE SHEET to Stack...")
    
    if not params.loops or len(params.loops) != 1:
        raise ValueError("Creating a sheet requires exactly 1 loop.")

    try:
        processed_loop = apply_pca_firewall(params.loops[0]['points'])
        
        pts = [b3d.Vector(p) for p in processed_loop]
        if (pts[0] - pts[-1]).length > 1e-5:
            pts.append(pts[0])
            
        wire = b3d.Wire.make_polygon(pts)
        sheet_face = b3d.Face(wire)

        state.rebuild_geometry.append(sheet_face)

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        
        try:
            from build123d.exporters3d import export_stl
            export_stl(sheet_face, path)
                
            tmesh = trimesh.load(path, file_type='stl')
            vertices = tmesh.vertices.tolist()
            faces_out = tmesh.faces.tolist()
            
            broadcast_log(f"[Success] Rebuild Sheet created. Returning {len(faces_out)} faces to viewport.")
            return {"vertices": vertices, "faces": faces_out}
        finally:
            try:
                os.remove(path)
            except: pass

    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to build Surface Sheet: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {err_msg}")


@app.post("/commit-geometry")
async def commit_geometry(params: CommitGeometryParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing {params.operation.upper()} solid to Stack...")
    try:
        if not params.loops:
            raise ValueError("No loops provided.")

        processed_loops = []
        for loop_data in params.loops:
            processed_loops.append(apply_pca_firewall(loop_data['points']))

        if params.operation == 'loft' and len(processed_loops) == 2:
            pts1 = resample_loop(processed_loops[0], 100)
            pts2 = resample_loop(processed_loops[1], 100)
            
            p0 = np.array(pts1[0])
            dists = [np.linalg.norm(np.array(p) - p0) for p in pts2]
            best_idx = np.argmin(dists)
            pts2 = pts2[best_idx:] + pts2[:best_idx]
            
            processed_loops = [pts1, pts2]

        faces = []
        for pts_list in processed_loops:
            pts = [b3d.Vector(p) for p in pts_list]
            if (pts[0] - pts[-1]).length > 1e-5:
                pts.append(pts[0])
            wire = b3d.Wire.make_polygon(pts)
            faces.append(b3d.Face(wire))

        solid = None
        
        try:
            if params.operation == 'extrude' and len(faces) == 1:
                solid = b3d.extrude(faces[0], amount=params.extrude_depth)
            elif params.operation == 'loft' and len(faces) == 2:
                solid = b3d.loft(faces)
            else:
                raise ValueError("Invalid operation or loop count.")
        except Exception as b3d_err:
            err_str = str(b3d_err)
            if "not done" in err_str.lower() or "brep_api" in err_str.lower():
                raise ValueError("Loft failed: The resulting geometry would self-intersect. Try simplifying your loops.")
            raise b3d_err

        state.rebuild_geometry.append(solid)

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        
        try:
            if hasattr(solid, 'export_stl'):
                solid.export_stl(path)
            else:
                from build123d.exporters3d import export_stl
                export_stl(solid, path)
                
            tmesh = trimesh.load(path, file_type='stl')
            vertices = tmesh.vertices.tolist()
            faces_out = tmesh.faces.tolist()
            
            broadcast_log(f"[Success] Rebuild Solid created. Returning {len(faces_out)} faces to viewport.")
            return {"vertices": vertices, "faces": faces_out}
        finally:
            try:
                os.remove(path)
            except: pass

    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to build CAD Solid: {err_msg}")
        raise HTTPException(status_code=400, detail=err_msg)

@app.post("/boolean-cut")
async def boolean_cut(params: BooleanCutParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing BOOLEAN CUT to Stack...")
    try:
        if not params.loops or params.target_index is None:
            raise ValueError("Requires 1 loop and 1 target solid.")
        if params.target_index >= len(state.rebuild_geometry) or params.target_index < 0:
            raise ValueError("Target solid not found.")

        processed_loop = apply_pca_firewall(params.loops[0]['points'])
        
        pts = [b3d.Vector(p) for p in processed_loop]
        if (pts[0] - pts[-1]).length > 1e-5:
            pts.append(pts[0])
        wire = b3d.Wire.make_polygon(pts)
        face = b3d.Face(wire)
        
        tool_extrusion = b3d.extrude(face, amount=params.extrude_depth)
        target_solid = state.rebuild_geometry[params.target_index]
        
        try:
            result_solid = target_solid - tool_extrusion
        except Exception:
            from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
            cut_algo = BRepAlgoAPI_Cut(target_solid.wrapped, tool_extrusion.wrapped)
            cut_algo.Build()
            result_solid = b3d.Shape.cast(cut_algo.Shape())
        
        state.rebuild_geometry[params.target_index] = result_solid

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            from build123d.exporters3d import export_stl
            export_stl(result_solid, path)
            tmesh = trimesh.load(path, file_type='stl')
            broadcast_log(f"[Success] Boolean Cut created. Returning {len(tmesh.faces)} faces.")
            return {"vertices": tmesh.vertices.tolist(), "faces": tmesh.faces.tolist()}
        finally:
            try: os.remove(path)
            except: pass
            
    except Exception as e:
        broadcast_log(f"[Error] Failed to Boolean Cut: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {str(e)}")


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
    components = get_patch_components(mesh, params.sharpness_angle)
    target_region = next((comp for comp in components if start_face in comp), [start_face])
    
    patch_id = f"patch_{min(target_region)}"
    
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
                        "id": patch_id,
                        "type": "circle",
                        "center": center_3d.tolist(),
                        "radius": radius,
                        "normal": normal.tolist(),
                        "patch_faces": target_region.tolist()
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
                "id": patch_id,
                "type": "planar",
                "points": ordered_points.tolist(),
                "normal": region_normal.tolist(),
                "patch_faces": target_region.tolist()
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
    
    broadcast_log(f"[System] Isolating panels > {params.min_size} units...")
    components = get_patch_components(mesh, params.sharpness_angle)
    
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
                    
    broadcast_log(f"[Success] Auto-Extract complete. Found {len(extracted_features)} valid features.")
    return {"features": extracted_features}

@app.post("/generate-hulls")
def generate_hulls(params: HullParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    
    try:
        import coacd
    except ImportError:
        broadcast_log("[Error] Missing coacd library. Run: pip install coacd")
        raise HTTPException(status_code=500, detail="coacd module not found.")

    try:
        math_mesh = state.mesh
        coacd_threshold = 0.008 + ((100.0 - params.detail_level) / 100.0) * 0.15
        prep_res = int(30 + (params.detail_level / 100.0) * 50)

        if not params.skip_decimation and len(math_mesh.faces) > params.decimation_target:
            broadcast_log(f"[System] Decimating mesh down to {params.decimation_target:,} faces...")
            try:
                import fast_simplification
                result = fast_simplification.simplify(
                    math_mesh.vertices, math_mesh.faces, target_count=params.decimation_target
                )
                math_mesh = trimesh.Trimesh(vertices=result[0], faces=result[1])
                broadcast_log(f"[Success] Decimation complete. (Actual: {len(math_mesh.faces):,} faces)")
            except Exception as e:
                broadcast_log(f"[Warning] Decimation skipped: {e}")

        broadcast_log("[System] Launching CoACD Subprocess to capture C++ logs...")
        
        fd_in, in_path = tempfile.mkstemp(suffix=".pkl")
        os.close(fd_in)
        with open(in_path, 'wb') as f:
            pickle.dump({
                'vertices': np.ascontiguousarray(math_mesh.vertices, dtype=np.float64), 
                'faces': np.ascontiguousarray(math_mesh.faces, dtype=np.int32)
            }, f)
        
        fd_out, out_path = tempfile.mkstemp(suffix=".pkl")
        os.close(fd_out)
        
        safe_in_path = in_path.replace('\\', '/')
        safe_out_path = out_path.replace('\\', '/')
        
        worker_script = f"""
import coacd
import pickle
import numpy as np

if __name__ == '__main__':
    with open('{safe_in_path}', 'rb') as f:
        data = pickle.load(f)
        
    coacd.set_log_level('info')
    
    v = np.ascontiguousarray(data['vertices'], dtype=np.float64)
    f = np.ascontiguousarray(data['faces'], dtype=np.int32)
    
    c_mesh = coacd.Mesh(v, f)
    parts = coacd.run_coacd(
        c_mesh, 
        max_convex_hull={params.max_hulls}, 
        threshold={coacd_threshold},
        preprocess_resolution={prep_res},
        mcts_iterations=100
    )
    
    with open('{safe_out_path}', 'wb') as f:
        pickle.dump(parts, f)
"""
        fd_script, script_path = tempfile.mkstemp(suffix=".py")
        with open(script_path, 'w') as f:
            f.write(worker_script)
        os.close(fd_script)
        
        process = subprocess.Popen(
            [sys.executable, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        for line in process.stdout:
            msg = line.strip()
            if msg:
                if "[CoACD] [info]" in msg:
                    msg = msg.split("[CoACD] [info]")[-1].strip()
                broadcast_log(f"[CoACD] {msg}")
                
        process.wait()
        
        if process.returncode != 0:
            raise Exception(f"CoACD Subprocess crashed with code {process.returncode}")
            
        with open(out_path, 'rb') as f:
            parts = pickle.load(f)
            
        try:
            os.remove(in_path)
            os.remove(out_path)
            os.remove(script_path)
        except Exception:
            pass
        
        serialized_hulls = []
        for vertices, faces in parts:
            serialized_hulls.append({
                "vertices": np.array(vertices).tolist(),
                "faces": np.array(faces).tolist()
            })
            
        broadcast_log(f"[Success] C++ Kernel Finished! Generated {len(serialized_hulls)} clean blocks.")
        return {"hulls": serialized_hulls}
        
    except Exception as e:
        broadcast_log(f"[Error] CoACD failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"CoACD failed: {str(e)}")


@app.post("/export-step")
async def export_step(payload: dict):
    try:
        import build123d as b3d
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import Error: {str(e)}. Try deleting your .venv folder and recreating it.")
        
    shapes = []
    merge_hulls = payload.get("merge_hulls", False)
    symmetry = payload.get("symmetry", {"x": False, "y": False, "z": False})
    
    for shape in state.rebuild_geometry:
        shapes.append(shape)
        
    hulls = payload.get("hulls", [])
    hull_solids = []
    
    if hulls:
        broadcast_log(f"[System] Stitching {len(hulls)} triangulated hulls into Solid Bodies...")
        
    for idx, hull in enumerate(hulls):
        try:
            pts = [b3d.Vector(v) for v in hull["vertices"]]
            faces = []
            for f in hull["faces"]:
                poly_pts = [pts[i] for i in f]
                if len(poly_pts) >= 3:
                    poly_pts.append(poly_pts[0]) 
                    wire = b3d.Wire.make_polygon(poly_pts)
                    faces.append(b3d.Face(wire))
            
            try:
                sewer = BRepBuilderAPI_Sewing()
                sewer.SetTolerance(1e-2)
                for face in faces:
                    sewer.Add(face.wrapped)
                sewer.Perform()
                sewed_shape = sewer.SewedShape()
                sewed_b3d = b3d.Shape(sewed_shape)
            except Exception:
                sewed_b3d = b3d.Shell.make_shell(faces)
            
            if isinstance(sewed_b3d, b3d.Shell):
                try:
                    hull_solids.append(b3d.Solid.make_solid(sewed_b3d))
                except:
                    hull_solids.append(sewed_b3d)
            elif isinstance(sewed_b3d, b3d.Compound):
                for shell in sewed_b3d.shells():
                    try:
                        hull_solids.append(b3d.Solid.make_solid(shell))
                    except:
                        hull_solids.append(shell)
            else:
                hull_solids.append(sewed_b3d)

        except Exception as e:
            broadcast_log(f"[Warning] Failed to process hull #{idx}: {e}")
            
    if merge_hulls and len(hull_solids) > 1:
        broadcast_log("[System] Melting intersecting solids via Boolean Union...")
        try:
            fused_shape = hull_solids[0]
            for next_shape in hull_solids[1:]:
                fused_shape = fused_shape.fuse(next_shape)
                
            shapes.append(fused_shape)
            broadcast_log("[Success] Solids cleanly merged!")
        except Exception as e:
            broadcast_log(f"[Warning] Boolean Union hit a zero-thickness error. Falling back to separate blocks.")
            shapes.extend(hull_solids) 
    else:
        shapes.extend(hull_solids)
            
    features = payload.get("features", [])
    if features:
        broadcast_log(f"[System] Compiling {len(features)} CAD sketches...")
        
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
            broadcast_log(f"[Warning] Failed to build a sketch feature: {e}")
            
    shapes = [s for s in shapes if s is not None and hasattr(s, 'wrapped')]

    if any([symmetry.get('x'), symmetry.get('y'), symmetry.get('z')]):
        broadcast_log("[System] Applying structural symmetry arrays using build123d.mirror()...")
        
        final_shapes = []
        for s in shapes:
            final_shapes.append(s)

        try:
            if symmetry.get('x'):
                final_shapes.extend([b3d.mirror(s, about=b3d.Plane.YZ) for s in list(final_shapes)])
            if symmetry.get('y'):
                final_shapes.extend([b3d.mirror(s, about=b3d.Plane.XZ) for s in list(final_shapes)])
            if symmetry.get('z'):
                final_shapes.extend([b3d.mirror(s, about=b3d.Plane.XY) for s in list(final_shapes)])
            shapes = final_shapes
        except Exception as mirror_err:
            broadcast_log(f"[Warning] Symmetry Mirroring failed during export: {mirror_err}")

    if not shapes:
        broadcast_log("[Error] No geometry found to export.")
        raise HTTPException(status_code=400, detail="No geometry found to export.")
        
    broadcast_log("[System] Writing STEP file to disk...")
    fd, path = tempfile.mkstemp(suffix=".step")
    os.close(fd)
    
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
        broadcast_log(f"[Error] Fatal OpenCASCADE crash: {export_error}")
        raise HTTPException(status_code=500, detail=f"Failed during STEP compilation: {str(export_error)}")
    
    broadcast_log("[Success] STEP translation complete! Initiating download.")
    return FileResponse(path, media_type="application/octet-stream", filename="RetopoCAD_Export.step")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)