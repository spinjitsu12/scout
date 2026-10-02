"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Action, Game } from "@/lib/game";
import { scoutAudio } from "@/lib/audio";
import { desktopBridge } from "@/lib/desktop";
import { spriteIndex } from "@/lib/game-ui";
import {
  CAR_NAMES, DISTRICT_ASSETS, FIELD_LOCATIONS, FUEL_CAPACITY, GAS_PRICES, PAINTS,
  candidateLocation, candidatePosition, fieldOf, styleOf, type FieldState, type ScoutStyle,
} from "@/lib/expedition";
import { SPRITE_RECTS } from "@/lib/world";
import {
  DISTRICT_GEOMETRIES, DRIVE_SPEED, VEHICLE_SCALE, WALK_SPEED, districtCamera,
  districtMove, districtPath, districtToScreen, districtToWorld, driveDistance, driveInput,
  drawPixelCar, exitVehicle, nearestDistrictPoint, shortestAngle, steeringInput, stepSteeredVehicle,
  assistedSteering, assistedWaypointReached, districtRoadRoute, fuelAfterDistance,
  vehicleFootprintFits, type DistrictGeometry, type DriveCamera, type DrivePoint, type VehicleMotion,
} from "@/lib/driving";
import { renderDrivingCamera } from "./driving-camera";
import { DISTRICT_NAMES, roadCue, routeDistance, trafficAt, type RoadCue } from "@/lib/district-life";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./road.css";

export type RoadWorldProps = {
  game: Game; paused: boolean; run: (action: Action) => boolean;
  onCandidate: (id: string) => void; onVenue: (source: number) => void; onOffice: () => void;
  focusId?: string | null;
};
type RoadActor = { key: string; point: DrivePoint; visualPoint?: DrivePoint; label: string; kind: "candidate" | "venue" | "gas" | "car"; id?: string; location?: number; sprite?: number; role?: string; met?: boolean; group?: string };
type Images = { district: HTMLImageElement | null; people: HTMLImageElement | null; pump: HTMLImageElement | null };
type RoadStatus = { driving: boolean; speed: number; fuel: number; nearby: string | null; distance: number; assisted: boolean; cue: RoadCue; fuelNeeded: number };
const MODES = ["overhead", "cockpit", "chase", "far"] as const;
const MODE_LABELS = { overhead: "OVERHEAD", cockpit: "COCKPIT", chase: "CHASE", far: "FAR CHASE" };
const movementKey = (key: string) => ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Shift"].includes(key);
const inputTarget = (target: EventTarget | null) => target instanceof HTMLElement && (target.matches("input,textarea,select") || target.isContentEditable);
const firstName = (name: string) => name.replace(/^Dr\.\s*/, "").split(" ")[0];
const cloneField = (field: FieldState): FieldState => ({ ...field, player: { ...field.player }, car: { ...field.car }, visited: [...field.visited], met: [...field.met] });
const fieldKey = (field: FieldState) => JSON.stringify([field.scene, field.player.x.toFixed(2), field.player.y.toFixed(2), field.car.x.toFixed(2), field.car.y.toFixed(2), field.heading.toFixed(4), field.driving, field.fuel.toFixed(4)]);

export default function RoadWorld({ game, paused, run, onCandidate, onVenue, onOffice, focusId }: RoadWorldProps) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), mapCanvas = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(game), runRef = useRef(run), pausedRef = useRef(paused);
  const candidateRef = useRef(onCandidate), venueRef = useRef(onVenue), officeRef = useRef(onOffice);
  gameRef.current = game; runRef.current = run; candidateRef.current = onCandidate; venueRef.current = onVenue; officeRef.current = onOffice;
  const field = useRef<FieldState>(cloneField(fieldOf(game)));
  const motion = useRef<VehicleMotion>({ position: { ...field.current.car }, velocity: { x: 0, y: 0 }, heading: field.current.heading });
  const keys = useRef(new Set<string>()), touchKeys = useRef(new Set<string>());
  const walkingPath = useRef<DrivePoint[]>([]), assistPath = useRef<DrivePoint[]>([]), gpsPath = useRef<DrivePoint[]>([]);
  const latestSnapshot = useRef<FieldState | null>(cloneField(field.current));
  const lastSavedKey = useRef(fieldKey(field.current)), lastSaveAt = useRef(0);
  const camera = useRef<DriveCamera>(districtCamera(1280, 800, field.current.player));
  const viewport = useRef({ width: 1280, height: 800, dpr: 1 }), images = useRef<Images>({ district: null, people: null, pump: null });
  const actorButtons = useRef(new Map<string, HTMLButtonElement>()), actorsRef = useRef<RoadActor[]>([]);
  const hoveredRef = useRef<string | null>(null);
  const focusedRef = useRef(focusId); focusedRef.current = focusId;
  const nearbyRef = useRef<string | null>(null), lastFocus = useRef<string | null>(null), stepAt = useRef(0), arrived = useRef<number | null>(null);
  const updateAt = useRef(0), gpsAt = useRef(0), animationTime = useRef(0), skipUnmountSave = useRef(false);
  const collisionAt = useRef(0), warnedFuel = useRef(field.current.fuel < 2);
  const [ready, setReady] = useState(false), [artError, setArtError] = useState(false), [gpsOpen, setGpsOpen] = useState(false), [gasOpen, setGasOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null), [message, setMessage] = useState("Walk to your car and press E. W accelerates, A/D steer, S brakes or reverses.");
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [status, setStatus] = useState<RoadStatus>({ driving: field.current.driving, speed: 0, fuel: field.current.fuel, nearby: null, distance: 0, assisted: false, cue: roadCue(field.current.car, field.current.heading, []), fuelNeeded: 0 });
  const style = styleOf(game), mode = style.camera || "overhead", destination = FIELD_LOCATIONS[game.tier].find(place => place.id === fieldOf(game).destination);
  pausedRef.current = paused || gasOpen; hoveredRef.current = hovered;

  useEffect(() => {
    setNoticeVisible(true);
    const timeout = window.setTimeout(() => setNoticeVisible(false), 7600);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const actors = useMemo<RoadActor[]>(() => {
    const contacts = game.candidates.filter(person => person.discovered && person.status === "available").map(person => ({
      key: person.id, point: candidatePosition(game, person.id), label: person.name, kind: "candidate" as const,
      id: person.id, location: candidateLocation(person.id), sprite: spriteIndex(person.id), role: person.role,
      met: fieldOf(game).met.includes(person.id),
    }));
    const grouped = contacts.map(contact => {
      const together = contacts.filter(other => driveDistance(other.point, contact.point) < 1), index = together.findIndex(other => other.key === contact.key);
      return together.length > 1 ? { ...contact, visualPoint: { x: contact.point.x + (index - (together.length - 1) / 2) * Math.min(16, 60 / Math.max(1, together.length - 1)), y: contact.point.y - index % 2 * 5 }, group: `${index + 1}/${together.length} CONTACTS` } : contact;
    }).sort((a, b) => Number(b.key === focusId) - Number(a.key === focusId));
    return [...FIELD_LOCATIONS[game.tier].map(location => ({ key: `venue-${location.id}`, point: location.door, label: location.name, kind: location.id === 4 ? "gas" as const : "venue" as const, location: location.id })), ...grouped];
  }, [game.tier, game.candidates, game.field?.met, focusId]);
  actorsRef.current = actors;

  const flush = useCallback((force = false) => {
    const current = cloneField(field.current);
    current.heading = ((current.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (current.driving) current.player = { ...current.car };
    const key = fieldKey(current);
    if (!force && key === lastSavedKey.current) return true;
    latestSnapshot.current = current; lastSavedKey.current = key;
    const ok = runRef.current({ type: "fieldSnapshot", field: current });
    if (!ok) lastSavedKey.current = "";
    return ok;
  }, []);

  const clearMovement = useCallback(() => { keys.current.clear(); touchKeys.current.clear(); walkingPath.current = []; assistPath.current = []; }, []);
  const setRoute = useCallback((locationId: number | null) => {
    if (pausedRef.current) return;
    flush(true);
    if (runRef.current({ type: "setDestination", destination: locationId })) {
      field.current.destination = locationId; assistPath.current = []; gpsAt.current = 0; arrived.current = null;
      setGpsOpen(false);
      const place = FIELD_LOCATIONS[gameRef.current.tier].find(item => item.id === locationId);
      setMessage(place ? `GPS set for ${place.name}. Drive there, park, then explore on foot.` : "GPS route cleared.");
    }
  }, [flush]);

  useEffect(() => {
    const incoming = fieldOf(game), sent = latestSnapshot.current;
    // Own movement snapshots must not rewind the live animation. Imports, towing and
    // refueling change authoritative state and are applied immediately.
    if (!sent || driveDistance(incoming.car, sent.car) > .05 || driveDistance(incoming.player, sent.player) > .05 || incoming.driving !== sent.driving || incoming.scene !== sent.scene || Math.abs(shortestAngle(incoming.heading, sent.heading)) > .00001) {
      field.current = cloneField(incoming); motion.current = { position: { ...incoming.car }, velocity: { x: 0, y: 0 }, heading: incoming.heading };
      walkingPath.current = []; assistPath.current = [];
    } else if (Math.abs(incoming.fuel - sent.fuel) > .00001) field.current.fuel = incoming.fuel;
    field.current.destination = incoming.destination; field.current.visited = [...incoming.visited]; field.current.met = [...incoming.met];
    latestSnapshot.current = cloneField(incoming);
    scoutAudio.setInVehicle(field.current.driving);
  }, [game.field]);

  useEffect(() => {
    // Earlier saves placed the garage on the requested rather than actual artwork.
    // Migrate only invalid parked positions; valid live careers retain their coordinates.
    const current = field.current, currentStyle = styleOf(gameRef.current);
    if (vehicleFootprintFits(current.car, current.heading, currentStyle.car, DISTRICT_GEOMETRIES[gameRef.current.tier])) return;
    const headquarters = FIELD_LOCATIONS[gameRef.current.tier][0].point;
    current.car = { ...headquarters }; current.player = { x: headquarters.x + 44, y: headquarters.y + 32 }; current.driving = false;
    motion.current = { position: { ...headquarters }, velocity: { x: 0, y: 0 }, heading: current.heading };
    flush(true); setMessage("Your vehicle is ready at the headquarters garage. Walk near it and press E.");
  }, [flush]);

  const walkTo = useCallback((point: DrivePoint) => {
    const currentGame = gameRef.current;
    if (pausedRef.current || field.current.driving) return;
    const goal = nearestDistrictPoint(point, false, DISTRICT_GEOMETRIES[currentGame.tier]);
    walkingPath.current = districtPath(field.current.player, goal, false, DISTRICT_GEOMETRIES[currentGame.tier]);
    keys.current.clear(); touchKeys.current.clear();
    if (!walkingPath.current.length) setMessage("That path is blocked. Try the nearby sidewalk.");
  }, []);
  const approach = useCallback((actor: RoadActor) => {
    if (pausedRef.current) return;
    if (field.current.driving || driveDistance(field.current.player, actor.point) > 420) {
      if (actor.location !== undefined) setRoute(actor.location);
      setMessage(field.current.driving ? "Follow the GPS, stop the car, and press E to step out." : "That contact is across town. Get in your car and follow the GPS.");
      return;
    }
    const point = actor.kind === "candidate" ? { x: actor.point.x + 12, y: actor.point.y + 24 } : actor.point;
    walkTo(point);
    setMessage(`Approaching ${actor.label}. Press E when nearby.`);
  }, [setRoute, walkTo]);

  const nearestActor = useCallback((): RoadActor | null => {
    if (field.current.driving) return null;
    const current = field.current.player;
    const candidates = actorsRef.current.filter(actor => driveDistance(current, actor.point) <= (actor.kind === "candidate" ? 72 : 90));
    if (driveDistance(current, field.current.car) <= 66) candidates.push({ key: "car", point: field.current.car, label: CAR_NAMES[styleOf(gameRef.current).car], kind: "car" });
    const selected = candidates.find(actor => actor.key === hoveredRef.current);
    if (selected) return selected;
    const focused = candidates.find(actor => actor.key === focusedRef.current);
    if (focused) return focused;
    candidates.sort((a, b) => driveDistance(current, a.point) - driveDistance(current, b.point));
    if (candidates.length) return candidates[0];
    return null;
  }, []);

  const interact = useCallback(() => {
    if (pausedRef.current) return;
    const current = field.current, currentGame = gameRef.current;
    const geometry = DISTRICT_GEOMETRIES[currentGame.tier];
    if (current.driving) {
      if (Math.hypot(motion.current.velocity.x, motion.current.velocity.y) > 10) { setMessage("Brake or release the accelerator before stepping out."); return; }
      const exit = exitVehicle(current.car, current.heading, geometry);
      if (!exit) { setMessage("There is no room to step out. Move the car to an open curb."); return; }
      clearMovement(); current.driving = false; current.player = exit; motion.current.velocity = { x: 0, y: 0 };
      flush(true); scoutAudio.setInVehicle(false); scoutAudio.setDriving(0); scoutAudio.sfx("exitCar"); setMessage("On foot. Walk to a contact or entrance and press E.");
      return;
    }
    const actor = nearestActor();
    if (!actor) { setMessage("Walk near your car, a contact, or a venue entrance, then press E."); return; }
    clearMovement();
    if (actor.kind === "car") {
      current.driving = true; current.player = { ...current.car }; motion.current.position = { ...current.car }; motion.current.heading = current.heading; motion.current.velocity = { x: 0, y: 0 };
      flush(true); scoutAudio.setInVehicle(true); scoutAudio.sfx("enterCar");
      setMessage(current.fuel <= .001 ? "The tank is empty. Step out and call roadside assistance, or walk to the nearby pump." : "W accelerates. S brakes/reverses. A/D steer. C changes the camera. E exits when stopped.");
      return;
    }
    if (!flush(true)) return;
    scoutAudio.sfx("interact");
    if (actor.kind === "candidate" && actor.id) {
      if (runRef.current({ type: "meet", id: actor.id })) candidateRef.current(actor.id);
    } else if (actor.kind === "gas") {
      if (driveDistance(current.car, FIELD_LOCATIONS[currentGame.tier][4].point) > 100) { setMessage("Bring your car onto the fuel forecourt, then walk to the pump."); return; }
      setGasOpen(true);
    } else if (actor.location === 0) {
      skipUnmountSave.current = true; officeRef.current();
    } else {
      const venue = FIELD_LOCATIONS[currentGame.tier].find(item => item.id === actor.location);
      if (venue?.source !== null && venue?.source !== undefined) venueRef.current(venue.source);
    }
  }, [clearMovement, flush, nearestActor]);

  const changeCamera = useCallback((chosen?: ScoutStyle["camera"]) => {
    if (pausedRef.current) return;
    const currentStyle = styleOf(gameRef.current);
    const next = chosen || MODES[(MODES.indexOf(currentStyle.camera || "overhead") + 1) % MODES.length];
    flush(true);
    runRef.current({ type: "preferences", camera: next });
    setMessage(`${MODE_LABELS[next]} camera selected. Press C to cycle views.`);
  }, [flush]);

  const followGPS = useCallback(() => {
    if (pausedRef.current || !field.current.driving) { setMessage("Get in the car before using assisted driving."); return; }
    if (field.current.fuel <= .001) { setMessage("The tank is empty. Refuel before driving."); return; }
    const place = FIELD_LOCATIONS[gameRef.current.tier].find(item => item.id === field.current.destination);
    if (!place) { setGpsOpen(true); return; }
    assistPath.current = districtRoadRoute(field.current.car, place.point, DISTRICT_GEOMETRIES[gameRef.current.tier]);
    keys.current.clear(); touchKeys.current.clear();
    setMessage(assistPath.current.length ? `Assisted drive to ${place.name}. Steering or braking cancels it.` : "No safe road route is available.");
  }, []);

  useEffect(() => {
    if (!focusId) { lastFocus.current = null; return; }
    if (paused || lastFocus.current === focusId) return;
    const actor = actors.find(item => item.id === focusId);
    if (!actor) return;
    lastFocus.current = focusId;
    hoveredRef.current = null; setHovered(null);
    approach(actor);
  }, [focusId, actors, paused, approach]);

  useEffect(() => {
    if (paused || gasOpen) {
      clearMovement(); motion.current.velocity = { x: 0, y: 0 }; scoutAudio.setDriving(0); flush(true);
    }
  }, [paused, gasOpen, clearMovement, flush]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (inputTarget(event.target) || pausedRef.current || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === " " && event.target instanceof HTMLElement && event.target.closest("button")) return;
      if (movementKey(key)) { event.preventDefault(); keys.current.add(key); walkingPath.current = []; assistPath.current = []; }
      if ((key === "e" || (!field.current.driving && key === " ")) && !event.repeat) { event.preventDefault(); interact(); }
      if (key === "c" && !event.repeat) { event.preventDefault(); changeCamera(); }
      if (key === "g" && !event.repeat) { event.preventDefault(); setGpsOpen(value => !value); }
    };
    const keyup = (event: KeyboardEvent) => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; keys.current.delete(key); };
    const leave = () => { clearMovement(); motion.current.velocity = { x: 0, y: 0 }; scoutAudio.setDriving(0); flush(true); };
    const visibility = () => { if (document.hidden) leave(); };
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup); window.addEventListener("blur", leave);
    window.addEventListener("pagehide", leave); document.addEventListener("visibilitychange", visibility);
    // Root can synchronously flush movement before exporting a career or switching screens.
    window.addEventListener("scout:flush-field", leave);
    const stopBeforeClose = desktopBridge()?.onBeforeClose(leave);
    return () => {
      window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("blur", leave);
      stopBeforeClose?.();
      window.removeEventListener("pagehide", leave); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("scout:flush-field", leave);
    };
  }, [clearMovement, flush, interact, changeCamera]);

  useEffect(() => {
    let active = true;
    images.current = { district: null, people: null, pump: null }; setReady(false); setArtError(false);
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const picture = new Image(); picture.onload = () => resolve(picture); picture.onerror = reject; picture.src = src; });
    Promise.allSettled([load(DISTRICT_ASSETS[game.tier]), load("pixel/characters.png"), load("pixel/gas-station.png")]).then(results => {
      if (!active) return;
      images.current.district = results[0].status === "fulfilled" ? results[0].value : null;
      images.current.people = results[1].status === "fulfilled" ? results[1].value : null;
      images.current.pump = results[2].status === "fulfilled" ? results[2].value : null;
      setArtError(results[0].status === "rejected"); setReady(true);
    });
    return () => { active = false; };
  }, [game.tier]);

  useEffect(() => {
    if (!host.current || !canvas.current) return;
    const resize = () => {
      const rect = host.current!.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      viewport.current = { width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr };
      const surface = canvas.current!; surface.width = Math.round(rect.width * dpr); surface.height = Math.round(rect.height * dpr);
    };
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvas.current) return;
    const context = canvas.current.getContext("2d"); if (!context) return;
    let frame = 0, previous = performance.now(), disposed = false;
    const animate = (now: number) => {
      if (disposed) return;
      const dt = Math.max(0, Math.min(.045, (now - previous) / 1000)); previous = now;
      const currentGame = gameRef.current, currentStyle = styleOf(currentGame), current = field.current;
      const geometry = DISTRICT_GEOMETRIES[currentGame.tier];
      const allKeys = new Set([...keys.current, ...touchKeys.current]);
      const focus = current.driving ? current.car : current.player;
      if (!pausedRef.current && !document.hidden) {
        animationTime.current += dt;
        if (current.driving) {
          let controls = steeringInput(allKeys);
          if (assistPath.current.length) {
            let next = assistPath.current[0], gap = driveDistance(current.car, next);
            while (assistedWaypointReached(motion.current, next) && assistPath.current.length > 1) { assistPath.current.shift(); next = assistPath.current[0]; gap = driveDistance(current.car, next); }
            controls = assistedSteering(motion.current, next, assistPath.current.length === 1);
            if (assistedWaypointReached(motion.current, next) && assistPath.current.length === 1) { assistPath.current = []; controls = { throttle: 0, steer: 0, brake: true }; setMessage("Arrived. Press E to step out and explore the venue."); scoutAudio.sfx("arrival"); }
          }
          if (current.fuel <= .000001) controls = { ...controls, throttle: 0 };
          const before = current.car;
          const previousSpeed = Math.hypot(motion.current.velocity.x, motion.current.velocity.y);
          motion.current = stepSteeredVehicle(motion.current, controls, dt, currentStyle.car, geometry);
          current.car = { ...motion.current.position }; current.player = { ...current.car }; current.heading = motion.current.heading;
          const travelled = driveDistance(before, current.car);
          current.fuel = fuelAfterDistance(current.fuel, travelled, currentStyle.car);
          if (previousSpeed > 24 && Math.hypot(motion.current.velocity.x, motion.current.velocity.y) < 1 && now - collisionAt.current > 2500) {
            collisionAt.current = now; scoutAudio.sfx("bump"); setMessage("Curb ahead. Reverse with S, then steer back onto the road. Use GPS for a safe route.");
          }
          if (current.fuel < 2 && !warnedFuel.current) {
            warnedFuel.current = true; scoutAudio.sfx("lowFuel"); setMessage("Fuel is running low. Set GPS to Highway Fuel and park beside the pump.");
          } else if (current.fuel >= 2) warnedFuel.current = false;
          if (current.fuel <= .000001 && assistPath.current.length) { assistPath.current = []; setMessage("Out of fuel. Brake, step out, then call roadside assistance."); }
          scoutAudio.setDriving(Math.hypot(motion.current.velocity.x, motion.current.velocity.y) / DRIVE_SPEED);
        } else {
          let vector = driveInput(allKeys);
          if (!vector.x && !vector.y && walkingPath.current.length) {
            const next = walkingPath.current[0], gap = driveDistance(current.player, next);
            if (gap <= Math.max(4, WALK_SPEED * dt)) { current.player = { ...next }; walkingPath.current.shift(); }
            else vector = { x: (next.x - current.player.x) / gap, y: (next.y - current.player.y) / gap };
          }
          if (vector.x || vector.y) {
            const before = current.player;
            current.player = districtMove(before, { x: vector.x * WALK_SPEED * dt, y: vector.y * WALK_SPEED * dt }, false, geometry);
            if (now - stepAt.current > 340 && driveDistance(before, current.player) > .1) { scoutAudio.sfx("step"); stepAt.current = now; }
          }
          scoutAudio.setDriving(0);
        }
        if (now - lastSaveAt.current > 750) { flush(); lastSaveAt.current = now; }
      }
      const nearest = nearestActor(); nearbyRef.current = nearest?.key || null;
      const place = FIELD_LOCATIONS[currentGame.tier].find(item => item.id === current.destination);
      if (place && current.driving && driveDistance(current.car, place.point) < 90 && arrived.current !== place.id) {
        arrived.current = place.id; scoutAudio.sfx("arrival"); setMessage(`${place.name} is nearby. Park safely and press E to get out.`);
      }
      if (place && now - gpsAt.current > 1200) {
        gpsPath.current = current.driving ? districtRoadRoute(current.car, place.point, geometry) : districtPath(current.player, place.door, false, geometry); gpsAt.current = now;
      } else if (!place) gpsPath.current = [];
      if (now - updateAt.current > 140) {
        const remaining = place ? gpsPath.current.length ? routeDistance(focus, gpsPath.current) : driveDistance(focus, current.driving ? place.point : place.door) : 0;
        setStatus({ driving: current.driving, speed: Math.hypot(motion.current.velocity.x, motion.current.velocity.y), fuel: current.fuel, nearby: nearbyRef.current, distance: Math.round(remaining), assisted: !!assistPath.current.length, cue: roadCue(current.car, current.heading, gpsPath.current, place?.point), fuelNeeded: fuelAfterDistance(FUEL_CAPACITY, 0, currentStyle.car) - fuelAfterDistance(FUEL_CAPACITY, remaining, currentStyle.car) }); updateAt.current = now;
        drawMap(mapCanvas.current, geometry.roads, current, FIELD_LOCATIONS[currentGame.tier], peopleOnMap(currentGame), gpsPath.current);
      }
      const view = viewport.current;
      camera.current = districtCamera(view.width, view.height, current.driving ? current.car : current.player);
      const cam = camera.current;
      context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); context.imageSmoothingEnabled = false;
      const viewMode = currentStyle.camera || "overhead";
      if (current.driving && viewMode !== "overhead") {
        renderDrivingCamera(context, { width: view.width, height: view.height, field: current, tier: currentGame.tier, style: currentStyle, geometry, mode: viewMode, speed: Math.hypot(motion.current.velocity.x, motion.current.velocity.y), time: animationTime.current, gps: gpsPath.current, people: actorsRef.current.filter(actor => actor.kind === "candidate").map(actor => ({ point: actor.point, sprite: actor.sprite || 1, name: firstName(actor.label) })), atlas: images.current.people });
        actorButtons.current.forEach(button => { button.style.visibility = "hidden"; });
      } else {
        context.clearRect(0, 0, view.width, view.height); context.save(); context.scale(cam.scale, cam.scale); context.translate(-cam.x, -cam.y);
        if (images.current.district) context.drawImage(images.current.district, 0, 0, 1536, 1024);
        else drawFallbackDistrict(context, geometry.roads, geometry.solids, currentGame.tier);
        drawFuelForecourt(context, images.current.pump, FIELD_LOCATIONS[currentGame.tier][4].point, currentGame.tier);
        drawHighwaySigns(context, geometry.roads, currentGame.tier);
        if (gpsPath.current.length) {
          context.strokeStyle = current.driving ? "#b8e89a" : "#f0d18c"; context.lineWidth = 3; context.setLineDash([8, 11]); context.globalAlpha = .7; context.beginPath(); context.moveTo(focus.x, focus.y); gpsPath.current.forEach(point => context.lineTo(point.x, point.y)); context.stroke(); context.setLineDash([]); context.globalAlpha = 1;
        }
        if (walkingPath.current.length) { const end = walkingPath.current[walkingPath.current.length - 1]; context.fillStyle = "#e8dfab"; context.fillRect(end.x - 5, end.y - 2, 10, 4); context.fillRect(end.x - 2, end.y - 5, 4, 10); }
        drawAmbientTraffic(context, geometry, animationTime.current);
        const people = actorsRef.current.filter(actor => actor.kind === "candidate");
        const drawables: { y: number; draw: () => void }[] = [...people].reverse().map(actor => ({ y: (actor.visualPoint || actor.point).y + (actor.key === focusedRef.current ? 1 : 0), draw: () => drawPerson(context, images.current.people, actor.visualPoint || actor.point, actor.sprite || 1, animationTime.current, false) }));
        drawables.push({ y: current.car.y, draw: () => { context.save(); context.translate(Math.round(current.car.x), Math.round(current.car.y)); context.scale(VEHICLE_SCALE, VEHICLE_SCALE); drawPixelCar(context, currentStyle.car, PAINTS[currentStyle.paint], current.heading, currentStyle.plate); context.restore(); } });
        if (!current.driving) drawables.push({ y: current.player.y, draw: () => drawPerson(context, images.current.people, current.player, currentStyle.avatar, animationTime.current, !!walkingPath.current.length || !!driveInput(allKeys).x || !!driveInput(allKeys).y, true) });
        drawables.sort((a, b) => a.y - b.y).forEach(item => item.draw());
        for (const location of FIELD_LOCATIONS[currentGame.tier]) {
          if (location.id === 4) continue;
          const isGoal = current.destination === location.id;
          context.fillStyle = isGoal ? "#d1eda0" : "#fae0a9"; context.globalAlpha = isGoal ? .9 : .45;
          context.fillRect(location.door.x - 9, location.door.y + 2, 18, 3); context.fillRect(location.door.x - 3, location.door.y - 4, 6, 12); context.globalAlpha = 1;
        }
        if (!current.driving && driveDistance(current.player, current.car) < 100) {
          context.fillStyle = "#182b32"; context.fillRect(current.car.x - 10, current.car.y - 31, 20, 17); context.fillStyle = "#d8edba"; context.font = "14px ScoutPixel, monospace"; context.textAlign = "center"; context.fillText("E", current.car.x, current.car.y - 18);
        }
        context.restore();
        for (const actor of actorsRef.current) {
          const button = actorButtons.current.get(actor.key); if (!button) continue;
          const point = districtToScreen(actor.visualPoint || actor.point, cam);
          button.style.left = `${Math.round(point.x)}px`; button.style.top = `${Math.round(point.y - (actor.kind === "candidate" ? 49 * cam.scale : 0))}px`;
          button.style.visibility = point.x > -50 && point.x < view.width + 50 && point.y > 100 && point.y < view.height - 90 ? "visible" : "hidden";
        }
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => { disposed = true; cancelAnimationFrame(frame); scoutAudio.setDriving(0); scoutAudio.setInVehicle(false); if (!skipUnmountSave.current) flush(); };
  }, [flush, nearestActor]);

  const nearbyActor = actors.find(actor => actor.key === status.nearby);
  const carNearby = status.nearby === "car";
  const contextText = status.driving ? status.speed > 10 ? "BRAKE TO STEP OUT" : "STEP OUT OF CAR" : carNearby ? "GET IN YOUR CAR" : nearbyActor ? nearbyActor.kind === "candidate" ? `MEET ${firstName(nearbyActor.label).toUpperCase()}` : nearbyActor.kind === "gas" ? "OPEN FUEL PUMP" : nearbyActor.location === 0 ? "ENTER HEADQUARTERS" : `ENTER ${nearbyActor.label.toUpperCase()}` : "EXPLORE ON FOOT";
  const empty = status.fuel <= .0001, price = GAS_PRICES[game.tier], missing = Math.max(0, FUEL_CAPACITY - status.fuel);
  const touchStart = (event: React.PointerEvent<HTMLButtonElement>, key: string) => { event.preventDefault(); if (pausedRef.current) return; event.currentTarget.setPointerCapture(event.pointerId); touchKeys.current.add(key); walkingPath.current = []; assistPath.current = []; };
  const touchEnd = (key: string) => touchKeys.current.delete(key);

  return <div ref={host} className={`scout-road ${paused || gasOpen ? "scout-road--paused" : ""} ${status.driving ? "scout-road--driving" : ""}`} data-tier={game.tier} data-view={mode}>
    <canvas ref={canvas} className="road-canvas" tabIndex={0} aria-label="Playable scouting district. On foot use WASD or click the pavement. E gets in or out of your car. In the car W accelerates, S brakes or reverses, A and D steer, Space brakes, and C changes camera." onPointerDown={event => {
      if (pausedRef.current) return;
      if (field.current.driving) { setMessage("Drive with W/S and A/D. Choose a GPS destination, then Follow GPS for assisted driving."); return; }
      const rect = event.currentTarget.getBoundingClientRect(); walkTo(districtToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, camera.current));
    }} />
    <div className="road-actors" aria-label="District contacts and entrances">
      {actors.map(actor => <button key={actor.key} ref={node => { if (node) actorButtons.current.set(actor.key, node); else actorButtons.current.delete(actor.key); }} className={`road-actor road-actor--${actor.kind} ${actor.key === status.nearby || actor.key === hovered ? "road-actor--near" : ""} ${actor.key === focusId ? "road-actor--focused" : ""}`} style={{ visibility: "hidden" }} disabled={paused || gasOpen || !ready} onClick={() => { if (!field.current.driving && driveDistance(field.current.player, actor.point) <= (actor.kind === "candidate" ? 72 : 90)) { hoveredRef.current = actor.key; interact(); } else approach(actor); }} onPointerEnter={() => setHovered(actor.key)} onPointerLeave={() => setHovered(null)} aria-label={actor.kind === "candidate" ? `Approach ${actor.label}, ${actor.role}` : `Walk to ${actor.label} entrance`}>
        {actor.kind === "candidate" ? <><span className="road-actor-hit" /><span className="road-actor-name">{actor.key === focusId ? "◆ " : actor.met ? "· " : ""}{firstName(actor.label)}</span><span className="road-actor-role">{actor.role}{actor.group && <small>{actor.group}</small>}</span></> : <span className="road-venue-label">{actor.kind === "gas" ? "FUEL" : actor.label}</span>}
      </button>)}
    </div>
    <div className="road-gps">
      <button className="road-map" disabled={paused || gasOpen} onClick={() => setGpsOpen(value => !value)} aria-label="Open district GPS destinations"><span>{DISTRICT_NAMES[game.tier]} <kbd>G</kbd></span><canvas ref={mapCanvas} width={192} height={128} aria-hidden="true" /><small>{destination ? destination.name : "CHOOSE A DESTINATION"}</small></button>
      {gpsOpen && <div className="road-gps-menu" role="group" aria-label="GPS destinations">{FIELD_LOCATIONS[game.tier].map(place => <button key={place.id} onClick={() => setRoute(place.id)}><b>{place.id === 0 ? "HQ" : place.id === 4 ? "GAS" : `0${place.id}`}</b><span>{place.name}<small>{place.id === 4 ? `$${price.toFixed(2)} / GAL` : place.subtitle}</small></span></button>)}<button className="road-clear-route" onClick={() => setRoute(null)}>Clear route</button></div>}
      {destination && <div className="road-route">{status.driving && <div className="road-turn"><b aria-hidden="true">{status.cue.arrow}</b><span>{status.cue.label}<small>HEADING {status.cue.heading}</small></span></div>}<span>{status.distance < 100 ? "VENUE NEARBY" : `${status.distance} M TO DESTINATION`}</span>{status.driving && <><small className={status.fuelNeeded > status.fuel ? "road-route-fuel-low" : ""}>TRIP FUEL ~{status.fuelNeeded.toFixed(1)} GAL</small><button disabled={paused || gasOpen || empty} onClick={status.assisted ? () => { assistPath.current = []; setMessage("Assisted driving stopped."); } : followGPS}>{status.assisted ? "STOP ASSIST" : "FOLLOW GPS"}</button></>}</div>}
    </div>
    {status.driving && <div className="road-camera-controls" aria-label="Driving camera">{MODES.map(item => <button key={item} className={mode === item ? "road-camera-selected" : ""} aria-pressed={mode === item} disabled={paused || gasOpen} onClick={() => changeCamera(item)}>{MODE_LABELS[item]}</button>)}<kbd>C</kbd></div>}
    <div className={`road-vehicle-hud ${status.fuel < 2 ? "road-low-fuel" : ""}`}><div><span>{status.driving ? "ON THE ROAD" : "PARKED"}</span><b>{status.driving ? `${Math.round(status.speed / 6)} MPH` : style.plate}</b></div><div className="road-fuel"><span>FUEL <b>{status.fuel.toFixed(1)} / {FUEL_CAPACITY} GAL</b></span><div role="meter" aria-label="Fuel remaining" aria-valuemin={0} aria-valuemax={FUEL_CAPACITY} aria-valuenow={status.fuel}><i style={{ width: `${status.fuel / FUEL_CAPACITY * 100}%` }} /></div></div>{empty && !status.driving && <button disabled={paused || gasOpen || game.cash < 150} onClick={() => { clearMovement(); flush(true); if (runRef.current({ type: "roadside" })) { setMessage("Roadside assistance brought your car to Highway Fuel. Walk to the pump to buy gas."); } }}>CALL ROADSIDE · $150</button>}</div>
    {!paused && !gasOpen && <div className={`road-context ${status.driving || status.nearby ? "road-context--active" : ""}`}><button disabled={!status.driving && !status.nearby} onClick={interact}><kbd>E</kbd><span>{contextText}</span></button><small>{status.driving ? "W GAS · S BRAKE/REVERSE · A/D STEER · SPACE BRAKE" : "WASD / ARROWS · CLICK TO WALK"}</small></div>}
    <div className="road-touch-controls" aria-label={status.driving ? "Vehicle controls" : "Walking controls"}>
      <div className="road-dpad">{[["w", "▲", "up"], ["a", "◀", "left"], ["s", "▼", "down"], ["d", "▶", "right"]].map(([key, icon, label]) => <button key={key} className={`road-pad-${label}`} disabled={paused || gasOpen || !ready} aria-label={status.driving ? label === "up" ? "Accelerate" : label === "down" ? "Brake and reverse" : `Steer ${label}` : `Walk ${label}`} onPointerDown={event => touchStart(event, key)} onPointerUp={() => touchEnd(key)} onPointerCancel={() => touchEnd(key)} onLostPointerCapture={() => touchEnd(key)}>{icon}</button>)}<span aria-hidden="true">·</span></div>
      <div className="road-touch-actions">{status.driving && <button className="road-touch-brake" disabled={paused || gasOpen} onPointerDown={event => touchStart(event, " ")} onPointerUp={() => touchEnd(" ")} onPointerCancel={() => touchEnd(" ")} onLostPointerCapture={() => touchEnd(" ")}>BRAKE</button>}<button disabled={paused || gasOpen || (!status.driving && !status.nearby)} onClick={interact}><b>E</b><span>{status.driving ? "EXIT" : carNearby ? "DRIVE" : "MEET"}</span></button></div>
    </div>
    {!ready && <div className="road-loading" role="status">HEADING OUT INTO THE DISTRICT…</div>}
    {artError && <span className="road-art-notice">District art unavailable. Roads remain playable.</span>}
    <p className={`road-announcement ${noticeVisible && !paused && !gasOpen ? "road-announcement--visible" : ""}`} role="status" aria-live="polite"><i aria-hidden="true" />{message}</p>
    <Dialog open={gasOpen} onOpenChange={setGasOpen}><DialogContent className="road-gas-dialog"><DialogHeader><DialogTitle>HIGHWAY FUEL</DialogTitle><DialogDescription>Parked at the pump. Fuel is paid from your scouting budget.</DialogDescription></DialogHeader><div className="road-pump-price"><span>UNLEADED</span><b>${price.toFixed(2)}<small>PER GALLON</small></b></div><div className="road-gas-summary"><span>TANK<b>{status.fuel.toFixed(2)} / 12 GAL</b></span><span>AVAILABLE BUDGET<b>${game.cash.toFixed(2)}</b></span></div><div className="road-gas-options">{[2, 5, missing].map((amount, index) => {
      const gallons = Math.min(amount, missing), cost = Math.round(gallons * price * 100) / 100;
      return <button key={index} disabled={missing < .01 || cost > game.cash || cost <= 0} onClick={() => { flush(true); if (runRef.current({ type: "refuel", gallons: index === 2 ? undefined : amount })) { setGasOpen(false); setMessage(`Refueled ${gallons.toFixed(2)} gallons. Ready for the next lead.`); scoutAudio.sfx("refuel"); } }}><span>{index === 2 ? "FILL TANK" : `ADD ${amount} GAL`}</span><b>${cost.toFixed(2)}</b></button>;
    })}</div><p>Consumption depends on distance driven: compact 650 m/gal, wagon 520 m/gal, coupe 600 m/gal. Coasting still uses the distance travelled.</p><button className="road-gas-done" onClick={() => setGasOpen(false)}>BACK TO THE DISTRICT</button></DialogContent></Dialog>
  </div>;
}

function drawPerson(ctx: CanvasRenderingContext2D, atlas: HTMLImageElement | null, point: DrivePoint, index: number, time: number, walking: boolean, player = false) {
  const x = Math.round(point.x), y = Math.round(point.y), bob = walking ? Math.round(Math.sin(time * 15) * 1.5) : Math.round(Math.sin(time * 2 + index) * .6);
  ctx.fillStyle = "#102833"; ctx.globalAlpha = .4; ctx.fillRect(x - 11, y - 2, 22, 5); ctx.globalAlpha = 1;
  const source = SPRITE_RECTS[Math.max(0, Math.min(15, index))], height = player ? 48 : 46, width = source[2] / source[3] * height;
  if (atlas) ctx.drawImage(atlas, source[0], source[1], source[2], source[3], Math.round(x - width / 2), y - height + bob, Math.round(width), height);
  else { ctx.fillStyle = player ? "#81cfb3" : "#ddd1a0"; ctx.fillRect(x - 8, y - 30 + bob, 16, 21); ctx.fillStyle = "#ecbe9a"; ctx.fillRect(x - 6, y - 43 + bob, 12, 12); ctx.fillStyle = "#263d51"; ctx.fillRect(x - 7, y - 9, 5, 11); ctx.fillRect(x + 2, y - 9, 5, 11); }
  if (player) { ctx.fillStyle = "#cae6a1"; ctx.fillRect(x - 5, y - 56 + bob, 10, 3); ctx.fillRect(x - 2, y - 53 + bob, 4, 3); }
}
function drawFallbackDistrict(ctx: CanvasRenderingContext2D, roads: readonly { x: number; y: number; width: number; height: number }[], solids: readonly { x: number; y: number; width: number; height: number }[], tier: number) {
  ctx.fillStyle = tier ? "#344f52" : "#8ba178"; ctx.fillRect(0, 0, 1536, 1024);
  for (const road of roads) { ctx.fillStyle = "#b2aa8b"; ctx.fillRect(road.x - 9, road.y - 9, road.width + 18, road.height + 18); }
  for (const road of roads) { ctx.fillStyle = "#465358"; ctx.fillRect(road.x, road.y, road.width, road.height); }
  for (const solid of solids) { ctx.fillStyle = "#203b46"; ctx.fillRect(solid.x, solid.y, solid.width, solid.height); ctx.fillStyle = tier ? "#6c8790" : "#b99474"; ctx.fillRect(solid.x + 7, solid.y + 12, solid.width - 14, solid.height - 20); ctx.fillStyle = "#e1c99c"; for (let x = solid.x + 25; x < solid.x + solid.width - 20; x += 46) ctx.fillRect(x, solid.y + solid.height - 60, 25, 34); }
}
function drawFuelForecourt(ctx: CanvasRenderingContext2D, pump: HTMLImageElement | null, point: DrivePoint, tier: number) {
  ctx.fillStyle = tier ? "#56615c" : "#8c927d"; ctx.fillRect(729, 590, 211, 104); ctx.fillStyle = "#c8c3a0"; ctx.fillRect(732, 593, 204, 3); ctx.fillRect(732, 689, 204, 3);
  ctx.fillStyle = "#e0d6ae"; ctx.fillRect(point.x - 35, point.y + 30, 68, 2); ctx.fillRect(point.x - 35, point.y + 30, 2, 23); ctx.fillRect(point.x + 31, point.y + 30, 2, 23);
  if (pump) {
    // The pump aisle aligns with the authoritative station interaction point.
    ctx.drawImage(pump, 0, 0, pump.naturalWidth, pump.naturalHeight, point.x - 64, point.y - 81, 128, 128 * pump.naturalHeight / pump.naturalWidth);
  } else { ctx.fillStyle = "#dd9873"; ctx.fillRect(point.x - 44, point.y - 42, 88, 8); ctx.fillStyle = "#d7d2af"; ctx.fillRect(point.x - 33, point.y - 35, 5, 43); ctx.fillRect(point.x + 28, point.y - 35, 5, 43); ctx.fillStyle = "#253d45"; ctx.fillRect(point.x - 14, point.y - 15, 28, 28); }
  ctx.fillStyle = "#142c35"; ctx.fillRect(point.x - 37, point.y - 18, 74, 16); ctx.fillStyle = "#e1dba8"; ctx.font = "11px ScoutPixel, monospace"; ctx.textAlign = "center"; ctx.fillText("HIGHWAY FUEL", point.x, point.y - 6);
}
function drawHighwaySigns(ctx: CanvasRenderingContext2D, roads: readonly { x: number; y: number; width: number; height: number }[], tier: number) {
  const center = roads[4]; if (!center) return;
  const x = center.x + center.width + 14;
  for (const y of [center.y + 125, center.y + center.height - 92]) {
    ctx.fillStyle = "#46585b"; ctx.fillRect(x + 13, y, 3, 30); ctx.fillStyle = "#173d42"; ctx.fillRect(x - 11, y - 3, 54, 21); ctx.fillStyle = "#ccddb1"; ctx.fillRect(x - 9, y - 1, 50, 2); ctx.font = "10px ScoutPixel, monospace"; ctx.textAlign = "center"; ctx.fillText(tier === 2 ? "ROUTE 07" : "EXPRESS 1", x + 16, y + 11);
  }
}
function drawAmbientTraffic(ctx: CanvasRenderingContext2D, geometry: DistrictGeometry, time: number) {
  for (const car of trafficAt(geometry, time)) {
    ctx.save(); ctx.translate(Math.round(car.point.x), Math.round(car.point.y)); ctx.scale(.46, .46); drawPixelCar(ctx, car.kind, car.paint, car.heading); ctx.restore();
  }
}
function peopleOnMap(game: Game) { return game.candidates.filter(person => person.discovered && person.status === "available").map(person => candidatePosition(game, person.id)); }
function drawMap(surface: HTMLCanvasElement | null, roads: readonly { x: number; y: number; width: number; height: number }[], field: FieldState, places: readonly { id: number; point: DrivePoint; door: DrivePoint }[], people: readonly DrivePoint[], route: readonly DrivePoint[]) {
  if (!surface) return; const ctx = surface.getContext("2d"); if (!ctx) return;
  const sx = surface.width / 1536, sy = surface.height / 1024; ctx.imageSmoothingEnabled = false; ctx.fillStyle = "#18303a"; ctx.fillRect(0, 0, surface.width, surface.height);
  ctx.fillStyle = "#486269"; for (const road of roads) ctx.fillRect(Math.round(road.x * sx), Math.round(road.y * sy), Math.max(2, road.width * sx), Math.max(2, road.height * sy));
  ctx.strokeStyle = "#b8e89a"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo((field.driving ? field.car.x : field.player.x) * sx, (field.driving ? field.car.y : field.player.y) * sy); route.forEach(point => ctx.lineTo(point.x * sx, point.y * sy)); ctx.stroke();
  for (const place of places) { ctx.fillStyle = place.id === field.destination ? "#d5edaa" : place.id === 4 ? "#ecc68f" : "#99b5b6"; ctx.fillRect(Math.round(place.door.x * sx) - 3, Math.round(place.door.y * sy) - 3, 6, 6); }
  ctx.fillStyle = "#dbbba0"; people.forEach(point => ctx.fillRect(Math.round(point.x * sx) - 1, Math.round(point.y * sy) - 1, 3, 3));
  ctx.fillStyle = field.driving ? "#a4e4c4" : "#f4e6b1"; const focus = field.driving ? field.car : field.player; ctx.fillRect(Math.round(focus.x * sx) - 2, Math.round(focus.y * sy) - 2, 5, 5);
  if (!field.driving) { ctx.fillStyle = "#88bca7"; ctx.fillRect(Math.round(field.car.x * sx) - 2, Math.round(field.car.y * sy) - 1, 5, 3); }
}
