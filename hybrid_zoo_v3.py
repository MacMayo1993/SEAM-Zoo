#!/usr/bin/env python3
"""
Hybrid Zoo v3 - RP² Recursive on Wavelet Approximations + Auto-Family Selector
Last updated: January 16, 2026
"""

import numpy as np
import time
import gzip
import json
import pywt
import matplotlib.pyplot as plt
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Tuple, List, Optional
from tqdm import tqdm

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    import zstandard as zstd
    HAS_ZSTD = True
except ImportError:
    HAS_ZSTD = False

np.random.seed(42)

# ============================================================================
# Mini RP² (reusable for recursive calls on approx coeffs)
# ============================================================================

class MiniRP2:
    def __init__(self):
        self.seam = None

    def _estimate_gain(self, data):
        n = len(data)
        if n < 512:
            return -1.0
        mid = n // 2
        left = data[:mid]
        right_f = -data[mid:mid+len(left)][::-1]
        if len(left) != len(right_f):
            return -1.0
        delta = left - right_f
        delta_var = np.var(delta)
        data_var = np.var(data)
        if delta_var >= data_var:
            return -1.0
        ratio = delta_var / (data_var + 1e-10)
        return n * 32 * (1 - ratio) * 0.5 - 2000

    def compress(self, data):
        gain = self._estimate_gain(data)
        if gain < 0:
            bytes_in = data.astype(np.float32).tobytes()
            return gzip.compress(bytes_in, 9) if not HAS_ZSTD else zstd.ZstdCompressor(19).compress(bytes_in), None

        mid = len(data) // 2
        left = data[:mid]
        right = data[mid:]
        flipped = -right[::-1]
        max_len = max(len(left), len(flipped))
        left_p = np.pad(left, (0, max_len - len(left)))
        flipped_p = np.pad(flipped, (0, max_len - len(flipped)))
        delta = left_p - flipped_p

        left_b = left_p.astype(np.float32).tobytes()
        delta_b = delta.astype(np.float32).tobytes()

        if HAS_ZSTD:
            c_left = zstd.ZstdCompressor(19).compress(left_b)
            c_delta = zstd.ZstdCompressor(19).compress(delta_b)
        else:
            c_left = gzip.compress(left_b, 9)
            c_delta = gzip.compress(delta_b, 9)

        header = {
            'mid': mid,
            'orig_len': len(data),
            'left_c_len': len(c_left)
        }
        h_bytes = json.dumps(header).encode()
        h_len = len(h_bytes).to_bytes(4, 'little')
        return h_len + h_bytes + c_left + c_delta, mid

    def decompress(self, compressed):
        h_len = int.from_bytes(compressed[:4], 'little')
        header = json.loads(compressed[4:4+h_len].decode())
        left_start = 4 + h_len
        left_end = left_start + header['left_c_len']
        c_left = compressed[left_start:left_end]
        c_delta = compressed[left_end:]

        if HAS_ZSTD:
            dctx = zstd.ZstdDecompressor()
            left_b = dctx.decompress(c_left)
            delta_b = dctx.decompress(c_delta)
        else:
            left_b = gzip.decompress(c_left)
            delta_b = gzip.decompress(c_delta)

        left_p = np.frombuffer(left_b, np.float32)
        delta = np.frombuffer(delta_b, np.float32)
        flipped_p = left_p - delta
        right = -flipped_p[::-1][:header['orig_len'] - header['mid']]
        left = left_p[:header['mid']]
        return np.concatenate([left, right])


# ============================================================================
# Hybrid Compression with Auto-Family Selector
# ============================================================================

def hybrid_compress(data, families=['db4', 'bior4.4', 'sym8', 'coif5'], levels=5, thresh_factor=2.0):
    """
    Hybrid with automatic wavelet family selection:
    - Test each family
    - Choose the one yielding the smallest compressed size
    - Apply recursive RP² to approx coeffs when gain is positive
    """
    best_compressed = None
    best_size = float('inf')
    best_family = None
    best_coeffs = None
    best_seam = None

    for family in families:
        try:
            coeffs = pywt.wavedec(data, family, level=levels)
            approx = coeffs[0]
            details = coeffs[1:]

            # Try RP² on approx
            rp2 = MiniRP2()
            approx_comp, seam = rp2.compress(approx)

            # Threshold details
            thresholded_details = []
            for d in details:
                thresh = thresh_factor * np.median(np.abs(d)) / 0.6745
                thresholded_details.append(pywt.threshold(d, thresh, mode='soft'))

            # Pack
            packed = {
                'approx': approx_comp,
                'details': [d.astype(np.float32).tobytes() for d in thresholded_details],
                'seam': seam,
                'orig_len': len(data),
                'wavelet': family,
                'levels': levels
            }
            packed_bytes = gzip.compress(json.dumps(packed, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o)).encode(), 9) if not HAS_ZSTD else zstd.ZstdCompressor(19).compress(json.dumps(packed, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o)).encode())
            packed_size = len(packed_bytes)

            if packed_size < best_size:
                best_size = packed_size
                best_compressed = packed_bytes
                best_family = family
                best_coeffs = coeffs
                best_seam = seam

        except Exception as e:
            print(f"Warning: Family {family} failed - {e}")
            continue

    if best_compressed is None:
        raise RuntimeError("No wavelet family succeeded")

    print(f"  → Best family: {best_family} (size {best_size:,} bytes)")
    if best_seam is not None:
        print(f"  → RP² applied to approx coeffs (seam at {best_seam})")
    else:
        print("  → No RP² applied to approx (insufficient symmetry)")

    return best_compressed, best_coeffs, best_family


def hybrid_decompress(compressed):
    raw = gzip.decompress(compressed) if not HAS_ZSTD else zstd.ZstdDecompressor().decompress(compressed)
    packed = json.loads(raw.decode())

    approx_comp = packed['approx']
    if packed['seam'] is not None:
        rp2 = MiniRP2()
        approx = rp2.decompress(approx_comp)
    else:
        approx = np.frombuffer(gzip.decompress(approx_comp) if not HAS_ZSTD else zstd.ZstdDecompressor().decompress(approx_comp), np.float32)

    details = [np.frombuffer(d.encode('latin1') if isinstance(d, str) else d, np.float32) for d in packed['details']]

    coeffs = [approx] + details
    reconstructed = pywt.waverec(coeffs, packed['wavelet'])
    return reconstructed[:packed['orig_len']]


# ============================================================================
# Visualization
# ============================================================================

def visualize_hybrid(data, name, coeffs, family, seam=None):
    fig, axs = plt.subplots(4, 1, figsize=(14, 12), sharex=True)
    fig.suptitle(f"Hybrid Zoo v3: {name} (Best family: {family})", fontsize=16)

    # 1. Original
    axs[0].plot(data, 'b-', label='Original', linewidth=1.2)
    axs[0].set_title("Original Signal")
    axs[0].legend()
    axs[0].grid(True, alpha=0.3)

    # 2. Wavelet coeffs
    axs[1].plot(coeffs[0], 'g-', label='Approx (cA)', linewidth=1.5)
    offset = 0
    for i, d in enumerate(coeffs[1:], 1):
        axs[1].plot(np.arange(offset, offset+len(d)), d, label=f'Detail {i}', alpha=0.7)
        offset += len(d)
    axs[1].set_title(f"Wavelet Coefficients ({family}, 5 levels)")
    axs[1].legend()
    axs[1].grid(True, alpha=0.3)

    # 3. RP² delta (if applied)
    if seam is not None:
        approx = coeffs[0]
        mid = seam
        left = approx[:mid]
        flipped = -approx[mid:mid+len(left)][::-1]
        delta = left - np.pad(flipped, (0, len(left) - len(flipped)))
        axs[2].plot(delta, 'r-', label='RP² Delta on Approx')
        axs[2].set_title(f"RP² Delta (seam at {seam})")
        axs[2].legend()
        axs[2].grid(True, alpha=0.3)
    else:
        axs[2].text(0.5, 0.5, "No RP² delta\n(approx had insufficient symmetry gain)",
                    ha='center', va='center', fontsize=12)
        axs[2].set_title("RP² Delta (Skipped)")
        axs[2].axis('off')

    # 4. Reconstruction
    recon = hybrid_decompress(hybrid_compress(data)[0])
    axs[3].plot(data, 'b-', alpha=0.6, label='Original')
    axs[3].plot(recon, 'orange', linestyle='--', label='Hybrid Reconstruction')
    axs[3].set_title("Hybrid Reconstruction vs Original")
    axs[3].legend()
    axs[3].grid(True, alpha=0.3)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    save_path = Path(f"results/hybrid_viz_{name.replace(' ', '_')}.png")
    save_path.parent.mkdir(exist_ok=True)
    plt.savefig(save_path, dpi=200)
    plt.close()
    print(f"  Visualization saved: {save_path}")


# ============================================================================
# Test Suite
# ============================================================================

def generate_tests(n=20000):
    tests = {}
    x = np.linspace(-np.pi, np.pi, n)
    tests['Perfect Odd'] = np.sin(5 * x)
    tests['Noisy Odd 5%'] = tests['Perfect Odd'] + 0.05 * np.random.randn(n)
    seg_len = n // 10
    base = np.sin(np.linspace(0, 4*np.pi, seg_len))
    tests['Piecewise Flipped'] = np.concatenate([base if i%2==0 else -base[::-1] for i in range(10)])
    seg_len = n // 8
    tests['Sensor Gradient'] = np.concatenate([np.cumsum(np.random.randn(seg_len) * 0.1 + (0.02 if i%2==0 else -0.02)) for i in range(8)])
    tests['Random Control'] = np.random.randn(n)
    return tests


def run_benchmark():
    print("\n" + "="*80)
    print("Hybrid Zoo v3 Benchmark - Auto-Family + Recursive RP²")
    print("="*80)

    tests = generate_tests()
    results = []

    for name, data in tqdm(tests.items(), desc="Benchmarking"):
        print(f"\n\n=== {name} ===")
        orig_size = len(data.astype(np.float32).tobytes())
        gz = gzip.compress(data.astype(np.float32).tobytes(), 9)
        gz_ratio = orig_size / len(gz)

        start = time.time()
        compressed, coeffs, family = hybrid_compress(data)
        hyb_time = time.time() - start
        hyb_ratio = orig_size / len(compressed)

        # Extract seam info if available
        seam = None
        try:
            raw = gzip.decompress(compressed) if not HAS_ZSTD else zstd.ZstdDecompressor().decompress(compressed)
            packed = json.loads(raw.decode())
            seam = packed.get('seam')
        except:
            pass

        print(f"  gzip baseline: {gz_ratio:.2f}×")
        print(f"  Hybrid Zoo:    {hyb_ratio:.2f}×  ({hyb_time:.3f}s)")
        print(f"  Advantage:     {hyb_ratio / gz_ratio:.2f}×")

        # Visualize
        visualize_hybrid(data, name, coeffs, family, seam)

        results.append({
            'Test': name,
            'gzip_ratio': gz_ratio,
            'hybrid_ratio': hyb_ratio,
            'advantage': hyb_ratio / gz_ratio,
            'family': family
        })

    print("\n" + "="*80)
    print("SUMMARY")
    print("="*80)

    if HAS_PANDAS:
        df = pd.DataFrame(results)
        print(df.round(2).to_string(index=False))
    else:
        # Fallback to manual formatting
        print(f"{'Test':<20} {'gzip Ratio':<12} {'Hybrid Ratio':<14} {'Advantage':<12} {'Family':<10}")
        print("-" * 80)
        for r in results:
            print(f"{r['Test']:<20} {r['gzip_ratio']:<12.2f} {r['hybrid_ratio']:<14.2f} {r['advantage']:<12.2f} {r['family']:<10}")

    print("\nVisualizations saved in results/ directory as hybrid_viz_*.png")


if __name__ == "__main__":
    print("Hybrid Zoo v3 - Auto-Family Selector + Recursive RP² + Visualization")
    run_benchmark()
