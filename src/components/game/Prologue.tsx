"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { ScoutStyle } from "@/lib/expedition";
import { scoutAudio, type AudioStatus } from "@/lib/audio";
import {
  APARTMENT_OBSTACLES, APARTMENT_SPAWN, APARTMENT_STATIONS,
  DREAM_CONTACT, DREAM_MAX_SPEED, DREAM_PITCHES, DREAM_ROUTE_LENGTH,
  advancePrologue, chooseProloguePitch, skipPrologueDream, stepDreamDrive,
  type ApartmentStation, type DreamDrive, type PrologueState,
} from "@/lib/prologue";
import { SPRITE_RECTS, directionVector, distance, findPath, moveWithCollision, type Point } from "@/lib/world";
import PixelCharacter from "./PixelCharacter";
import "./prologue.css";

export type PrologueProps = {
  state: PrologueState;
  onChange: (state: PrologueState) => void;
  onComplete: () => void;
  style?: ScoutStyle;
  paused?: boolean;
};
type DreamView = "cockpit" | "chase" | "far";
type Images = { highway: HTMLImageElement | null; apartment: HTMLImageElement | null; characters: HTMLImageElement | null };
type RoomCamera = { scale: number; x: number; y: number; width: number; height: number };
const CAMERA_NAMES = { cockpit: "Cockpit", chase: "Chase", far: "Far chase" } as const;
const INITIAL_DRIVE: DreamDrive = { distance: 0, speed: 0, lane: .22 };
const emptyImages = (): Images => ({ highway: null, apartment: null, characters: null });

function polygon(ctx: CanvasRenderingContext2D, color: string, points: readonly (readonly [number, number])[]) {
  ctx.fillStyle = color; ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(Math.round(x), Math.round(y)) : ctx.moveTo(Math.round(x), Math.round(y)));
  ctx.closePath(); ctx.fill();
}
function pixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 9, color = "#f9e8bb", align: CanvasTextAlign = "center") {
  ctx.font = `${size}px ScoutPixel, monospace`; ctx.textAlign = align;
  ctx.fillStyle = "#14232d"; ctx.fillText(text, Math.round(x) + 1, Math.round(y) + 1);
  ctx.fillStyle = color; ctx.fillText(text, Math.round(x), Math.round(y));
}
function cropImage(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, focusX: number, focusY: number, zoom = 1) {
  const base = Math.max(width / image.width, height / image.height) * zoom;
  const sw = width / base, sh = height / base;
  const sx = Math.max(0, Math.min(image.width - sw, image.width * focusX - sw / 2));
  const sy = Math.max(0, Math.min(image.height - sh, image.height * focusY - sh / 2));
  ctx.drawImage(image, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), 0, 0, width, height);
}
function drawActor(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement | null, index: number, x: number, y: number, height: number, facing = 1, bob = 0) {
  const [sx, sy, sw, sh] = SPRITE_RECTS[Math.max(0, Math.min(15, index))];
  const width = height * sw / sh;
  ctx.fillStyle = "#1d2737"; ctx.globalAlpha = .38;
  ctx.fillRect(Math.round(x - width * .42), Math.round(y - 3), Math.round(width * .84), 5); ctx.globalAlpha = 1;
  if (atlas) {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y + bob)); ctx.scale(facing, 1);
    ctx.drawImage(atlas, sx, sy, sw, sh, Math.round(-width / 2), -height, Math.round(width), height); ctx.restore();
  } else {
    ctx.fillStyle = "#213d49"; ctx.fillRect(x - width / 2, y - height * .72, width, height * .58);
    ctx.fillStyle = "#d4a788"; ctx.fillRect(x - width * .3, y - height, width * .6, height * .3);
  }
}

/** An original grand tourer, drawn with deliberate stepped pixel silhouettes. */
function drawLuxurySide(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(scale, scale);
  ctx.fillStyle = "#121c2b"; ctx.globalAlpha = .45; ctx.fillRect(-92, 15, 184, 8); ctx.fillRect(-78, 11, 155, 16); ctx.globalAlpha = 1;
  polygon(ctx, "#c4a050", [[-94, 1], [-85, -11], [-53, -15], [-33, -36], [30, -36], [60, -17], [87, -13], [98, -3], [92, 12], [-91, 12]]);
  polygon(ctx, "#f2d88a", [[-87, -10], [-55, -16], [-30, -37], [27, -37], [59, -18], [89, -12], [94, -6], [-88, -6]]);
  polygon(ctx, "#183443", [[-43, -18], [-27, -32], [24, -32], [47, -18]]);
  ctx.fillStyle = "#42647b"; ctx.fillRect(-23, -29, 30, 4); ctx.fillRect(12, -29, 13, 4);
  ctx.fillStyle = "#f8e1bc"; ctx.fillRect(-15, -22, 18, 7); ctx.fillRect(-12, -14, 20, 6);
  // The dream scout: cream jacket, dark shades, and a little gold chain.
  ctx.fillStyle = "#966b53"; ctx.fillRect(-14, -30, 8, 9); ctx.fillStyle = "#121e2b"; ctx.fillRect(-15, -31, 10, 4); ctx.fillRect(-14, -26, 9, 3);
  ctx.fillStyle = "#ecca62"; ctx.fillRect(-9, -19, 3, 4); ctx.fillStyle = "#f4e6be"; ctx.fillRect(-83, -6, 171, 3);
  ctx.fillStyle = "#ab8842"; ctx.fillRect(-85, 3, 180, 4); ctx.fillStyle = "#745e35"; ctx.fillRect(-89, 10, 181, 4);
  ctx.fillStyle = "#283944"; ctx.fillRect(10, -12, 2, 23); ctx.fillStyle = "#f9e9b4"; ctx.fillRect(17, -6, 11, 2);
  ctx.fillStyle = "#18232e"; ctx.fillRect(75, -2, 20, 7); ctx.fillStyle = "#ffdbae"; ctx.fillRect(80, -8, 15, 4);
  ctx.fillStyle = "#dd765e"; ctx.fillRect(-94, -3, 7, 5);
  for (const wheelX of [-56, 56]) {
    ctx.fillStyle = "#101823"; ctx.fillRect(wheelX - 16, 2, 32, 23); ctx.fillRect(wheelX - 11, -3, 22, 33);
    ctx.fillStyle = "#889ca6"; ctx.fillRect(wheelX - 9, 4, 18, 17); ctx.fillRect(wheelX - 6, 1, 12, 23);
    ctx.fillStyle = "#344b5a"; ctx.fillRect(wheelX - 4, 6, 8, 14); ctx.fillRect(wheelX - 8, 9, 16, 5);
    if (Math.floor(time * 14) % 2) { ctx.fillStyle = "#d1d8c8"; ctx.fillRect(wheelX - 7, 5, 3, 4); ctx.fillRect(wheelX + 4, 14, 3, 4); }
  }
  ctx.restore();
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number, images: Images, elapsed: number, started: boolean, reduced: boolean) {
  const progress = started ? Math.min(1, elapsed / 7.5) : 0;
  const ease = reduced ? 1 : progress * progress * (3 - 2 * progress);
  if (images.highway) cropImage(ctx, images.highway, width, height, .51 + .07 * ease, .17 + .46 * ease, 2.4 - 1.05 * ease);
  else { ctx.fillStyle = "#b97865"; ctx.fillRect(0, 0, width, height); ctx.fillStyle = "#355766"; ctx.fillRect(0, height * .6, width, height * .4); }
  if (progress > .38 || reduced) {
    const close = Math.max(0, Math.min(1, (progress - .38) / .62));
    const scale = Math.min(width / 245, height / 110) * (.2 + .8 * close);
    const y = height * (.64 + .14 * close);
    drawLuxurySide(ctx, width * (.61 - .08 * close), y, scale, elapsed);
    if (close > .8) { pixelText(ctx, "VELOCE SOLSTICE", width / 2, height * .52, 12, "#fff0c9"); pixelText(ctx, "V12 GRAND TOURER · THE DREAM GARAGE", width / 2, height * .57, 8, "#ecdbab"); }
  }
  ctx.fillStyle = "#111b24"; ctx.fillRect(0, 0, width, height * .075); ctx.fillRect(0, height * .925, width, height * .075);
}

function drawDreamRoad(ctx: CanvasRenderingContext2D, width: number, height: number, drive: DreamDrive, view: DreamView, time: number, images: Images) {
  const horizon = Math.round(height * .34);
  if (images.highway) {
    // Keep the original pixel sky and coast while rendering a moving road below.
    const skyHeight = horizon + 15, sourceHeight = Math.min(560, images.highway.width * skyHeight / width);
    ctx.drawImage(images.highway, 0, 560 - sourceHeight, images.highway.width, sourceHeight, 0, 0, width, skyHeight);
  } else { ctx.fillStyle = "#ebaa73"; ctx.fillRect(0, 0, width, horizon); }
  ctx.fillStyle = "#557568"; ctx.fillRect(0, horizon, width, height - horizon);
  polygon(ctx, "#35616b", [[0, horizon], [width * .38, horizon], [width * .2, height], [0, height]]);
  const cameraHeight = view === "cockpit" ? 26 : view === "far" ? 145 : 86;
  const focal = width * .73;
  const projection = (side: number, depth: number, elevation = 0): [number, number] => [width / 2 + (side - drive.lane * 150) * focal / depth, horizon + (cameraHeight - elevation) * focal / depth];
  for (let z = 1500; z > 8; z -= 20) {
    const far = z + 20, near = z;
    const [lfx, lfy] = projection(-280, far), [rfx, rfy] = projection(280, far);
    const [lnx, lny] = projection(-280, near), [rnx, rny] = projection(280, near);
    const stripe = Math.floor((z + drive.distance * 2.6) / 88) % 2;
    polygon(ctx, stripe ? "#34424c" : "#37454e", [[lfx, lfy], [rfx, rfy], [rnx, rny], [lnx, lny]]);
    for (const side of [-268, 268, -8, 8]) {
      const [fx, fy] = projection(side, far), [nx, ny] = projection(side, near);
      const [f2x, f2y] = projection(side + 4, far), [n2x, n2y] = projection(side + 4, near);
      polygon(ctx, Math.abs(side) < 10 ? "#d6ba70" : "#cbd4bd", [[fx, fy], [f2x, f2y], [n2x, n2y], [nx, ny]]);
    }
    if (stripe) for (const side of [-135, 135]) {
      const [fx, fy] = projection(side, far), [nx, ny] = projection(side, near);
      const [f2x, f2y] = projection(side + 5, far), [n2x, n2y] = projection(side + 5, near);
      polygon(ctx, "#dcddc2", [[fx, fy], [f2x, f2y], [n2x, n2y], [nx, ny]]);
    }
  }
  // Guardrails and repeating roadside palms supply speed without camera shake.
  for (let index = 12; index >= 0; index--) {
    const depth = 65 + ((index * 125 - drive.distance * 2.6) % 1550 + 1550) % 1550;
    const scale = focal / depth;
    for (const side of [-325, 325]) {
      const [x, y] = projection(side, depth), top = y - scale * 31;
      ctx.fillStyle = "#8d9885"; ctx.fillRect(Math.round(x), Math.round(top), Math.max(1, Math.round(scale * 4)), Math.round(scale * 32));
      ctx.fillStyle = "#d0c5a0"; ctx.fillRect(Math.round(x - scale * 11), Math.round(top), Math.round(scale * 23), Math.max(1, Math.round(scale * 4)));
    }
    const [tx, ty] = projection(420, depth);
    ctx.fillStyle = "#6f6d42"; ctx.fillRect(Math.round(tx), Math.round(ty - scale * 67), Math.max(1, Math.round(scale * 5)), Math.round(scale * 68));
    ctx.fillStyle = "#254d40"; ctx.fillRect(Math.round(tx - scale * 22), Math.round(ty - scale * 67), Math.round(scale * 49), Math.round(scale * 9));
    ctx.fillRect(Math.round(tx - scale * 13), Math.round(ty - scale * 78), Math.round(scale * 30), Math.round(scale * 11));
  }
  if (view === "cockpit") {
    const dash = Math.round(height * .77);
    ctx.fillStyle = "#14212c"; ctx.fillRect(0, dash, width, height - dash); ctx.fillStyle = "#6c6954"; ctx.fillRect(0, dash, width, 4);
    ctx.fillStyle = "#d7b971"; ctx.fillRect(0, dash + 4, width, 2);
    for (let y = 0; y < dash; y += 3) {
      const pillar = Math.round(7 + Math.abs(y - dash * .55) / dash * 12);
      ctx.fillStyle = "#1d2d3a"; ctx.fillRect(0, y, pillar, 3); ctx.fillRect(width - pillar, y, pillar, 3);
    }
    const wheelX = width * .28, wheelY = height * .95, radius = Math.min(39, width * .12);
    ctx.fillStyle = "#0b131f"; ctx.fillRect(wheelX - radius, wheelY - radius, radius * 2, 9); ctx.fillRect(wheelX - radius, wheelY - radius, 9, radius * 2); ctx.fillRect(wheelX + radius - 9, wheelY - radius, 9, radius * 2); ctx.fillRect(wheelX - radius, wheelY + radius - 9, radius * 2, 9);
    ctx.fillStyle = "#bdad78"; ctx.fillRect(wheelX - radius + 9, wheelY - 4, radius * 2 - 18, 6); ctx.fillRect(wheelX - 4, wheelY - radius + 8, 7, radius - 10);
    ctx.fillStyle = "#203540"; ctx.fillRect(wheelX - 11, wheelY - 12, 22, 18); pixelText(ctx, "V", wheelX, wheelY, 9, "#e2c67c");
    ctx.fillStyle = "#090f1b"; ctx.fillRect(width * .5, dash + 12, width * .29, 27);
    pixelText(ctx, `${Math.round(drive.speed / DREAM_MAX_SPEED * 108)} MPH`, width * .645, dash + 23, 10, "#cce8ad");
    pixelText(ctx, "SOLSTICE / V12", width * .645, dash + 33, 6, "#d4bf8b");
    ctx.fillStyle = "#07121c"; ctx.fillRect(width * .46, height * .11, width * .15, height * .055); ctx.fillStyle = "#6c8390"; ctx.fillRect(width * .47, height * .117, width * .13, height * .037);
  } else {
    const carScale = view === "far" ? .52 : .78;
    const x = width / 2, y = height * (view === "far" ? .65 : .74);
    ctx.save(); ctx.translate(x, y); ctx.scale(carScale * width / 360, carScale * width / 360);
    ctx.fillStyle = "#13212a"; ctx.fillRect(-40, -4, 80, 11); ctx.fillRect(-37, -35, 13, 35); ctx.fillRect(24, -35, 13, 35);
    ctx.fillStyle = "#ceaa62"; ctx.fillRect(-33, -34, 66, 32); ctx.fillRect(-26, -54, 52, 31);
    ctx.fillStyle = "#193648"; ctx.fillRect(-23, -51, 46, 19); ctx.fillStyle = "#92b6b5"; ctx.fillRect(-20, -49, 39, 3);
    ctx.fillStyle = "#ec886d"; ctx.fillRect(-30, -23, 16, 5); ctx.fillRect(14, -23, 16, 5); ctx.fillStyle = "#f5e4ba"; ctx.fillRect(-14, -16, 28, 8);
    pixelText(ctx, "ONWARD", 0, -10, 5, "#29424d"); ctx.restore();
  }
  if (drive.speed > 65 && Math.floor(time * 4) % 2) { ctx.fillStyle = "#c0d4cb"; ctx.globalAlpha = .13; ctx.fillRect(19, height * .58, 1, height * .1); ctx.fillRect(width - 20, height * .6, 1, height * .12); ctx.globalAlpha = 1; }
}

function drawMeeting(ctx: CanvasRenderingContext2D, width: number, height: number, images: Images, time: number, playerIndex: number, rejection: boolean) {
  if (images.highway) {
    const skyHeight = height * .48, sourceHeight = Math.min(560, images.highway.width * skyHeight / width);
    ctx.drawImage(images.highway, 0, 560 - sourceHeight, images.highway.width, sourceHeight, 0, 0, width, skyHeight);
  }
  else { ctx.fillStyle = "#c39d76"; ctx.fillRect(0, 0, width, height * .48); }
  ctx.fillStyle = "#556368"; ctx.fillRect(0, height * .48, width, height * .52);
  for (let row = 0; row < 15; row++) { ctx.fillStyle = row % 2 ? "#59696b" : "#627174"; ctx.fillRect(0, height * .49 + row * 9, width, 1); }
  const gateY = height * .46;
  ctx.fillStyle = "#364650"; ctx.fillRect(width * .09, gateY - 65, 18, 76); ctx.fillRect(width * .43, gateY - 65, 18, 76);
  ctx.fillStyle = "#c8c0a5"; ctx.fillRect(width * .08, gateY - 72, width * .4, 15);
  pixelText(ctx, "STANFIELD", width * .28, gateY - 61, 9, "#243b46");
  ctx.fillStyle = "#20333b"; for (let x = width * .14; x < width * .43; x += 9) ctx.fillRect(x, gateY - 54, 2, 48);
  ctx.fillStyle = "#26453c"; ctx.fillRect(width * .56, gateY - 48, width * .3, 58); ctx.fillStyle = "#355648"; ctx.fillRect(width * .58, gateY - 57, width * .24, 9);
  ctx.fillStyle = "#9b8664"; ctx.fillRect(width * .59, gateY + 24, width * .24, 6); ctx.fillRect(width * .62, gateY + 30, 5, 12); ctx.fillRect(width * .8, gateY + 30, 5, 12);
  drawLuxurySide(ctx, width * .22, height * .62, Math.min(width / 590, height / 330), time);
  drawActor(ctx, images.characters, playerIndex, width * .43, height * .62, Math.min(57, height * .25), 1, Math.sin(time * 2) * .4);
  drawActor(ctx, images.characters, 4, width * (rejection ? .63 : .62), height * .6, Math.min(58, height * .25), -1, Math.sin(time * 2 + 2) * .4);
  pixelText(ctx, "LUCA VALE", width * .62, height * .35, 8, "#fff0cf");
}

function roomCamera(width: number, height: number): RoomCamera {
  const scale = Math.min(width / 960, height / 640);
  return { scale, x: (width - 960 * scale) / 2, y: (height - 640 * scale) / 2, width, height };
}
function drawApartment(ctx: CanvasRenderingContext2D, width: number, height: number, images: Images, player: Point, index: number, time: number, moving: boolean, facing: number) {
  const camera = roomCamera(width, height);
  ctx.fillStyle = "#121c25"; ctx.fillRect(0, 0, width, height); ctx.save(); ctx.translate(camera.x, camera.y); ctx.scale(camera.scale, camera.scale);
  if (images.apartment) ctx.drawImage(images.apartment, 0, 0, 960, 640);
  else { ctx.fillStyle = "#9d7b55"; ctx.fillRect(30, 160, 900, 400); ctx.fillStyle = "#33585b"; ctx.fillRect(115, 195, 143, 212); }
  drawActor(ctx, images.characters, index, player.x, player.y, 64, facing, moving ? Math.sin(time * 13) * 1.2 : Math.sin(time * 1.7) * .4);
  ctx.restore(); return camera;
}

export default function Prologue({ state, onChange, onComplete, style, paused = false }: PrologueProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef({ state, onChange, onComplete, style });
  const imagesRef = useRef<Images>(emptyImages());
  const keysRef = useRef(new Set<string>());
  const driveRef = useRef<DreamDrive>({ ...INITIAL_DRIVE });
  const playerRef = useRef<Point>({ ...APARTMENT_SPAWN });
  const routeRef = useRef<Point[]>([]);
  const targetRef = useRef<ApartmentStation | null>(null);
  const elapsedRef = useRef(0);
  const transitionedRef = useRef(false);
  const startedRef = useRef(state.phase !== "sky");
  const reducedRef = useRef(false);
  const viewRef = useRef<DreamView>("cockpit");
  const faceRef = useRef(1);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const stationHandlerRef = useRef<(station: ApartmentStation) => void>(() => {});
  const [started, setStarted] = useState(state.phase !== "sky");
  const [view, setView] = useState<DreamView>("cockpit");
  const [readout, setReadout] = useState({ speed: 0, progress: 0, moving: false });
  const [room, setRoom] = useState<RoomCamera>({ scale: 1, x: 0, y: 0, width: 960, height: 640 });
  const [thought, setThought] = useState<ApartmentStation | null>(null);
  const [phoneAnswered, setPhoneAnswered] = useState(false);
  const [audio, setAudio] = useState<AudioStatus>(() => scoutAudio.getStatus());

  useEffect(() => { sceneRef.current = { state, onChange, onComplete, style }; }, [state, onChange, onComplete, style]);
  useEffect(() => scoutAudio.subscribe(setAudio), []);
  useEffect(() => {
    if (paused) { keysRef.current.clear(); scoutAudio.setDriving(0); }
  }, [paused]);
  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [key, path] of Object.entries({ highway: "pixel/dream-highway.png", apartment: "pixel/apartment.png", characters: "pixel/characters.png" })) {
      const image = new Image(); image.src = path;
      image.onload = () => { imagesRef.current[key as keyof Images] = image; };
    }
  }, []);

  useEffect(() => {
    elapsedRef.current = 0; transitionedRef.current = false; keysRef.current.clear(); routeRef.current = []; targetRef.current = null;
    if (state.phase === "cruise") { driveRef.current = { ...INITIAL_DRIVE }; viewRef.current = "cockpit"; }
    if (state.phase === "wake") { playerRef.current = { ...APARTMENT_SPAWN }; scoutAudio.sfx("wake"); }
    if (state.phase === "phone") scoutAudio.sfx("phone");
    const inCar = state.phase === "sky" || state.phase === "cruise";
    scoutAudio.setInVehicle(inCar); scoutAudio.setEngineKind(inCar ? "luxury" : "compact");
    if (!inCar) scoutAudio.setDriving(0);
    return () => { scoutAudio.setDriving(0); };
  }, [state.phase]);

  useEffect(() => () => { scoutAudio.setDriving(0); scoutAudio.setInVehicle(false); scoutAudio.setEngineKind("compact"); }, []);

  const revealStation = useCallback((station: ApartmentStation) => {
    setThought(station); scoutAudio.sfx("interact");
  }, []);
  useEffect(() => { stationHandlerRef.current = revealStation; }, [revealStation]);

  const changeView = useCallback(() => {
    const modes: DreamView[] = ["cockpit", "chase", "far"];
    const next = modes[(modes.indexOf(viewRef.current) + 1) % modes.length];
    viewRef.current = next; setView(next); scoutAudio.sfx("interact");
  }, []);
  const advance = useCallback(() => onChange(advancePrologue(state)), [onChange, state]);
  const walkTo = useCallback((station: ApartmentStation) => {
    setThought(null); targetRef.current = station; routeRef.current = findPath(playerRef.current, station.approach, APARTMENT_OBSTACLES, 8);
    if (distance(playerRef.current, station.approach) < 18) { routeRef.current = []; targetRef.current = null; revealStation(station); }
  }, [revealStation]);
  const finish = useCallback(() => { onChange(advancePrologue(state)); onComplete(); }, [state, onChange, onComplete]);
  const skipDream = useCallback(() => { scoutAudio.setDriving(0); onChange(skipPrologueDream(state)); }, [state, onChange]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent, down: boolean) => {
      if (pausedRef.current && down) return;
      const phase = sceneRef.current.state.phase;
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
      if (phase !== "cruise" && phase !== "wake") return;
      const key = event.key.toLowerCase();
      if (key === " " && event.target instanceof HTMLElement && event.target.closest("button")) return;
      if (["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright", " "].includes(key)) {
        event.preventDefault(); if (down) keysRef.current.add(key); else keysRef.current.delete(key);
        if (phase === "wake" && down && ["w", "a", "s", "d", "arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) { routeRef.current = []; targetRef.current = null; }
      }
      if (down && !event.repeat && phase === "cruise" && key === "c") { event.preventDefault(); changeView(); }
      if (down && !event.repeat && phase === "wake" && (key === "e" || key === " ")) {
        const nearest = [...APARTMENT_STATIONS].sort((a, b) => distance(a.approach, playerRef.current) - distance(b.approach, playerRef.current))[0];
        if (distance(nearest.approach, playerRef.current) < 62) stationHandlerRef.current(nearest);
      }
    };
    const down = (event: KeyboardEvent) => onKey(event, true), up = (event: KeyboardEvent) => onKey(event, false);
    const clear = () => { keysRef.current.clear(); scoutAudio.setDriving(0); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", clear); };
  }, [changeView]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false }); if (!context) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(Math.max(320, Math.min(640, rect.width / 2)));
      canvas.height = Math.round(canvas.width / Math.max(.6, rect.width / Math.max(1, rect.height)));
      context.imageSmoothingEnabled = false;
      setRoom(roomCamera(canvas.width, canvas.height));
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    let frame = 0, previous = performance.now(), lastReadout = previous;
    const tick = (now: number) => {
      const dt = pausedRef.current || document.hidden ? 0 : Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
      const props = sceneRef.current, phase = props.state.phase, time = elapsedRef.current += dt;
      const width = canvas.width, height = canvas.height, images = imagesRef.current;
      let moving = false;
      if (phase === "sky") {
        if (!startedRef.current) elapsedRef.current = 0;
        drawSky(context, width, height, images, elapsedRef.current, startedRef.current, reducedRef.current);
        scoutAudio.setDriving(dt > 0 && startedRef.current ? .35 + Math.min(.55, time / 10) : 0);
        if (dt > 0 && startedRef.current && time >= (reducedRef.current ? 2.5 : 10.5) && !transitionedRef.current) { transitionedRef.current = true; props.onChange(advancePrologue(props.state)); }
      } else if (phase === "cruise") {
        const keys = keysRef.current;
        driveRef.current = stepDreamDrive(driveRef.current, { throttle: keys.has("w") || keys.has("arrowup"), brake: keys.has("s") || keys.has("arrowdown"), steering: Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")) }, dt);
        drawDreamRoad(context, width, height, driveRef.current, viewRef.current, time, images); scoutAudio.setDriving(dt > 0 ? driveRef.current.speed / DREAM_MAX_SPEED : 0);
        if (dt > 0 && driveRef.current.distance >= DREAM_ROUTE_LENGTH && !transitionedRef.current) { transitionedRef.current = true; keys.clear(); scoutAudio.sfx("arrival"); props.onChange(advancePrologue(props.state)); }
      } else if (phase === "meeting" || phase === "phone") {
        drawMeeting(context, width, height, images, time, props.style?.avatar ?? 0, props.state.choice !== null);
        if (phase === "phone") { context.fillStyle = "#0e1728"; context.globalAlpha = .65; context.fillRect(0, 0, width, height); context.globalAlpha = 1; }
      } else if (phase === "wake") {
        let direction = directionVector(keysRef.current);
        let stride = 174 * dt;
        if (direction.x === 0 && direction.y === 0 && routeRef.current.length) {
          const point = routeRef.current[0], gap = distance(playerRef.current, point);
          if (gap < 4) routeRef.current.shift();
          else { direction = { x: (point.x - playerRef.current.x) / gap, y: (point.y - playerRef.current.y) / gap }; stride = Math.min(stride, gap); }
        }
        moving = direction.x !== 0 || direction.y !== 0;
        if (moving) {
          const before = playerRef.current;
          playerRef.current = moveWithCollision(before, { x: direction.x * stride, y: direction.y * stride }, APARTMENT_OBSTACLES, 8);
          if (direction.x !== 0) faceRef.current = direction.x < 0 ? -1 : 1;
          if (Math.floor(time * 3.5) !== Math.floor((time - dt) * 3.5)) scoutAudio.sfx("step");
        }
        if (dt > 0 && targetRef.current && distance(playerRef.current, targetRef.current.approach) < 17) { const station = targetRef.current; targetRef.current = null; routeRef.current = []; stationHandlerRef.current(station); }
        drawApartment(context, width, height, images, playerRef.current, props.style?.avatar ?? 0, time, moving, faceRef.current);
      }
      if (now - lastReadout > 130) { lastReadout = now; setReadout({ speed: Math.round(driveRef.current.speed / DREAM_MAX_SPEED * 108), progress: Math.round(driveRef.current.distance / DREAM_ROUTE_LENGTH * 100), moving }); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  const pointAndWalk = (event: PointerEvent<HTMLCanvasElement>) => {
    if (state.phase !== "wake" || pausedRef.current) return;
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect(), camera = roomCamera(canvas.width, canvas.height);
    const screen = { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height };
    const destination = { x: (screen.x - camera.x) / camera.scale, y: (screen.y - camera.y) / camera.scale };
    if (destination.x < 26 || destination.x > 934 || destination.y < 164 || destination.y > 614) return;
    targetRef.current = null; setThought(null); routeRef.current = findPath(playerRef.current, destination, APARTMENT_OBSTACLES, 8);
  };
  const hold = (key: string, event: PointerEvent<HTMLButtonElement>) => { if (pausedRef.current) return; event.currentTarget.setPointerCapture(event.pointerId); keysRef.current.add(key); };
  const release = (key: string) => { keysRef.current.delete(key); };
  const startDream = () => {
    startedRef.current = true; elapsedRef.current = 0; setStarted(true);
    void scoutAudio.start(0).then(() => { scoutAudio.setInVehicle(true); scoutAudio.setEngineKind("luxury"); scoutAudio.sfx("luxury"); });
  };
  const soundToggle = () => { if (!audio.started) void scoutAudio.start(0); else scoutAudio.setMuted(!audio.muted); };
  const sceneName = { sky: "A dream of tomorrow", cruise: "The prospect", meeting: "The pitch", phone: "The call", wake: "A real beginning", complete: "Your career begins" }[state.phase];
  const reply = DREAM_PITCHES.find(pitch => pitch.id === state.choice);

  return <section className={`scout-prologue prologue-${state.phase} ${paused ? "prologue-paused" : ""}`} inert={paused} aria-label="SCOUT story prologue">
    <canvas ref={canvasRef} className="prologue-canvas" aria-label={state.phase === "wake" ? "Your apartment. Click the floor to walk, or use WASD. Click the laptop to begin your first day." : state.phase === "cruise" ? "Drive the luxury car to Stanfield Junction. Hold W or the accelerator. C changes camera." : sceneName} onPointerDown={pointAndWalk} />
    <header className="prologue-topbar"><span><b>SCOUT</b><small>{sceneName}</small></span><div>
      <button className="prologue-button prologue-quiet" aria-pressed={audio.started && !audio.muted} onClick={soundToggle}>{audio.started && !audio.muted ? "Sound on" : audio.started ? "Sound off" : "Enable sound"}</button>
      {state.phase !== "wake" && state.phase !== "complete" && <button className="prologue-button prologue-quiet" onClick={skipDream}>Skip dream</button>}
    </div></header>

    {state.phase === "sky" && !started && <div className="prologue-title-screen"><span className="prologue-kicker">A CAREER IN THE MAKING</span><h1>SCOUT</h1><p>Find the people nobody else sees.</p><button className="prologue-button prologue-primary" onClick={startDream}>Begin story</button><small>Your progress saves as the story unfolds.</small></div>}
    {state.phase === "sky" && started && <div className="prologue-cinematic-caption"><span>COAST HIGHWAY · GOLDEN HOUR</span><p>Somewhere ahead is the person who changes everything.</p><button className="prologue-button prologue-quiet" onClick={advance}>Take the wheel</button></div>}

    {state.phase === "cruise" && <>
      <aside className="prologue-route-card"><span className="prologue-kicker">NEXT MEETING</span><h2>{DREAM_CONTACT.name}</h2><p>{DREAM_CONTACT.detail}</p><small>He left a prestigious university. Then built something nobody there could.</small><div className="prologue-route-meter"><i style={{ width: `${readout.progress}%` }} /></div><span className="prologue-route-label">Stanfield Junction · {100 - readout.progress}% to go</span></aside>
      <div className="prologue-driving-hud"><span><b>{readout.speed}</b> MPH</span><button className="prologue-button" onClick={changeView}>{CAMERA_NAMES[view]} <kbd>C</kbd></button><button className="prologue-button" aria-pressed={audio.radioEnabled} onClick={() => scoutAudio.setRadio(!audio.radioEnabled, 0)}>{audio.radioEnabled ? "GOLD FM on" : "Radio off"}</button></div>
      <div className="prologue-drive-controls"><div><span><kbd>W</kbd> accelerate · <kbd>S</kbd> brake · <kbd>A</kbd><kbd>D</kbd> steer</span><small>This is the life you&apos;ve been imagining.</small></div><button className="prologue-button" onPointerDown={event => hold("s", event)} onPointerUp={() => release("s")} onPointerCancel={() => release("s")} onLostPointerCapture={() => release("s")}>Hold brake</button><button className="prologue-button prologue-primary" onPointerDown={event => hold("w", event)} onPointerUp={() => release("w")} onPointerCancel={() => release("w")} onLostPointerCapture={() => release("w")}>Hold accelerator</button><button className="prologue-button prologue-quiet" onClick={advance}>Continue to meeting</button></div>
    </>}

    {state.phase === "meeting" && <div className="prologue-dialogue" aria-live="polite"><div className="prologue-speaker"><PixelCharacter index={4} size={88} /><div><span className="prologue-kicker">{reply ? "OFFER DECLINED" : "THE ONE THAT GOT AWAY"}</span><h2>{DREAM_CONTACT.name}</h2><small>{DREAM_CONTACT.detail}</small></div></div>
      <p className="prologue-quote">“{reply?.reply ?? "You found me. Before you pitch: I left because everyone kept telling me what I should build. What makes your team different?"}”</p>
      {!reply ? <div className="prologue-pitches">{DREAM_PITCHES.map((pitch, index) => <button key={pitch.id} className="prologue-button" onClick={() => { scoutAudio.sfx("interact"); onChange(chooseProloguePitch(state, pitch.id)); }}><span>{String(index + 1).padStart(2, "0")}</span>{pitch.label}</button>)}</div> : <div className="prologue-rejection"><span>He leaves before you can make a second offer.</span><button className="prologue-button prologue-primary" onClick={advance}>Check your phone</button></div>}
    </div>}

    {state.phase === "phone" && <div className="prologue-phone-stage"><div className={`prologue-phone ${!phoneAnswered ? "is-ringing" : ""}`} role="group" aria-label={phoneAnswered ? "Employment terminated" : "Incoming call from the director"}>
      <div className="prologue-phone-notch" /><div className="prologue-phone-status"><span>18:42</span><span>5G ▰</span></div><span className="prologue-kicker">{phoneAnswered ? "CALL ENDED" : "INCOMING CALL"}</span><PixelCharacter index={5} size={112} /><h2>The Director</h2><span>Office line</span>
      {phoneAnswered ? <><div className="prologue-fired"><small>CIRRUS WORKS</small><b>CONTRACT TERMINATED</b><span>Access revoked. Return the keys.</span></div><p>“A car and a title don&apos;t make you a scout. We&apos;re done.”</p><button className="prologue-button prologue-primary" onClick={advance}>Wake up</button></> : <><p className="prologue-phone-buzz">Your phone won&apos;t stop buzzing.</p><button className="prologue-button prologue-primary" onClick={() => { setPhoneAnswered(true); scoutAudio.sfx("error"); }}>Answer the call</button></>}
      <div className="prologue-phone-home" />
    </div></div>}

    {state.phase === "wake" && <>
      <aside className="prologue-wake-card"><span className="prologue-kicker">06:42 AM · YOUR APARTMENT</span><h2>Just a dream.</h2><p>The real story starts here.</p><small>Walk around. Your first-day email is on the laptop.</small></aside>
      <div className="prologue-apartment-targets">{APARTMENT_STATIONS.map(station => <button key={station.id} className={`prologue-room-target ${station.id === "desk" ? "is-objective" : ""}`} aria-label={`Walk to ${station.name}`} style={{ left: `${(room.x + station.point.x * room.scale) / room.width * 100}%`, top: `${(room.y + station.point.y * room.scale) / room.height * 100}%` }} onClick={() => walkTo(station)}><i /><span>{station.name}</span>{station.id === "desk" && <small>FIRST DAY</small>}</button>)}</div>
      {thought && <div className="prologue-apartment-thought" aria-live="polite"><div><span className="prologue-kicker">{thought.id === "desk" ? "YOUR FIRST-DAY EMAIL" : thought.name}</span><p>{thought.thought}</p>{thought.id === "desk" && <small>Meet people in person. Learn what drives them. Build a team that can do the work.</small>}</div><button className={`prologue-button ${thought.id === "desk" ? "prologue-primary" : ""}`} onClick={thought.id === "desk" ? finish : () => setThought(null)}>{thought.id === "desk" ? "Start my first day" : "Keep looking"}</button></div>}
      <div className="prologue-apartment-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · click floor to move · <kbd>E</kbd> inspect nearby</span><button className="prologue-button" onClick={() => walkTo(APARTMENT_STATIONS.find(station => station.id === "desk")!)}>Go to laptop</button></div>
    </>}
  </section>;
}
