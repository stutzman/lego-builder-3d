# 🧱 BrickForge 3D — Interactive Text-to-LEGO Animator & Studio

An interactive 3D LEGO brick building experience powered by Three.js. Type what you want to build and watch it assemble brick-by-brick in real time at any speed you choose.

## 🚀 Quick Start (Zero Install Needed)
1. **Direct Open:** Double-click `index.html` or `BrickForge-3D-Standalone.html` in any modern web browser (Chrome, Safari, Edge, Firefox).
2. **Or Serve Locally:**
   ```bash
   python3 -m http.server 8420
   ```
   Then open `http://localhost:8420`.

## ✨ Features
- **Hybrid Text-to-LEGO Engine (`js/generator.js`):**
  - Built-in **Procedural 3D Architect** works 100% offline with zero setup (Castles, Race Cars, Starfighters, Giant Robots, Houses, T-Rex Dinosaurs, Lighthouses, Pyramids, Skyscrapers, Trees, and 3D LEGO Typography via `word: YOURTEXT`).
  - Automatic **Interlocking Brick Optimizer** merges voxels into staggered multi-stud LEGO bricks (`2×6`, `2×4`, `2×3`, `2×2`, `1×4`, `1×2`, `1×1`).
  - Optional **Live LLM Integration** (Google Gemini or OpenAI API key via the **🧠 Hybrid Engine** button).
- **Real-Time Speed & Timeline Scrubber:**
  - Control build speed from `0.1×` slow-motion to `15×` hyper-speed.
  - Scrub through the timeline bar or step brick-by-brick (`-1` / `+1` or `←` / `→` arrow keys).
- **Manual Brick Builder & Paint Tools:**
  - Switch between **🎥 Camera**, **🧱 Add Brick** (`R` to rotate 90°), **🎨 Paint**, and **🗑️ Erase** modes.
- **Physics & Destruction (`js/physicsEngine.js`):**
  - Click **💥 Explode Build (TNT)** or use **☄️ Smash** mode to knock bricks loose with 3D gravity and bounce physics, then click **⏪ Reassemble Bricks** to reverse time.
- **Instruction Manual & Parts List:**
  - Click **📖 Manual & Parts** for step-by-step layer cards, **X-Ray Layer Isolation**, and a complete Bill of Materials.
