import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createPerson } from "@/lib/immersive-assets";
import PixelCharacter from "./PixelCharacter";

function lightPortrait(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight("#fff4db", "#274c43", 2.25));
  const key = new THREE.DirectionalLight("#ffead3", 3.25); key.position.set(-2, 3.5, -4); scene.add(key);
  const rim = new THREE.DirectionalLight("#c7dfd1", 1.8); rim.position.set(3, 2.5, 1); scene.add(rim);
}
function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  return renderer;
}
/** One active preview, using the same articulated model as the world. */
export default function ScoutPortrait({ avatar }: { avatar: number }) {
  const container = useRef<HTMLDivElement>(null), [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const target = container.current; if (!target) return;
    let renderer: THREE.WebGLRenderer; try { renderer = makeRenderer(); } catch { setUnavailable(true); return; }
    setUnavailable(false);
    const scene = new THREE.Scene(); lightPortrait(scene);
    const person = createPerson({ avatar }); person.group.rotation.y = -.29; scene.add(person.group);
    const camera = new THREE.OrthographicCamera(-1, 1, 1.04, -1.04, .1, 12); camera.position.set(0, 1, -3.4); camera.lookAt(0, .87, 0);
    const floorGeometry = new THREE.CircleGeometry(.57, 40), floorMaterial = new THREE.MeshBasicMaterial({ color: "#102e27", transparent: true, opacity: .2, depthWrite: false });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = .006; scene.add(floor);
    renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1)); renderer.domElement.setAttribute("aria-hidden", "true"); target.appendChild(renderer.domElement);
    function resize() { const width = Math.max(1, target!.clientWidth), height = Math.max(1, target!.clientHeight); camera.left = -1.04 * width / height; camera.right = 1.04 * width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); renderer.render(scene, camera); }
    const observer = new ResizeObserver(resize); observer.observe(target); resize();
    let frame = 0, lastFrame = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function animate(now: number) { if (now - lastFrame >= 1000 / 30) { lastFrame = now; person.update(0, reducedMotion ? 0 : now / 1000); renderer.render(scene, camera); } if (!reducedMotion) frame = requestAnimationFrame(animate); }
    if (!reducedMotion) frame = requestAnimationFrame(animate);
    function contextLost(event: Event) { event.preventDefault(); setUnavailable(true); cancelAnimationFrame(frame); }
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener("webglcontextlost", contextLost); person.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [avatar]);
  return <div className="career-portrait-renderer" ref={container} style={{ position: "relative", width: "100%", height: "100%" }}>{unavailable && <div className="career-portrait-fallback"><PixelCharacter index={avatar} size={180}/></div>}</div>;
}
let thumbnailCache: string[] | undefined, thumbnailsUnavailable = false;
/** All sixteen thumbnails share one short-lived WebGL context. */
function appearanceThumbnails(): string[] | undefined {
  if (thumbnailCache || thumbnailsUnavailable) return thumbnailCache;
  let renderer: THREE.WebGLRenderer; try { renderer = makeRenderer(); } catch { thumbnailsUnavailable = true; return; }
  try {
    renderer.setSize(96, 96); const scene = new THREE.Scene(); lightPortrait(scene);
    const camera = new THREE.OrthographicCamera(-.46, .46, .46, -.46, .1, 10); camera.position.set(0, 1.34, -3); camera.lookAt(0, 1.29, 0);
    const images: string[] = [];
    for (let avatar = 0; avatar < 16; avatar++) { const person = createPerson({ avatar }); person.group.rotation.y = -.19; scene.add(person.group); renderer.render(scene, camera); images.push(renderer.domElement.toDataURL("image/png")); scene.remove(person.group); person.dispose(); }
    thumbnailCache = images; return images;
  } catch { thumbnailsUnavailable = true; return; }
  finally { renderer.dispose(); renderer.forceContextLoss(); }
}
export function ScoutAppearancePreview({ avatar }: { avatar: number }) {
  const [thumbnail, setThumbnail] = useState(() => thumbnailCache?.[avatar]); useEffect(() => { setThumbnail(appearanceThumbnails()?.[avatar]); }, [avatar]);
  return thumbnail ? <img className="career-avatar-portrait" src={thumbnail} alt="" width={48} height={48} draggable={false}/> : <PixelCharacter index={avatar} size={48}/>;
}

let portraitCache: string[] | undefined, portraitsUnavailable = false;
function stillPortraits(): string[] | undefined {
  if (portraitCache || portraitsUnavailable) return portraitCache;
  let renderer: THREE.WebGLRenderer;
  try { renderer = makeRenderer(); } catch { portraitsUnavailable = true; return; }
  try {
    renderer.setSize(384, 512);
    const scene = new THREE.Scene(); lightPortrait(scene);
    const camera = new THREE.OrthographicCamera(-.78, .78, 1.04, -1.04, .1, 12);
    camera.position.set(0, 1, -3.4); camera.lookAt(0, .87, 0);
    const images: string[] = [];
    for (let avatar = 0; avatar < 16; avatar++) {
      const person = createPerson({ avatar }); person.group.rotation.y = -.29;
      scene.add(person.group); renderer.render(scene, camera);
      images.push(renderer.domElement.toDataURL("image/png"));
      scene.remove(person.group); person.dispose();
    }
    portraitCache = images; return images;
  } catch { portraitsUnavailable = true; return; }
  finally { renderer.dispose(); renderer.forceContextLoss(); }
}

/** A high-resolution model portrait that creates no live renderer for repeated cards. */
export function StaticScoutPortrait({ avatar }: { avatar: number }) {
  const index = Math.max(0, Math.min(15, Math.trunc(avatar)));
  const [portrait, setPortrait] = useState(() => portraitCache?.[index]);
  useEffect(() => { setPortrait(stillPortraits()?.[index]); }, [index]);
  return portrait ? <img src={portrait} alt="" aria-hidden="true" width={384} height={512} draggable={false} style={{ display: "block", width: "100%", height: "100%", objectFit: "contain", imageRendering: "auto" }}/> : <PixelCharacter index={index} size={96}/>;
}
