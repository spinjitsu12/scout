"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { spriteIndex, type WorldProps, type WorldTarget } from "@/lib/game-ui";
import { scoutAudio } from "@/lib/audio";
import { styleOf } from "@/lib/expedition";
import {
  MAP_HEIGHT, MAP_WIDTH, SPRITE_RECTS, WORLD_COLLISIONS, cameraForView, directionVector, distance,
  findPath, moveWithCollision, nearestWalkable, pointIsWalkable, screenToWorld, worldToScreen,
  type Camera, type Point,
} from "@/lib/world";
import "./world.css";

type Actor = {
  key: string; target: WorldTarget; point: Point; labelPoint?: Point;
  label: string; detail?: string; hint: string; sprite?: number; teammate?: boolean; starred?: boolean;
};
type Particle = Point & { born: number; color: string; size: number; dx: number; dy: number };
type Images = { rooms: (HTMLImageElement | null)[]; people: HTMLImageElement | null };
type MiniMap = { x: number; y: number; width: number; height: number };

const SPAWN = { x: 464, y: 494 };
const SPEED = 164;
const BACKGROUNDS = ["pixel/company-world.png", "pixel/elite-world.png", "pixel/veil-world.png"];

const LEAD_SPOTS: readonly (readonly Point[])[] = [
  [{ x: 592, y: 263 }, { x: 815, y: 265 }, { x: 901, y: 334 }, { x: 902, y: 452 },
    { x: 438, y: 365 }, { x: 516, y: 308 }, { x: 388, y: 466 }, { x: 494, y: 442 }],
  [{ x: 611, y: 275 }, { x: 772, y: 286 }, { x: 880, y: 354 }, { x: 866, y: 463 },
    { x: 808, y: 501 }, { x: 528, y: 508 }, { x: 647, y: 497 }, { x: 578, y: 358 }],
  [{ x: 611, y: 293 }, { x: 733, y: 357 }, { x: 891, y: 332 }, { x: 742, y: 481 },
    { x: 765, y: 523 }, { x: 551, y: 489 }, { x: 720, y: 270 }, { x: 716, y: 414 }],
];
const TEAM_SPOTS: readonly (readonly Point[])[] = [
  [{ x: 123, y: 286 }, { x: 218, y: 286 }, { x: 342, y: 289 }, { x: 84, y: 343 }, { x: 379, y: 353 }],
  [{ x: 106, y: 309 }, { x: 211, y: 311 }, { x: 342, y: 311 }, { x: 93, y: 380 }, { x: 379, y: 367 }],
  [{ x: 104, y: 273 }, { x: 211, y: 276 }, { x: 340, y: 277 }, { x: 102, y: 364 }, { x: 341, y: 356 }],
];

function stations(tier: number): Actor[] {
  return [
    { key: "station-sources", target: { kind: "station", station: "sources" }, point: { x: 730, y: 207 }, labelPoint: { x: 710, y: 250 }, label: "FIND LEADS", hint: "A new name. A new possibility." },
    { key: "station-team", target: { kind: "station", station: "team" }, point: { x: 230, y: 239 }, labelPoint: { x: 355, y: 290 }, label: "YOUR TEAM", hint: "Good people do their best work together." },
    { key: "station-missions", target: { kind: "station", station: "missions" }, point: { x: 230, y: 444 }, labelPoint: { x: 238, y: 488 }, label: tier === 2 ? "FIELD OPERATIONS" : "PROJECT TABLE", hint: "Build a team. Put your judgment to the test." },
    { key: "station-career", target: { kind: "station", station: "career" }, point: { x: 480, y: 164 }, labelPoint: { x: 481, y: 195 }, label: "DIRECTOR", hint: "Your next chapter starts with this one." },
    { key: "station-week", target: { kind: "station", station: "week" }, point: { x: 79, y: 529 }, labelPoint: { x: 80, y: 498 }, label: "END WEEK", hint: "Time moves on. So does the talent market." },
    { key: "station-garage", target: { kind: "station", station: "garage" }, point: { x: 855, y: 514 }, labelPoint: { x: 855, y: 540 }, label: "GARAGE", hint: "Your next great recruit is out in the district." },
  ];
}

const radiusFor = (actor: Actor) => actor.target.kind === "candidate" ? 55 : 92;
const shortName = (name: string) => name.replace(/^Dr\.\s*/, "").split(" ")[0];
const inputKey = (key: string) => key.length === 1 ? key.toLowerCase() : key;
const isMovementKey = (key: string) => ["w", "a", "s", "d", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);

export default function World({ game, paused, onInteract, focusId, officeOnly = false }: WorldProps) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const mapButton = useRef<HTMLButtonElement>(null);
  const targetButtons = useRef(new Map<string, HTMLButtonElement>());
  const gameRef = useRef(game);
  const pausedRef = useRef(paused);
  const interactRef = useRef(onInteract);
  gameRef.current = game;
  pausedRef.current = paused;
  interactRef.current = onInteract;

  const player = useRef<Point>({ ...SPAWN });
  const facing = useRef(1);
  const keys = useRef(new Set<string>());
  const touchKeys = useRef(new Set<string>());
  const path = useRef<Point[]>([]);
  const destination = useRef<Point | null>(null);
  const pending = useRef<string | null>(null);
  const hover = useRef<string | null>(null);
  const nearbyRef = useRef<string | null>(null);
  const actorsRef = useRef<Actor[]>([]);
  const camera = useRef<Camera>(cameraForView(960, 640, SPAWN));
  const viewport = useRef({ width: 960, height: 640, dpr: 1 });
  const miniMap = useRef<MiniMap>({ x: 0, y: 0, width: 0, height: 0 });
  const images = useRef<Images>({ rooms: [], people: null });
  const clock = useRef(0);
  const particles = useRef<Particle[]>([]);
  const born = useRef(new Map<string, number>());
  const reducedMotion = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [nearby, setNearby] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [leadOrder, setLeadOrder] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState("Use WASD or the arrow keys to walk. Click a person to approach them.");
  const lastFocus = useRef<string | null>(null);

  const leads = useMemo(() => officeOnly ? [] : game.candidates.filter(person => person.discovered && person.status === "available"), [game.candidates, officeOnly]);
  const leadSignature = leads.map(person => person.id).join(",");
  useEffect(() => {
    const ids = leadSignature.split(",").filter(Boolean);
    setLeadOrder(previous => {
      const newcomers = ids.filter(id => !previous.includes(id));
      return [...newcomers, ...previous.filter(id => ids.includes(id))];
    });
    setPage(0);
  }, [leadSignature, game.tier]);

  const orderedLeads = useMemo(() => {
    const order = new Map(leadOrder.map((id, index) => [id, index]));
    return [...leads].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }, [leads, leadOrder]);
  const pageCount = Math.max(1, Math.ceil(orderedLeads.length / 8));
  const actors = useMemo(() => {
    const collision = WORLD_COLLISIONS[game.tier];
    const available: Actor[] = orderedLeads.slice(Math.min(page, pageCount - 1) * 8, (Math.min(page, pageCount - 1) + 1) * 8).map((person, index) => ({
      key: person.id, target: { kind: "candidate", id: person.id }, point: nearestWalkable(LEAD_SPOTS[game.tier][index], collision),
      label: person.name, detail: person.role, hint: person.tested.length ? "There’s more to the story." : "Let’s talk about the work.",
      sprite: spriteIndex(person.id), starred: person.starred,
    }));
    const teammates: Actor[] = game.candidates.filter(person => person.status === "hired").slice(0, 5).map((person, index) => ({
      key: person.id, target: { kind: "candidate", id: person.id }, point: nearestWalkable(TEAM_SPOTS[game.tier][index], collision),
      label: person.name, detail: person.role, hint: "Ready when you are.", sprite: spriteIndex(person.id), teammate: true, starred: person.starred,
    }));
    return [...stations(game.tier), ...available, ...teammates];
  }, [game.tier, game.candidates, orderedLeads, page, pageCount]);
  actorsRef.current = actors;

  const emitInteraction = useCallback((actor: Actor) => {
    pending.current = null;
    path.current = [];
    destination.current = null;
    keys.current.clear();
    touchKeys.current.clear();
    hover.current = null;
    setHovered(null);
    scoutAudio.sfx("interact");
    setAnnouncement(`Opening ${actor.label}.`);
    interactRef.current(actor.target);
  }, []);

  const walkTo = useCallback((point: Point, targetKey?: string) => {
    if (pausedRef.current) return;
    const collision = WORLD_COLLISIONS[gameRef.current.tier];
    const goal = nearestWalkable(point, collision);
    const route = findPath(player.current, goal, collision);
    if (!route.length) {
      setAnnouncement("Try a destination in the open aisle.");
      return;
    }
    path.current = route;
    destination.current = goal;
    pending.current = targetKey ?? null;
    keys.current.clear();
    touchKeys.current.clear();
    hover.current = null;
    setHovered(null);
  }, []);

  const approach = useCallback((actor: Actor, open = true) => {
    if (pausedRef.current && open) return;
    if (open && distance(player.current, actor.point) <= radiusFor(actor)) {
      emitInteraction(actor);
      return;
    }
    let goal = actor.point;
    if (actor.target.kind === "candidate") {
      const length = distance(player.current, actor.point) || 1;
      const beside = { x: actor.point.x + (player.current.x - actor.point.x) / length * 42, y: actor.point.y + (player.current.y - actor.point.y) / length * 42 };
      if (pointIsWalkable(beside, WORLD_COLLISIONS[gameRef.current.tier])) goal = beside;
    }
    if (pausedRef.current && !open) {
      const collision = WORLD_COLLISIONS[gameRef.current.tier];
      path.current = findPath(player.current, goal, collision);
      destination.current = nearestWalkable(goal, collision);
      pending.current = null;
    } else walkTo(goal, open ? actor.key : undefined);
    setAnnouncement(`Approaching ${actor.label}.`);
  }, [emitInteraction, walkTo]);

  const interactNearby = useCallback(() => {
    if (pausedRef.current) return;
    const actor = actorsRef.current.find(item => item.key === nearbyRef.current);
    if (actor) emitInteraction(actor);
    else setAnnouncement("Walk near a person or station, then press E or Space.");
  }, [emitInteraction]);

  useEffect(() => {
    player.current = { ...SPAWN };
    path.current = [];
    destination.current = null;
    pending.current = null;
    born.current.clear();
    particles.current = [];
    lastFocus.current = null;
    setNearby(null);
    nearbyRef.current = null;
  }, [game.tier]);

  useEffect(() => {
    if (paused) { keys.current.clear(); touchKeys.current.clear(); }
  }, [paused]);

  useEffect(() => {
    if (!focusId) { lastFocus.current = null; return; }
    if (lastFocus.current === focusId) return;
    const index = orderedLeads.findIndex(person => person.id === focusId);
    if (index >= 0 && Math.floor(index / 8) !== page) { setPage(Math.floor(index / 8)); return; }
    const actor = actors.find(item => item.key === focusId);
    if (actor) { lastFocus.current = focusId; hover.current = actor.key; setHovered(actor.key); approach(actor, false); }
  }, [focusId, orderedLeads, page, actors, approach]);

  useEffect(() => {
    let active = true;
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    Promise.allSettled([...BACKGROUNDS, "pixel/characters.png"].map(load)).then(loaded => {
      if (!active) return;
      images.current = { rooms: loaded.slice(0, 3).map(result => result.status === "fulfilled" ? result.value : null), people: loaded[3].status === "fulfilled" ? loaded[3].value : null };
      setLoadError(loaded.some(result => result.status === "rejected"));
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const element = container.current;
    const surface = canvas.current;
    if (!element || !surface) return;
    const context = surface.getContext("2d", { alpha: false });
    if (!context) return;
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewport.current = { width: bounds.width, height: bounds.height, dpr };
      surface.width = Math.round(bounds.width * dpr);
      surface.height = Math.round(bounds.height * dpr);
      camera.current = cameraForView(bounds.width, bounds.height, player.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    const keydown = (event: KeyboardEvent) => {
      if (pausedRef.current || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, [role=dialog]")) return;
      const key = inputKey(event.key);
      if (isMovementKey(key)) {
        event.preventDefault();
        keys.current.add(key);
        path.current = [];
        destination.current = null;
        pending.current = null;
      } else if ((key === "e" || key === " ") && !event.repeat) {
        if (key === " " && target?.closest("button")) return;
        event.preventDefault();
        interactNearby();
      }
    };
    const keyup = (event: KeyboardEvent) => keys.current.delete(inputKey(event.key));
    const release = () => { keys.current.clear(); touchKeys.current.clear(); };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);

    let frame = 0;
    let previous = performance.now();
    let lastFootstep = 0;
    let lastNearby = "";
    const draw = (now: number) => {
      const delta = Math.min((now - previous) / 1000, .05);
      previous = now;
      const running = !pausedRef.current;
      if (running) clock.current += delta;
      const time = clock.current;
      const tier = gameRef.current.tier;
      const collision = WORLD_COLLISIONS[tier];
      let walking = false;
      if (running) {
        const vector = directionVector(new Set([...keys.current, ...touchKeys.current]));
        let velocity = { x: vector.x * SPEED * delta, y: vector.y * SPEED * delta };
        if (!vector.x && !vector.y && path.current.length) {
          const next = path.current[0];
          const remaining = distance(player.current, next);
          if (remaining < 2) { player.current = next; path.current.shift(); }
          else {
            const amount = Math.min(SPEED * delta, remaining);
            velocity = { x: (next.x - player.current.x) / remaining * amount, y: (next.y - player.current.y) / remaining * amount };
          }
        }
        const moved = moveWithCollision(player.current, velocity, collision);
        walking = distance(moved, player.current) > .05;
        if (Math.abs(moved.x - player.current.x) > .1) facing.current = moved.x < player.current.x ? -1 : 1;
        player.current = moved;
        if (walking && time - lastFootstep > .17) {
          lastFootstep = time;
          scoutAudio.sfx("step");
          particles.current.push({ x: moved.x + (Math.floor(time * 6) % 2 ? 6 : -6), y: moved.y, born: time, color: tier === 0 ? "#d2bd92" : tier === 1 ? "#b9bfdf" : "#968b72", size: 3, dx: 0, dy: 2 });
        }
        const waiting = actorsRef.current.find(actor => actor.key === pending.current);
        if (waiting && distance(player.current, waiting.point) <= radiusFor(waiting)) emitInteraction(waiting);
        if (!path.current.length && !pending.current) destination.current = null;
      }

      let closest: Actor | undefined;
      let closestDistance = Infinity;
      for (const actor of actorsRef.current) {
        const separation = distance(player.current, actor.point);
        if (separation < radiusFor(actor) && separation < closestDistance) { closest = actor; closestDistance = separation; }
        if (actor.sprite !== undefined && !born.current.has(actor.key)) {
          born.current.set(actor.key, time);
          for (let index = 0; index < 5; index++) particles.current.push({ x: actor.point.x, y: actor.point.y - 26, born: time, color: "#d8efa9", size: index % 2 + 2, dx: (index - 2) * 12, dy: -15 - index * 2 });
        }
      }
      const nearestKey = closest?.key ?? "";
      nearbyRef.current = nearestKey || null;
      if (nearestKey !== lastNearby) { lastNearby = nearestKey; setNearby(nearestKey || null); }

      const view = viewport.current;
      const desiredCamera = cameraForView(view.width, view.height, player.current);
      const ease = reducedMotion.current ? 1 : 1 - Math.exp(-delta * 9);
      camera.current = { ...desiredCamera, x: camera.current.x + (desiredCamera.x - camera.current.x) * ease, y: camera.current.y + (desiredCamera.y - camera.current.y) * ease };
      const cam = camera.current;
      context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      context.fillStyle = ["#1d2424", "#13172a", "#111c1a"][tier];
      context.fillRect(0, 0, view.width, view.height);
      context.save();
      context.translate(cam.offsetX - cam.x * cam.scale, cam.offsetY - cam.y * cam.scale);
      context.scale(cam.scale, cam.scale);
      const room = images.current.rooms[tier];
      if (room) context.drawImage(room, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      else {
        context.fillStyle = ["#7b7560", "#59667a", "#4b6258"][tier]; context.fillRect(26, 164, 908, 450);
        context.fillStyle = ["#88836c", "#68758a", "#576f64"][tier];
        for (let y = 164; y < 614; y += 32) for (let x = 26; x < 934; x += 32) if ((x + y) / 32 % 2 > 0) context.fillRect(x, y, 31, 31);
        for (const prop of collision) { context.fillStyle = "#213641"; context.fillRect(prop.x, prop.y, prop.width, prop.height); context.fillStyle = tier === 0 ? "#a78f6f" : "#73888b"; context.fillRect(prop.x + 5, prop.y + 5, prop.width - 10, Math.max(2, prop.height - 15)); }
      }

      // Restrained tier lighting and square motes preserve the bitmap art's pixel edges.
      context.fillStyle = ["rgba(247,193,96,.025)", "rgba(128,146,255,.045)", "rgba(14,90,76,.055)"][tier];
      context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      for (let index = 0; index < 22; index++) {
        const x = (index * 137 + 101) % MAP_WIDTH;
        const y = 190 + ((index * 73 + (reducedMotion.current ? 0 : time * (tier === 0 ? 3 : 1.5))) % 380);
        context.fillStyle = ["rgba(255,230,155,.3)", "rgba(190,196,255,.24)", "rgba(143,231,186,.2)"][tier];
        context.fillRect(Math.round(x), Math.round(y), 2, 2);
      }

      if (destination.current) {
        const goal = destination.current;
        const pulse = reducedMotion.current ? 0 : Math.round(Math.sin(time * 6) * 2);
        context.strokeStyle = "#e2f5b9";
        context.lineWidth = 2;
        context.strokeRect(Math.round(goal.x) - 9 - pulse, Math.round(goal.y) - 5 - pulse, 18 + pulse * 2, 10 + pulse * 2);
        context.fillStyle = "rgba(226,245,185,.35)";
        context.fillRect(Math.round(goal.x) - 2, Math.round(goal.y) - 2, 4, 4);
      }

      const drawSprite = (point: Point, index: number, flip: number, bob: number, isPlayer = false, highlighted = false) => {
        context.fillStyle = "rgba(12,20,22,.45)";
        context.fillRect(Math.round(point.x) - 13, Math.round(point.y) - 3, 26, 4);
        context.fillRect(Math.round(point.x) - 9, Math.round(point.y) - 5, 18, 2);
        if (highlighted || isPlayer) {
          context.strokeStyle = isPlayer ? "rgba(225,247,169,.7)" : "#e6f7bb";
          context.lineWidth = 2;
          context.strokeRect(Math.round(point.x) - 16, Math.round(point.y) - 6, 32, 10);
        }
        const atlas = images.current.people;
        if (!atlas) {
          context.fillStyle = isPlayer ? "#8bd3b2" : "#ddd0a1"; context.fillRect(Math.round(point.x) - 10, Math.round(point.y + bob) - 39, 20, 25);
          context.fillStyle = "#e6bfa0"; context.fillRect(Math.round(point.x) - 8, Math.round(point.y + bob) - 57, 16, 18);
          context.fillStyle = "#223847"; context.fillRect(Math.round(point.x) - 9, Math.round(point.y) - 14, 6, 14); context.fillRect(Math.round(point.x) + 3, Math.round(point.y) - 14, 6, 14);
          return;
        }
        const rect = SPRITE_RECTS[index % SPRITE_RECTS.length];
        const height = isPlayer ? 66 : 62;
        const width = height * rect[2] / rect[3];
        context.save();
        context.translate(Math.round(point.x), Math.round(point.y + bob));
        context.scale(flip, 1);
        context.drawImage(atlas, rect[0], rect[1], rect[2], rect[3], Math.round(-width / 2), -height, Math.round(width), height);
        context.restore();
      };
      const people = actorsRef.current.filter(actor => actor.sprite !== undefined).map((actor, index) => ({ actor, point: { x: actor.point.x + (reducedMotion.current ? 0 : Math.sin(time * .6 + index * 1.7) * 1.5), y: actor.point.y } }));
      const depth = [...people.map(item => ({ ...item, player: false })), { actor: null, point: player.current, player: true }].sort((a, b) => a.point.y - b.point.y);
      for (const item of depth) {
        if (item.player) drawSprite(item.point, styleOf(gameRef.current).avatar, facing.current, walking && !reducedMotion.current ? Math.round(Math.sin(time * 18) * 1.5) : 0, true);
        else if (item.actor) {
          const actor = item.actor;
          const selected = actor.key === hover.current || actor.key === nearbyRef.current || actor.key === pending.current;
          const bob = reducedMotion.current ? 0 : Math.round(Math.sin(time * 1.5 + actor.sprite!) * .8);
          drawSprite(item.point, actor.sprite!, player.current.x < actor.point.x ? -1 : 1, bob, false, selected);
        }
      }
      particles.current = particles.current.filter(particle => time - particle.born < .65);
      for (const particle of particles.current) {
        const age = time - particle.born;
        context.globalAlpha = Math.max(0, 1 - age / .65);
        context.fillStyle = particle.color;
        context.fillRect(Math.round(particle.x + particle.dx * age), Math.round(particle.y + particle.dy * age), particle.size, particle.size);
      }
      context.globalAlpha = 1;
      context.restore();

      for (const actor of actorsRef.current) {
        const button = targetButtons.current.get(actor.key);
        if (!button) continue;
        const point = worldToScreen(actor.labelPoint ?? actor.point, cam);
        const person = actor.sprite !== undefined;
        button.style.left = `${Math.round(point.x)}px`;
        button.style.top = `${Math.round(point.y - (person ? 66 * cam.scale : 0))}px`;
        if (person) {
          button.style.height = `${Math.round(66 * cam.scale + 45)}px`;
          button.style.width = `${Math.max(110, 65 * cam.scale)}px`;
          button.style.setProperty("--person-hit-width", `${Math.round(42 * cam.scale)}px`);
        }
        button.style.visibility = point.x > -45 && point.x < view.width + 45 && point.y > -40 && point.y < view.height + 30 ? "visible" : "hidden";
      }

      // This navigable geometry map also lets a touch player choose destinations outside the camera.
      const mw = view.width < 760 ? 94 : 120;
      const mh = mw * MAP_HEIGHT / MAP_WIDTH;
      const mx = view.width - mw - 18;
      const my = view.width < 760 ? 151 : view.height - mh - 145;
      miniMap.current = { x: mx, y: my, width: mw, height: mh };
      context.fillStyle = "rgba(12,24,25,.83)";
      context.fillRect(mx - 5, my - 22, mw + 10, mh + 27);
      context.strokeStyle = "rgba(199,222,181,.65)";
      context.lineWidth = 1;
      context.strokeRect(Math.round(mx - 5) + .5, Math.round(my - 22) + .5, mw + 10, mh + 27);
      context.fillStyle = "#c4d9b2";
      context.font = "12px ScoutPixel, monospace";
      context.fillText("ROOM MAP", mx, my - 6);
      const ms = mw / MAP_WIDTH;
      context.fillStyle = "#2c3b39";
      context.fillRect(mx, my, mw, mh);
      context.fillStyle = "#142323";
      for (const rect of collision) context.fillRect(mx + rect.x * ms, my + rect.y * ms, Math.max(2, rect.width * ms), Math.max(2, rect.height * ms));
      for (const actor of actorsRef.current) {
        context.fillStyle = actor.target.kind === "station" ? "#ccbc83" : actor.teammate ? "#9ae0bb" : "#b7c8fa";
        context.fillRect(Math.round(mx + actor.point.x * ms) - 1, Math.round(my + actor.point.y * ms) - 1, 3, 3);
      }
      context.strokeStyle = "rgba(217,231,204,.65)";
      context.strokeRect(mx + cam.x * ms, my + cam.y * ms, cam.viewWidth * ms, cam.viewHeight * ms);
      context.fillStyle = "#f2f6bf";
      context.fillRect(Math.round(mx + player.current.x * ms) - 2, Math.round(my + player.current.y * ms) - 2, 4, 4);
      if (mapButton.current) {
        Object.assign(mapButton.current.style, { left: `${mx}px`, top: `${my}px`, width: `${mw}px`, height: `${mh}px` });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [emitInteraction, interactNearby]);

  const nearbyActor = actors.find(actor => actor.key === nearby);
  const hintedActor = actors.find(actor => actor.key === hovered) ?? nearbyActor;
  const changeHover = (key: string | null) => { hover.current = key; setHovered(key); };
  const pointerDestination = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || paused) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    walkTo(screenToWorld({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, camera.current));
    event.currentTarget.focus({ preventScroll: true });
  };
  const startTouch = (event: React.PointerEvent<HTMLButtonElement>, direction: string) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    path.current = [];
    destination.current = null;
    pending.current = null;
    touchKeys.current.add(direction);
  };
  const endTouch = (direction: string) => touchKeys.current.delete(direction);

  return <div ref={container} className={`scout-world ${paused ? "scout-world--paused" : ""}`} data-tier={game.tier}>
    <canvas ref={canvas} className="scout-world-canvas" tabIndex={0} aria-label="Playable pixel office. Walk with WASD or arrow keys. Click the floor to walk, or a person or station to approach. E or Space interacts nearby." onPointerDown={pointerDestination} />
    <div className="world-targets">
      {actors.map(actor => <button key={actor.key} ref={element => { if (element) targetButtons.current.set(actor.key, element); else targetButtons.current.delete(actor.key); }}
        className={`world-target ${actor.sprite !== undefined ? "world-person" : "world-station"} ${actor.teammate ? "world-teammate" : ""} ${actor.key === nearby || actor.key === hovered ? "world-target--near" : ""}`}
        style={{ visibility: "hidden" }} disabled={paused || !ready} onClick={() => approach(actor)}
        onPointerEnter={() => changeHover(actor.key)} onPointerLeave={() => changeHover(null)} onFocus={() => changeHover(actor.key)} onBlur={() => changeHover(null)}
        aria-label={`${actor.target.kind === "candidate" ? actor.teammate ? "Talk to team member" : "Meet candidate" : "Walk to"} ${actor.label}${actor.detail ? `, ${actor.detail}` : ""}`}>
        {actor.sprite !== undefined && <span className="world-character-hit" aria-hidden="true" />}
        <span className="world-target-label">{actor.sprite === undefined && <span className="world-station-marker" aria-hidden="true">◇</span>}{actor.starred && <span className="world-star" aria-hidden="true">★ </span>}{actor.sprite !== undefined ? shortName(actor.label) : actor.label}</span>
        {actor.detail && <span className="world-target-role">{actor.teammate ? "TEAM · " : ""}{actor.detail}</span>}
      </button>)}
    </div>
    <button ref={mapButton} className="world-map-hotspot" aria-label="Room map. Tap a location to walk there." disabled={paused || !ready} onPointerDown={event => {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      walkTo({ x: (event.clientX - bounds.left) / bounds.width * MAP_WIDTH, y: (event.clientY - bounds.top) / bounds.height * MAP_HEIGHT });
    }} onClick={event => { if (event.detail === 0) walkTo({ x: 600, y: 260 }); }} />
    {pageCount > 1 && <div className="world-lead-pages" aria-label="People in the scouting lounge">
      <button disabled={paused} onClick={() => { setPage(current => (current + pageCount - 1) % pageCount); pending.current = null; }} aria-label="Previous group of candidates">◀</button>
      <span>LEADS {page + 1}/{pageCount}</span>
      <button disabled={paused} onClick={() => { setPage(current => (current + 1) % pageCount); pending.current = null; }} aria-label="Next group of candidates">▶</button>
    </div>}
    {!ready && <div className="world-loading" role="status">LIGHTING UP THE ROOM…</div>}
    {loadError && ready && <span className="world-art-notice">Some room art is unavailable. Your career remains playable.</span>}
    {!paused && ready && <div className={`world-context ${nearbyActor ? "world-context--active" : ""}`}>
      {nearbyActor ? <><kbd>E</kbd><span>{nearbyActor.target.kind === "candidate" ? "Talk to" : "Open"} {nearbyActor.label}</span><span className="world-space-hint">/ SPACE</span></> : <><span className="world-desktop-hint">WASD / ARROWS · CLICK TO WALK</span><span className="world-mobile-hint">TAP THE FLOOR OR ROOM MAP TO WALK</span></>}
    </div>}
    {hintedActor && !paused && <div className="world-speech" aria-hidden="true"><span>{hintedActor.hint}</span></div>}
    <div className="world-touch-controls" aria-label="Movement controls">
      <div className="world-dpad">
        {[["ArrowUp", "▲", "up"], ["ArrowLeft", "◀", "left"], ["ArrowDown", "▼", "down"], ["ArrowRight", "▶", "right"]].map(([direction, icon, label]) => <button key={direction} className={`world-dpad-${label}`} aria-label={`Move ${label}`} disabled={paused || !ready}
          onPointerDown={event => startTouch(event, direction)} onPointerUp={() => endTouch(direction)} onPointerCancel={() => endTouch(direction)} onLostPointerCapture={() => endTouch(direction)}
          onClick={event => { if (event.detail === 0) { const vector = directionVector(new Set([direction])); walkTo({ x: player.current.x + vector.x * 48, y: player.current.y + vector.y * 48 }); } }}>{icon}</button>)}
        <span className="world-dpad-center" aria-hidden="true">·</span>
      </div>
      <button className="world-touch-interact" disabled={paused || !nearbyActor || !ready} onClick={interactNearby} aria-label={nearbyActor ? `Interact with ${nearbyActor.label}` : "Interact. Walk near a person or station first."}>E<span>TALK</span></button>
    </div>
    <p className="world-sr-only" role="status" aria-live="polite">{announcement}</p>
  </div>;
}
