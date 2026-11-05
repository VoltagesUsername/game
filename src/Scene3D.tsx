import { ThreeCanvas } from "@remotion/three";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

/**
 * IMPORTANT for Remotion + three.js:
 * Never animate with useFrame()/clock time. Derive everything from
 * useCurrentFrame() so every render is deterministic and frame-accurate.
 */
export const Scene3D: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const intro = spring({ frame, fps, config: { damping: 200 } });
  const t = frame / fps;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ preserveDrawingBuffer: true }}
    >
      <color attach="background" args={["#0b0d17"]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={2} />
      <pointLight position={[-4, -2, 3]} intensity={30} color="#ff3d81" />

      {/* Hero object */}
      <mesh
        scale={intro * 1.1}
        rotation={[t * 0.6, t * 0.9, 0]}
        position={[0, interpolate(intro, [0, 1], [-2, 0.4]), 0]}
      >
        <torusKnotGeometry args={[1, 0.32, 256, 48]} />
        <meshStandardMaterial color="#4f7cff" metalness={0.6} roughness={0.2} />
      </mesh>

      {/* Orbiting satellites */}
      {[0, 1, 2, 3, 4].map((i) => {
        const a = t * 0.8 + (i / 5) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 3, Math.sin(a * 2) * 0.5 + 0.4, Math.sin(a) * 3]}
            scale={intro * 0.25}
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#ffb347" flatShading />
          </mesh>
        );
      })}
    </ThreeCanvas>
  );
};
