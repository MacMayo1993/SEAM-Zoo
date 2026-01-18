# SEAM-Zoo Interactive Visualization

An interactive 3D pedagogical visualization for exploring compression algorithms using RP² (Real Projective Space) folding and wavelet transforms.

## Features

- **5 Progressive Levels**: From perfect symmetry to complex optimization challenges
- **Real-time 3D Visualization**: Interactive ribbon geometry showing signal folding
- **Symmetry Heatmap**: 2D plot showing local signal symmetry
- **Strain Indicators**: Visual feedback on compression efficiency
- **Antipode Visualization**: Toggle ghost lines showing RP² quotient mapping
- **Educational Overlays**: Context-aware tutorial hints for each level

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
cd visualization
npm install
```

### Run Development Server

```bash
npm run dev
```

The app will open automatically at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

## How to Play

### Level 1: Perfect Symmetry
Learn the basics by folding a perfectly symmetric signal. Watch the compression ratio increase to 2× with zero strain!

### Level 2: Phase Offset Attack
Experience strain visualization as orange "glow" appears when folding imperfect symmetry.

### Level 3: Regime Switch
Unlock seam control! Place the seam at regime boundaries to optimize compression of multi-pattern signals.

### Level 4: High-Entropy Chaos
Discover failure modes - watch MDL (Minimum Description Length) go negative when folding random data.

### Level 5: Advanced Partial Fold
Master optimization by identifying and folding only the symmetric regions of a complex signal.

## Controls

- **Fold Parameter Slider**: Interpolate between manifold (0) and quotient space (1)
- **Seam Position Slider**: Control where the fold begins (unlocked in levels 3 & 5)
- **Show/Hide Antipodes**: Visualize the geometric mapping between position ↔ antipode
- **Show/Hide Plot**: Toggle the 2D symmetry heatmap
- **COMMIT Button**: Lock in your fold and advance to the next level

## Pedagogical Concepts

### Information Theory
- **MDL (Minimum Description Length)**: Balance between compression benefit and encoding overhead
- **Entropy**: Measure of signal randomness and compressibility

### Differential Geometry
- **RP² (Real Projective Plane)**: Quotient space where antipodal points are identified
- **Strain Field**: Geometric cost of the folding operation

### Signal Processing
- **Symmetry Detection**: Identifying odd-symmetric patterns for compression
- **Regime Switching**: Handling signals with multiple behavioral patterns
- **Wavelet Correlation**: Multi-resolution analysis of signal structure

## Technical Details

### Built With
- **React 18** - UI framework
- **Three.js** - 3D rendering engine
- **React Three Fiber** - React renderer for Three.js
- **Vite** - Fast build tool and dev server

### Key Components

#### `buildTubeWithAntipodes()`
Generates tube geometry along a 3D curve and computes antipodal mappings for RP² visualization.

#### `SignalRibbon`
Main 3D component with custom shaders for:
- Fold parameter interpolation
- Strain-based coloring
- Seam position markers

#### `SymmetryPlot`
Canvas-based 2D visualization showing:
- Signal waveform
- Local symmetry correlation (green/orange gradient)
- Seam position marker

## Metrics Explained

### Compression Ratio
```
compression = 1.0 + fold * symmetry
```
Maximum value is 2.0× (perfect folding of perfectly symmetric signal)

### MDL Gain
```
mdl = symmetry * fold - 3.0 * strain_cost
```
Positive values indicate compression benefit; negative indicates overhead exceeds savings.

### Strain
Geometric distance between original position and antipodal mapping. High strain = wasted encoding bits.

## Educational Applications

### Classroom Use (60-minute lesson)
1. **Intro** (10 min): What is compression?
2. **Guided Play** (15 min): Instructor demonstrates levels 1-2
3. **Independent Exploration** (15 min): Students complete levels 3-5
4. **Discussion** (15 min): Why did level 4 fail? How is this like JPEG?
5. **Wrap-up** (5 min): Connect to real compression algorithms

### Assessment
- **Basic**: Complete all 5 levels
- **Proficient**: Score > 500 points
- **Advanced**: Explain MDL formula in own words

## Architecture

```
visualization/
├── src/
│   ├── App.jsx           # Main component with all logic
│   └── main.jsx          # React entry point
├── public/               # Static assets
├── index.html            # HTML template
├── vite.config.js        # Vite configuration
├── package.json          # Dependencies
└── README.md            # This file
```

## Performance

- **60 FPS** on modern hardware
- **220-point signals** with real-time interpolation
- **Custom GLSL shaders** for efficient GPU rendering

## Future Enhancements

- [ ] Save/replay optimal solutions
- [ ] Challenge mode with time limits
- [ ] Upload custom signals (CSV/audio)
- [ ] Multiplayer co-op mode
- [ ] VR support for Oculus Quest

## License

MIT - See LICENSE file in root directory

## Related

This visualization complements the Python-based compression algorithm in the parent directory (`../hybrid_zoo_v3.py`).
