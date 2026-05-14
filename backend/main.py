import uvicorn
import trimesh
import trimesh.curvature
import trimesh.smoothing 
import numpy as np
import io
import tempfile
import os
import sys
import subprocess
import pickle
import traceback
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
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
    cleaned_mesh = None 
    live_logs = []
    rebuild_geometry = {} # DICTIONARY FOR STRICT ID LOCKING

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
    geo_id: str
    operation: str
    loops: list
    extrude_depth: float = 2.0

class BooleanCutParams(BaseModel):
    geo_id: str
    loops: list
    extrude_depth: float
    target_id: str

class BooleanOpParams(BaseModel):
    geo_id: str
    target_id: str
    tool_id: str
    keep_tool: bool = False
    operation: str = 'subtract'

class CreatePrimitiveParams(BaseModel):
    geo_id: str
    patch_faces: list
    primitive_type: str
    sharpness_angle: float = 30.0
    symmetry: dict = None
    extrude_depth: float = 0.0

class CreatePatchParams(BaseModel):
    geo_id: str
    loops: list
    sharpness_angle: float = 30.0

class MagicPatchParams(BaseModel):
    geo_id: str
    patch_faces: list
    sharpness_angle: float = 30.0

class PatchSplitParams(BaseModel):
    geo_id: str
    points: list
    sharpness_angle: float = 30.0

class TransformParams(BaseModel):
    target_id: str
    dx: float
    dy: float
    dz: float
    rx: float
    ry: float
    rz: float
    sx: float
    sy: float
    sz: float
    px: float
    py: float
    pz: float

class PreprocessParams(BaseModel):
    decimation_target: int = 25000
    sharpening_iters: int = 3

class SewParams(BaseModel):
    geo_id: str
    target_ids: list

class ExportStepParams(BaseModel):
    hulls: list = []
    features: list = []
    merge_hulls: bool = False
    symmetry: dict = None
    active_geo_ids: list = []

@app.get("/api/logs")
async def get_logs():
    return {"logs": state.live_logs}

def run_preprocessing_engine(mesh_in, decimation_target=25000, sharpening_iters=3):
    try:
        broadcast_log(f"[System] Background: Pre-Processing Engine Started (Target: {decimation_target}, Iters: {sharpening_iters})...")
        clean_mesh = mesh_in.copy()
        
        if len(clean_mesh.faces) > decimation_target:
            try:
                broadcast_log("[System] Background: Running simplification...")
                if hasattr(clean_mesh, 'simplify_quadratic_decimation'):
                    clean_mesh = clean_mesh.simplify_quadratic_decimation(decimation_target)
                else:
                    import fast_simplification
                    v, f = fast_simplification.simplify(clean_mesh.vertices, clean_mesh.faces, target_count=decimation_target)
                    clean_mesh = trimesh.Trimesh(vertices=v, faces=f)
            except Exception as e:
                broadcast_log(f"[Warning] Decimation skipped: {e}")

        if sharpening_iters > 0:
            try:
                broadcast_log("[System] Background: Applying feature sharpening...")
                for _ in range(sharpening_iters):
                    if hasattr(trimesh.smoothing, 'filter_bilateral'):
                        clean_mesh = trimesh.smoothing.filter_bilateral(clean_mesh)
                    else:
                        clean_mesh = trimesh.smoothing.filter_taubin(clean_mesh)
            except Exception as e:
                broadcast_log(f"[Warning] Sharpening filter bypassed: {e}")

        state.cleaned_mesh = clean_mesh
        broadcast_log(f"[Success] Background: Cleaned Mesh ready for Math! Faces: {len(clean_mesh.faces):,}")
    except Exception as e:
        state.cleaned_mesh = mesh_in
        broadcast_log(f"[Error] Pre-processing crashed, falling back to raw mesh: {e}")

@app.post("/preprocess-mesh")
async def preprocess_mesh(params: PreprocessParams, background_tasks: BackgroundTasks):
    if state.mesh is None: raise HTTPException(status_code=400)
    background_tasks.add_task(run_preprocessing_engine, state.mesh, params.decimation_target, params.sharpening_iters)
    return {"status": "Processing in background"}

@app.post("/upload-mesh")
async def upload_mesh(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        state.live_logs = [] 
        state.rebuild_geometry = {} 
        broadcast_log(f"[System] Receiving {file.filename}...")
        contents = await file.read()
        
        mesh = trimesh.load(io.BytesIO(contents), file_type='obj', force='mesh')
        
        mesh.merge_vertices()
        mesh.update_faces(mesh.nondegenerate_faces())
        mesh.remove_unreferenced_vertices()
        trimesh.repair.fix_normals(mesh)
        trimesh.repair.fix_inversion(mesh)
        
        state.mesh = mesh
        state.cleaned_mesh = mesh 
        
        background_tasks.add_task(run_preprocessing_engine, mesh, 25000, 3)
        
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

def perform_fitting_race(target_pt, sharpness_angle):
    import scipy.optimize
    
    ref_mesh = state.mesh
    _, _, ref_face_ids = ref_mesh.nearest.on_surface(target_pt)
    if len(ref_face_ids) == 0:
        raise HTTPException(status_code=404)
    start_ref_face = ref_face_ids[0]
    ref_components = get_patch_components(ref_mesh, sharpness_angle)
    ref_target_region = next((comp for comp in ref_components if start_ref_face in comp), [start_ref_face])
    patch_id = f"patch_{min(ref_target_region)}"

    math_mesh = state.cleaned_mesh if state.cleaned_mesh is not None else state.mesh
    _, _, math_face_ids = math_mesh.nearest.on_surface(target_pt)
    start_math_face = math_face_ids[0]
    math_components = get_patch_components(math_mesh, sharpness_angle)
    math_target_region = next((comp for comp in math_components if start_math_face in comp), [start_math_face])
    
    patch_verts_idx = np.unique(math_mesh.faces[math_target_region])
    pts = math_mesh.vertices[patch_verts_idx]
    
    if len(pts) < 4:
        return {"best_match": "plane", "errors": {"plane": 0, "cylinder": 999, "sphere": 999, "cone": 999, "torus": 999}, "radius": 0.0, "face_count": len(ref_target_region), "patch_faces": ref_target_region.tolist(), "id": patch_id}
        
    centroid = np.mean(pts, axis=0)
    
    _, _, vh = np.linalg.svd(pts - centroid)
    normal = vh[2, :]
    plane_mse = float(np.mean((np.dot(pts - centroid, normal))**2))
    
    def sphere_obj(c):
        return np.linalg.norm(pts - c, axis=1) - np.mean(np.linalg.norm(pts - c, axis=1))
    try:
        res_sph = scipy.optimize.least_squares(sphere_obj, centroid)
        sph_r = np.linalg.norm(pts - res_sph.x, axis=1)
        sphere_mse = float(np.mean((sph_r - np.mean(sph_r))**2))
        r_sph = float(np.mean(sph_r))
        if r_sph > 10000: sphere_mse = float('inf')
    except:
        sphere_mse = float('inf')
        r_sph = 0.0
        
    u = vh[0, :]
    v = vh[1, :]
    p2d = np.column_stack((np.dot(pts - centroid, u), np.dot(pts - centroid, v)))
    def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
    def cyl_obj(c): return calc_R(c) - np.mean(calc_R(c))
    
    try:
        c2d_guess = np.mean(p2d, axis=0)
        res_cyl = scipy.optimize.least_squares(cyl_obj, c2d_guess)
        radii = calc_R(res_cyl.x)
        cyl_mse = float(np.mean((radii - np.mean(radii))**2))
        r_cyl = np.mean(radii)
        if r_cyl > max(100.0, np.ptp(pts)*10) or r_cyl < 1e-4: cyl_mse = float('inf')
    except:
        cyl_mse = float('inf')
        r_cyl = 0.0

    def cone_obj(c):
        apex, axis, theta = c[0:3], c[3:6], c[6]
        axis_norm = np.linalg.norm(axis)
        if axis_norm < 1e-5: return np.ones(len(pts))*999
        axis = axis / axis_norm
        vec = pts - apex
        h = np.dot(vec, axis)
        r_vec = np.linalg.norm(np.cross(vec, axis), axis=1)
        return r_vec * np.cos(theta) - h * np.sin(theta)
        
    try:
        apex_guess = centroid + normal * np.ptp(pts)
        res_cone = scipy.optimize.least_squares(cone_obj, [*apex_guess, *normal, np.pi/4])
        cone_mse = float(np.mean((cone_obj(res_cone.x))**2))
    except:
        cone_mse = float('inf')

    def torus_obj(c):
        center, axis, R, r_min = c[0:3], c[3:6], c[6], c[7]
        axis_norm = np.linalg.norm(axis)
        if axis_norm < 1e-5: return np.ones(len(pts))*999
        axis = axis / axis_norm
        vec = pts - center
        z = np.dot(vec, axis)
        d_xy = np.linalg.norm(vec - np.outer(z, axis), axis=1)
        return np.sqrt((d_xy - R)**2 + z**2) - r_min

    try:
        res_torus = scipy.optimize.least_squares(torus_obj, [*centroid, *normal, np.ptp(pts)/2, np.ptp(pts)/10])
        torus_mse = float(np.mean((torus_obj(res_torus.x))**2))
    except:
        torus_mse = float('inf')
        
    errors = {
        "plane": plane_mse,
        "cylinder": cyl_mse,
        "sphere": sphere_mse,
        "cone": cone_mse,
        "torus": torus_mse
    }

    try:
        calc_radius = max(np.ptp(pts, axis=0).max() * 0.15, 1e-3)
        gaussian_curv = trimesh.curvature.discrete_gaussian_curvature_measure(math_mesh, pts, calc_radius)
        mean_curv = trimesh.curvature.discrete_mean_curvature_measure(math_mesh, pts, calc_radius)

        avg_gauss = float(np.mean(np.abs(gaussian_curv)))
        avg_mean = float(np.mean(np.abs(mean_curv)))

        gauss_zero_tol, mean_high_tol = 0.05, 0.05

        if avg_gauss < gauss_zero_tol and avg_mean < mean_high_tol:
            best_match = "plane"
        elif avg_gauss < gauss_zero_tol and avg_mean >= mean_high_tol:
            best_match = "cylinder" if cyl_mse < cone_mse else "cone"
        elif avg_gauss >= gauss_zero_tol:
            best_match = "sphere" if sphere_mse < torus_mse else "torus"
        else:
            best_match = min(errors, key=errors.get)
    except:
        best_match = min(errors, key=errors.get)

    strict_best = min(errors, key=errors.get)
    if errors[best_match] > errors[strict_best] * 3.0:
        best_match = strict_best

    if min(errors.values()) > 0.5: 
        best_match = 'B-Spline'

    return {
        "best_match": best_match,
        "errors": errors,
        "radius": float(r_cyl) if best_match == 'cylinder' else float(r_sph) if best_match == 'sphere' else 0.0,
        "face_count": len(ref_target_region),
        "patch_faces": ref_target_region.tolist(),
        "id": patch_id
    }

@app.post("/classify-patch")
async def classify_patch(params: ClassifyParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    target_pt = np.array([[params.x, params.y, params.z]])
    return perform_fitting_race(target_pt, params.sharpness_angle)

@app.post("/analyze-surface")
async def analyze_surface(params: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    target_pt = np.array([[params.x, params.y, params.z]])
    return perform_fitting_race(target_pt, params.sharpness_angle)

@app.post("/scout-loop")
async def scout_loop(params: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400)
        
    try:
        import networkx as nx
        target_pt = np.array([[params.x, params.y, params.z]])
        
        ref_mesh = state.mesh
        _, _, ref_face_ids = ref_mesh.nearest.on_surface(target_pt)
        if len(ref_face_ids) == 0: raise HTTPException(status_code=404)
        start_ref_face = ref_face_ids[0]
        ref_components = get_patch_components(ref_mesh, params.sharpness_angle)
        ref_target_region = next((comp for comp in ref_components if start_ref_face in comp), [start_ref_face])
        
        patch_id = f"scout_{min(ref_target_region)}"

        math_mesh = state.cleaned_mesh if state.cleaned_mesh is not None else state.mesh
        _, _, math_face_ids = math_mesh.nearest.on_surface(target_pt)
        if len(math_face_ids) == 0: raise HTTPException(status_code=404)
        start_math_face = math_face_ids[0]
        math_components = get_patch_components(math_mesh, params.sharpness_angle)
        math_target_region = next((comp for comp in math_components if start_math_face in comp), [start_math_face])
        
        faces = math_mesh.faces[math_target_region]
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
            loop_verts = math_mesh.vertices[list(loop)]
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
            
        ordered_points = math_mesh.vertices[ordered_nodes]
        
        return {
            "id": patch_id,
            "type": "planar",
            "points": ordered_points.tolist(),
            "patch_faces": ref_target_region.tolist() 
        }
    except Exception as e:
        raise HTTPException(status_code=500)

@app.post("/undo-geometry")
async def undo_geometry():
    broadcast_log("[System] Undo synchronized with React State.")
    return {"success": True}

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
    if len(pts) < 2: return points
    diffs = np.diff(pts, axis=0)
    diffs = np.vstack([diffs, pts[0] - pts[-1]])
    dists = np.linalg.norm(diffs, axis=1)
    cum_dists = np.insert(np.cumsum(dists), 0, 0)
    total_len = cum_dists[-1]
    if total_len == 0: return points
    target_dists = np.linspace(0, total_len, target_count, endpoint=False)
    resampled = np.zeros((target_count, 3))
    for i in range(3):
        resampled[:, i] = np.interp(target_dists, cum_dists, np.append(pts[:, i], pts[0, i]))
    return resampled.tolist()

# === DYNAMIC CORNER DETECTION ALGORITHM ===
def find_dynamic_corners(pts, threshold_deg=30.0):
    n = len(pts)
    if n < 3: return list(range(n))

    v_in = pts - np.roll(pts, 1, axis=0)
    v_out = np.roll(pts, -1, axis=0) - pts
    
    v_in_norm = np.linalg.norm(v_in, axis=1, keepdims=True) + 1e-9
    v_out_norm = np.linalg.norm(v_out, axis=1, keepdims=True) + 1e-9
    
    v_in_unit = v_in / v_in_norm
    v_out_unit = v_out / v_out_norm
    
    dot = np.sum(v_in_unit * v_out_unit, axis=1)
    angles = np.arccos(np.clip(dot, -1.0, 1.0))
    angles_deg = np.degrees(angles)
    
    window = max(2, n // 20)
    is_peak = np.ones(n, dtype=bool)
    for i in range(n):
        if angles_deg[i] < threshold_deg:
            is_peak[i] = False
            continue
            
        for j in range(-window, window + 1):
            if j == 0: continue
            if angles[i] < angles[(i + j) % n]:
                is_peak[i] = False
                break
                
    corners = np.where(is_peak)[0].tolist()
    
    if len(corners) < 3:
        diffs = np.linalg.norm(pts - np.roll(pts, 1, axis=0), axis=1)
        cum_dists = np.cumsum(diffs)
        total_len = cum_dists[-1]
        
        targets = [0, total_len * 0.25, total_len * 0.5, total_len * 0.75]
        corners = []
        for t in targets:
            idx = np.searchsorted(cum_dists, t)
            corners.append(min(idx, n - 1))
            
    return sorted(corners)

def extract_segment(pts, start_idx, end_idx):
    if start_idx < end_idx:
        return pts[start_idx:end_idx+1]
    else:
        return np.vstack((pts[start_idx:], pts[:end_idx+1]))

def resample_segment(seg_pts, target_count=25):
    if len(seg_pts) < 2: return seg_pts.tolist()
    diffs = np.diff(seg_pts, axis=0)
    dists = np.linalg.norm(diffs, axis=1)
    cum_dists = np.insert(np.cumsum(dists), 0, 0)
    total_len = cum_dists[-1]
    if total_len == 0: return seg_pts.tolist()
    target_dists = np.linspace(0, total_len, target_count)
    resampled = np.zeros((target_count, 3))
    for i in range(3):
        resampled[:, i] = np.interp(target_dists, cum_dists, seg_pts[:, i])
    return resampled.tolist()


@app.post("/patch-split")
async def patch_split(params: PatchSplitParams):
    try:
        import build123d as b3d
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
        from OCP.GeomAbs import GeomAbs_C0
        from OCP.gp import gp_Pnt
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d or OCP missing")

    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")

    broadcast_log(f"[System] Initiating Auto-Patch Split [{params.geo_id}]...")

    try:
        raw_pts = np.array(params.points)
        if len(raw_pts) > 0 and np.linalg.norm(raw_pts[0] - raw_pts[-1]) < 1e-5:
            raw_pts = raw_pts[:-1]

        corners = find_dynamic_corners(raw_pts, params.sharpness_angle)
        broadcast_log(f"[System] Detected {len(corners)} hard corners for splitting.")

        edges = []
        for i in range(len(corners)):
            start_idx = corners[i]
            end_idx = corners[(i + 1) % len(corners)]
            
            pts_count = max(10, 100 // len(corners)) 
            seg_pts = resample_segment(extract_segment(raw_pts, start_idx, end_idx), pts_count)
            edges.append(b3d.Edge.make_spline([b3d.Vector(p) for p in seg_pts]))

        wire = b3d.Wire(edges)

        filler = BRepOffsetAPI_MakeFilling()
        for edge in wire.edges():
            filler.Add(edge.wrapped, GeomAbs_C0)

        if state.mesh is not None:
            np_pts = np.array(params.points)
            centroid = np.mean(np_pts, axis=0)
            distances = np.linalg.norm(state.mesh.vertices - centroid, axis=1)
            closest_idx = np.argsort(distances)[:50]
            internal_pts = state.mesh.vertices[closest_idx]
            for pt in internal_pts:
                filler.Add(gp_Pnt(float(pt[0]), float(pt[1]), float(pt[2])))

        filler.Build()
        
        if not filler.IsDone():
            broadcast_log("[Warning] Complex shrinkwrap failed, falling back to planar wire face.")
            patch_face = b3d.Face(wire)
        else:
            patch_face = b3d.Face(filler.Shape())

        state.rebuild_geometry[params.geo_id] = patch_face

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        
        try:
            from build123d.exporters3d import export_stl
            export_stl(patch_face, path)
            tmesh = trimesh.load(path, file_type='stl')
            vertices = tmesh.vertices.tolist()
            faces_out = tmesh.faces.tolist()
            broadcast_log(f"[Success] Patch Split created. Returning {len(faces_out)} faces.")
            return {"vertices": vertices, "faces": faces_out}
        finally:
            try: os.remove(path)
            except: pass

    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to execute Patch Split: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {err_msg}")


@app.post("/magic-patch")
async def magic_patch(params: MagicPatchParams):
    try:
        import build123d as b3d
        import networkx as nx
        from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
        from OCP.GeomAbs import GeomAbs_C0
        from OCP.gp import gp_Pnt
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d or OCP missing")

    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    broadcast_log(f"[System] Initiating Magic Patch for {len(params.patch_faces)} faces [{params.geo_id}]...")

    try:
        submesh_faces = state.mesh.faces[params.patch_faces]
        edges = trimesh.geometry.faces_to_edges(submesh_faces)
        edges_sorted = np.sort(edges, axis=1)
        unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
        boundary_edges = unique_edges[counts == 1]

        if len(boundary_edges) == 0:
            raise ValueError("No valid boundary found in selection.")

        G = nx.Graph()
        G.add_edges_from(boundary_edges)
        
        try:
            cycle = nx.find_cycle(G)
            ordered_nodes = [u for u, v in cycle]
        except:
            ordered_nodes = list(nx.dfs_preorder_nodes(G))

        raw_pts = state.mesh.vertices[ordered_nodes]
        
        if len(raw_pts) < 3:
            raise ValueError("Boundary loop has too few vertices to patch.")

        corners = find_dynamic_corners(raw_pts, params.sharpness_angle)
        broadcast_log(f"[System] Detected {len(corners)} hard corners for splitting.")

        b3d_edges = []
        for i in range(len(corners)):
            start_idx = corners[i]
            end_idx = corners[(i + 1) % len(corners)]
            
            pts_count = max(10, 100 // len(corners))
            seg_pts = resample_segment(extract_segment(raw_pts, start_idx, end_idx), pts_count)
            b3d_edges.append(b3d.Edge.make_spline([b3d.Vector(p) for p in seg_pts]))
            
        wire = b3d.Wire(b3d_edges)
        
        broadcast_log("[System] Shrinkwrapping NURBS patch to mesh curvature...")
        
        internal_nodes = list(set(np.unique(submesh_faces)) - set(ordered_nodes))
        np.random.shuffle(internal_nodes)
        sample_size = min(len(internal_nodes), 50)
        internal_pts = state.mesh.vertices[internal_nodes[:sample_size]]

        filler = BRepOffsetAPI_MakeFilling()
        for edge in wire.edges():
            filler.Add(edge.wrapped, GeomAbs_C0)
            
        for pt in internal_pts:
            filler.Add(gp_Pnt(float(pt[0]), float(pt[1]), float(pt[2])))
            
        filler.Build()
        
        if not filler.IsDone():
            broadcast_log("[Warning] Complex shrinkwrap failed, falling back to planar wire face.")
            patch_face = b3d.Face(wire)
        else:
            patch_face = b3d.Face(filler.Shape())

        state.rebuild_geometry[params.geo_id] = patch_face

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        
        try:
            from build123d.exporters3d import export_stl
            export_stl(patch_face, path)
            tmesh = trimesh.load(path, file_type='stl')
            vertices = tmesh.vertices.tolist()
            faces_out = tmesh.faces.tolist()
            broadcast_log(f"[Success] Magic Patch created. Returning {len(faces_out)} faces.")
            return {"vertices": vertices, "faces": faces_out}
        finally:
            try: os.remove(path)
            except: pass

    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to execute Magic Patch: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {err_msg}")


@app.post("/create-patch")
async def create_patch(params: CreatePatchParams):
    try:
        import build123d as b3d
        from OCP.GeomAbs import GeomAbs_C0
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing PATCH-FROM-WIRES to Stack [{params.geo_id}]...")
    
    if not params.loops:
        raise ValueError("Creating a patch requires at least 1 loop.")

    try:
        processed_loop = []
        for loop in params.loops:
            processed_loop.extend(loop.get('points', []))
        
        pts = [b3d.Vector(p) for p in processed_loop]
        
        if len(pts) > 0 and (pts[0] - pts[-1]).length > 1e-5:
            pts.append(pts[0])
            
        wire = b3d.Wire.make_polygon(pts)
        patch_face = None
        
        try:
            patch_face = b3d.Face.make_from_wires(wire)
        except Exception:
            pass
            
        if patch_face is None or state.mesh is not None:
            broadcast_log("[System] Shrinkwrapping face to mesh curvature...")
            try:
                from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
                filler = BRepOffsetAPI_MakeFilling()
                
                for edge in wire.edges():
                    filler.Add(edge.wrapped, GeomAbs_C0)
                    
                filler.Build()
                if filler.IsDone():
                    patch_face = b3d.Face(filler.Shape())
            except Exception as e:
                broadcast_log(f"[Warning] Advanced shrinkwrap filling fallback: {e}")

        if patch_face is None:
            raise ValueError("Could not generate a valid B-Rep face from the provided wires.")

        state.rebuild_geometry[params.geo_id] = patch_face

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        
        try:
            from build123d.exporters3d import export_stl
            export_stl(patch_face, path)
                
            tmesh = trimesh.load(path, file_type='stl')
            vertices = tmesh.vertices.tolist()
            faces_out = tmesh.faces.tolist()
            
            broadcast_log(f"[Success] B-Rep Surface Patch created. Returning {len(faces_out)} faces.")
            return {"vertices": vertices, "faces": faces_out}
        finally:
            try: os.remove(path)
            except: pass

    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to build Surface Patch: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {err_msg}")

@app.post("/create-primitive")
async def create_primitive(params: CreatePrimitiveParams):
    try:
        import build123d as b3d
        import scipy.optimize
        import networkx as nx
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing {params.primitive_type.upper()} primitive to Stack [{params.geo_id}]...")
    
    math_mesh = state.cleaned_mesh if state.cleaned_mesh is not None else state.mesh
    if not math_mesh:
        raise HTTPException(status_code=400, detail="No mesh loaded.")

    try:
        patch_faces = params.patch_faces
        ref_mesh = state.mesh
        ref_verts = ref_mesh.vertices[np.unique(ref_mesh.faces[patch_faces])]
        target_pt = np.mean(ref_verts, axis=0).reshape(1, 3)
        
        _, _, math_face_ids = math_mesh.nearest.on_surface(target_pt)
        start_math_face = math_face_ids[0]
        math_components = get_patch_components(math_mesh, params.sharpness_angle)
        math_target_region = next((comp for comp in math_components if start_math_face in comp), [start_math_face])
        
        patch_verts_idx = np.unique(math_mesh.faces[math_target_region])
        pts = math_mesh.vertices[patch_verts_idx]
        
        solid = None
        
        if params.primitive_type == 'cylinder':
            region_normals = math_mesh.face_normals[math_target_region]
            cov_normals = np.cov(region_normals.T)
            evals, evecs = np.linalg.eigh(cov_normals)
            axis = evecs[:, 0]
            
            if np.abs(axis[0]) < 0.9: u = np.cross(axis, [1, 0, 0])
            else: u = np.cross(axis, [0, 1, 0])
            u = u / np.linalg.norm(u)
            v = np.cross(axis, u)
            
            centroid = np.mean(pts, axis=0)
            p2d = np.column_stack((np.dot(pts - centroid, u), np.dot(pts - centroid, v)))
            def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
            def cyl_obj(c): Ri = calc_R(c); return Ri - Ri.mean()
            
            c2d_guess = np.mean(p2d, axis=0)
            res_cyl = scipy.optimize.least_squares(cyl_obj, c2d_guess)
            center_2d = res_cyl.x
            radius = float(np.mean(calc_R(center_2d)))
            
            center_3d = centroid + center_2d[0]*u + center_2d[1]*v
            h_vals = np.dot(pts - center_3d, axis)
            h_min, h_max = np.min(h_vals), np.max(h_vals)
            height = float(h_max - h_min)
            
            midpoint = center_3d + axis * (h_max + h_min) / 2.0
            loc = b3d.Plane(origin=b3d.Vector(midpoint), z_dir=b3d.Vector(axis)).location
            solid = loc * b3d.Cylinder(radius=radius, height=height)

        elif params.primitive_type == 'sphere':
            centroid = np.mean(pts, axis=0)
            def sphere_obj(c):
                r = np.linalg.norm(pts - c, axis=1)
                return r - np.mean(r)
            res_sph = scipy.optimize.least_squares(sphere_obj, centroid)
            r_sph = float(np.mean(np.linalg.norm(pts - res_sph.x, axis=1)))
            loc = b3d.Location(b3d.Vector(res_sph.x))
            solid = loc * b3d.Sphere(radius=r_sph)

        elif params.primitive_type == 'cone':
            def cone_obj(c):
                apex, axis, theta = c[0:3], c[3:6], c[6]
                axis_norm = np.linalg.norm(axis)
                if axis_norm < 1e-5: return np.ones(len(pts))*999
                axis = axis / axis_norm
                vec = pts - apex
                h = np.dot(vec, axis)
                r_vec = np.linalg.norm(np.cross(vec, axis), axis=1)
                return r_vec * np.cos(theta) - h * np.sin(theta)
                
            centroid = np.mean(pts, axis=0)
            _, _, vh = np.linalg.svd(pts - centroid)
            normal = vh[2, :]
            apex_guess = centroid + normal * np.ptp(pts)
            try:
                res_cone = scipy.optimize.least_squares(cone_obj, [*apex_guess, *normal, np.pi/4])
                apex, axis, theta = res_cone.x[0:3], res_cone.x[3:6], res_cone.x[6]
                axis = axis / np.linalg.norm(axis)
                theta = abs(theta)
                
                h_vals = np.dot(pts - apex, axis)
                h_min, h_max = min(h_vals), max(h_vals)
                
                h_cone = max(abs(h_min), abs(h_max))
                r_base = h_cone * np.tan(theta)
                
                base_center = apex - axis * h_cone
                loc = b3d.Plane(origin=b3d.Vector(base_center), z_dir=b3d.Vector(axis)).location
                solid = loc * b3d.Cone(bottom_radius=abs(r_base), top_radius=0, height=h_cone)
            except Exception as e:
                raise ValueError(f"Cone fitting failed: {e}")

        elif params.primitive_type == 'torus':
            def torus_obj(c):
                center, axis, R, r_min = c[0:3], c[3:6], c[6], c[7]
                axis_norm = np.linalg.norm(axis)
                if axis_norm < 1e-5: return np.ones(len(pts))*999
                axis = axis / axis_norm
                vec = pts - center
                z = np.dot(vec, axis)
                d_xy = np.linalg.norm(vec - np.outer(z, axis), axis=1)
                return np.sqrt((d_xy - R)**2 + z**2) - r_min

            centroid = np.mean(pts, axis=0)
            _, _, vh = np.linalg.svd(pts - centroid)
            normal = vh[2, :]
            try:
                res_torus = scipy.optimize.least_squares(torus_obj, [*centroid, *normal, np.ptp(pts)/2, np.ptp(pts)/10])
                center, axis, R, r_min = res_torus.x[0:3], res_torus.x[3:6], res_torus.x[6], res_torus.x[7]
                axis = axis / np.linalg.norm(axis)
                
                loc = b3d.Plane(origin=b3d.Vector(center), z_dir=b3d.Vector(axis)).location
                solid = loc * b3d.Torus(major_radius=abs(R), minor_radius=abs(r_min))
            except Exception as e:
                raise ValueError(f"Torus fitting failed: {e}")

        elif params.primitive_type == 'plane' or params.primitive_type == 'planar':
            faces = math_mesh.faces[math_target_region]
            edges = trimesh.geometry.faces_to_edges(faces)
            edges_sorted = np.sort(edges, axis=1)
            unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
            boundary_edges = unique_edges[counts == 1]
            
            G = nx.Graph()
            G.add_edges_from(boundary_edges)
            loops = list(nx.connected_components(G))
            best_loop = max(loops, key=len)
            subgraph = G.subgraph(best_loop)
            try:
                cycle = nx.find_cycle(subgraph)
                ordered_nodes = [u for u, v in cycle]
            except:
                ordered_nodes = list(nx.dfs_preorder_nodes(subgraph))
                
            ordered_points = math_mesh.vertices[ordered_nodes]
            processed_loop = apply_pca_firewall(ordered_points)
            
            pts_vec = [b3d.Vector(p) for p in processed_loop]
            if (pts_vec[0] - pts_vec[-1]).length > 1e-5:
                pts_vec.append(pts_vec[0])
            
            if params.extrude_depth < 0:
                pts_vec.reverse()
                
            wire = b3d.Wire.make_polygon(pts_vec)
            solid = b3d.Face(wire)

            if params.extrude_depth != 0.0:
                solid = b3d.extrude(solid, amount=abs(params.extrude_depth))
        
        else:
            raise ValueError(f"Unknown primitive type: {params.primitive_type}")

        state.rebuild_geometry[params.geo_id] = solid

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            from build123d.exporters3d import export_stl
            export_stl(solid, path)
            tmesh = trimesh.load(path, file_type='stl')
            broadcast_log(f"[Success] Primitive generated. Returning {len(tmesh.faces)} faces.")
            return {"vertices": tmesh.vertices.tolist(), "faces": tmesh.faces.tolist()}
        finally:
            try: os.remove(path)
            except: pass
            
    except Exception as e:
        err_msg = str(e)
        broadcast_log(f"[Error] Failed to build Primitive: {err_msg}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {err_msg}")

@app.post("/create-sheet")
async def create_sheet(params: CommitGeometryParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing SURFACE SHEET [{params.geo_id}]...")
    
    if not params.loops or len(params.loops) != 1:
        raise ValueError("Creating a sheet requires exactly 1 loop.")

    try:
        processed_loop = params.loops[0]['points']
        
        if params.loops[0].get('type') in ['planar', 'plane']:
            processed_loop = apply_pca_firewall(processed_loop)
            broadcast_log("[System] Planar Firewall Applied: Flattening loop.")
        
        pts = [b3d.Vector(p) for p in processed_loop]
        if (pts[0] - pts[-1]).length > 1e-5:
            pts.append(pts[0])
            
        wire = b3d.Wire.make_polygon(pts)
        sheet_face = b3d.Face(wire)

        state.rebuild_geometry[params.geo_id] = sheet_face

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

    broadcast_log(f"[System] Committing {params.operation.upper()} [{params.geo_id}]...")
    try:
        if not params.loops:
            raise ValueError("No loops provided.")

        processed_loops = []
        for loop_data in params.loops:
            if loop_data.get('type') in ['planar', 'plane']:
                processed_loops.append(apply_pca_firewall(loop_data['points']))
                broadcast_log("[System] Planar Firewall Applied: Flattening planar loop.")
            else:
                processed_loops.append(loop_data.get('points', []))

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
            
            if params.operation == 'extrude' and params.extrude_depth < 0:
                pts.reverse()
                
            wire = b3d.Wire.make_polygon(pts)
            faces.append(b3d.Face(wire))

        solid = None
        
        try:
            if params.operation == 'extrude' and len(faces) == 1:
                solid = b3d.extrude(faces[0], amount=abs(params.extrude_depth))
            elif params.operation == 'loft' and len(faces) == 2:
                solid = b3d.loft(faces)
            else:
                raise ValueError("Invalid operation or loop count.")
        except Exception as b3d_err:
            err_str = str(b3d_err)
            if "not done" in err_str.lower() or "brep_api" in err_str.lower():
                raise ValueError("Loft failed: The resulting geometry would self-intersect. Try simplifying your loops.")
            raise b3d_err

        state.rebuild_geometry[params.geo_id] = solid

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

@app.post("/sew-surfaces")
async def sew_surfaces(params: SewParams):
    try:
        import build123d as b3d
        from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Sewing {len(params.target_ids)} surfaces...")
    try:
        shapes = []
        for tid in params.target_ids:
            s = state.rebuild_geometry.get(tid)
            if s is not None:
                shapes.append(s)
        
        if len(shapes) < 2:
            raise ValueError("Not enough valid surfaces found to sew.")

        sewer = BRepBuilderAPI_Sewing()
        sewer.SetTolerance(1e-2) 
        for shape in shapes:
            if isinstance(shape, b3d.Solid):
                for f in shape.faces(): sewer.Add(f.wrapped)
            elif isinstance(shape, b3d.Shell):
                sewer.Add(shape.wrapped)
            elif isinstance(shape, b3d.Face):
                sewer.Add(shape.wrapped)
            else:
                sewer.Add(shape.wrapped)

        sewer.Perform()
        sewed_shape = sewer.SewedShape()
        sewed_b3d = b3d.Shape.cast(sewed_shape)
        
        is_solid = False
        final_solid = None

        if isinstance(sewed_b3d, b3d.Shell):
            if sewed_b3d.is_closed:
                final_solid = b3d.Solid.make_solid(sewed_b3d)
                is_solid = True
            else:
                final_solid = sewed_b3d
        elif isinstance(sewed_b3d, b3d.Compound):
            solids = sewed_b3d.solids()
            if solids:
                final_solid = solids[0]
                is_solid = True
            else:
                shells = sewed_b3d.shells()
                if shells and shells[0].is_closed:
                    final_solid = b3d.Solid.make_solid(shells[0])
                    is_solid = True
                else:
                    final_solid = sewed_b3d
        else:
            final_solid = sewed_b3d

        if is_solid:
            broadcast_log("[Success] Surfaces sewed into a Watertight Solid!")
        else:
            broadcast_log("[Warning] Surfaces sewed into a Shell, but it is NOT watertight (has holes). Try patching remaining gaps.")

        state.rebuild_geometry[params.geo_id] = final_solid

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            from build123d.exporters3d import export_stl
            export_stl(final_solid, path)
            tmesh = trimesh.load(path, file_type='stl')
            return {
                "vertices": tmesh.vertices.tolist(), 
                "faces": tmesh.faces.tolist(),
                "is_solid": is_solid
            }
        finally:
            try: os.remove(path)
            except: pass

    except Exception as e:
        broadcast_log(f"[Error] Failed to sew surfaces: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {str(e)}")

@app.post("/transform-geometry")
async def transform_geometry(params: TransformParams):
    import build123d as b3d
    from math import degrees
    try:
        solid = state.rebuild_geometry.get(params.target_id)
        if solid is None:
            raise ValueError("Target geometry is missing or corrupted in backend dictionary.")

        pivot = (params.px, params.py, params.pz)
        
        if params.dx != 0 or params.dy != 0 or params.dz != 0:
            solid = solid.translate((params.dx, params.dy, params.dz))

        if params.rx != 0: 
            solid = solid.rotate(b3d.Axis(pivot, (1,0,0)), degrees(params.rx))
        if params.ry != 0: 
            solid = solid.rotate(b3d.Axis(pivot, (0,1,0)), degrees(params.ry))
        if params.rz != 0: 
            solid = solid.rotate(b3d.Axis(pivot, (0,0,1)), degrees(params.rz))

        if params.sx != 1.0 or params.sy != 1.0 or params.sz != 1.0:
            solid = solid.translate((-params.px, -params.py, -params.pz))
            try:
                solid = solid.scale((params.sx, params.sy, params.sz))
            except Exception as e:
                broadcast_log(f"[Warning] Engine rejected non-uniform scaling on this shape type: {e}")
            solid = solid.translate((params.px, params.py, params.pz))
            
        state.rebuild_geometry[params.target_id] = solid
        
        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            from build123d.exporters3d import export_stl
            export_stl(solid, path)
            tmesh = trimesh.load(path, file_type='stl')
            return {"vertices": tmesh.vertices.tolist(), "faces": tmesh.faces.tolist()}
        finally:
            try: os.remove(path)
            except: pass
    except Exception as e:
        broadcast_log(f"[Error] Transform failed: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/boolean-op")
async def boolean_op(params: BooleanOpParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing BOOLEAN {params.operation.upper()} to Stack...")
    try:
        target_solid = state.rebuild_geometry.get(params.target_id)
        tool_solid = state.rebuild_geometry.get(params.tool_id)

        if target_solid is None or tool_solid is None:
            raise ValueError("One of the selected objects is empty or was previously deleted.")
        
        if params.operation == 'subtract':
            try:
                result_solid = target_solid - tool_solid
            except Exception:
                from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
                cut_algo = BRepAlgoAPI_Cut(target_solid.wrapped, tool_solid.wrapped)
                cut_algo.Build()
                result_solid = b3d.Shape.cast(cut_algo.Shape())
        else:
            raise ValueError("Unsupported boolean operation.")
        
        state.rebuild_geometry[params.geo_id] = result_solid

        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            from build123d.exporters3d import export_stl
            export_stl(result_solid, path)
            tmesh = trimesh.load(path, file_type='stl')
            broadcast_log(f"[Success] Boolean Op created. Returning {len(tmesh.faces)} faces.")
            return {"vertices": tmesh.vertices.tolist(), "faces": tmesh.faces.tolist()}
        finally:
            try: os.remove(path)
            except: pass
            
    except Exception as e:
        broadcast_log(f"[Error] Failed Boolean operation: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Geometry Error: {str(e)}")

@app.post("/boolean-cut")
async def boolean_cut(params: BooleanCutParams):
    try:
        import build123d as b3d
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing BOOLEAN CUT to Stack...")
    try:
        if not params.loops:
            raise ValueError("Requires 1 loop.")

        processed_loop = params.loops[0]['points']
        if params.loops[0].get('type') in ['planar', 'plane']:
            processed_loop = apply_pca_firewall(processed_loop)
            broadcast_log("[System] Planar Firewall Applied: Flattening loop.")
        
        pts = [b3d.Vector(p) for p in processed_loop]
        if (pts[0] - pts[-1]).length > 1e-5:
            pts.append(pts[0])
            
        if params.extrude_depth < 0:
            pts.reverse()
            
        wire = b3d.Wire.make_polygon(pts)
        face = b3d.Face(wire)
        
        tool_extrusion = b3d.extrude(face, amount=abs(params.extrude_depth))
        target_solid = state.rebuild_geometry.get(params.target_id)
        
        if target_solid is None:
             raise ValueError("Target geometry is missing or corrupted in dictionary.")

        try:
            result_solid = target_solid - tool_extrusion
        except Exception:
            from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
            cut_algo = BRepAlgoAPI_Cut(target_solid.wrapped, tool_extrusion.wrapped)
            cut_algo.Build()
            result_solid = b3d.Shape.cast(cut_algo.Shape())
        
        state.rebuild_geometry[params.geo_id] = result_solid

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

    target_pt = np.array([[params.x, params.y, params.z]])
    
    # 1. Visuals
    ref_mesh = state.mesh
    _, _, ref_face_ids = ref_mesh.nearest.on_surface(target_pt)
    if len(ref_face_ids) == 0:
        raise HTTPException(status_code=404, detail="Could not snap to a face.")
    start_ref_face = ref_face_ids[0]
    ref_components = get_patch_components(ref_mesh, params.sharpness_angle)
    ref_target_region = next((comp for comp in ref_components if start_ref_face in comp), [start_ref_face])
    
    wire_id = f"wire_{uuid.uuid4().hex[:8]}"

    # 2. Math
    math_mesh = state.cleaned_mesh if state.cleaned_mesh is not None else state.mesh
    _, _, math_face_ids = math_mesh.nearest.on_surface(target_pt)
    start_math_face = math_face_ids[0]
    math_components = get_patch_components(math_mesh, params.sharpness_angle)
    math_target_region = next((comp for comp in math_components if start_math_face in comp), [start_math_face])
    
    region_normals = math_mesh.face_normals[math_target_region]
    region_normal = np.mean(region_normals, axis=0)
    
    variance = np.var(region_normals, axis=0).sum()
    is_planar = variance < 1e-2

    faces = math_mesh.faces[math_target_region]
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
        loop_verts = math_mesh.vertices[list(loop)]
        dist = np.min(np.linalg.norm(loop_verts - target_pt, axis=1))
        if dist < min_dist:
            min_dist = dist
            best_loop_nodes = list(loop)
            best_subgraph = G.subgraph(loop)

    is_circle = False
    if not is_planar:
        loop_points = math_mesh.vertices[best_loop_nodes]
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
                        "normal": normal.tolist(),
                        "patch_faces": ref_target_region.tolist(),
                        "id": wire_id
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
                
            ordered_points = math_mesh.vertices[ordered_nodes]
            return {
                "type": "planar",
                "points": ordered_points.tolist(),
                "normal": region_normal.tolist(),
                "patch_faces": ref_target_region.tolist(),
                "id": wire_id
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
                            "normal": normal.tolist(),
                            "patch_faces": comp.tolist(),
                            "id": f"wire_{uuid.uuid4().hex[:8]}"
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
                        "normal": region_normal.tolist(),
                        "patch_faces": comp.tolist(),
                        "id": f"wire_{uuid.uuid4().hex[:8]}"
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
    
    # 1. Fetch only the exact IDs that React deems currently active
    active_ids = payload.get("active_geo_ids", [])
    for gid in active_ids:
        shape = state.rebuild_geometry.get(gid)
        if shape is not None:
            shapes.append(shape)
        
    # 2. Process CoACD Hulls
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
            
    # 3. Process Extracted Sketched Features
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

    # 4. Symmetry Logic across all collected shapes
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
        
    # 5. Native build123d robust export
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