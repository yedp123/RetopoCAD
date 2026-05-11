# **RetopoCAD 🚀**

<img width="1920" height="919" alt="1778509335081933314429384891700" src="https://github.com/user-attachments/assets/640fa6e9-e67d-4f76-93f5-b95efd5d9175" />


**An experimental, browser-based tool to bridge the gap between messy high-poly meshes and clean Solid CAD.**

## **⚠️ Highly Experimental**

## **Features**

wip

## **Tech Stack & Credits**

A special thanks to [Andrea Pozzetti](https://github.com/PozzettiAndrea) for his constant advices, expertise and guidance, this project wouldn't have been possible without him!

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
