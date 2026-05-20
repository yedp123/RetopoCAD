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
    rebuild_geometry = {} 
    master_skeleton = None
    patch_loops = []

state = AppState()

class BuildSkeletonParams(BaseModel):
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class RefineSkeletonParams(BaseModel):
    circle_tolerance: float = 0.05
    line_tolerance: float = 0.05

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
    edge_smoothing: float = 0.5

class FeatureParams(BaseModel):
    x: float
    y: float
    z: float
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class ClassifyParams(BaseModel):
    x: float
    y: float
    z: float
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class AutoExtractParams(BaseModel):
    min_size: float
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class BatchMagicPatchParams(BaseModel):
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class HullParams(BaseModel):
    max_hulls: int
    detail_level: float
    decimation_target: int
    skip_decimation: bool = False
    edge_smoothing: float = 0.5

class CommitGeometryParams(BaseModel):
    geo_id: str
    operation: str
    loops: list
    extrude_depth: float = 2.0
    edge_smoothing: float = 0.5

class BooleanCutParams(BaseModel):
    geo_id: str
    loops: list
    extrude_depth: float
    target_id: str
    edge_smoothing: float = 0.5

class BooleanOpParams(BaseModel):
    geo_id: str
    target_id: str
    tool_id: str
    keep_tool: bool = False
    operation: str = 'subtract'
    edge_smoothing: float = 0.5

class CreatePrimitiveParams(BaseModel):
    geo_id: str
    patch_faces: list
    primitive_type: str
    sharpness_angle: float = 30.0
    symmetry: dict = None
    extrude_depth: float = 0.0
    edge_smoothing: float = 0.5

class CreatePatchParams(BaseModel):
    geo_id: str
    loops: list
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class MagicPatchParams(BaseModel):
    geo_id: str
    patch_faces: list
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

class PatchSplitParams(BaseModel):
    geo_id: str
    points: list
    sharpness_angle: float = 30.0
    edge_smoothing: float = 0.5

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
    edge_smoothing: float = 0.5

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
    """
    Extract patch components using multi-angle consensus voting,
    with a normal-clustering fallback for nearly-coplanar surfaces.
    
    Phase 1: Standard dihedral angle detection with consensus voting.
    Phase 2: For each large component, check if face normals cluster into
             distinct groups. If so, split the component by re-running
             connected components on only the faces within each cluster.
    """
    if mesh is None: return []
    
    adjacency = mesh.face_adjacency
    angles = mesh.face_adjacency_angles
    n_edges = len(angles)
    
    if n_edges == 0:
        return [np.arange(len(mesh.faces))]
    
    # User's angle IS the center — no Otsu override
    center_angle = sharpness_angle_deg
    
    # Narrow band: ±10% of the angle, minimum ±1.5°, maximum ±5°
    band = float(np.clip(center_angle * 0.10, 1.5, 5.0))
    test_angles_deg = [
        center_angle - band,
        center_angle - band / 2,
        center_angle,
        center_angle + band / 2,
        center_angle + band,
    ]
    test_angles_deg = [max(1.0, a) for a in test_angles_deg]
    
    # Multi-angle consensus: count how many thresholds classify each edge as "sharp"
    edge_sharp_votes = np.zeros(n_edges, dtype=int)
    for test_deg in test_angles_deg:
        test_rad = np.radians(test_deg)
        edge_sharp_votes += (angles >= test_rad).astype(int)
    
    # An edge is "robustly smooth" only if it's smooth in majority (sharp < 3 of 5)
    robust_smooth = edge_sharp_votes < 3
    
    smooth_edges = adjacency[robust_smooth]
    initial_components = list(trimesh.graph.connected_components(edges=smooth_edges, nodes=np.arange(len(mesh.faces))))
    
    # =====================================================================
    # Phase 2: Normal-clustering fallback for nearly-coplanar surfaces
    # If a component has ≥10 faces and its normals have high variance,
    # try splitting it using spectral gap analysis on face normals.
    # =====================================================================
    MIN_COMPONENT_SIZE = 10  # Don't bother splitting tiny components
    NORMAL_VARIANCE_THRESHOLD = 0.01  # Minimum variance to trigger splitting
    
    final_components = []
    for comp in initial_components:
        if len(comp) < MIN_COMPONENT_SIZE:
            final_components.append(comp)
            continue
        
        # Check if face normals in this component have enough variance to warrant splitting
        comp_normals = mesh.face_normals[comp]
        normal_variance = np.var(comp_normals, axis=0).sum()
        
        if normal_variance < NORMAL_VARIANCE_THRESHOLD:
            final_components.append(comp)
            continue
        
        # Try to find the optimal number of clusters using the spectral gap
        # We use PCA eigenvalues of the normals to determine if there are distinct groups
        try:
            from sklearn.cluster import KMeans
            
            centered = comp_normals - np.mean(comp_normals, axis=0)
            _, s, _ = np.linalg.svd(centered, full_matrices=False)
            
            # If the top 2 singular values are both significant, normals span 2+ directions
            if len(s) >= 2 and s[1] / (s[0] + 1e-9) > 0.15:
                # Try k=2 first, then k=3 if needed
                best_k = 2
                best_score = -1
                
                for k in [2, 3]:
                    if k > len(comp) // 3:
                        continue
                    km = KMeans(n_clusters=k, random_state=42, n_init=5, max_iter=50)
                    labels = km.fit_predict(comp_normals)
                    
                    # Check cluster quality: each cluster should be internally coherent
                    cluster_variances = []
                    for ci in range(k):
                        mask = labels == ci
                        if np.sum(mask) < 3:
                            continue
                        cluster_var = np.var(comp_normals[mask], axis=0).sum()
                        cluster_variances.append(cluster_var)
                    
                    if len(cluster_variances) == k:
                        # Score = ratio of (between-cluster variance) / (within-cluster variance)
                        within = np.mean(cluster_variances)
                        total = normal_variance
                        between = total - within
                        score = between / (within + 1e-9)
                        
                        # Only accept the split if the between/within ratio is high
                        if score > best_score and score > 2.0:
                            best_score = score
                            best_k = k
                
                if best_score > 2.0:
                    # Perform the winning split
                    km = KMeans(n_clusters=best_k, random_state=42, n_init=5, max_iter=50)
                    labels = km.fit_predict(comp_normals)
                    
                    # For each cluster, extract the sub-component using graph connectivity
                    comp_array = np.array(comp)
                    for ci in range(best_k):
                        cluster_faces = comp_array[labels == ci]
                        if len(cluster_faces) == 0:
                            continue
                        
                        # Build adjacency within this cluster only
                        cluster_face_set = set(cluster_faces.tolist())
                        cluster_smooth = []
                        for i in range(len(adjacency)):
                            f0, f1 = adjacency[i]
                            if f0 in cluster_face_set and f1 in cluster_face_set and robust_smooth[i]:
                                cluster_smooth.append([f0, f1])
                        
                        if len(cluster_smooth) > 0:
                            sub_components = list(trimesh.graph.connected_components(
                                edges=np.array(cluster_smooth), 
                                nodes=cluster_faces
                            ))
                            final_components.extend(sub_components)
                        else:
                            # No smooth edges within cluster — each face is its own component
                            final_components.append(cluster_faces)
                else:
                    final_components.append(comp)
            else:
                final_components.append(comp)
        except ImportError:
            # sklearn not available, skip clustering fallback
            final_components.append(comp)
        except Exception:
            # Any clustering failure — just keep the original component
            final_components.append(comp)
    
    return final_components


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

def find_dynamic_corners(pts, threshold_deg=30.0):
    n = len(pts)
    if n < 3: return list(range(n))

    corners = set()
    # Multi-pass lookahead to catch both single-vertex sharps and slightly rounded/dense corners
    for step in [1, 3, max(5, n // 20)]:
        if step >= n // 2: continue
        
        v_in = pts - np.roll(pts, step, axis=0)
        v_out = np.roll(pts, -step, axis=0) - pts
        
        v_in_norm = np.linalg.norm(v_in, axis=1, keepdims=True) + 1e-9
        v_out_norm = np.linalg.norm(v_out, axis=1, keepdims=True) + 1e-9
        
        v_in_unit = v_in / v_in_norm
        v_out_unit = v_out / v_out_norm
        
        dot = np.sum(v_in_unit * v_out_unit, axis=1)
        angles_deg = np.degrees(np.arccos(np.clip(dot, -1.0, 1.0)))
        
        window = step * 2
        for i in range(n):
            if angles_deg[i] >= threshold_deg:
                # Check if it's the sharpest point in its local neighborhood
                is_max = True
                for j in range(-window, window + 1):
                    if j == 0: continue
                    idx = (i + j) % n
                    if angles_deg[idx] > angles_deg[i]:
                        is_max = False
                        break
                if is_max:
                    corners.add(i)

    corners = sorted(list(corners))
    
    # Distance-based merging so we don't get clustered points on a single curve
    if len(corners) > 1:
        merged = [corners[0]]
        min_dist = max(3, n // 50)
        for c in corners[1:]:
            if c - merged[-1] >= min_dist:
                merged.append(c)
        # Wrap-around check
        if len(merged) > 1 and (n - merged[-1] + merged[0]) < min_dist:
            merged.pop()
        corners = merged

    # Invincible fallback: cut into 4 quadrants if we somehow found 0 corners
    if len(corners) < 3:
        diffs = np.linalg.norm(pts - np.roll(pts, 1, axis=0), axis=1)
        cum_dists = np.cumsum(diffs)
        total_len = cum_dists[-1]
        
        targets = [0, total_len * 0.25, total_len * 0.5, total_len * 0.75]
        corners = []
        for t in targets:
            idx = np.searchsorted(cum_dists, t)
            corners.append(min(idx, n - 1))
        corners = sorted(list(set(corners)))
        
    return corners

def extract_segment(pts, start_idx, end_idx):
    if start_idx < end_idx:
        return pts[start_idx:end_idx+1]
    else:
        return np.vstack((pts[start_idx:], pts[:end_idx+1]))

def create_tension_edge(pts, force_start, force_end, tension=0.5):
    import build123d as b3d
    import numpy as np
    
    start_v = b3d.Vector(force_start)
    end_v = b3d.Vector(force_end)
    
    if len(pts) <= 2:
        return b3d.Edge.make_line(start_v, end_v)
        
    line_vec = force_end - force_start
    line_len = np.linalg.norm(line_vec)
    
    if line_len < 1e-4:
        return None
        
    target_count = int(len(pts) * (1.0 - tension))
    target_count = max(4, min(target_count, len(pts)))
    
    indices = np.linspace(0, len(pts) - 1, target_count, dtype=int)
    
    clean_pts = [start_v]
    for idx in indices[1:-1]:
        v = b3d.Vector(pts[idx])
        if (v - clean_pts[-1]).length > 1e-2 and (v - end_v).length > 1e-2:
            clean_pts.append(v)
    clean_pts.append(end_v)
    
    try:
        if len(clean_pts) > 2:
            return b3d.Edge.make_spline(clean_pts)
        else:
            return b3d.Edge.make_line(start_v, end_v)
    except:
        return b3d.Edge.make_line(start_v, end_v)

@app.post("/magic-patch")
async def magic_patch(params: MagicPatchParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    import build123d as b3d
    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
    from OCP.GeomAbs import GeomAbs_C0
    from scipy.spatial import ConvexHull
    
    broadcast_log(f"[System] Committing MAGIC PATCH to Stack...")
    
    # 1. Get exact faces and boundary
    faces = state.mesh.faces[params.patch_faces]
    edges = trimesh.geometry.faces_to_edges(faces)
    edges_sorted = np.sort(edges, axis=1)
    unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
    boundary_edges = unique_edges[counts == 1]
    
    if len(boundary_edges) == 0:
        raise ValueError("No open boundaries found in selected patch.")
        
    import networkx as nx
    G = nx.Graph()
    G.add_edges_from(boundary_edges)
    largest_cc = max(nx.connected_components(G), key=len)
    subgraph = G.subgraph(largest_cc)
    try:
        cycle = nx.find_cycle(subgraph)
        ordered_nodes = [u for u, v in cycle]
    except:
        ordered_nodes = list(nx.dfs_preorder_nodes(subgraph))
        
    raw_pts = state.mesh.vertices[ordered_nodes]
    
    # 2. Find Corners
    corners = find_dynamic_corners(raw_pts, params.sharpness_angle)
    if len(corners) < 3:
        diffs = np.linalg.norm(raw_pts - np.roll(raw_pts, 1, axis=0), axis=1)
        cum_dists = np.cumsum(diffs)
        total_len = cum_dists[-1]
        targets = [0, total_len * 0.25, total_len * 0.5, total_len * 0.75]
        corners = []
        for t in targets:
            idx = np.searchsorted(cum_dists, t)
            corners.append(min(idx, len(raw_pts) - 1))
        corners = sorted(list(set(corners)))
        if len(corners) < 3:
            corners = [0, len(raw_pts)//3, 2*len(raw_pts)//3]
            
    corner_pts = [raw_pts[c] for c in corners]
    cycle_edges = []
    clamped_tension = max(0.01, params.edge_smoothing / 100.0 if params.edge_smoothing > 1 else params.edge_smoothing)

    for i in range(len(corners)):
        start_idx = corners[i]
        end_idx = corners[(i + 1) % len(corners)]
        seg_pts = extract_segment(raw_pts, start_idx, end_idx)
        pA = corner_pts[i]
        pB = corner_pts[(i+1)%len(corners)]
        new_edge = create_tension_edge(seg_pts, pA, pB, tension=clamped_tension)
        if new_edge:
            cycle_edges.append(new_edge)
            
    # 3. Generate Face
    face = None
    
    if len(cycle_edges) in [2, 3, 4]:
        try: 
            f = b3d.Face.make_surface_from_curves(cycle_edges)
            if f.is_valid: face = f
        except: pass
        
    if face is None:
        try:
            filler = BRepOffsetAPI_MakeFilling()
            for edge in cycle_edges: filler.Add(edge.wrapped, GeomAbs_C0)
            filler.Build()
            if filler.IsDone(): 
                f = b3d.Face(filler.Shape())
                if f.is_valid: face = f
        except: pass
        
    if face is None:
        try:
            flat_pts = np.array(apply_pca_firewall(corner_pts))
            centroid_flat = np.mean(flat_pts, axis=0)
            flat_pts += np.random.normal(0, 1e-6, flat_pts.shape)
            _, _, vh = np.linalg.svd(flat_pts - centroid_flat)
            u_vec = vh[0, :]
            v_vec = vh[1, :]
            p2d = np.column_stack((np.dot(flat_pts - centroid_flat, u_vec), np.dot(flat_pts - centroid_flat, v_vec)))
            hull = ConvexHull(p2d)
            hull_pts_3d = [centroid_flat + p2d[idx][0] * u_vec + p2d[idx][1] * v_vec for idx in hull.vertices]
            poly_pts = [b3d.Vector(p) for p in hull_pts_3d]
            if (poly_pts[0] - poly_pts[-1]).length > 1e-4:
                poly_pts.append(poly_pts[0])
            f = b3d.Face(b3d.Wire.make_polygon(poly_pts))
            if f.is_valid: face = f
        except: pass
        
    if face is None:
        raise ValueError("CAD engine rejected the boundary curves. Try reducing edge smoothing.")
        
    state.rebuild_geometry[params.geo_id] = face
    
    fd, path = tempfile.mkstemp(suffix=".stl")
    os.close(fd)
    try:
        from build123d.exporters3d import export_stl
        export_stl(face, path)
        tmesh = trimesh.load(path, file_type='stl')
        broadcast_log(f"[Success] Magic Patch created. Returning {len(tmesh.faces)} faces.")
        return {"vertices": tmesh.vertices.tolist(), "faces": tmesh.faces.tolist()}
    finally:
        try: os.remove(path)
        except: pass

@app.post("/batch-magic-patch")
async def batch_magic_patch(params: BatchMagicPatchParams):
    if state.mesh is None:
        msg = "No mesh loaded."
        broadcast_log(f"[Error] {msg}")
        raise HTTPException(status_code=400, detail=msg)
    
    # ORGANIC WATERTIGHT CHECK
    if not getattr(state.mesh, 'is_watertight', False):
        broadcast_log("[Warning] Mesh is not watertight! This may cause issues with automated topological searches.")
        
    import build123d as b3d
    import scipy.optimize
    import scipy.spatial
    import networkx as nx
    from OCP.GeomAbs import GeomAbs_C0
    from OCP.Geom import Geom_Plane, Geom_CylindricalSurface
    from OCP.gp import gp_Pln, gp_Pnt, gp_Dir, gp_Ax3
    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
    
    broadcast_log(f"[System] Initiating Organic Surface Extraction (Global Skeleton-First)...")

    # =====================================================================
    # PHASE 1: GLOBAL TOPOLOGY - Extract the shared skeleton BEFORE surfaces
    # =====================================================================

    # 1a. Component Extraction - assign every face to a component
    components = get_patch_components(state.mesh, params.sharpness_angle)
    
    # Build face-to-component lookup
    face_to_comp = np.full(len(state.mesh.faces), -1, dtype=int)
    valid_comp_indices = []
    comp_verts_map = {}  # comp_idx -> vertices of the component's faces
    for ci, comp in enumerate(components):
        if len(comp) < 3: continue
        valid_comp_indices.append(ci)
        for fi in comp:
            face_to_comp[fi] = ci
        comp_faces = state.mesh.faces[comp]
        comp_verts_map[ci] = state.mesh.vertices[np.unique(comp_faces)]

    if not valid_comp_indices:
        msg = "No valid patch components found. Try adjusting the sharpness angle."
        broadcast_log(f"[Error] {msg}")
        raise HTTPException(status_code=400, detail=msg)

    # 1b. Find ALL sharp edges using the SAME consensus logic as get_patch_components
    adjacency = state.mesh.face_adjacency
    angles = state.mesh.face_adjacency_angles
    adjacency_edges = state.mesh.face_adjacency_edges
    n_adj = len(angles)
    
    # Same consensus band as get_patch_components (user's angle is center)
    center_angle = params.sharpness_angle
    band = float(np.clip(center_angle * 0.10, 1.5, 5.0))
    test_angles_deg = [
        center_angle - band,
        center_angle - band / 2,
        center_angle,
        center_angle + band / 2,
        center_angle + band,
    ]
    test_angles_deg = [max(1.0, a) for a in test_angles_deg]
    
    edge_sharp_votes = np.zeros(n_adj, dtype=int)
    for test_deg in test_angles_deg:
        test_rad = np.radians(test_deg)
        edge_sharp_votes += (angles >= test_rad).astype(int)
    
    sharp_mask = edge_sharp_votes >= 3
    sharp_face_pairs = adjacency[sharp_mask]
    sharp_vertex_edges = adjacency_edges[sharp_mask]
    
    broadcast_log(f"[System] Consensus band: {center_angle:.1f}° ± {band:.1f}° → {int(np.sum(sharp_mask))} robust sharp edges")
    
    if len(sharp_vertex_edges) == 0:
        msg = "No sharp edges detected. Try lowering the sharpness angle."
        broadcast_log(f"[Error] {msg}")
        raise HTTPException(status_code=400, detail=msg)

    broadcast_log(f"[System] Found {len(sharp_vertex_edges)} consensus-sharp edges across {len(valid_comp_indices)} components.")

    # 1c. Build global sharp-edge graph from mesh vertex indices
    sharp_graph = nx.Graph()
    for edge_idx, (v0, v1) in enumerate(sharp_vertex_edges):
        # Store which two components this edge separates
        f0, f1 = sharp_face_pairs[edge_idx]
        c0, c1 = face_to_comp[f0], face_to_comp[f1]
        sharp_graph.add_edge(int(v0), int(v1), comp_pair=tuple(sorted([c0, c1])))

    # 1d. Find JUNCTION vertices — these are the TRUE topological corners
    # Three types of junctions:
    #   - Degree 1 = boundary endpoint
    #   - Degree 3+ = where 3+ sharp edges meet  
    #   - Degree 2 BUT component pair changes = where two different boundaries meet
    #     (e.g., edge separating A|B meets edge separating B|C at a degree-2 vertex)
    #     Without this, the chain walker would create one long chain spanning both
    #     boundaries, causing the vertex misalignment bug.
    junction_verts = set()
    for v in sharp_graph.nodes():
        deg = sharp_graph.degree(v)
        if deg != 2:
            junction_verts.add(v)
        else:
            # Degree-2 vertex: check if the two edges separate DIFFERENT component pairs
            neighbors = list(sharp_graph.neighbors(v))
            if len(neighbors) == 2:
                pair0 = sharp_graph.edges[v, neighbors[0]].get('comp_pair')
                pair1 = sharp_graph.edges[v, neighbors[1]].get('comp_pair')
                if pair0 is not None and pair1 is not None and pair0 != pair1:
                    junction_verts.add(v)  # Component boundary changes here = real junction

    # If no junctions found (e.g., all closed loops), break loops at arbitrary points
    if not junction_verts:
        for cc in nx.connected_components(sharp_graph):
            cc_list = list(cc)
            if len(cc_list) > 0:
                junction_verts.add(cc_list[0])
    
    broadcast_log(f"[System] Found {len(junction_verts)} topological junction vertices (including {sum(1 for v in junction_verts if sharp_graph.degree(v) == 2)} comp-pair-change junctions).")

    # 1e. Walk between junctions to extract CHAINS (each chain = one shared edge curve)
    # A chain is a path of vertices from one junction to the next, along sharp edges.
    visited_edges = set()
    edge_chains = []  # List of (chain_vertices, set_of_comp_pairs)
    
    for start_v in junction_verts:
        for neighbor in sharp_graph.neighbors(start_v):
            edge_key = (min(start_v, neighbor), max(start_v, neighbor))
            if edge_key in visited_edges:
                continue
            
            # Walk from start_v through neighbor until we hit another junction
            chain = [start_v, neighbor]
            visited_edges.add(edge_key)
            comp_pairs_on_chain = set()
            edata = sharp_graph.edges[start_v, neighbor]
            if 'comp_pair' in edata:
                comp_pairs_on_chain.add(edata['comp_pair'])
            
            current = neighbor
            prev = start_v
            while current not in junction_verts:
                # Find the next vertex (the one that isn't prev)
                neighbors = list(sharp_graph.neighbors(current))
                next_v = None
                for n in neighbors:
                    if n != prev:
                        ek = (min(current, n), max(current, n))
                        if ek not in visited_edges:
                            next_v = n
                            break
                if next_v is None:
                    break
                
                ek = (min(current, next_v), max(current, next_v))
                visited_edges.add(ek)
                edata = sharp_graph.edges[current, next_v]
                if 'comp_pair' in edata:
                    comp_pairs_on_chain.add(edata['comp_pair'])
                chain.append(next_v)
                prev = current
                current = next_v
            
            if len(chain) >= 2:
                edge_chains.append((chain, comp_pairs_on_chain))

    broadcast_log(f"[System] Extracted {len(edge_chains)} shared edge chains between junctions.")

    # =====================================================================
    # PHASE 2: CREATE EXACTLY ONE B3D EDGE PER CHAIN
    # =====================================================================

    clamped_tension = max(0.01, params.edge_smoothing / 100.0 if params.edge_smoothing > 1 else params.edge_smoothing)

    # 2a. Compute planarity for each component (for processing order)
    comp_planarity = {}
    for ci in valid_comp_indices:
        mse = 999.0
        internal_pts = comp_verts_map.get(ci, np.array([]))
        if len(internal_pts) >= 3:
            pts = np.array(internal_pts)
            centroid = np.mean(pts, axis=0)
            _, _, vh = np.linalg.svd(pts - centroid)
            plane_normal = vh[2, :]
            mse = float(np.mean((np.dot(pts - centroid, plane_normal))**2))
        comp_planarity[ci] = mse

    # 2b. For each chain, determine which component is "flatter" (lower MSE) and use
    #     that side's vertex positions to define the canonical edge geometry.
    #     The key insight: the chain vertices are mesh vertex INDICES shared by both sides.
    #     The 3D positions are the same (same mesh vertices), but we process flatter 
    #     components first so their edges take priority in the registry.
    
    chain_b3d_edges = {}  # chain_index -> b3d.Edge
    chain_junction_keys = {}  # chain_index -> (key_start, key_end)
    
    # Sort chains by the planarity of their flattest adjacent component
    def chain_priority(chain_idx):
        _, comp_pairs = edge_chains[chain_idx]
        min_mse = 999.0
        for pair in comp_pairs:
            for ci in pair:
                if ci in comp_planarity:
                    min_mse = min(min_mse, comp_planarity[ci])
        return min_mse
    
    sorted_chain_indices = sorted(range(len(edge_chains)), key=chain_priority)

    for chain_idx in sorted_chain_indices:
        chain_verts, comp_pairs = edge_chains[chain_idx]
        chain_pts = state.mesh.vertices[chain_verts]
        
        if len(chain_pts) < 2:
            continue

        pA = chain_pts[0]
        pB = chain_pts[-1]
        
        # Create the canonical edge — corners are EXACTLY at junction vertices
        start_v = b3d.Vector(float(pA[0]), float(pA[1]), float(pA[2]))
        end_v = b3d.Vector(float(pB[0]), float(pB[1]), float(pB[2]))
        
        if (start_v - end_v).length < 1e-6:
            continue
        
        try:
            if len(chain_pts) <= 2:
                edge = b3d.Edge.make_line(start_v, end_v)
            else:
                # Use MORE points from the chain to keep the edge close to the mesh
                # Subsample to max 50 points but keep the density high near endpoints
                max_pts = min(50, len(chain_pts))
                target_count = max(max_pts, int(len(chain_pts) * (1.0 - clamped_tension)))
                target_count = max(4, min(target_count, len(chain_pts)))
                indices = np.linspace(0, len(chain_pts) - 1, target_count, dtype=int)
                
                # Build clean point list — use tighter distance filter (1e-4 instead of 1e-2)
                # so we don't skip critical points near junctions
                clean_pts = [start_v]
                for idx in indices[1:-1]:
                    v = b3d.Vector(float(chain_pts[idx][0]), float(chain_pts[idx][1]), float(chain_pts[idx][2]))
                    if (v - clean_pts[-1]).length > 1e-4 and (v - end_v).length > 1e-4:
                        clean_pts.append(v)
                clean_pts.append(end_v)
                
                if len(clean_pts) > 2:
                    # Compute tangent directions at endpoints from the mesh boundary
                    # This prevents spline overshooting at junction corners
                    tangent_start = (clean_pts[1] - clean_pts[0])
                    tangent_end = (clean_pts[-1] - clean_pts[-2])
                    
                    # Normalize tangents (avoid zero-length)
                    ts_len = tangent_start.length
                    te_len = tangent_end.length
                    
                    if ts_len > 1e-8 and te_len > 1e-8:
                        try:
                            # Create spline with tangent constraints at endpoints
                            # tangents list: [start_tangent, None for interior, ..., end_tangent]
                            tangents = [tangent_start] + [None] * (len(clean_pts) - 2) + [tangent_end]
                            edge = b3d.Edge.make_spline(clean_pts, tangents=tangents)
                        except Exception:
                            # Fallback: unconstrained spline
                            edge = b3d.Edge.make_spline(clean_pts)
                    else:
                        edge = b3d.Edge.make_spline(clean_pts)
                else:
                    edge = b3d.Edge.make_line(start_v, end_v)
        except Exception:
            try:
                edge = b3d.Edge.make_line(start_v, end_v)
            except Exception:
                continue
        
        chain_b3d_edges[chain_idx] = edge
        
        # Store junction keys for lookup
        key_A = f"{int(round(pA[0]*10000))}_{int(round(pA[1]*10000))}_{int(round(pA[2]*10000))}"
        key_B = f"{int(round(pB[0]*10000))}_{int(round(pB[1]*10000))}_{int(round(pB[2]*10000))}"
        chain_junction_keys[chain_idx] = (key_A, key_B)

    broadcast_log(f"[System] Created {len(chain_b3d_edges)} canonical B3D edges (exactly 1 per shared boundary).")

    # --- VERTEX SHARING: Re-build edges with shared OCCT TopoDS_Vertex objects ---
    # Without this, edges have separate vertex objects at the same position,
    # which prevents OCCT from recognizing topological connections between faces.
    try:
        from OCP.BRep import BRep_Tool as _BRepTool
        from OCP.TopLoc import TopLoc_Location
        from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeVertex
        from OCP.TopoDS import TopoDS
        from OCP.TopExp import TopExp
        
        # Detect which API style python-ocp uses (some versions use _s suffix for statics)
        _has_curve_s = hasattr(_BRepTool, 'Curve_s')
        _has_pnt_s = hasattr(_BRepTool, 'Pnt_s')
        
        def _brep_curve(edge_shape):
            """Get curve from edge, handling both OCP API styles."""
            loc = TopLoc_Location()
            if _has_curve_s:
                return _BRepTool.Curve_s(edge_shape, loc)
            else:
                return _BRepTool.Curve(edge_shape, loc)
        
        def _brep_pnt(vertex):
            """Get point from vertex, handling both OCP API styles."""
            if _has_pnt_s:
                return _BRepTool.Pnt_s(vertex)
            else:
                return _BRepTool.Pnt(vertex)
        
        junction_occt_verts = {}
        for jv in junction_verts:
            pos = state.mesh.vertices[jv]
            pnt = gp_Pnt(float(pos[0]), float(pos[1]), float(pos[2]))
            junction_occt_verts[jv] = BRepBuilderAPI_MakeVertex(pnt).Vertex()
        
        shared_count = 0
        share_errors = []
        for chain_idx in list(chain_b3d_edges.keys()):
            chain_verts_list, _ = edge_chains[chain_idx]
            jv_start = chain_verts_list[0]
            jv_end = chain_verts_list[-1]
            
            if jv_start not in junction_occt_verts or jv_end not in junction_occt_verts:
                continue
            
            edge = chain_b3d_edges[chain_idx]
            try:
                curve_result = _brep_curve(edge.wrapped)
                
                # BRep_Tool.Curve returns (Handle_Geom_Curve, first_param, last_param)
                if curve_result is None:
                    # Fallback: just make a line edge with shared vertices
                    maker = BRepBuilderAPI_MakeEdge(
                        junction_occt_verts[jv_start],
                        junction_occt_verts[jv_end]
                    )
                    if maker.IsDone():
                        chain_b3d_edges[chain_idx] = b3d.Edge(maker.Edge())
                        shared_count += 1
                    continue
                    
                curve_handle = curve_result[0]
                u_first = curve_result[1]
                u_last = curve_result[2]
                
                if curve_handle is None or curve_handle.IsNull():
                    # For degenerate/line edges, make a fresh line edge with shared verts
                    maker = BRepBuilderAPI_MakeEdge(
                        junction_occt_verts[jv_start],
                        junction_occt_verts[jv_end]
                    )
                    if maker.IsDone():
                        chain_b3d_edges[chain_idx] = b3d.Edge(maker.Edge())
                        shared_count += 1
                    continue
                
                maker = BRepBuilderAPI_MakeEdge(
                    curve_handle,
                    junction_occt_verts[jv_start],
                    junction_occt_verts[jv_end],
                    u_first, u_last
                )
                if maker.IsDone():
                    chain_b3d_edges[chain_idx] = b3d.Edge(maker.Edge())
                    shared_count += 1
                else:
                    share_errors.append(f"chain {chain_idx}: MakeEdge not done (error: {maker.Error()})")
            except Exception as e:
                share_errors.append(f"chain {chain_idx}: {type(e).__name__}: {e}")
        
        if share_errors:
            broadcast_log(f"[Debug] Vertex sharing issues: {share_errors[:5]}")
        broadcast_log(f"[System] Enforced vertex sharing on {shared_count}/{len(chain_b3d_edges)} edges across {len(junction_occt_verts)} junctions.")
    except Exception as e:
        broadcast_log(f"[Warning] Vertex sharing phase failed entirely: {e}. Continuing without it.")

    # =====================================================================
    # PHASE 3: ASSIGN EDGES TO COMPONENTS & BUILD SURFACES
    # =====================================================================
    
    # 3a. For each component, find which chains bound it (deduplicated)
    comp_to_chains = {ci: [] for ci in valid_comp_indices}
    for chain_idx, (chain_verts, comp_pairs) in enumerate(edge_chains):
        if chain_idx not in chain_b3d_edges:
            continue
        for pair in comp_pairs:
            for ci in pair:
                if ci in comp_to_chains and chain_idx not in comp_to_chains[ci]:
                    comp_to_chains[ci].append(chain_idx)
    
    # 3b. Process components in planarity order (flattest first)
    sorted_comp_indices = sorted(valid_comp_indices, key=lambda ci: comp_planarity.get(ci, 999.0))

    b3d_faces = []

    for ci in sorted_comp_indices:
        chain_indices = comp_to_chains.get(ci, [])
        if not chain_indices:
            continue
        
        # Collect the b3d edges for this component's boundary
        cycle_edges = []
        
        # We need to order the chains into a proper loop.
        # Use MultiGraph to handle parallel edges between the same junction pair.
        junction_graph = nx.MultiGraph()
        for ch_idx in chain_indices:
            if ch_idx not in chain_junction_keys:
                continue
            kA, kB = chain_junction_keys[ch_idx]
            junction_graph.add_edge(kA, kB, key=ch_idx, chain_idx=ch_idx)
        
        if len(junction_graph.edges()) == 0:
            continue
        
        # Try to find a cycle through the junction graph
        try:
            # For components that form a closed loop
            cycle_path = nx.find_cycle(junction_graph)
            ordered_chain_indices = []
            for cycle_entry in cycle_path:
                u, v = cycle_entry[0], cycle_entry[1]
                # For MultiGraph, get the edge key (chain_idx) from the cycle entry
                if len(cycle_entry) >= 3:
                    edge_key = cycle_entry[2]
                    edata = junction_graph.edges[u, v, edge_key]
                else:
                    # Fallback: get any edge between u and v
                    edata = list(junction_graph[u][v].values())[0]
                ch_idx = edata['chain_idx']
                kA, kB = chain_junction_keys[ch_idx]
                
                # Determine if we need to reverse this edge
                if kA == u:
                    ordered_chain_indices.append((ch_idx, False))
                else:
                    ordered_chain_indices.append((ch_idx, True))
            
            for ch_idx, needs_reverse in ordered_chain_indices:
                edge = chain_b3d_edges[ch_idx]
                if needs_reverse:
                    try:
                        cycle_edges.append(edge.reversed())
                    except AttributeError:
                        cycle_edges.append(b3d.Edge(edge.wrapped.Reversed()))
                else:
                    cycle_edges.append(edge)
        except nx.NetworkXNoCycle:
            # Open boundary - just collect edges in whatever order
            for ch_idx in chain_indices:
                if ch_idx in chain_b3d_edges:
                    cycle_edges.append(chain_b3d_edges[ch_idx])
        except Exception:
            for ch_idx in chain_indices:
                if ch_idx in chain_b3d_edges:
                    cycle_edges.append(chain_b3d_edges[ch_idx])

        if len(cycle_edges) < 2:
            continue
        
        # 3c. Generate the face using the analytic surface hierarchy
        geom_surf = None
        internal_pts = comp_verts_map.get(ci, np.array([]))
        
        # --- EVALUATE ANALYTIC BASE ---
        if len(internal_pts) >= 15:
            pts = np.array(internal_pts)
            centroid = np.mean(pts, axis=0)
            _, _, vh = np.linalg.svd(pts - centroid)
            plane_normal = vh[2, :]
            plane_mse = float(np.mean((np.dot(pts - centroid, plane_normal))**2))
            
            cyl_mse = float('inf')
            radius = 0.0
            try:
                axis = vh[0, :]
                u_vec = vh[1, :]
                v_vec = vh[2, :]
                p2d = np.column_stack((np.dot(pts - centroid, u_vec), np.dot(pts - centroid, v_vec)))
                def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
                def cyl_obj(c): return calc_R(c) - np.mean(calc_R(c))
                
                res_cyl = scipy.optimize.least_squares(cyl_obj, np.mean(p2d, axis=0))
                radii = calc_R(res_cyl.x)
                cyl_mse = float(np.mean((radii - np.mean(radii))**2))
                radius = float(np.mean(radii))
                center_2d = res_cyl.x
                center_3d = centroid + center_2d[0]*u_vec + center_2d[1]*v_vec
                axis_3d, u_3d = axis, u_vec
            except: pass

            best_match = 'unknown'
            if plane_mse < 0.05: best_match = 'plane'
            elif cyl_mse < plane_mse * 0.5 and radius > 0.1: best_match = 'cylinder'
            elif plane_mse < 0.5: best_match = 'plane'

            try:
                if best_match == 'plane':
                    pln = gp_Pln(gp_Pnt(float(centroid[0]), float(centroid[1]), float(centroid[2])), 
                                 gp_Dir(float(plane_normal[0]), float(plane_normal[1]), float(plane_normal[2])))
                    geom_surf = Geom_Plane(pln)
                elif best_match == 'cylinder':
                    ax3 = gp_Ax3(gp_Pnt(float(center_3d[0]), float(center_3d[1]), float(center_3d[2])), 
                                 gp_Dir(float(axis_3d[0]), float(axis_3d[1]), float(axis_3d[2])),
                                 gp_Dir(float(u_3d[0]), float(u_3d[1]), float(u_3d[2])))
                    geom_surf = Geom_CylindricalSurface(ax3, float(radius))
            except: pass

        # --- THE INVINCIBLE FALLBACK HIERARCHY ---
        face = None
        mse_val = comp_planarity.get(ci, 999.0)
        is_organic = mse_val > 0.5  # High MSE = curved/organic surface

        # STRATEGY 1: Analytic surface + edge constraints (best for plane/cylinder)
        if geom_surf is not None:
            try:
                filler = BRepOffsetAPI_MakeFilling()
                for edge in cycle_edges: filler.Add(edge.wrapped, GeomAbs_C0)
                filler.LoadInitSurface(geom_surf)
                filler.Build()
                if filler.IsDone(): 
                    f = b3d.Face(filler.Shape())
                    if f.is_valid: face = f
            except: pass

        # STRATEGY 2: Direct surface from curves (only works with 2-4 edges)
        if face is None and len(cycle_edges) in [2, 3, 4]:
            try: 
                f = b3d.Face.make_surface_from_curves(cycle_edges)
                if f.is_valid: face = f
            except: pass

        # STRATEGY 3: MakeFilling with INTERIOR POINT CONSTRAINTS from original mesh
        # This is the critical path for organic surfaces - we sample points from the
        # component's actual mesh faces to guide the surface curvature
        if face is None:
            try:
                from OCP.gp import gp_Pnt as gp_Pnt_filling
                filler = BRepOffsetAPI_MakeFilling()
                for edge in cycle_edges: filler.Add(edge.wrapped, GeomAbs_C0)
                
                # Sample interior points from the original mesh component
                if len(internal_pts) >= 3:
                    pts_arr = np.array(internal_pts)
                    # For organic surfaces, use more points for better curvature capture
                    max_constraint_pts = 30 if is_organic else 15
                    
                    if len(pts_arr) > max_constraint_pts:
                        # Subsample evenly across the point cloud
                        indices = np.linspace(0, len(pts_arr) - 1, max_constraint_pts, dtype=int)
                        sample_pts = pts_arr[indices]
                    else:
                        sample_pts = pts_arr
                    
                    pts_added = 0
                    for sp in sample_pts:
                        try:
                            filler.Add(gp_Pnt_filling(float(sp[0]), float(sp[1]), float(sp[2])))
                            pts_added += 1
                        except: pass
                
                filler.Build()
                if filler.IsDone(): 
                    f = b3d.Face(filler.Shape())
                    if f.is_valid: face = f
            except: pass

        # STRATEGY 4: MakeFilling with relaxed tolerances + interior points
        # Some complex organic shapes need more flexible tolerances
        if face is None:
            for fill_tol in [1e-2, 0.05, 0.1]:
                try:
                    from OCP.gp import gp_Pnt as gp_Pnt_filling2
                    filler = BRepOffsetAPI_MakeFilling(3, 15, int(max(5, len(cycle_edges) * 2)), False, fill_tol, fill_tol, fill_tol * 0.1, fill_tol * 10)
                    for edge in cycle_edges: filler.Add(edge.wrapped, GeomAbs_C0)
                    
                    if len(internal_pts) >= 3:
                        pts_arr = np.array(internal_pts)
                        sample_count = min(20, len(pts_arr))
                        if len(pts_arr) > sample_count:
                            indices = np.linspace(0, len(pts_arr) - 1, sample_count, dtype=int)
                            sample_pts = pts_arr[indices]
                        else:
                            sample_pts = pts_arr
                        
                        for sp in sample_pts:
                            try:
                                filler.Add(gp_Pnt_filling2(float(sp[0]), float(sp[1]), float(sp[2])))
                            except: pass
                    
                    filler.Build()
                    if filler.IsDone(): 
                        f = b3d.Face(filler.Shape())
                        if f.is_valid: 
                            face = f
                            break
                except: pass

        # STRATEGY 5: Build a wire and make face from wire (works for simpler cases)
        if face is None:
            try:
                from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeWire
                wire_builder = BRepBuilderAPI_MakeWire()
                for edge in cycle_edges:
                    wire_builder.Add(edge.wrapped)
                if wire_builder.IsDone():
                    wire = b3d.Wire(wire_builder.Wire())
                    f = b3d.Face.make_from_wires(wire)
                    if f.is_valid: face = f
            except: pass

        # STRATEGY 6: Convex hull polygon fallback (last resort for anything)
        if face is None:
            try:
                from scipy.spatial import ConvexHull
                corner_pts = []
                for ch_idx in chain_indices:
                    if ch_idx in chain_junction_keys:
                        kA, kB = chain_junction_keys[ch_idx]
                        chain_verts_list, _ = edge_chains[ch_idx]
                        corner_pts.append(state.mesh.vertices[chain_verts_list[0]])
                        corner_pts.append(state.mesh.vertices[chain_verts_list[-1]])
                corner_pts = [np.array(p) for p in corner_pts]
                # Deduplicate
                if corner_pts:
                    unique_corners = [corner_pts[0]]
                    for p in corner_pts[1:]:
                        if all(np.linalg.norm(p - uc) > 1e-4 for uc in unique_corners):
                            unique_corners.append(p)
                    corner_pts = unique_corners
                
                if len(corner_pts) >= 3:
                    flat_pts = np.array(apply_pca_firewall(corner_pts))
                    centroid_flat = np.mean(flat_pts, axis=0)
                    flat_pts += np.random.normal(0, 1e-6, flat_pts.shape)
                    
                    _, _, vh = np.linalg.svd(flat_pts - centroid_flat)
                    u_vec = vh[0, :]
                    v_vec = vh[1, :]
                    
                    p2d = np.column_stack((np.dot(flat_pts - centroid_flat, u_vec), np.dot(flat_pts - centroid_flat, v_vec)))
                    hull = ConvexHull(p2d)
                    
                    hull_pts_3d = [centroid_flat + p2d[idx][0] * u_vec + p2d[idx][1] * v_vec for idx in hull.vertices]
                    
                    poly_pts = [b3d.Vector(p) for p in hull_pts_3d]
                    if (poly_pts[0] - poly_pts[-1]).length > 1e-4:
                        poly_pts.append(poly_pts[0])
                        
                    f = b3d.Face(b3d.Wire.make_polygon(poly_pts))
                    if f.is_valid: 
                        face = f
            except Exception as e:
                pass

        if face is not None:
            b3d_faces.append(face)
        else:
            broadcast_log(f"[Warning] Component {ci} failed all face strategies (MSE: {mse_val:.3f}, edges: {len(cycle_edges)}, organic: {is_organic})")

    broadcast_log(f"[System] Generated {len(b3d_faces)} CAD faces from {len(sorted_comp_indices)} components.")

    if not b3d_faces:
         msg = "Engine failed to generate valid faces. All fallbacks exhausted."
         broadcast_log(f"[Error] {msg}")
         raise HTTPException(status_code=400, detail=msg)

    # =====================================================================
    # PHASE 4: SMART CLUSTER SEWING
    # Instead of all-or-nothing, we group faces by shared edges,
    # sew each cluster independently, and return problematic faces separately.
    # =====================================================================
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    from OCP.ShapeFix import ShapeFix_Shape, ShapeFix_Solid
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_VERTEX, TopAbs_EDGE
    from OCP.TopoDS import TopoDS
    
    broadcast_log(f"[System] Analyzing face adjacency for smart sewing ({len(b3d_faces)} faces)...")
    
    # 4a. Extract edge vertex-pair keys from each face to determine adjacency
    def get_face_edge_keys(face):
        """Get set of (vertex_key_A, vertex_key_B) tuples representing each edge.
        Uses 2-decimal rounding for more tolerant matching (~0.01 unit tolerance)."""
        edge_keys = set()
        try:
            from OCP.TopExp import TopExp
            from OCP.BRep import BRep_Tool as BRT
            exp = TopExp_Explorer(face.wrapped, TopAbs_EDGE)
            while exp.More():
                edge_shape = exp.Current()
                try:
                    v1 = TopExp.FirstVertex_s(TopoDS.Edge_s(edge_shape))
                    v2 = TopExp.LastVertex_s(TopoDS.Edge_s(edge_shape))
                    p1 = BRT.Pnt(v1)
                    p2 = BRT.Pnt(v2)
                    # Use 2-decimal rounding (~0.01 unit tolerance) for more forgiving matching
                    k1 = (round(p1.X(), 2), round(p1.Y(), 2), round(p1.Z(), 2))
                    k2 = (round(p2.X(), 2), round(p2.Y(), 2), round(p2.Z(), 2))
                    edge_keys.add(tuple(sorted([k1, k2])))
                except:
                    pass
                exp.Next()
        except:
            pass
        return edge_keys
    
    # Build adjacency graph: faces sharing at least one edge are connected
    face_edge_keys = [get_face_edge_keys(f) for f in b3d_faces]
    
    face_adj_graph = nx.Graph()
    for i in range(len(b3d_faces)):
        face_adj_graph.add_node(i)
    
    for i in range(len(b3d_faces)):
        for j in range(i + 1, len(b3d_faces)):
            shared = face_edge_keys[i] & face_edge_keys[j]
            if shared:
                face_adj_graph.add_edge(i, j, shared_edges=len(shared))
    
    clusters = list(nx.connected_components(face_adj_graph))
    broadcast_log(f"[System] Found {len(clusters)} face clusters: {[len(c) for c in sorted(clusters, key=len, reverse=True)]}")
    
    # 4b. Sew each cluster independently
    output_geometries = []
    
    def try_sew_cluster(cluster_faces, cluster_label):
        """Try to sew a group of faces into a shell. Returns (geometry, is_solid, was_sewn)."""
        if len(cluster_faces) == 1:
            return cluster_faces[0], False, False
        
        tolerances_to_try = [1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.2]
        best_geo = None
        best_is_solid = False
        
        for tol in tolerances_to_try:
            try:
                sewer = BRepBuilderAPI_Sewing()
                sewer.SetTolerance(tol)
                
                for face in cluster_faces:
                    if face.is_valid:
                        sewer.Add(face.wrapped)
                
                sewer.Perform()
                temp_sewed = sewer.SewedShape()
                
                if temp_sewed.IsNull():
                    continue
                
                healer = ShapeFix_Shape(temp_sewed)
                healer.SetPrecision(tol)
                healer.SetMinTolerance(tol)
                healer.SetMaxTolerance(tol * 5)
                healer.Perform()
                healed_shape = healer.Shape()
                
                if healed_shape.IsNull():
                    continue
                
                temp_b3d = b3d.Shape.cast(healed_shape)
                
                if isinstance(temp_b3d, b3d.Solid):
                    broadcast_log(f"[System] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Solid at tol={tol}")
                    return temp_b3d, True, True
                
                elif isinstance(temp_b3d, b3d.Shell):
                    if temp_b3d.is_closed:
                        try:
                            solid = b3d.Solid.make_solid(temp_b3d)
                            broadcast_log(f"[System] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Sealed Solid at tol={tol}")
                            return solid, True, True
                        except:
                            pass
                    best_geo = temp_b3d
                    best_is_solid = False
                    # Don't break - try tighter tolerance first for Solid
                    if tol <= 1e-2:
                        continue
                    broadcast_log(f"[System] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Open Shell at tol={tol}")
                    return best_geo, False, True
                
                elif isinstance(temp_b3d, b3d.Compound):
                    shells = temp_b3d.shells()
                    if shells:
                        if shells[0].is_closed:
                            try:
                                solid = b3d.Solid.make_solid(shells[0])
                                broadcast_log(f"[System] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Solid from Compound at tol={tol}")
                                return solid, True, True
                            except:
                                pass
                        best_geo = shells[0]
                    else:
                        best_geo = temp_b3d
            except:
                continue
        
        if best_geo is not None:
            broadcast_log(f"[System] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Best effort Shell")
            return best_geo, best_is_solid, True
        
        # Sewing completely failed - return as compound
        broadcast_log(f"[Warning] Cluster '{cluster_label}' ({len(cluster_faces)} faces) → Sewing failed, returning loose")
        return b3d.Compound(children=cluster_faces), False, False
    
    # Sort clusters by size (largest first) for cleaner output
    sorted_clusters = sorted(clusters, key=len, reverse=True)
    
    from build123d.exporters3d import export_stl
    
    for cluster_idx, cluster in enumerate(sorted_clusters):
        cluster_faces = [b3d_faces[i] for i in cluster]
        
        if len(cluster_faces) == 1:
            # Single face - output as individual sheet for easy management
            geo = cluster_faces[0]
            geo_type = "face"
            is_solid = False
            was_sewn = False
            label = f"Face_{cluster_idx}"
        else:
            label = f"Shell_{cluster_idx}"
            geo, is_solid, was_sewn = try_sew_cluster(cluster_faces, label)
            geo_type = "solid" if is_solid else ("shell" if was_sewn else "compound")
        
        # Export to STL for visualization
        geo_id = f"batch_{geo_type}_{uuid.uuid4().hex[:8]}"
        state.rebuild_geometry[geo_id] = geo
        
        fd, path = tempfile.mkstemp(suffix=".stl")
        os.close(fd)
        try:
            export_stl(geo, path)
            tmesh = trimesh.load(path, file_type='stl')
            
            naked_edges = []
            if not is_solid and len(tmesh.faces) > 0:
                edges = trimesh.geometry.faces_to_edges(tmesh.faces)
                edges_sorted = np.sort(edges, axis=1)
                unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
                boundary_edges = unique_edges[counts == 1]
                for edge in boundary_edges:
                    p1 = tmesh.vertices[edge[0]].tolist()
                    p2 = tmesh.vertices[edge[1]].tolist()
                    naked_edges.append([p1, p2])
            
            face_count_label = f"{len(cluster)} patches" if len(cluster) > 1 else "1 patch"
            output_geometries.append({
                "vertices": tmesh.vertices.tolist(),
                "faces": tmesh.faces.tolist(),
                "id": geo_id,
                "tag": f"{'Merged ' if was_sewn else ''}{geo_type.title()} ({face_count_label})",
                "is_solid": is_solid,
                "naked_edges": naked_edges,
                "type": geo_type,
                "name": f"Batch_{label}"
            })
        except Exception as e:
            broadcast_log(f"[Warning] Failed to export cluster '{label}': {e}")
        finally:
            try: os.remove(path)
            except: pass
    
    # Summary
    merged_count = sum(1 for g in output_geometries if 'Merged' in g.get('tag', ''))
    loose_count = len(output_geometries) - merged_count
    broadcast_log(f"[Success] Smart Sewing complete: {merged_count} merged shells + {loose_count} individual faces = {len(output_geometries)} geometries total.")
    
    return {"geometries": output_geometries}

@app.post("/build-skeleton")
async def build_skeleton(params: BuildSkeletonParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
        
    # STRUCTURED WATERTIGHT CHECK
    if not getattr(state.mesh, 'is_watertight', False):
        msg = "The Structured CAD Pipeline requires a perfectly Watertight/Manifold mesh to prevent algorithmic explosions. Please close all holes in your mesh before using this method."
        broadcast_log(f"[Error] {msg}")
        raise HTTPException(status_code=400, detail=msg)
        
    import build123d as b3d
    import networkx as nx
    import scipy.spatial

    broadcast_log(f"[System] Initiating Master Skeleton Extraction (Angle: {params.sharpness_angle}°)...")

    components = get_patch_components(state.mesh, params.sharpness_angle)
    
    loops_pts = []
    valid_comps = []
    
    for comp in components:
        if len(comp) < 3: continue
        faces = state.mesh.faces[comp]
        edges = trimesh.geometry.faces_to_edges(faces)
        edges_sorted = np.sort(edges, axis=1)
        unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
        boundary_edges = unique_edges[counts == 1]
        
        if len(boundary_edges) == 0: continue
        
        G_temp = nx.Graph()
        G_temp.add_edges_from(boundary_edges)
        try:
            cycle = nx.find_cycle(G_temp)
            ordered_nodes = [u for u, v in cycle]
        except:
            ordered_nodes = list(nx.dfs_preorder_nodes(G_temp))
            
        loops_pts.append(state.mesh.vertices[ordered_nodes])
        valid_comps.append(comp)

    if not loops_pts:
        raise HTTPException(status_code=400, detail="No boundaries detected.")

    all_pts = np.vstack(loops_pts)
    tree = scipy.spatial.cKDTree(all_pts)
    pairs = tree.query_pairs(r=0.01) 
    
    parent = {i: i for i in range(len(all_pts))}
    def find(i):
        if parent[i] == i: return i
        parent[i] = find(parent[i])
        return parent[i]
    def union(i, j):
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j
            
    for i, j in pairs: 
        union(i, j)
        
    merged_positions = {}
    for i in range(len(all_pts)):
        root = find(i)
        if root not in merged_positions:
            merged_positions[root] = all_pts[root]
            
    snapped_loops = []
    idx_counter = 0
    for raw_pts in loops_pts:
        snapped = []
        for _ in range(len(raw_pts)):
            root = find(idx_counter)
            snapped.append(merged_positions[root])
            idx_counter += 1
        snapped_loops.append(np.array(snapped))

    state.master_skeleton = nx.Graph()
    state.patch_loops = []
    edge_count = 0
    clamped_tension = max(0.01, params.edge_smoothing / 100.0 if params.edge_smoothing > 1 else params.edge_smoothing)

    for raw_pts, comp in zip(snapped_loops, valid_comps):
        if len(raw_pts) < 4: continue
        
        corners = find_dynamic_corners(raw_pts, params.sharpness_angle)
        
        if len(corners) < 3:
            diffs = np.linalg.norm(raw_pts - np.roll(raw_pts, 1, axis=0), axis=1)
            cum_dists = np.cumsum(diffs)
            total_len = cum_dists[-1]
            targets = [0, total_len * 0.25, total_len * 0.5, total_len * 0.75]
            corners = []
            for t in targets:
                idx = np.searchsorted(cum_dists, t)
                corners.append(min(idx, len(raw_pts) - 1))
            corners = sorted(list(set(corners)))
            if len(corners) < 3:
                corners = [0, len(raw_pts)//3, 2*len(raw_pts)//3]
        
        corner_pts = [raw_pts[c] for c in corners]

        loop_keys = []
        for pA in corner_pts:
            keyA = tuple(np.round(pA, 4))
            loop_keys.append(keyA)
            
        clean_keys = []
        for k in loop_keys:
            if not clean_keys or clean_keys[-1] != k:
                clean_keys.append(k)
        if len(clean_keys) > 1 and clean_keys[0] == clean_keys[-1]:
            clean_keys.pop()
            
        if len(clean_keys) >= 3:
            verts = state.mesh.vertices[np.unique(state.mesh.faces[comp])].tolist()
            state.patch_loops.append({
                "keys": clean_keys,
                "points": verts
            })

        for i in range(len(corners)):
            start_idx = corners[i]
            end_idx = corners[(i + 1) % len(corners)]
            
            seg_pts = extract_segment(raw_pts, start_idx, end_idx)
            pA = corner_pts[i]
            pB = corner_pts[(i+1)%len(corners)]
            
            keyA = tuple(np.round(pA, 4))
            keyB = tuple(np.round(pB, 4))
            
            if keyA == keyB: continue
            
            if not state.master_skeleton.has_node(keyA):
                state.master_skeleton.add_node(keyA, pos=pA)
            if not state.master_skeleton.has_node(keyB):
                state.master_skeleton.add_node(keyB, pos=pB)
            
            if not state.master_skeleton.has_edge(keyA, keyB):
                new_edge = create_tension_edge(seg_pts, pA, pB, tension=clamped_tension)
                if new_edge:
                    state.master_skeleton.add_edge(keyA, keyB, b3d_edge=new_edge)
                    edge_count += 1
                    
    broadcast_log(f"[Success] Master Skeleton built with {state.master_skeleton.number_of_nodes()} points and {edge_count} shared curves.")
    
    return {
        "status": "success",
        "nodes": state.master_skeleton.number_of_nodes(),
        "edges": state.master_skeleton.number_of_edges()
    }

@app.post("/refine-skeleton")
async def refine_skeleton(params: RefineSkeletonParams):
    if state.master_skeleton is None or state.master_skeleton.number_of_nodes() == 0:
        raise HTTPException(status_code=400, detail="Master skeleton is empty or not built.")
        
    import networkx as nx
    import build123d as b3d
    import scipy.optimize
    import numpy as np

    broadcast_log("[System] Initiating Andrew's 3-Pass Wire Classification...")
    
    G = state.master_skeleton
    new_G = nx.Graph()
    chains = []
    visited_edges = set()

    def update_patch_loops(chain):
        if len(chain) <= 2: return
        intermediate = set(chain[1:-1])
        for i, patch in enumerate(state.patch_loops):
            loop = patch["keys"]
            if not intermediate.intersection(loop): continue
            new_loop = [n for n in loop if n not in intermediate]
            clean_loop = []
            for n in new_loop:
                if not clean_loop or clean_loop[-1] != n: clean_loop.append(n)
            if len(clean_loop) > 1 and clean_loop[0] == clean_loop[-1]:
                clean_loop.pop()
            state.patch_loops[i]["keys"] = clean_loop
    
    for comp in list(nx.connected_components(G)):
        if all(G.degree(n) == 2 for n in comp):
            try:
                cycle = nx.find_cycle(G.subgraph(comp))
                nodes = [u for u, v in cycle]
                nodes.append(nodes[0]) 
                edges = [tuple(sorted(e)) for e in cycle]
                if not any(e in visited_edges for e in edges):
                    chains.append(nodes)
                    visited_edges.update(edges)
            except: pass

    branch_nodes = [n for n in G.nodes() if G.degree(n) != 2]
    for start_node in branch_nodes:
        for neighbor in G.neighbors(start_node):
            edge = tuple(sorted((start_node, neighbor)))
            if edge in visited_edges: continue
            
            current, prev = neighbor, start_node
            path = [start_node, current]
            visited_edges.add(edge)
            
            while G.degree(current) == 2 and current != start_node:
                next_nodes = [n for n in G.neighbors(current) if n != prev]
                if not next_nodes: break
                next_node = next_nodes[0]
                path.append(next_node)
                visited_edges.add(tuple(sorted((current, next_node))))
                prev, current = current, next_node
            
            chains.append(path)

    counts = {"circle": 0, "line": 0, "spline": 0, "fallback": 0}

    for chain in chains:
        update_patch_loops(chain) 
        
        start_node = chain[0]
        end_node = chain[-1]
        is_closed = (start_node == end_node)
        pts = np.array([G.nodes[n]['pos'] for n in chain])
        
        b3d_edge, edge_type = None, "unknown"

        if is_closed and len(pts) >= 4:
            pts_unique = pts[:-1]
            centroid = np.mean(pts_unique, axis=0)
            cov = np.cov(pts_unique.T)
            evals, evecs = np.linalg.eigh(cov)
            normal = evecs[:, 0]
            u, v = evecs[:, 1], evecs[:, 2]
            
            p2d = np.column_stack((np.dot(pts_unique - centroid, u), np.dot(pts_unique - centroid, v)))
            def calc_R(c): return np.sqrt((p2d[:, 0] - c[0])**2 + (p2d[:, 1] - c[1])**2)
            def f_2(c): Ri = calc_R(c); return Ri - Ri.mean()
            
            try:
                c2d_guess = np.mean(p2d, axis=0)
                res = scipy.optimize.least_squares(f_2, c2d_guess)
                radius = float(calc_R(res.x).mean())
                if np.std(calc_R(res.x)) / radius < params.circle_tolerance:
                    center_3d = centroid + res.x[0]*u + res.x[1]*v
                    p = b3d.Plane(origin=b3d.Vector(center_3d), z_dir=b3d.Vector(normal))
                    b3d_edge = b3d.Edge.make_circle(radius=radius, plane=p)
                    edge_type = "circle"
            except: pass

        if b3d_edge is None and not is_closed and len(pts) >= 2:
            pA, pB = pts[0], pts[-1]
            line_vec = pB - pA
            line_len = np.linalg.norm(line_vec)
            if line_len > 1e-5:
                line_dir = line_vec / line_len
                if max([np.linalg.norm(np.cross(p - pA, line_dir)) for p in pts]) < params.line_tolerance:
                    b3d_edge = b3d.Edge.make_line(b3d.Vector(pA), b3d.Vector(pB))
                    edge_type = "line"

        if b3d_edge is None:
            clean_pts = []
            for p in pts:
                v_p = b3d.Vector(p)
                if not clean_pts or (v_p - clean_pts[-1]).length > 1e-4:
                    clean_pts.append(v_p)
            
            if is_closed and (clean_pts[0] - clean_pts[-1]).length > 1e-4:
                clean_pts.append(clean_pts[0])
                
            if len(clean_pts) > 2:
                try:
                    b3d_edge = b3d.Edge.make_spline(clean_pts)
                    edge_type = "spline"
                except Exception as e:
                    broadcast_log(f"[Warning] Spline generation failed, falling back to line. Reason: {e}")
            
            if b3d_edge is None and len(clean_pts) >= 2:
                b3d_edge = b3d.Edge.make_line(clean_pts[0], clean_pts[-1])
                edge_type = "fallback"

        if b3d_edge is not None:
            counts[edge_type] += 1
            if not new_G.has_node(start_node): new_G.add_node(start_node, pos=G.nodes[start_node]['pos'])
            if not new_G.has_node(end_node): new_G.add_node(end_node, pos=G.nodes[end_node]['pos'])
            new_G.add_edge(start_node, end_node, b3d_edge=b3d_edge, type=edge_type)

    state.master_skeleton = new_G
    broadcast_log(f"[Success] Andrew's Classification Complete: {counts['circle']} Circles, {counts['line']} Lines, {counts['spline']} Splines.")
    
    return {
        "status": "success",
        "nodes": new_G.number_of_nodes(),
        "edges": new_G.number_of_edges(),
        "metrics": counts
    }

@app.post("/generate-shell")
async def generate_shell():
    if state.master_skeleton is None or state.master_skeleton.number_of_edges() == 0:
        raise HTTPException(status_code=400, detail="Master skeleton not built or empty.")
        
    import build123d as b3d
    from OCP.BRepBuilderAPI import BRepBuilderAPI_Sewing
    from OCP.ShapeFix import ShapeFix_Shape
    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
    from OCP.GeomAbs import GeomAbs_C0
    from OCP.gp import gp_Pnt

    broadcast_log("[System] Extracting specific patch cycles for face injection with Internal Constraints...")
    
    G = state.master_skeleton
    cycles = state.patch_loops
    
    if not cycles:
        raise HTTPException(status_code=400, detail="No topological loops found in skeleton.")
        
    b3d_faces = []
    
    for patch in cycles:
        cycle_keys = patch["keys"]
        internal_pts = patch.get("points", [])
        cycle_edges = []
        valid_cycle = True
        
        if len(cycle_keys) == 1:
            u = cycle_keys[0]
            if G.has_edge(u, u):
                edge_data = G.get_edge_data(u, u)
                if 'b3d_edge' in edge_data:
                    cycle_edges.append(edge_data['b3d_edge'])
                else:
                    valid_cycle = False
            else:
                valid_cycle = False
        else:
            for i in range(len(cycle_keys)):
                u = cycle_keys[i]
                v = cycle_keys[(i + 1) % len(cycle_keys)]
                
                if G.has_edge(u, v):
                    edge_data = G.get_edge_data(u, v)
                    if 'b3d_edge' in edge_data:
                        cycle_edges.append(edge_data['b3d_edge'])
                    else:
                        valid_cycle = False; break
                else:
                    valid_cycle = False; break
                
        if valid_cycle and len(cycle_edges) > 0:
            try:
                filler = BRepOffsetAPI_MakeFilling()
                for edge in cycle_edges:
                    filler.Add(edge.wrapped, GeomAbs_C0)
                    
                # if len(internal_pts) > 0:
                #     step = max(1, len(internal_pts) // 10) 
                #     for pt in internal_pts[::step][:10]:
                #         filler.Add(gp_Pnt(float(pt[0]), float(pt[1]), float(pt[2])))
                        
                filler.Build()
                if filler.IsDone():
                    b3d_faces.append(b3d.Face(filler.Shape()))
                else:
                    wire = b3d.Wire(cycle_edges)
                    b3d_faces.append(b3d.Face.make_from_wires(wire))
            except Exception:
                pass
                    
    if not b3d_faces:
         raise HTTPException(status_code=400, detail="Engine failed to inject faces into the skeleton cycles.")

    sewer = BRepBuilderAPI_Sewing()
    sewer.SetTolerance(1e-2)
    
    for face in b3d_faces:
        sewer.Add(face.wrapped)

    sewer.Perform()
    sewed_shape = sewer.SewedShape()
    
    if not sewed_shape.IsNull():
        healer = ShapeFix_Shape(sewed_shape)
        healer.SetPrecision(0.1)
        healer.Perform()
        sewed_shape = healer.Shape()

    sewed_b3d = None
    if not sewed_shape.IsNull():
        try:
            sewed_b3d = b3d.Shape.cast(sewed_shape)
        except: pass

    is_solid = False
    final_geo = None

    if sewed_b3d is not None:
        if isinstance(sewed_b3d, b3d.Solid):
            final_geo = sewed_b3d
            is_solid = True
        elif isinstance(sewed_b3d, b3d.Shell):
            if sewed_b3d.is_closed:
                try:
                    final_geo = b3d.Solid.make_solid(sewed_b3d)
                    is_solid = True
                except:
                    final_geo = sewed_b3d
            else:
                final_geo = sewed_b3d
        elif isinstance(sewed_b3d, b3d.Compound):
            shells = sewed_b3d.shells()
            if shells and shells[0].is_closed:
                try:
                    final_geo = b3d.Solid.make_solid(shells[0])
                    is_solid = True
                except:
                    final_geo = shells[0]

    if final_geo is None:
        final_geo = b3d.Compound(children=b3d_faces)
        
    geo_id = f"master_shell_{uuid.uuid4().hex[:8]}"
    state.rebuild_geometry[geo_id] = final_geo
    
    fd, path = tempfile.mkstemp(suffix=".stl")
    os.close(fd)
    try:
        from build123d.exporters3d import export_stl
        export_stl(final_geo, path)
        tmesh = trimesh.load(path, file_type='stl')
        
        naked_edges = []
        if not is_solid:
            edges = trimesh.geometry.faces_to_edges(tmesh.faces)
            edges_sorted = np.sort(edges, axis=1)
            unique_edges, counts = np.unique(edges_sorted, axis=0, return_counts=True)
            boundary_edges = unique_edges[counts == 1]
            for edge in boundary_edges:
                p1 = tmesh.vertices[edge[0]].tolist()
                p2 = tmesh.vertices[edge[1]].tolist()
                naked_edges.append([p1, p2])

        return {
            "vertices": tmesh.vertices.tolist(),
            "faces": tmesh.faces.tolist(),
            "id": geo_id,
            "tag": "Master Skeleton Shell",
            "is_solid": is_solid,
            "naked_edges": naked_edges
        }
    finally:
        try: os.remove(path)
        except: pass

@app.post("/classify-patch")
async def classify_patch(params: ClassifyParams):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    target_pt = np.array([[params.x, params.y, params.z]])
    
    # Simple placeholder logic to avoid errors on your frontend while analyzing patches
    return {
        "best_match": "unknown",
        "errors": {"plane": 0, "cylinder": 0, "sphere": 0, "cone": 0, "torus": 0},
        "radius": 0,
        "face_count": 0
    }

@app.post("/analyze-surface")
async def analyze_surface(params: Point3D):
    if state.mesh is None:
        raise HTTPException(status_code=400, detail="No mesh loaded.")
    return {"status": "success"}

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
        
        # --- NEW: Extract and format corners for UI Debugging ---
        corner_indices = find_dynamic_corners(ordered_points, params.sharpness_angle)
        corner_pts = [ordered_points[i].tolist() for i in corner_indices]
        
        return {
            "id": patch_id,
            "type": "planar",
            "points": ordered_points.tolist(),
            "corners": corner_pts, # Added to light up the UI
            "patch_faces": ref_target_region.tolist() 
        }
    except Exception as e:
        raise HTTPException(status_code=500)

@app.post("/undo-geometry")
async def undo_geometry():
    broadcast_log("[System] Undo synchronized with React State.")
    return {"success": True}

@app.post("/create-patch")
async def create_patch(params: CreatePatchParams):
    try:
        import build123d as b3d
        from OCP.GeomAbs import GeomAbs_C0
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Committing PATCH-FROM-WIRES to Stack with smoothing {params.edge_smoothing}...")
    
    if not params.loops:
        raise ValueError("Creating a patch requires at least 1 loop.")

    try:
        loop_arrays = [np.array(l.get('points', [])) for l in params.loops if len(l.get('points', [])) > 1]
        
        for _ in range(2): 
            for i in range(len(loop_arrays)):
                for j in range(len(loop_arrays)):
                    if i == j: continue
                    for idx_i in [0, -1]:
                        for idx_j in [0, -1]:
                            if np.linalg.norm(loop_arrays[i][idx_i] - loop_arrays[j][idx_j]) < 1.0:
                                avg = (loop_arrays[i][idx_i] + loop_arrays[j][idx_j]) / 2.0
                                loop_arrays[i][idx_i] = avg
                                loop_arrays[j][idx_j] = avg

        b3d_edges = []
        clamped_tension = max(0.01, params.edge_smoothing / 100.0 if params.edge_smoothing > 1 else params.edge_smoothing)

        for loop_pts in loop_arrays:
            # Check if it's an open or closed loop
            is_closed = np.linalg.norm(loop_pts[0] - loop_pts[-1]) < 1e-3
            
            # Find the sharp corners!
            corners = find_dynamic_corners(loop_pts, params.sharpness_angle)
            
            if len(corners) < 2:
                # If it's a smooth circle or straight line, treat as one curve
                edge = create_tension_edge(loop_pts, force_start=loop_pts[0], force_end=loop_pts[-1], tension=clamped_tension)
                if edge: b3d_edges.append(edge)
            else:
                # --- THE FIX: Slice the loop into multiple separate Splines at the corners ---
                for i in range(len(corners)):
                    start_idx = corners[i]
                    end_idx = corners[(i + 1) % len(corners)]
                    
                    if not is_closed and i == len(corners) - 1:
                        # For open curves, draw the final segment to the very last point
                        end_idx = len(loop_pts) - 1
                        if start_idx >= end_idx: continue
                        seg_pts = loop_pts[start_idx:end_idx+1]
                        edge = create_tension_edge(seg_pts, force_start=loop_pts[start_idx], force_end=loop_pts[end_idx], tension=clamped_tension)
                        if edge: b3d_edges.append(edge)
                        break
                        
                    seg_pts = extract_segment(loop_pts, start_idx, end_idx)
                    edge = create_tension_edge(seg_pts, force_start=loop_pts[start_idx], force_end=loop_pts[end_idx], tension=clamped_tension)
                    if edge: b3d_edges.append(edge)
                # -----------------------------------------------------------------------------

        patch_face = None
        if len(b3d_edges) in [2, 3, 4]:
            try:
                patch_face = b3d.Face.make_surface_from_curves(b3d_edges)
            except Exception as e:
                broadcast_log(f"[Warning] Strict mathematical patch failed, falling back to filling: {e}")

        if patch_face is None:
            try:
                wire = b3d.Wire(b3d_edges)
                try:
                    patch_face = b3d.Face.make_from_wires(wire)
                except Exception:
                    from OCP.BRepOffsetAPI import BRepOffsetAPI_MakeFilling
                    filler = BRepOffsetAPI_MakeFilling()
                    for edge in wire.edges():
                        filler.Add(edge.wrapped, GeomAbs_C0)
                    filler.Build()
                    if filler.IsDone():
                        patch_face = b3d.Face(filler.Shape())
            except Exception as e:
                raise ValueError("Could not generate a valid B-Rep face from the provided wires. Ensure they form a closed loop.")

        if patch_face is None:
            raise ValueError("CAD engine rejected the boundary curves.")

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

        if solid is None:
            raise ValueError("Engine returned null geometry.")

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

        if sheet_face is None:
             raise ValueError("Engine failed to output sheet.")

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
            def resample_loop(points, target_count=100):
                pts = np.array(points)
                if len(pts) < 2: return points
                diffs = np.diff(pts, axis=0)
                diffs = np.vstack([diffs, pts[0] - pts[-1]])
                dists = np.linalg.norm(diffs, axis=1)
                cum_dists = np.insert(np.cumsum(dists), 0, 0)
                total_len = cum_dists[-1]
                if total_len == 0: return points
                
                # Force exactly target_count points via linear interpolation
                target_dists = np.linspace(0, total_len, target_count, endpoint=False)
                resampled = np.zeros((target_count, 3))
                for i in range(3):
                    resampled[:, i] = np.interp(target_dists, cum_dists, np.append(pts[:, i], pts[0, i]))
                return resampled.tolist()

            pts1 = resample_loop(processed_loops[0], 100)
            pts2 = resample_loop(processed_loops[1], 100)
        
            
            # --- THE FIX: Handle Open vs Closed Curves Properly ---
            is_closed_1 = np.linalg.norm(np.array(pts1[0]) - np.array(pts1[-1])) < 1e-3
            is_closed_2 = np.linalg.norm(np.array(pts2[0]) - np.array(pts2[-1])) < 1e-3

            if is_closed_1 and is_closed_2:
                # If they are closed loops, align the start points so it doesn't twist
                p0 = np.array(pts1[0])
                dists = [np.linalg.norm(np.array(p) - p0) for p in pts2]
                best_idx = np.argmin(dists)
                pts2 = pts2[best_idx:] + pts2[:best_idx]
            
            # Align winding direction (prevents bowties for both open and closed)
            if len(pts1) > 1 and len(pts2) > 1:
                vec1 = np.array(pts1[1]) - np.array(pts1[0])
                vec2_forward = np.array(pts2[1]) - np.array(pts2[0])
                vec2_reverse = np.array(pts2[-1]) - np.array(pts2[0])
                
                if np.dot(vec1, vec2_reverse) > np.dot(vec1, vec2_forward):
                    pts2 = list(reversed(pts2)) # Just flip the array!
            # -----------------------------------------------------
            
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

        if solid is None:
            raise ValueError("Boolean engine returned a null Solid.")

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
            if s is not None and hasattr(s, 'wrapped'):
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
        
        sewed_b3d = None
        try:
            if not sewed_shape.IsNull():
                sewed_b3d = b3d.Shape.cast(sewed_shape)
        except Exception:
            sewed_b3d = None
            
        is_solid = False
        final_solid = None

        if sewed_b3d is not None:
            if isinstance(sewed_b3d, b3d.Shell):
                if sewed_b3d.is_closed:
                    try:
                        final_solid = b3d.Solid.make_solid(sewed_b3d)
                        is_solid = True
                    except:
                        final_solid = sewed_b3d
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
                        try:
                            final_solid = b3d.Solid.make_solid(shells[0])
                            is_solid = True
                        except:
                            final_solid = sewed_b3d
                    else:
                        final_solid = sewed_b3d
            else:
                final_solid = sewed_b3d

        if final_solid is None:
            broadcast_log("[Warning] Sewing algorithm failed to bond properly. Grouping as Compound.")
            final_solid = b3d.Compound(children=shapes)

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
                try:
                    result_solid = b3d.Shape.cast(cut_algo.Shape())
                except:
                    result_solid = None
        else:
            raise ValueError("Unsupported boolean operation.")
        
        if result_solid is None:
            raise ValueError("Boolean operation engine returned null geometry.")

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
            try:
                result_solid = b3d.Shape.cast(cut_algo.Shape())
            except:
                result_solid = None
        
        if result_solid is None:
            raise ValueError("Boolean operation failed to output solid geometry.")

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
    
    ref_mesh = state.mesh
    _, _, ref_face_ids = ref_mesh.nearest.on_surface(target_pt)
    if len(ref_face_ids) == 0:
        raise HTTPException(status_code=404, detail="Could not snap to a face.")
    start_ref_face = ref_face_ids[0]
    ref_components = get_patch_components(ref_mesh, params.sharpness_angle)
    ref_target_region = next((comp for comp in ref_components if start_ref_face in comp), [start_ref_face])
    
    wire_id = f"wire_{uuid.uuid4().hex[:8]}"

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
                    
                    # Extract and format corners for UI Debugging 
                    corner_indices = find_dynamic_corners(ordered_points, params.sharpness_angle)
                    corner_pts = [ordered_points[i].tolist() for i in corner_indices]

                    extracted_features.append({
                        "type": "planar",
                        "points": ordered_points.tolist(),
                        "corners": corner_pts, # Added
                        "normal": region_normal.tolist(),
                        "patch_faces": comp.tolist(),
                        "id": f"wire_{uuid.uuid4().hex[:8]}"
                    })
                except:
                    pass
                    
    broadcast_log(f"[Success] Auto-Extract complete. Found {len(extracted_features)} valid features.")
    return {"features": extracted_features}

@app.post("/export-step")
async def export_step(params: ExportStepParams, background_tasks: BackgroundTasks):
    try:
        import build123d as b3d
        from build123d.exporters3d import export_step as b3d_export_step
    except ImportError:
        raise HTTPException(status_code=500, detail="build123d missing")

    broadcast_log(f"[System] Exporting {len(params.active_geo_ids)} active geometries and {len(params.features)} curves to STEP...")
    
    shapes_to_export = []
    
    for geo_id in params.active_geo_ids:
        shape = state.rebuild_geometry.get(geo_id)
        if shape is not None:
            shapes_to_export.append(shape)
            
    for feat in params.features:
        try:
            f_type = feat.get('type')
            if f_type == 'circle':
                c = feat.get('center')
                n = feat.get('normal')
                r = feat.get('radius')
                if c and n and r:
                    plane = b3d.Plane(origin=b3d.Vector(c), z_dir=b3d.Vector(n))
                    shapes_to_export.append(b3d.Edge.make_circle(radius=r, plane=plane))
            
            elif f_type in ['planar', 'plane', 'curve']:
                pts = feat.get('points', [])
                if len(pts) >= 2:
                    vecs = [b3d.Vector(p) for p in pts]
                    if (vecs[0] - vecs[-1]).length > 1e-4:
                        vecs.append(vecs[0])
                    shapes_to_export.append(b3d.Wire.make_polygon(vecs))
        except Exception as e:
            broadcast_log(f"[Warning] Skipped a curve during export reconstruction: {e}")

    if not shapes_to_export:
        broadcast_log("[Error] No active geometry or curves to export.")
        raise HTTPException(status_code=400, detail="No active geometry to export.")

    final_shape = None
    if params.merge_hulls and len(shapes_to_export) > 1:
        try:
            solids = [s for s in shapes_to_export if isinstance(s, b3d.Solid)]
            others = [s for s in shapes_to_export if not isinstance(s, b3d.Solid)]
            
            if solids:
                merged_solid = solids[0]
                for s in solids[1:]:
                    merged_solid = merged_solid + s
                final_shape = b3d.Compound(children=[merged_solid] + others)
            else:
                final_shape = b3d.Compound(children=shapes_to_export)
                
            broadcast_log("[System] Merged solid geometry for export.")
        except Exception as e:
            broadcast_log(f"[Warning] Boolean merge failed during export, grouping instead: {e}")
            final_shape = b3d.Compound(children=shapes_to_export)
    else:
        final_shape = b3d.Compound(children=shapes_to_export) if len(shapes_to_export) > 1 else shapes_to_export[0]

    fd, path = tempfile.mkstemp(suffix=".step")
    os.close(fd)
    
    def remove_temp_file(filepath: str):
        try: os.remove(filepath)
        except Exception: pass
            
    try:
        b3d_export_step(final_shape, path)
        broadcast_log(f"[Success] STEP file generated successfully.")
        background_tasks.add_task(remove_temp_file, path)
        return FileResponse(path=path, filename="RetopoCAD_Export.step", media_type="application/octet-stream")
    except Exception as e:
        background_tasks.add_task(remove_temp_file, path)
        broadcast_log(f"[Error] STEP export crashed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)