# **RetopoCAD 🚀**

**An experimental, browser-based tool to bridge the gap between messy high-poly meshes and clean Solid CAD.**

RetopoCAD allows you to upload high-density .obj files (like kitbashed concepts, 3D scans, or ZBrush sculpts), automatically convert them into mathematically solid blockouts, extract analytical curves (circles/planar shapes), and export the entire package directly to a .step file.

This creates a seamless bridge into modern CAD software like **Plasticity** or **Fusion 360** without having to manually retopologize your mesh click-by-click.

## **⚠️ Highly Experimental**

This project was developed as a rapid prototype and MVP. It relies on intense mathematical operations, floating-point geometry sewing, and C++ bindings. While the export functions feature "robust fallbacks," edge cases with corrupted meshes, zero-thickness geometry, or highly complex triangulations may cause unexpected behavior. **Save your sessions often\!**

## **Features**

* **Auto-Blocker:** Uses Approximate Convex Decomposition to slice organic and hard-surface meshes into watertight CAD blocks.  
* **Smart Curve Extraction:** Click on any flat panel or cylindrical hole. The Python backend will analyze the surface curvature variance to automatically fit a perfectly mathematical 2D Circle or trace the polygon boundary into a 1D CAD sketch.  
* **Batch Auto-Extract:** Scans the entire mesh and automatically extracts all valid curves that meet your minimum size threshold.  
* **Live STEP Export:** Compiles triangulated hulls via the OpenCASCADE sewing API into solid BREP bodies, merges them via Boolean Unions, and injects your 2D sketches into a single .step file.  
* **Session Management:** Save your blocks, settings, and curves to a lightweight .json file to easily pick up where you left off.

## **Tech Stack & Credits**

This tool stands on the shoulders of giants. It was built using:

* **Frontend:** React, React Three Fiber (Three.js), TailwindCSS, Vite.  
* **Backend:** FastAPI, Uvicorn, Python 3.12.  
* **Geometry Processing:**  
  * [**CoACD**](https://github.com/SarahWeiii/CoACD) (Collision-Aware Convex Decomposition) by Wei et al. \- *The genius C++ engine powering the Auto-Blocker.*  
  * [**build123d**](https://build123d.readthedocs.io/) & **OCP** \- *The incredible Python wrapper for the OpenCASCADE CAD kernel, used for boolean unions, sewing, and STEP generation.*  
  * [**trimesh**](https://github.com/mikedh/trimesh) \- *For parsing and graph analysis.*  
  * [**fast-simplification**](https://github.com/Louis-Pujol/fast-simplification) \- *For the high-speed pre-decimation pass.*  
  * **SciPy / NetworkX** \- *For boundary pathfinding and least-squares mathematical circle fitting.*

## **Installation (Local Development)**

### **1\. Python Backend**

You will need Python 3.12. Create a virtual environment and install the dependencies:

python \-m venv .venv  
.\\.venv\\Scripts\\activate  
pip install fastapi uvicorn pydantic python-multipart trimesh numpy scipy networkx coacd fast-simplification build123d aiofiles

Start the server:

python main.py

### **2\. React Frontend**

In a separate terminal, navigate to your frontend directory:

npm install  
npm run dev

*Developed by Yann.*