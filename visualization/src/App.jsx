import React, { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";

// -------------------------
// Geometry: Tube + antipodes
// -------------------------
function buildTubeWithAntipodes(points, radius, tubularSegments, radialSegments) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const posAttr = geo.attributes.position;
  const vertexCount = posAttr.count;
  const ringSize = radialSegments + 1;
  const ringCount = Math.floor(vertexCount / ringSize);

  const aAntipode = new Float32Array(vertexCount * 3);
  const aStrain = new Float32Array(vertexCount);
  const aU = new Float32Array(vertexCount); // curve parameter for seam viz

  const curveSamples = [];
  for (let i = 0; i < ringCount; i++) {
    const u = i / (ringCount - 1);
    curveSamples.push(curve.getPointAt(u));
  }

  let maxStrain = 0;
  for (let vi = 0; vi < vertexCount; vi++) {
    const ringId = Math.floor(vi / ringSize);
    const u = ringId / (ringCount - 1);
    const u2 = 1.0 - u;

    const c1 = curveSamples[ringId];
    const c2 = curve.getPointAt(u2);

    const v = new THREE.Vector3(posAttr.getX(vi), posAttr.getY(vi), posAttr.getZ(vi));
    const offset = v.clone().sub(c1);

    const v2 = c2.clone().sub(offset);
    aAntipode[3 * vi + 0] = v2.x;
    aAntipode[3 * vi + 1] = v2.y;
    aAntipode[3 * vi + 2] = v2.z;

    const strain = v.distanceTo(v2);
    aStrain[vi] = strain;
    aU[vi] = u;
    if (strain > maxStrain) maxStrain = strain;
  }

  geo.setAttribute("aAntipode", new THREE.BufferAttribute(aAntipode, 3));
  geo.setAttribute("aStrain", new THREE.BufferAttribute(aStrain, 1));
  geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1));

  return { geo, maxStrain };
}

// -------------------------
// Levels
// -------------------------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS = [
  {
    name: "Tutorial: Perfect Symmetry",
    desc: "Pure odd-symmetric signal. Notice how the fold creates zero strain.",
    idealSymmetry: 0.999,
    makeGen: () => (t) => Math.sin(t * 2.0),
    hint: "Drag the slider all the way to 1.0 - watch the ribbon collapse perfectly!",
    seamPos: 0.5,
    teachingFocus: "symmetry",
  },
  {
    name: "Phase Offset Attack",
    desc: "Signal shifted by π/4. Fold creates visible strain (orange glow).",
    idealSymmetry: 0.65,
    makeGen: () => (t) => Math.sin(t * 1.2 + 0.3) + Math.cos(t * 0.5) * 0.4,
    hint: "Notice the orange 'seam leak' when you fold - that's wasted bits!",
    seamPos: 0.5,
    teachingFocus: "strain",
  },
  {
    name: "Regime Switch (k* Zone)",
    desc: "Two different patterns. Global fold wastes bits - can you find the seam?",
    idealSymmetry: 0.45,
    makeGen: () => (t) => (t < 0 ? Math.sin(t * 3) : Math.sin(-t * 3 + 0.8)),
    hint: "Try placing the seam at the regime boundary (center). Then fold only one half.",
    seamPos: 0.5,
    teachingFocus: "seam",
    allowSeamControl: true,
  },
  {
    name: "High-Entropy Chaos",
    desc: "Random noise. Folding creates more overhead than benefit.",
    idealSymmetry: 0.15,
    makeGen: (seed) => {
      const rnd = mulberry32(seed);
      return (t) => 0.5 * Math.sin(t * 4.0) + (rnd() - 0.5) * 0.7;
    },
    hint: "This is where traditional compression wins. Watch MDL go negative!",
    seamPos: 0.5,
    teachingFocus: "entropy",
  },
  {
    name: "Advanced: Partial Fold",
    desc: "High symmetry but only in [0.3, 0.7] range. Can you optimize?",
    idealSymmetry: 0.85,
    makeGen: () => (t) => {
      const w = 1.0 / (1.0 + Math.exp(-10 * (Math.abs(t) - 1.5))); // smooth window
      return Math.sin(t * 2.5) * w + (1 - w) * (Math.random() - 0.5);
    },
    hint: "Place seam at 0.3 or 0.7, then fold only the symmetric region!",
    seamPos: 0.5,
    teachingFocus: "optimization",
    allowSeamControl: true,
    allowPartialFold: true,
  },
];

// -------------------------
// Tutorial Overlay
// -------------------------
function TutorialOverlay({ level, stats, fold, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const hints = {
    symmetry: stats.compression > 1.5 && fold > 0.8
      ? "✓ Perfect! High symmetry = high compression."
      : null,
    strain: stats.strain > 0.15 && fold > 0.5
      ? "⚠ See the orange glow? That's strain = wasted bits."
      : null,
    seam: fold > 0.3
      ? "💡 Hint: The seam should be where the pattern changes."
      : null,
    entropy: stats.mdl < 0 && fold > 0.6
      ? "✓ Correct! Random data gets WORSE when folded."
      : null,
  };

  const currentHint = hints[level.teachingFocus];

  return currentHint ? (
    <div style={styles.tutorialBubble}>
      <div>{currentHint}</div>
      <button onClick={() => setDismissed(true)} style={styles.dismissBtn}>
        Got it
      </button>
    </div>
  ) : null;
}

// -------------------------
// Symmetry Heatmap (2D plot)
// -------------------------
function SymmetryPlot({ points, seamPos }) {
  const canvasRef = useRef();

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, w, h);

    // Extract 1D signal
    const signal = points.map(p => p.y);
    const n = signal.length;

    // Draw signal
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * w;
      const y = h / 2 - signal[i] * (h / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw seam marker
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    const seamX = seamPos * w;
    ctx.beginPath();
    ctx.moveTo(seamX, 0);
    ctx.lineTo(seamX, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Symmetry gradient (local correlation)
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < n - 1; i++) {
      const u = i / (n - 1);
      const u2 = 1 - u;
      const j = Math.floor(u2 * (n - 1));
      const corr = 1.0 - Math.abs(signal[i] + signal[j]) / 2.0; // rough antisymmetry
      const x1 = (i / (n - 1)) * w;
      const x2 = ((i + 1) / (n - 1)) * w;

      ctx.fillStyle = corr > 0.5 ? "#34d399" : "#fb923c";
      ctx.fillRect(x1, h - 20, x2 - x1, 20);
    }
    ctx.globalAlpha = 1.0;

    // Labels
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    ctx.fillText("Signal (green = symmetric, orange = asymmetric)", 5, 12);
    ctx.fillText("Seam →", seamX + 5, h - 25);

  }, [points, seamPos]);

  return <canvas ref={canvasRef} width={400} height={120} style={styles.plotCanvas} />;
}

// -------------------------
// Strain Field Indicator
// -------------------------
function StrainIndicator({ strain, maxStrain }) {
  const pct = Math.min(100, (strain / maxStrain) * 100);
  return (
    <div style={styles.strainBar}>
      <div style={styles.strainLabel}>STRAIN LEAK</div>
      <div style={styles.strainTrack}>
        <div
          style={{
            ...styles.strainFill,
            width: `${pct}%`,
            background: pct > 60 ? "#ef4444" : pct > 30 ? "#fb923c" : "#34d399",
          }}
        />
      </div>
      <div style={styles.strainPct}>{pct.toFixed(0)}%</div>
    </div>
  );
}

// -------------------------
// Ribbon component
// -------------------------
function SignalRibbon({ levelIdx, fold, seamPos, onStats, showAntipodes }) {
  const matRef = useRef();
  const antipodesRef = useRef();

  const { points, idealSymmetry, seed } = useMemo(() => {
    const lvl = LEVELS[levelIdx];
    const s = 1234 + levelIdx * 999;
    const gen = lvl.makeGen(s);
    const pts = [];
    const count = 220;
    for (let i = 0; i < count; i++) {
      const u = i / (count - 1);
      const t = (u * 2 - 1) * 5;
      const x = t;
      const y = gen(t);
      const z = 0.3 * Math.cos(t * 1.5);
      pts.push(new THREE.Vector3(x, y, z));
    }
    return { points: pts, idealSymmetry: lvl.idealSymmetry, seed: s };
  }, [levelIdx]);

  const { geo, maxStrain } = useMemo(() => {
    return buildTubeWithAntipodes(points, 0.10, 140, 10);
  }, [points]);

  const uniforms = useMemo(
    () => ({
      uFold: { value: 0 },
      uTime: { value: 0 },
      uGlow: { value: 1.2 },
      uMaxStrain: { value: 1.0 },
      uSeamPos: { value: 0.5 },
      uColorA: { value: new THREE.Color("#60a5fa") },
      uColorB: { value: new THREE.Color("#fb923c") },
      uSeamColor: { value: new THREE.Color("#22d3ee") },
    }),
    []
  );

  const lastStatsT = useRef(0);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (matRef.current) {
      matRef.current.uniforms.uFold.value = fold;
      matRef.current.uniforms.uTime.value = t;
      matRef.current.uniforms.uMaxStrain.value = maxStrain;
      matRef.current.uniforms.uSeamPos.value = seamPos;
    }

    if (t - lastStatsT.current > 0.10) {
      lastStatsT.current = t;
      const sym = idealSymmetry;
      const strainCost = (1.0 - sym) * fold;
      const compression = 1.0 + fold * sym;
      const mdl = sym * fold - 3.0 * strainCost;
      onStats({
        compression,
        mdl,
        strain: strainCost,
        maxStrain,
        seed,
      });
    }
  });

  // Antipode ghost visualization
  const antiGeo = useMemo(() => {
    if (!showAntipodes) return null;
    const positions = geo.attributes.position.array;
    const antipodes = geo.attributes.aAntipode.array;
    const lineGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < positions.length; i += 30) {
      pts.push(
        new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]),
        new THREE.Vector3(antipodes[i], antipodes[i + 1], antipodes[i + 2])
      );
    }
    lineGeo.setFromPoints(pts);
    return lineGeo;
  }, [geo, showAntipodes]);

  return (
    <>
      <mesh geometry={geo}>
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={`
            uniform float uFold;
            uniform float uSeamPos;
            attribute vec3 aAntipode;
            attribute float aStrain;
            attribute float aU;
            varying float vStrain;
            varying float vFold;
            varying float vU;

            void main() {
              vec3 pos = position;
              vec3 anti = aAntipode;
              vec3 interp = mix(pos, anti, uFold);

              vStrain = aStrain;
              vFold = uFold;
              vU = aU;

              gl_Position = projectionMatrix * modelViewMatrix * vec4(interp, 1.0);
            }
          `}
          fragmentShader={`
            uniform float uTime;
            uniform float uGlow;
            uniform float uMaxStrain;
            uniform float uSeamPos;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            uniform vec3 uSeamColor;

            varying float vStrain;
            varying float vFold;
            varying float vU;

            void main() {
              float sn = vStrain / (uMaxStrain + 0.01);

              vec3 baseColor = (sn >= 0.0) ? uColorA : uColorB;

              float seam = pow(abs(sn), 2.5) * vFold * uGlow;
              vec3 hot = vec3(1.0, 0.35, 0.15);
              vec3 color = mix(baseColor * 0.75, hot, seam);
              color += seam * 1.25;

              // Seam marker (cyan flash)
              float seamDist = abs(vU - uSeamPos);
              float seamPulse = exp(-50.0 * seamDist) * (0.5 + 0.5 * sin(uTime * 6.0));
              color += uSeamColor * seamPulse * vFold * 0.8;

              gl_FragColor = vec4(color, 1.0);
            }
          `}
        />
      </mesh>

      {showAntipodes && antiGeo && (
        <lineSegments geometry={antiGeo}>
          <lineBasicMaterial color="#22d3ee" transparent opacity={0.3} />
        </lineSegments>
      )}
    </>
  );
}

// -------------------------
// App UI
// -------------------------
export default function App() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [fold, setFold] = useState(0);
  const [seamPos, setSeamPos] = useState(0.5);
  const [stats, setStats] = useState({ compression: 1, mdl: 0, strain: 0, maxStrain: 1, seed: 0 });
  const [score, setScore] = useState(0);
  const [showHelp, setShowHelp] = useState(true);
  const [showAntipodes, setShowAntipodes] = useState(false);
  const [showPlot, setShowPlot] = useState(true);

  const lvl = LEVELS[levelIdx];

  const commitFold = () => {
    const pts = Math.max(0, Math.floor(stats.mdl * 100));
    setScore((s) => s + pts);
    setFold(0);
    setSeamPos(0.5);
    setLevelIdx((i) => (i + 1) % LEVELS.length);
    setShowHelp(true);
  };

  // Generate points for symmetry plot
  const points = useMemo(() => {
    const gen = lvl.makeGen(1234 + levelIdx * 999);
    const pts = [];
    for (let i = 0; i < 220; i++) {
      const u = i / 219;
      const t = (u * 2 - 1) * 5;
      pts.push(new THREE.Vector3(t, gen(t), 0));
    }
    return pts;
  }, [levelIdx]);

  return (
    <div style={styles.page}>
      {/* Header HUD */}
      <div style={styles.hud}>
        <div>
          <div style={styles.title}>SEAM-ZOO § PEDAGOGY</div>
          <div style={styles.sub}>Level {levelIdx + 1}/{LEVELS.length}: {lvl.name}</div>
          <div style={styles.desc}>{lvl.desc}</div>
        </div>
        <div style={styles.metrics}>
          <div style={styles.metricBox}>
            <div style={styles.metricLabel}>Compression</div>
            <div style={styles.metricValue}>{stats.compression.toFixed(2)}×</div>
          </div>
          <div style={styles.metricBox}>
            <div style={styles.metricLabel}>MDL Gain</div>
            <div
              style={{
                ...styles.metricValue,
                color: stats.mdl >= 0 ? "#34d399" : "#fb7185",
              }}
            >
              {stats.mdl.toFixed(3)}
            </div>
          </div>
          <div style={styles.metricBox}>
            <div style={styles.metricLabel}>Score</div>
            <div style={styles.metricValue}>{score}</div>
          </div>
        </div>
      </div>

      {/* Tutorial overlay */}
      {showHelp && (
        <TutorialOverlay
          level={lvl}
          stats={stats}
          fold={fold}
          onDismiss={() => setShowHelp(false)}
        />
      )}

      {/* Strain indicator */}
      {stats.strain > 0.05 && fold > 0.2 && (
        <div style={styles.strainContainer}>
          <StrainIndicator strain={stats.strain} maxStrain={stats.maxStrain} />
        </div>
      )}

      {/* 3D Canvas */}
      <div style={styles.canvasWrap}>
        <Canvas
          camera={{ position: [0, 2, 8], fov: 50 }}
          onCreated={({ gl }) => gl.setClearColor("#020617")}
        >
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} />
          <SignalRibbon
            levelIdx={levelIdx}
            fold={fold}
            seamPos={seamPos}
            onStats={setStats}
            showAntipodes={showAntipodes}
          />
          <OrbitControls enableDamping dampingFactor={0.05} />
        </Canvas>
      </div>

      {/* Symmetry plot */}
      {showPlot && (
        <div style={styles.plotContainer}>
          <SymmetryPlot points={points} seamPos={seamPos} />
        </div>
      )}

      {/* Controls footer */}
      <div style={styles.footer}>
        <div style={styles.controlPanel}>
          {/* Fold slider */}
          <div style={styles.sliderWrap}>
            <div style={styles.sliderTop}>
              <span>Manifold (0)</span>
              <span>Fold Parameter</span>
              <span>Quotient (1)</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={fold}
              onChange={(e) => setFold(parseFloat(e.target.value))}
              style={styles.slider}
            />
          </div>

          {/* Seam slider (if unlocked) */}
          {lvl.allowSeamControl && (
            <div style={styles.sliderWrap}>
              <div style={styles.sliderTop}>
                <span>Start (0)</span>
                <span>Seam Position</span>
                <span>End (1)</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={seamPos}
                onChange={(e) => setSeamPos(parseFloat(e.target.value))}
                style={styles.slider}
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={styles.buttonRow}>
          <button
            onClick={() => setShowAntipodes(!showAntipodes)}
            style={{...styles.button, ...styles.secondaryBtn}}
          >
            {showAntipodes ? "Hide" : "Show"} Antipodes
          </button>
          <button
            onClick={() => setShowPlot(!showPlot)}
            style={{...styles.button, ...styles.secondaryBtn}}
          >
            {showPlot ? "Hide" : "Show"} Plot
          </button>
          <button onClick={commitFold} style={styles.button}>
            {levelIdx === LEVELS.length - 1 ? "🎉 FINISH" : `COMMIT (+${Math.max(0, Math.floor(stats.mdl * 100))} pts)`}
          </button>
        </div>
      </div>

      {/* Hint tooltip */}
      {lvl.hint && showHelp && (
        <div style={styles.hintBox}>
          💡 {lvl.hint}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: {
    width: "100vw",
    height: "100vh",
    background: "#020617",
    color: "#e2e8f0",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: 20,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    zIndex: 10,
    pointerEvents: "none",
  },
  title: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: -0.5,
  },
  sub: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    opacity: 0.7,
    marginTop: 4,
  },
  desc: {
    fontSize: 12,
    opacity: 0.6,
    maxWidth: 420,
    marginTop: 6,
  },
  metrics: {
    display: "flex",
    gap: 10,
  },
  metricBox: {
    background: "rgba(15,23,42,0.55)",
    border: "1px solid rgba(51,65,85,0.55)",
    borderRadius: 12,
    padding: "10px 12px",
    minWidth: 120,
    pointerEvents: "auto",
  },
  metricLabel: {
    fontSize: 10,
    opacity: 0.65,
    textTransform: "uppercase",
    fontWeight: 800,
    letterSpacing: 1,
  },
  metricValue: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 22,
    marginTop: 6,
  },
  tutorialBubble: {
    position: "absolute",
    top: 100,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(59,130,246,0.15)",
    border: "2px solid #3b82f6",
    borderRadius: 16,
    padding: "16px 20px",
    maxWidth: 500,
    zIndex: 20,
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    gap: 16,
    fontSize: 14,
    fontWeight: 500,
  },
  dismissBtn: {
    background: "#3b82f6",
    border: "none",
    color: "white",
    padding: "6px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
  },
  strainContainer: {
    position: "absolute",
    top: 120,
    right: 20,
    zIndex: 15,
  },
  strainBar: {
    background: "rgba(15,23,42,0.7)",
    border: "1px solid rgba(51,65,85,0.6)",
    borderRadius: 12,
    padding: 12,
    width: 200,
    backdropFilter: "blur(10px)",
  },
  strainLabel: {
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 1.5,
    opacity: 0.7,
    marginBottom: 8,
  },
  strainTrack: {
    height: 8,
    background: "#1e293b",
    borderRadius: 4,
    overflow: "hidden",
  },
  strainFill: {
    height: "100%",
    transition: "width 0.2s, background 0.2s",
  },
  strainPct: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 18,
    marginTop: 6,
    fontWeight: 900,
  },
  canvasWrap: {
    flex: 1,
  },
  plotContainer: {
    position: "absolute",
    bottom: 160,
    left: 20,
    zIndex: 15,
    background: "rgba(15,23,42,0.7)",
    border: "1px solid rgba(51,65,85,0.6)",
    borderRadius: 12,
    padding: 12,
    backdropFilter: "blur(10px)",
  },
  plotCanvas: {
    display: "block",
    borderRadius: 8,
  },
  footer: {
    borderTop: "1px solid rgba(30,41,59,0.7)",
    background: "#020617",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    zIndex: 20,
  },
  controlPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sliderWrap: {
    width: "100%",
  },
  sliderTop: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    opacity: 0.7,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: 800,
  },
  slider: {
    width: "100%",
  },
  buttonRow: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
  },
  button: {
    background: "#2563eb",
    border: "none",
    color: "white",
    fontWeight: 900,
    padding: "14px 20px",
    borderRadius: 14,
    cursor: "pointer",
    fontSize: 14,
  },
  secondaryBtn: {
    background: "#334155",
  },
  hintBox: {
    position: "absolute",
    bottom: 200,
    left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(34,211,238,0.15)",
    border: "1px solid #22d3ee",
    borderRadius: 12,
    padding: "12px 18px",
    fontSize: 13,
    zIndex: 15,
    maxWidth: 600,
    textAlign: "center",
    backdropFilter: "blur(10px)",
  },
};
