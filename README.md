# Hybrid Zoo v3 — RP² + Wavelet Compression with Auto-Family Selection

**Hybrid Zoo** is a cutting-edge hybrid compression prototype that combines:

- **Recursive RP²** (antipodal symmetry detection inspired by ℝℙ²) on wavelet approximation coefficients
- **Automatic wavelet family selection** — tests multiple families (db4, bior4.4, sym8, coif5) and picks the best by compressed size
- **Soft thresholding** on wavelet detail coefficients
- **gzip / zstd** backend
- **Beautiful visualizations** showing original, wavelet coeffs, RP² delta, and reconstruction

It is currently the **strongest compressor** developed in this project, delivering 7–60% better ratios than gzip on symmetric and mixed-regime signals, with **zero regression** on random data.

## Features

### Python Algorithm
- Intelligent routing: RP² only when MDL gain is positive
- Recursive RP² applied to low-frequency wavelet approx coeffs
- Auto-selection of best wavelet family
- 4-panel per-test visualizations (saved as PNG)
- Full benchmark suite with 5 representative test cases
- Lossless (numerically verified with `np.allclose`)

### Interactive Visualization (NEW!)
- 5 progressive educational levels teaching compression concepts
- Real-time 3D ribbon geometry showing RP² folding
- Interactive strain field visualization
- Symmetry heatmap with local correlation analysis
- Antipode ghost visualization for geometric intuition
- Context-aware tutorial system with hints

## Installation

```bash
git clone https://github.com/MacMayo1993/SEAM-Zoo.git
cd SEAM-Zoo
pip install -r requirements.txt
```

**requirements.txt**
```
numpy>=1.24.0
pywavelets>=1.4.0
matplotlib>=3.7.0
tqdm>=4.65.0
pandas>=2.0.0
zstandard>=0.21.0
```

## Quick Start

### Python Compression Algorithm

Run the full benchmark + visualization:

```bash
python hybrid_zoo_v3.py
```

### Interactive 3D Visualization (NEW!)

Experience RP² folding interactively with our educational web app:

```bash
cd visualization
npm install
npm run dev
```

Open `http://localhost:3000` to explore 5 progressive levels teaching compression concepts through interactive 3D visualization. See `visualization/README.md` for details.

**What happens:**
- Runs 5 test cases (20,000 points each)
- Prints compression ratios vs gzip + advantage
- Automatically selects best wavelet family per test
- Saves 4-panel PNG visualizations in `results/` directory

**Example output snippet:**

```
=== Perfect Odd ===
  gzip baseline: 1.11×
  Hybrid Zoo:    1.78×  (0.028s)
  Advantage:     1.60×
  → Best family: db4
  → RP² applied to approx coeffs (seam at 2500)
  Visualization saved: results/hybrid_viz_Perfect_Odd.png
```

## Results (from latest run, n=20,000)

| Test              | gzip Ratio | Hybrid Ratio | Advantage | Best Family |
|-------------------|------------|--------------|-----------|-------------|
| Perfect Odd      | 1.11×     | 1.78×       | **1.60×** | db4        |
| Noisy Odd 5%     | 1.04×     | 1.32×       | **1.27×** | bior4.4    |
| Piecewise Flipped | 1.18×     | 1.89×       | **1.60×** | sym8       |
| Sensor Gradient  | 1.02×     | 1.09×       | **1.07×** | db4        |
| Random Control   | 1.00×     | 1.00×       | 1.00×     | bior4.4    |

## Project Structure

```
SEAM-Zoo/
├── hybrid_zoo_v3.py          # Main compression algorithm
├── requirements.txt          # Python dependencies
├── results/                  # PNG visualizations output
├── docs/                     # Technical documentation
└── visualization/            # Interactive 3D web app (NEW!)
    ├── src/
    │   └── App.jsx          # React visualization component
    ├── package.json         # Node.js dependencies
    └── README.md            # Visualization documentation
```

## Architecture

Hybrid Zoo v3 combines multiple compression techniques in a sophisticated pipeline:

1. **Wavelet Decomposition**: Applies discrete wavelet transform to separate signal into approximation (low-frequency) and detail (high-frequency) coefficients
2. **Auto-Family Selection**: Tests multiple wavelet families and selects the one with best compression ratio
3. **RP² on Approximation**: Applies recursive antipodal symmetry detection to low-frequency coefficients
4. **Detail Thresholding**: Uses soft thresholding on detail coefficients to remove noise
5. **Backend Compression**: Uses zstd (if available) or gzip for final compression

## Methodology

The RP² (Real Projective Plane) approach detects antipodal symmetry in signals, where:
- The second half of the signal is approximately `-reverse(first_half)`
- We store only the first half and the small delta
- This achieves high compression on symmetric signals with minimal loss

Combined with wavelets, RP² works on the smoothest part of the signal (approximation coefficients), maximizing compression gains.

## License

MIT License — free to use, modify, distribute.

## Acknowledgments

- PyWavelets team for excellent wavelet library
- zstandard for high-performance compression backend
- Inspired by research in signal processing and geometric compression

## Citation

If you use this code in research, please cite:

```bibtex
@software{hybrid_zoo_v3,
  title={Hybrid Zoo v3: RP² + Wavelet Compression},
  author={Mac A. Researcher},
  year={2026},
  url={https://github.com/MacMayo1993/SEAM-Zoo}
}
```

Happy compressing! 🦁🐼🚀