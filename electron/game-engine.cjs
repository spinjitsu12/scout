// Generated from src/lib/game.ts. Run npm run build to refresh; edit the shared TypeScript engine instead.
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region src/lib/immersive-locations.ts
const HOME_CENTER = {
	x: 220,
	z: 480
};
const HOME_SPAWN = {
	x: 219,
	z: 482
};
const HOME_CAR_SPAWN$1 = {
	x: 220,
	z: 510
};
/** The only geometry contract used by gameplay, renderer and collision tests. All dimensions are metres. */
function getImmersiveLocations(tier) {
	const themes = tier === 0 ? [
		"studio",
		"workshop",
		"gallery",
		"cafe"
	] : tier === 1 ? [
		"institute",
		"archive",
		"observatory",
		"pavilion"
	] : [
		"headquarters",
		"signal",
		"station",
		"market"
	];
	const locations = FIELD_LOCATIONS[tier].map((location) => {
		const north = location.id < 2, parking = {
			x: location.point.x,
			z: location.point.y
		};
		const center = location.id === 4 ? {
			x: 850,
			z: 595
		} : {
			x: location.point.x,
			z: location.point.y + (north ? -63 : 63)
		};
		const width = location.id === 0 ? 60 : location.id === 4 ? 24 : 68, depth = location.id === 0 ? 42 : location.id === 4 ? 16 : 46;
		const door = {
			x: center.x,
			z: center.z + (north || location.id === 4 ? depth / 2 : -depth / 2)
		};
		const footprint = {
			minX: center.x - width / 2,
			maxX: center.x + width / 2,
			minZ: center.z - depth / 2,
			maxZ: center.z + depth / 2
		};
		const candidateSpawns = Array.from({ length: 12 }, (_, slot) => ({
			x: center.x - 23 + slot % 6 * 8.5,
			z: center.z + (slot < 6 ? -4 : 7)
		}));
		const make = (id, type, label, px, pz, range = 2.8, detail) => ({
			id,
			type,
			label,
			position: {
				x: px,
				z: pz
			},
			range,
			locationId: location.id,
			detail
		});
		const pointsOfInterest = location.id === 4 ? [make("fuel", "fuel", "Refuel at the pump", parking.x, parking.z, 4)] : location.id === 0 ? [
			make("office-missions", "missions", "Read the assignments board", center.x + 14, center.z - 12),
			make("office-career", "career", "Review your career notebook", center.x - 14, center.z - 12),
			make("office-team", "team", "Check the team lounge", center.x + 17, center.z + 10, 3),
			make("office-week", "week", "Finish the scouting week", center.x - 15, center.z + 10)
		] : [make(`venue-${location.id}-sources`, "sources", `Ask about the ${location.name} community`, center.x + 24, center.z - 13, 3), make(`venue-${location.id}-notice`, "thought", "Read the local noticeboard", center.x - 24, center.z + 14, 2.5, location.id === 1 ? "The best discoveries begin with listening. Members share their projects here; walk around and get to know them." : location.id === 2 ? "Take your time with the exhibits. A portfolio tells you what someone makes; a conversation tells you why." : "People return here for the quiet corners, the conversations, and the familiar faces. Take a little time before asking for an introduction.")];
		return {
			id: location.id,
			name: location.name,
			subtitle: location.subtitle,
			center,
			door,
			parking,
			interiorSpawn: {
				x: door.x,
				z: door.z + (north || location.id === 4 ? -3 : 3)
			},
			footprint,
			candidateSpawns,
			pointsOfInterest,
			theme: themes[location.id] ?? "fuel"
		};
	});
	locations.push({
		id: 5,
		name: "Home",
		subtitle: "Your apartment",
		center: { ...HOME_CENTER },
		door: {
			x: 220,
			z: 488.5
		},
		parking: { ...HOME_CAR_SPAWN$1 },
		interiorSpawn: {
			x: 220,
			z: 485.8
		},
		footprint: {
			minX: 210,
			maxX: 230,
			minZ: 471.5,
			maxZ: 488.5
		},
		candidateSpawns: [],
		theme: "home",
		pointsOfInterest: [
			{
				id: "home-laptop",
				type: "laptop",
				label: "Sit at your laptop",
				position: {
					x: 225.8,
					z: 476.2
				},
				range: 1.6,
				locationId: 5
			},
			{
				id: "home-rest",
				type: "week",
				label: "Wind down for the week",
				position: {
					x: 212.4,
					z: 480.8
				},
				range: 2,
				locationId: 5
			},
			{
				id: "home-window",
				type: "thought",
				label: "Take a moment by the window",
				position: {
					x: 228.8,
					z: 483.2
				},
				range: 1.7,
				locationId: 5,
				detail: "The town is in no rush. Neither are you. One thoughtful conversation can be worth an entire day of chasing leads."
			}
		]
	});
	return locations;
}
function candidateAnchor(tier, id) {
	const index = Math.max(0, Number(id.split("-")[1]) || 0);
	return { ...getImmersiveLocations(tier)[index % 3 + 1].candidateSpawns[Math.floor(index / 3) % 12] };
}
function publicInteriorContains(tier, locationId, point, margin = 0) {
	const location = getImmersiveLocations(tier).find((item) => item.id === locationId);
	if (!location) return false;
	const b = location.footprint;
	return point.x >= b.minX + margin && point.x <= b.maxX - margin && point.z >= b.minZ + margin && point.z <= b.maxZ - margin;
}
//#endregion
//#region src/lib/expedition.ts
const DISTRICT_WIDTH = 1536;
const DISTRICT_HEIGHT = 1024;
const GAS_POINT = {
	x: 840,
	y: 620
};
const GAS_PRICES = [
	4.15,
	4.65,
	5.25
];
const FIELD_LOCATIONS = {
	0: [
		{
			id: 0,
			point: {
				x: 387,
				y: 266
			},
			door: {
				x: 387,
				y: 180
			},
			name: "Cirrus Works",
			subtitle: "Headquarters & garage",
			source: null
		},
		{
			id: 1,
			point: {
				x: 1159,
				y: 266
			},
			door: {
				x: 1159,
				y: 201
			},
			name: "Maker Yard",
			subtitle: "Community meetup",
			source: 0
		},
		{
			id: 2,
			point: {
				x: 388,
				y: 718
			},
			door: {
				x: 388,
				y: 910
			},
			name: "Palette House",
			subtitle: "Portfolio circuit",
			source: 1
		},
		{
			id: 3,
			point: {
				x: 1138,
				y: 718
			},
			door: {
				x: 1138,
				y: 928
			},
			name: "Junction Café",
			subtitle: "Industry referrals",
			source: 2
		},
		{
			id: 4,
			point: GAS_POINT,
			door: GAS_POINT,
			name: "Highway Fuel",
			subtitle: "Fuel & roadside assistance",
			source: null
		}
	],
	1: [
		{
			id: 0,
			point: {
				x: 375,
				y: 275
			},
			door: {
				x: 375,
				y: 189
			},
			name: "Aster Institute",
			subtitle: "Headquarters & garage",
			source: null
		},
		{
			id: 1,
			point: {
				x: 1170,
				y: 275
			},
			door: {
				x: 1170,
				y: 194
			},
			name: "Archive Annex",
			subtitle: "Independent journals",
			source: 0
		},
		{
			id: 2,
			point: {
				x: 375,
				y: 752
			},
			door: {
				x: 375,
				y: 928
			},
			name: "Observatory",
			subtitle: "Research symposium",
			source: 1
		},
		{
			id: 3,
			point: {
				x: 1170,
				y: 752
			},
			door: {
				x: 1170,
				y: 932
			},
			name: "Glass Pavilion",
			subtitle: "Fellowship network",
			source: 2
		},
		{
			id: 4,
			point: GAS_POINT,
			door: GAS_POINT,
			name: "Highway Fuel",
			subtitle: "Fuel & roadside assistance",
			source: null
		}
	],
	2: [
		{
			id: 0,
			point: {
				x: 383,
				y: 266
			},
			door: {
				x: 383,
				y: 188
			},
			name: "The Veil",
			subtitle: "Restricted headquarters",
			source: null
		},
		{
			id: 1,
			point: {
				x: 1167,
				y: 266
			},
			door: {
				x: 1167,
				y: 186
			},
			name: "Signal Archive",
			subtitle: "Incident archive",
			source: 0
		},
		{
			id: 2,
			point: {
				x: 384,
				y: 702
			},
			door: {
				x: 384,
				y: 908
			},
			name: "Last Stop",
			subtitle: "Witness interviews",
			source: 1
		},
		{
			id: 3,
			point: {
				x: 1185,
				y: 702
			},
			door: {
				x: 1185,
				y: 923
			},
			name: "Night Market",
			subtitle: "Encrypted referrals",
			source: 2
		},
		{
			id: 4,
			point: GAS_POINT,
			door: GAS_POINT,
			name: "Highway Fuel",
			subtitle: "Fuel & roadside assistance",
			source: null
		}
	]
};
const PAINTS = {
	mint: "#86cfb3",
	coral: "#ed8b7b",
	gold: "#edc76c",
	violet: "#b6a0e3",
	slate: "#91a4b4"
};
const CAR_NAMES = {
	compact: "City compact",
	wagon: "Field wagon",
	coupe: "Scout coupe"
};
const DEFAULT_STYLE = {
	name: "Scout",
	avatar: 0,
	car: "compact",
	paint: "slate",
	plate: "SCOUT",
	camera: "cockpit",
	radio: false,
	station: 0,
	music: true,
	sound: true,
	engine: true
};
const FULL_TURN = Math.PI * 2;
const freshField = (tier = 0) => {
	const headquarters = FIELD_LOCATIONS[tier][0].point;
	return {
		scene: "office",
		player: {
			x: headquarters.x,
			y: headquarters.y + 40
		},
		car: { ...headquarters },
		heading: 0,
		driving: false,
		fuel: 12,
		visited: [0],
		met: [],
		destination: null
	};
};
const fieldOf = (game) => game.field ? {
	...game.field,
	fuel: game.field.fuel ?? 12
} : freshField(game.tier);
function candidateLocation(id) {
	return Math.max(0, Number(id.split("-")[1]) || 0) % 3 + 1;
}
function candidatePosition(game, id) {
	if (game.immersion) {
		const anchor = candidateAnchor(game.tier, id);
		return {
			x: anchor.x,
			y: anchor.z
		};
	}
	const location = FIELD_LOCATIONS[game.tier][candidateLocation(id)];
	const index = Math.max(0, Number(id.split("-")[1]) || 0);
	const slot = Math.floor(index / 3) % 12;
	const row = Math.floor(slot / 6);
	return {
		x: location.door.x + (slot % 6 - 2.5) * 38,
		y: Math.min(DISTRICT_HEIGHT - 30, location.door.y + 12 + row * 24)
	};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function atVenue(game, locationId) {
	if (game.immersion) {
		const state = game.immersion, place = getImmersiveLocations(game.tier).find((item) => item.id === locationId);
		if (!place || state.mode !== "foot" || !state.parkedAt.includes(locationId) || Math.hypot(state.vehicle.x - place.parking.x, state.vehicle.z - place.parking.z) > 25) return false;
		if (locationId === 4) return Math.hypot(state.player.x - place.parking.x, state.player.z - place.parking.z) <= 6;
		return state.interior === locationId && publicInteriorContains(game.tier, locationId, state.player, .3);
	}
	const location = FIELD_LOCATIONS[game.tier].find((place) => place.id === locationId);
	const field = fieldOf(game);
	return !!location && field.scene === "district" && !field.driving && distance(field.player, location.door) <= 110;
}
function canMeet(game, id) {
	const contact = game.candidates.find((candidate) => candidate.id === id);
	const field = fieldOf(game);
	if (game.immersion) {
		const anchor = candidateAnchor(game.tier, id);
		return !!contact && contact.discovered && contact.status === "available" && atVenue(game, candidateLocation(id)) && Math.hypot(game.immersion.player.x - anchor.x, game.immersion.player.z - anchor.z) <= 3.6;
	}
	return !!contact && contact.discovered && contact.status === "available" && field.scene === "district" && !field.driving && distance(field.player, candidatePosition(game, id)) <= 90;
}
function canRefuel(game) {
	const field = fieldOf(game);
	if (game.immersion) return atVenue(game, 4) && Math.hypot(game.immersion.player.x - game.immersion.vehicle.x, game.immersion.player.z - game.immersion.vehicle.z) <= 6;
	return atVenue(game, 4) && distance(field.car, FIELD_LOCATIONS[game.tier][4].point) <= 100;
}
const record$1 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const finite$1 = (value) => typeof value === "number" && Number.isFinite(value);
const validPoint = (value, bounded) => record$1(value) && finite$1(value.x) && finite$1(value.y) && (!bounded || value.x >= 0 && value.x <= 1536 && value.y >= 0 && value.y <= 1024);
function validScoutStyle(value) {
	return record$1(value) && typeof value.name === "string" && value.name.length >= 1 && value.name.length <= 24 && value.name.trim().length > 0 && !/[\u0000-\u001f\u007f]/u.test(value.name) && Number.isInteger(value.avatar) && value.avatar >= 0 && value.avatar <= 15 && typeof value.car === "string" && Object.hasOwn(CAR_NAMES, value.car) && typeof value.paint === "string" && Object.hasOwn(PAINTS, value.paint) && typeof value.plate === "string" && /^[A-Z0-9-]{1,8}$/u.test(value.plate) && (value.camera === void 0 || typeof value.camera === "string" && [
		"overhead",
		"cockpit",
		"chase",
		"far"
	].includes(value.camera)) && (value.radio === void 0 || typeof value.radio === "boolean") && (value.music === void 0 || typeof value.music === "boolean") && (value.sound === void 0 || typeof value.sound === "boolean") && (value.engine === void 0 || typeof value.engine === "boolean") && (value.station === void 0 || Number.isInteger(value.station) && value.station >= 0 && value.station <= 2);
}
function validField(value, bounded = true, legacyFuel = false) {
	if (!record$1(value) || !["office", "district"].includes(value.scene) || !validPoint(value.player, bounded) || !validPoint(value.car, bounded) || !finite$1(value.heading) || bounded && (value.heading < 0 || value.heading >= FULL_TURN) || typeof value.driving !== "boolean" || value.scene === "office" && value.driving || !(legacyFuel && value.fuel === void 0) && (!finite$1(value.fuel) || bounded && (value.fuel < 0 || value.fuel > 12)) || !Array.isArray(value.visited) || value.visited.length > 5 || new Set(value.visited).size !== value.visited.length || !value.visited.every((id) => Number.isInteger(id) && id >= 0 && id <= 4) || !Array.isArray(value.met) || value.met.length > 200 || new Set(value.met).size !== value.met.length || !value.met.every((id) => typeof id === "string" && id.length > 0 && id.length <= 100) || value.destination !== null && (!Number.isInteger(value.destination) || value.destination < 0 || value.destination > 4)) return false;
	return true;
}
function boundedField(field) {
	const bound = (point) => ({
		x: Math.max(0, Math.min(DISTRICT_WIDTH, point.x)),
		y: Math.max(0, Math.min(DISTRICT_HEIGHT, point.y))
	});
	return {
		...field,
		player: bound(field.player),
		car: bound(field.car),
		heading: (field.heading % FULL_TURN + FULL_TURN) % FULL_TURN,
		fuel: Math.max(0, Math.min(12, field.fuel)),
		visited: [...field.visited],
		met: [...field.met]
	};
}
//#endregion
//#region src/lib/prologue.ts
/** The dream is a prologue, never a lost or unwinnable real career. */
const PROLOGUE_PHASES = [
	"sky",
	"cruise",
	"meeting",
	"phone",
	"wake",
	"complete"
];
const DREAM_PITCHES = [
	{
		id: "salary",
		label: "Offer a salary nobody could refuse.",
		reply: "Money wasn't why I walked away from Stanfield. You still haven't asked what I want to build. I'm out."
	},
	{
		id: "purpose",
		label: "Pitch work that could change the world.",
		reply: "Everyone says that. Whose world? You brought a slogan when I needed a reason. I'm out."
	},
	{
		id: "freedom",
		label: "Promise him complete creative freedom.",
		reply: "A promise before you know me is just another contract. I won't sign away my future. I'm out."
	}
];
const initialPrologue = () => ({
	phase: "sky",
	choice: null
});
function validPrologue(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const state = value;
	return PROLOGUE_PHASES.includes(state.phase) && (state.choice === null || DREAM_PITCHES.some((pitch) => pitch.id === state.choice)) && (!["sky", "cruise"].includes(state.phase) || state.choice === null);
}
//#endregion
//#region src/lib/immersive-runtime.ts
const DREAM_CAR_SPAWN = {
	x: 500,
	z: 870,
	heading: 0
};
const HOME_CAR_SPAWN = {
	...HOME_CAR_SPAWN$1,
	heading: Math.PI
};
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const point = (value) => record(value) && finite(value.x) && finite(value.z) && value.x >= 0 && value.x <= 1536 && value.z >= 0 && value.z <= 1024;
function validImmersion(value) {
	if (!record(value) || value.schema !== 1 || ![
		0,
		1,
		2
	].includes(value.tier) || !["foot", "driving"].includes(value.mode) || !point(value.player) || !point(value.vehicle) || !record(value.player) || !record(value.vehicle)) return false;
	const player = value.player, vehicle = value.vehicle;
	const id = (value) => value === null || Number.isInteger(value) && value >= 0 && value <= 5;
	return finite(player.yaw) && Math.abs(player.yaw) <= Math.PI + .001 && finite(player.pitch) && Math.abs(player.pitch) <= 1.4 && finite(vehicle.heading) && Math.abs(vehicle.heading) <= Math.PI + .001 && finite(vehicle.speed) && Math.abs(vehicle.speed) <= 65 && finite(vehicle.steering) && Math.abs(vehicle.steering) <= 1 && finite(vehicle.distance) && vehicle.distance >= 0 && vehicle.distance < 1e9 && finite(vehicle.fuel) && vehicle.fuel >= 0 && vehicle.fuel <= 12 && ["D", "R"].includes(vehicle.gear) && id(value.interior) && id(value.destination) && Array.isArray(value.parkedAt) && value.parkedAt.length <= 6 && new Set(value.parkedAt).size === value.parkedAt.length && value.parkedAt.every((id) => Number.isInteger(id) && id >= 0 && id <= 5) && [
		"accelerate",
		"brake",
		"steer",
		"complete"
	].includes(value.tutorial) && Array.isArray(value.thoughtsSeen) && value.thoughtsSeen.length <= 100 && value.thoughtsSeen.every((id) => typeof id === "string" && id.length <= 120) && typeof value.homeReviewed === "boolean";
}
function freshImmersion(game) {
	const waking = game.story?.phase === "wake", dream = game.story && !["wake", "complete"].includes(game.story.phase);
	const headquarters = getImmersiveLocations(game.tier)[0];
	const parking = dream ? DREAM_CAR_SPAWN : waking ? HOME_CAR_SPAWN : {
		...headquarters.parking,
		heading: Math.PI
	};
	return {
		schema: 1,
		tier: game.tier,
		interior: dream ? null : waking ? 5 : 0,
		player: dream ? {
			x: parking.x,
			z: parking.z,
			yaw: 0,
			pitch: 0
		} : waking ? {
			...HOME_SPAWN,
			yaw: -Math.PI / 2,
			pitch: 0
		} : {
			...headquarters.interiorSpawn,
			yaw: 0,
			pitch: 0
		},
		vehicle: {
			...parking,
			speed: 0,
			steering: 0,
			distance: 0,
			fuel: game.field?.fuel ?? 12,
			gear: "D"
		},
		mode: dream ? "driving" : "foot",
		destination: dream ? 1 : waking ? 0 : null,
		parkedAt: dream ? [] : waking ? [5] : [0],
		tutorial: dream || waking ? "accelerate" : "complete",
		thoughtsSeen: [],
		homeReviewed: !waking
	};
}
//#endregion
//#region src/lib/game.ts
const SKILLS = [
	"craft",
	"insight",
	"nerve",
	"teamwork"
];
const MOTIVES = {
	autonomy: {
		name: "Autonomy",
		offer: "Independent work",
		cost: 350,
		description: "Room to choose how the work gets done."
	},
	security: {
		name: "Security",
		offer: "Guaranteed contract",
		cost: 700,
		description: "A stable contract and predictable income."
	},
	mentorship: {
		name: "Mentorship",
		offer: "Dedicated mentor",
		cost: 500,
		description: "Someone experienced to learn from."
	},
	purpose: {
		name: "Purpose",
		offer: "Meaningful project",
		cost: 350,
		description: "Work with a clear impact beyond the paycheck."
	},
	privacy: {
		name: "Privacy",
		offer: "Protected identity",
		cost: 500,
		description: "Control over what others know about them."
	}
};
const TIERS = [
	{
		number: "01",
		name: "The Company",
		employer: "Cirrus Works",
		label: "People & possibilities",
		description: "A small technology company. A big hiring problem.",
		briefing: "The launch is slipping. Find people who can build, design, and keep the business moving. Credentials are a starting point; work samples tell you more.",
		accent: "#c9eea7",
		roles: [
			"Engineering",
			"Design",
			"Operations"
		],
		budget: 42e3,
		stipend: 1200,
		trial: 800,
		sourceCost: 450,
		goals: {
			hires: 3,
			missions: 3,
			reputation: 35
		},
		skillNames: {
			craft: "Craft",
			insight: "Ingenuity",
			nerve: "Composure",
			teamwork: "Collaboration"
		},
		next: "Aster Institute",
		perk: "A wider network: one extra weekly action.",
		rival: "Helix Talent",
		sources: [
			{
				name: "Community meetup",
				detail: "Builders with something to prove.",
				tag: "OFF THE RADAR"
			},
			{
				name: "Portfolio circuit",
				detail: "Work that speaks for itself.",
				tag: "WORK SAMPLES"
			},
			{
				name: "Industry referrals",
				detail: "Follow a name to the next name.",
				tag: "YOUR NETWORK"
			}
		]
	},
	{
		number: "02",
		name: "The Elite",
		employer: "Aster Institute",
		label: "Extraordinary minds",
		description: "An institute pursuing problems nobody has solved.",
		briefing: "Your reputation opened this door. Recruit researchers, systems thinkers, and strategists. Diverse specialties earn a collaboration bonus on institute projects.",
		accent: "#c6b5ff",
		roles: [
			"Science",
			"Systems",
			"Strategy"
		],
		budget: 125e3,
		stipend: 4200,
		trial: 2400,
		sourceCost: 1400,
		goals: {
			hires: 4,
			missions: 4,
			reputation: 50
		},
		skillNames: {
			craft: "Expertise",
			insight: "Originality",
			nerve: "Focus",
			teamwork: "Synthesis"
		},
		next: "The Veil",
		perk: "Experienced judgment: cheaper investigations and a second extra weekly action.",
		rival: "Prometheus Foundation",
		sources: [
			{
				name: "Independent journals",
				detail: "The paper nobody cited. Yet.",
				tag: "UNRECOGNIZED"
			},
			{
				name: "Research symposium",
				detail: "The best minds in the room.",
				tag: "PEER REVIEW"
			},
			{
				name: "Fellowship network",
				detail: "Exceptional people know others.",
				tag: "CONNECTIONS"
			}
		]
	},
	{
		number: "03",
		name: "The Unknown",
		employer: "The Veil",
		label: "Restricted personnel",
		description: "An organization that officially does not exist.",
		briefing: "Some people see events before they happen. Others hear thoughts that are not their own. Verify their abilities and their control. Field operations increase exposure; cover operations bring it down.",
		accent: "#ffc989",
		roles: [
			"Perception",
			"Influence",
			"Control"
		],
		budget: 26e4,
		stipend: 7e3,
		trial: 4800,
		sourceCost: 2500,
		goals: {
			hires: 4,
			missions: 5,
			reputation: 65
		},
		skillNames: {
			craft: "Ability",
			insight: "Perception",
			nerve: "Control",
			teamwork: "Trust"
		},
		next: "Director clearance",
		perk: "Complete the final mandate to earn Director clearance.",
		rival: "Blackglass Division",
		sources: [
			{
				name: "Incident archive",
				detail: "Reports with no explanation.",
				tag: "UNEXPLAINED"
			},
			{
				name: "Witness interviews",
				detail: "Someone saw something impossible.",
				tag: "FIRST CONTACT"
			},
			{
				name: "Encrypted referrals",
				detail: "A trusted source. A hidden name.",
				tag: "CLASSIFIED"
			}
		]
	}
];
const PROFILES = [
	[
		[
			"Maya Chen",
			0,
			"Open-source maintainer",
			"Maintains a payment library after her day job. No degree; thousands of people rely on her code.",
			"Fixed a race condition that three senior engineers missed.",
			[
				84,
				88,
				70,
				78
			],
			"autonomy",
			95,
			3
		],
		[
			"Theo Mercer",
			1,
			"Independent designer",
			"Left a large agency to build tools for people with limited vision.",
			"The prototype works with a keyboard alone.",
			[
				80,
				86,
				77,
				84
			],
			"purpose",
			89,
			3
		],
		[
			"Nia Okafor",
			2,
			"Community organizer",
			"Runs a volunteer repair network with almost no money and very little fuss.",
			"Coordinated 60 volunteers through a citywide outage.",
			[
				78,
				79,
				89,
				93
			],
			"purpose",
			96,
			2
		],
		[
			"Elliot Vance",
			0,
			"Prestigious résumé",
			"An impressive list of employers and titles. His portfolio credits large teams.",
			"Claims to have led a complete platform migration.",
			[
				62,
				52,
				75,
				48
			],
			"security",
			69,
			1
		],
		[
			"Sana Patel",
			1,
			"Student portfolio",
			"A quiet final-year student with an unusual eye for interaction design.",
			"Her unfinished project has a remarkably clear onboarding flow.",
			[
				67,
				90,
				49,
				73
			],
			"mentorship",
			79,
			5
		],
		[
			"Rafael Cruz",
			2,
			"Startup operator",
			"Knows everyone in the local startup scene. Enjoys solving urgent problems.",
			"His former team grew fast, then missed two launches.",
			[
				72,
				65,
				84,
				65
			],
			"autonomy",
			67,
			2
		],
		[
			"Jun Park",
			0,
			"Repair shop programmer",
			"Automated the family repair shop between customer appointments.",
			"The inventory tool is faster than the commercial one it replaced.",
			[
				79,
				91,
				66,
				71
			],
			"mentorship",
			90,
			4
		],
		[
			"Amara Bell",
			1,
			"Museum technician",
			"Builds exhibits that make complex ideas accessible to children.",
			"A visitor figured out the exhibit without reading a word.",
			[
				88,
				84,
				86,
				82
			],
			"purpose",
			96,
			2
		],
		[
			"Levi Brooks",
			2,
			"Logistics specialist",
			"A warehouse coordinator who quietly eliminated a major delivery bottleneck.",
			"The improvement survived after he moved to another shift.",
			[
				90,
				75,
				88,
				87
			],
			"security",
			99,
			2
		],
		[
			"Iris Vale",
			0,
			"Competition finalist",
			"Solved every programming challenge, but prefers to work alone.",
			"Her code is elegant; nobody else could maintain it.",
			[
				94,
				89,
				83,
				35
			],
			"autonomy",
			84,
			2
		],
		[
			"Felix Reed",
			1,
			"Award-winning creative",
			"A persuasive presenter with a beautifully polished portfolio.",
			"Every case study looks excellent; user outcomes are missing.",
			[
				60,
				67,
				91,
				71
			],
			"security",
			76,
			1
		],
		[
			"Aisha Noor",
			2,
			"Front-desk problem solver",
			"Works reception at a busy clinic. Patients ask for her by name.",
			"Built a scheduling system that reduced missed visits.",
			[
				73,
				85,
				91,
				94
			],
			"mentorship",
			95,
			4
		]
	],
	[
		[
			"Dr. Ada Voss",
			0,
			"Independent researcher",
			"An unpublished researcher who found a flaw in a widely used climate model.",
			"Her prediction matched field observations months later.",
			[
				86,
				96,
				79,
				75
			],
			"autonomy",
			91,
			2
		],
		[
			"Kenji Mori",
			1,
			"Systems architect",
			"Connects ideas across disciplines, then builds something that actually works.",
			"A lab prototype ran continuously for 300 days.",
			[
				92,
				84,
				88,
				85
			],
			"purpose",
			98,
			2
		],
		[
			"Imani Saye",
			2,
			"Field strategist",
			"Coordinates research teams in places where plans rarely survive contact with reality.",
			"Her last expedition returned with every instrument intact.",
			[
				86,
				85,
				95,
				91
			],
			"purpose",
			96,
			2
		],
		[
			"Dr. Cassian Holt",
			0,
			"Decorated academic",
			"A celebrated lecturer with a familiar theory for every question.",
			"Has not published an original result in six years.",
			[
				77,
				56,
				89,
				64
			],
			"security",
			84,
			1
		],
		[
			"Linh Duarte",
			1,
			"Unconventional inventor",
			"Builds scientific instruments from discarded parts and documents every mistake.",
			"A handmade sensor outperformed the lab's reference instrument.",
			[
				84,
				95,
				71,
				82
			],
			"mentorship",
			88,
			4
		],
		[
			"Rory Finch",
			2,
			"Think-tank fellow",
			"Excellent at selling ambitious projects to donors. Less certain about implementation.",
			"Raised a large grant for a project still in its planning phase.",
			[
				67,
				76,
				92,
				71
			],
			"autonomy",
			74,
			1
		],
		[
			"Dr. Selene Aran",
			0,
			"Cross-discipline fellow",
			"Works between biology and mathematics, where conventional journals struggle to place her.",
			"Her strange model explains three unrelated experimental results.",
			[
				92,
				99,
				79,
				87
			],
			"purpose",
			93,
			3
		],
		[
			"Mateo Kim",
			1,
			"Observatory engineer",
			"Keeps remote instruments running through weather, outages, and dwindling budgets.",
			"Designed a failover system that needed no maintenance for a year.",
			[
				96,
				85,
				93,
				90
			],
			"security",
			99,
			2
		],
		[
			"Zuri West",
			2,
			"Independent analyst",
			"Finds the question everyone forgot to ask. Her memos are short and remarkably accurate.",
			"Predicted a failed collaboration from its decision-making structure.",
			[
				88,
				94,
				91,
				87
			],
			"autonomy",
			95,
			2
		],
		[
			"Dr. Owen Hart",
			0,
			"Young researcher",
			"A talented doctoral candidate whose notebooks contain more questions than answers.",
			"Solved an instrument calibration problem during an unrelated experiment.",
			[
				76,
				92,
				63,
				85
			],
			"mentorship",
			83,
			5
		],
		[
			"Petra Shaw",
			1,
			"Solo inventor",
			"Holds several patents and refuses to explain her prototypes to colleagues.",
			"A remarkable machine. An instruction manual nobody understands.",
			[
				95,
				94,
				88,
				38
			],
			"autonomy",
			82,
			2
		],
		[
			"Noah Silva",
			2,
			"Research coordinator",
			"Makes brilliant people work well together without taking the credit.",
			"Every member of a once-fractured lab signed his reference letter.",
			[
				85,
				87,
				94,
				99
			],
			"purpose",
			98,
			2
		]
	],
	[
		[
			"Elara Grey",
			0,
			"Incident 017 / The station",
			"Described a train delay in detail twelve minutes before the fault occurred.",
			"Three independent witnesses recorded the same sequence of events.",
			[
				88,
				97,
				73,
				83
			],
			"privacy",
			89,
			3
		],
		[
			"Dorian Ash",
			1,
			"Incident 041 / The room",
			"People near him reach the same conclusion without remembering the discussion.",
			"The effect disappears when he leaves the building.",
			[
				91,
				88,
				81,
				72
			],
			"autonomy",
			84,
			2
		],
		[
			"Mira Sol",
			2,
			"Incident 062 / Still water",
			"Nearby anomalous effects cease while she is concentrating.",
			"A containment alarm stopped when she entered the corridor.",
			[
				86,
				85,
				98,
				94
			],
			"purpose",
			98,
			2
		],
		[
			"Silas Wren",
			0,
			"Unverified prediction",
			"Produces long lists of predictions and publishes the successful ones.",
			"Only a few original timestamps can be independently verified.",
			[
				53,
				63,
				82,
				68
			],
			"security",
			71,
			1
		],
		[
			"Anya Frost",
			1,
			"Incident 108 / The echo",
			"Reports hearing a thought before the speaker finishes thinking it.",
			"Overcrowded rooms make the phenomenon harder to control.",
			[
				85,
				94,
				52,
				86
			],
			"mentorship",
			83,
			5
		],
		[
			"Kellan Moss",
			2,
			"Incident 119 / The door",
			"Survived an event that injured everyone else in the room.",
			"Refuses to repeat the circumstances without safety guarantees.",
			[
				88,
				77,
				85,
				78
			],
			"security",
			92,
			2
		],
		[
			"Vesper Lane",
			0,
			"Incident 203 / The ledger",
			"Recognizes patterns in encrypted records without knowing the language.",
			"Decoded a message whose key had never been written down.",
			[
				96,
				99,
				87,
				86
			],
			"privacy",
			96,
			2
		],
		[
			"Eden Cross",
			1,
			"Incident 211 / The crowd",
			"Can calm a room instantly. People retain their memories and independent judgment.",
			"Stopped an evacuation panic without raising her voice.",
			[
				93,
				91,
				94,
				98
			],
			"purpose",
			99,
			2
		],
		[
			"Ren Vale",
			2,
			"Incident 225 / The boundary",
			"Defines small areas where anomalous effects cannot cross.",
			"Maintained a boundary through a twelve-hour power failure.",
			[
				97,
				91,
				99,
				87
			],
			"privacy",
			99,
			2
		],
		[
			"Jules Ember",
			0,
			"Incident 244 / The dream",
			"Has a notebook of places they have never visited, including one restricted facility.",
			"A detail in a drawing matched an unannounced renovation.",
			[
				80,
				95,
				62,
				90
			],
			"mentorship",
			85,
			4
		],
		[
			"Soren Pike",
			1,
			"Incident 258 / The bargain",
			"Can persuade almost anyone. Insists that nobody should tell him what to do.",
			"Two former handlers independently asked not to be contacted again.",
			[
				98,
				91,
				85,
				32
			],
			"autonomy",
			73,
			2
		],
		[
			"Talia North",
			2,
			"Incident 271 / The quiet",
			"An experienced medic who suppresses effects long enough for others to recover.",
			"Every member of her response team volunteered to work with her again.",
			[
				90,
				86,
				95,
				99
			],
			"purpose",
			98,
			2
		]
	]
];
const FIRST = [
	"Arden",
	"Robin",
	"Alex",
	"Devon",
	"Samira",
	"Morgan",
	"Alexis",
	"Remy",
	"Rowan",
	"Casey",
	"Sage",
	"Avery"
];
const LAST = [
	"Ellis",
	"Rivera",
	"Singh",
	"Blake",
	"Tran",
	"Dawson",
	"Quinn",
	"Alvarez",
	"Ito",
	"Lawson",
	"Hassan",
	"Stone"
];
function random(g) {
	g.seed = Math.imul(1664525, g.seed) + 1013904223 >>> 0;
	return g.seed / 4294967296;
}
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const money = (n) => new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD",
	maximumFractionDigits: 0
}).format(n);
const members = (g) => g.candidates.filter((c) => c.status === "hired");
const payroll = (g) => members(g).reduce((sum, c) => sum + (c.wage || 0), 0);
const weeklyActions = (g) => 6 + g.prestige;
const intelCost = (g, n) => Math.round(n * (g.prestige >= 2 ? .8 : 1));
function log(g, text, tone = "neutral") {
	g.log.unshift({
		id: g.event++,
		week: g.week,
		text,
		tone
	});
	g.log = g.log.slice(0, 60);
}
function createCandidate(g, index) {
	const p = PROFILES[g.tier][index % 12];
	const generated = index >= 12;
	const skills = Object.fromEntries(SKILLS.map((key, i) => [key, clamp(p[5][i] + (generated ? Math.round(random(g) * 14 - 7) : 0), 20, 99)]));
	const name = generated ? `${FIRST[Math.floor(random(g) * FIRST.length)]} ${LAST[Math.floor(random(g) * LAST.length)]}` : p[0];
	const baseSalary = [
		1100,
		3300,
		6100
	][g.tier];
	return {
		id: `t${g.tier}-${index}`,
		name,
		role: TIERS[g.tier].roles[p[1]],
		origin: p[2],
		bio: p[3],
		hook: p[4],
		skills,
		ranges: {},
		growth: p[8],
		reliability: p[7],
		motive: p[6],
		salary: Math.round((baseSalary + random(g) * .6 * baseSalary) / 50) * 50,
		deadline: g.week + 4 + Math.floor(random(g) * 5),
		discovered: index < 6,
		starred: false,
		status: "available",
		evidence: [],
		tested: [],
		lastOffer: 0,
		trust: 0
	};
}
function newGame(seed = Date.now() >>> 0) {
	const g = {
		version: 1,
		seed,
		tier: 0,
		week: 1,
		cash: TIERS[0].budget,
		reputation: 0,
		actions: 6,
		candidates: [],
		completed: 0,
		attempts: 0,
		exposure: 0,
		missionThisWeek: false,
		log: [],
		prestige: 0,
		history: [],
		report: null,
		briefing: true,
		event: 0,
		mentoring: 0,
		rescueUsed: false,
		won: false,
		field: freshField(),
		style: { ...DEFAULT_STYLE },
		story: initialPrologue()
	};
	g.candidates = Array.from({ length: 12 }, (_, i) => createCandidate(g, i));
	log(g, "Welcome to Cirrus Works. Three great hires could change this company.");
	return g;
}
function normalizeGame(game) {
	const next = structuredClone(game);
	if (next.field === void 0) {
		next.field = freshField(next.tier);
		next.field.met = next.candidates.filter((candidate) => candidate.status === "hired" || candidate.discovered && (candidate.tested.length > 0 || candidate.evidence.length > 0)).map((candidate) => candidate.id);
	}
	next.style = {
		...DEFAULT_STYLE,
		...next.style
	};
	if (next.story === void 0) next.story = {
		phase: "complete",
		choice: null
	};
	if (next.field.fuel === void 0) next.field.fuel = 12;
	return next;
}
const canPrestige = (g) => {
	const goal = TIERS[g.tier].goals;
	return members(g).length >= goal.hires && g.completed >= goal.missions && g.reputation >= goal.reputation && (g.tier !== 2 || g.exposure < 60);
};
const goalProgress = (g) => {
	const goal = TIERS[g.tier].goals;
	return (Math.min(members(g).length / goal.hires, 1) + Math.min(g.completed / goal.missions, 1) + Math.min(g.reputation / goal.reputation, 1)) / 3 * 100;
};
function missions(g) {
	const tier = g.tier;
	return [
		[
			{
				name: "The first release",
				description: "Ship a useful prototype that people can understand and the team can maintain.",
				roles: [0, 1],
				weights: [
					.35,
					.25,
					.15,
					.25
				],
				diff: 62
			},
			{
				name: "The midnight outage",
				description: "Restore service, coordinate the response, and explain what happened to customers.",
				roles: [0, 2],
				weights: [
					.3,
					.15,
					.35,
					.2
				],
				diff: 67
			},
			{
				name: "A product worth using",
				description: "Turn difficult customer feedback into a simpler, better product.",
				roles: [1, 2],
				weights: [
					.2,
					.3,
					.15,
					.35
				],
				diff: 68
			},
			{
				name: "The enterprise pitch",
				description: "Win a demanding client with a credible demo and a plan the team can deliver.",
				roles: [
					0,
					1,
					2
				],
				weights: [
					.25,
					.2,
					.25,
					.3
				],
				diff: 73
			}
		],
		[
			{
				name: "Water from thin air",
				description: "Combine a new material, a working device, and a realistic field deployment.",
				roles: [
					0,
					1,
					2
				],
				weights: [
					.3,
					.3,
					.15,
					.25
				],
				diff: 79
			},
			{
				name: "The unproven theorem",
				description: "Find a new approach, test it rigorously, and communicate the result.",
				roles: [0, 2],
				weights: [
					.3,
					.4,
					.1,
					.2
				],
				diff: 80
			},
			{
				name: "The remote observatory",
				description: "Keep an ambitious experiment running where replacement parts cannot reach it.",
				roles: [1, 2],
				weights: [
					.35,
					.15,
					.3,
					.2
				],
				diff: 80
			},
			{
				name: "The fellowship review",
				description: "Produce an original result that survives scrutiny from other exceptional minds.",
				roles: [
					0,
					1,
					2
				],
				weights: [
					.25,
					.35,
					.2,
					.2
				],
				diff: 84
			}
		],
		[
			{
				name: "The disappearing frequency",
				description: "Locate a signal that changes whenever someone listens to it. Leave no public trace.",
				roles: [0, 2],
				weights: [
					.25,
					.35,
					.3,
					.1
				],
				diff: 84
			},
			{
				name: "A room full of echoes",
				description: "Separate genuine thoughts from an anomalous echo without compromising the witnesses.",
				roles: [0, 1],
				weights: [
					.3,
					.3,
					.25,
					.15
				],
				diff: 86
			},
			{
				name: "The seventh minute",
				description: "Contain an event whose effects appear seven minutes before its cause.",
				roles: [
					0,
					1,
					2
				],
				weights: [
					.3,
					.25,
					.3,
					.15
				],
				diff: 87
			},
			{
				name: "Quiet extraction",
				description: "Recover an exposed operative and restore a convincing explanation for the incident.",
				roles: [1, 2],
				weights: [
					.2,
					.15,
					.35,
					.3
				],
				diff: 85
			}
		]
	][tier].map((m, i) => ({
		id: `m${i}`,
		name: m.name,
		description: m.description,
		difficulty: m.diff,
		reward: [
			9e3,
			25e3,
			43e3
		][tier] + i * [
			1e3,
			2e3,
			3e3
		][tier],
		reputation: [
			12,
			14,
			16
		][tier] + i,
		roles: m.roles.map((r) => TIERS[tier].roles[r]),
		weights: Object.fromEntries(SKILLS.map((s, j) => [s, m.weights[j]])),
		exposure: tier === 2 ? 10 + i * 3 : 0
	}));
}
function projectScore(g, mission, ids) {
	const team = members(g).filter((c) => ids.includes(c.id));
	if (!team.length) return {
		score: 0,
		contributions: [],
		coverage: 0
	};
	const contributions = team.map((c) => ({
		name: c.name,
		score: Math.round(SKILLS.reduce((sum, s) => sum + c.skills[s] * mission.weights[s], 0) * (.84 + c.reliability / 625) * (.85 + (c.morale ?? 85) / 667))
	}));
	const coverage = mission.roles.filter((role) => team.some((c) => c.role === role)).length;
	const allRoles = new Set(team.map((c) => c.role)).size;
	const coverageBonus = coverage / mission.roles.length * 8 - (mission.roles.length - coverage) * 4;
	const institutionBonus = g.tier === 1 ? Math.max(0, allRoles - 1) * 3 : 0;
	const agencyPenalty = g.tier === 2 ? Math.max(0, g.exposure - 40) / 8 : 0;
	return {
		score: Math.max(0, Math.round(contributions.reduce((sum, c) => sum + c.score, 0) / team.length + coverageBonus + institutionBonus - agencyPenalty)),
		contributions,
		coverage
	};
}
function act(original, action) {
	const g = normalizeGame(original);
	const t = TIERS[g.tier];
	const need = (actions, cost = 0) => {
		if (g.actions < actions) throw new Error("No time left this week. Advance to next week to continue.");
		if (g.cash < cost) throw new Error("Your budget cannot cover this action.");
		g.actions -= actions;
		g.cash -= cost;
	};
	const find = (id, available = false) => {
		const c = g.candidates.find((c) => c.id === id);
		if (!c || available && (c.status !== "available" || !c.discovered)) throw new Error("This candidate is no longer available.");
		return c;
	};
	if (action.type === "story") {
		if (!validPrologue(action.state)) throw new Error("The prologue could not be saved.");
		const wasWaking = g.story?.phase === "wake";
		g.story = { ...action.state };
		if (g.immersion && action.state.phase === "wake" && !wasWaking) {
			g.field.fuel = 12;
			g.immersion = freshImmersion(g);
		}
		return g;
	}
	if (action.type === "immersionSnapshot") {
		if (!validImmersion(action.snapshot) || action.snapshot.tier !== g.tier) throw new Error("Your position could not be saved.");
		const snapshot = structuredClone(action.snapshot);
		const locations = getImmersiveLocations(g.tier);
		snapshot.parkedAt = [...new Set(g.immersion?.parkedAt ?? [])];
		if (Math.abs(snapshot.vehicle.speed) < .65) {
			for (const location of locations) if (Math.hypot(snapshot.vehicle.x - location.parking.x, snapshot.vehicle.z - location.parking.z) <= 25 && !snapshot.parkedAt.includes(location.id)) snapshot.parkedAt.push(location.id);
		}
		if (snapshot.interior !== null && !publicInteriorContains(g.tier, snapshot.interior, snapshot.player)) snapshot.interior = null;
		snapshot.vehicle.fuel = Math.min(g.field.fuel, snapshot.vehicle.fuel);
		g.immersion = snapshot;
		g.field = boundedField({
			...g.field,
			scene: snapshot.interior === 0 ? "office" : "district",
			player: {
				x: snapshot.mode === "driving" ? snapshot.vehicle.x : snapshot.player.x,
				y: snapshot.mode === "driving" ? snapshot.vehicle.z : snapshot.player.z
			},
			car: {
				x: snapshot.vehicle.x,
				y: snapshot.vehicle.z
			},
			heading: snapshot.vehicle.heading,
			driving: snapshot.mode === "driving",
			fuel: snapshot.vehicle.fuel,
			destination: snapshot.destination !== null && snapshot.destination <= 4 ? snapshot.destination : null
		});
		for (const location of locations) if (location.id <= 4 && atVenue(g, location.id) && !g.field.visited.includes(location.id)) g.field.visited.push(location.id);
		return g;
	}
	if (action.type === "customize") {
		if (!validScoutStyle(action.style)) throw new Error("Choose a scout name, a valid look and an uppercase plate with 1–8 letters, numbers or hyphens.");
		g.style = {
			...g.style,
			...action.style,
			name: action.style.name.trim()
		};
		return g;
	}
	if (action.type === "preferences") {
		const preferences = { ...g.style };
		for (const key of [
			"camera",
			"radio",
			"station",
			"music",
			"sound",
			"engine"
		]) if (action[key] !== void 0) Object.assign(preferences, { [key]: action[key] });
		if (!validScoutStyle(preferences)) throw new Error("Choose a valid camera, radio station and sound setting.");
		g.style = preferences;
		return g;
	}
	if (action.type === "fieldEnter") {
		if (g.immersion) return g;
		if (g.field.scene === "district") return g;
		g.field = boundedField({
			...g.field,
			scene: "district",
			driving: false,
			player: {
				x: g.field.car.x + 44,
				y: g.field.car.y + 32
			}
		});
		return g;
	}
	if (action.type === "fieldReturn") {
		if (g.immersion) {
			if (!atVenue(g, 0)) throw new Error("Drive to headquarters, park, and walk through the entrance.");
			return g;
		}
		if (g.field.scene === "office") return g;
		if (!atVenue(g, 0)) throw new Error("Park and walk to the headquarters entrance to go inside.");
		const headquarters = FIELD_LOCATIONS[g.tier][0].point;
		g.field = {
			...g.field,
			scene: "office",
			driving: false,
			car: { ...headquarters },
			player: {
				x: headquarters.x,
				y: headquarters.y + 40
			},
			heading: 0,
			destination: null
		};
		return g;
	}
	if (action.type === "setDestination") {
		if (!g.immersion && g.field.scene !== "district") throw new Error("Head outside to set a driving destination.");
		if (action.destination !== null && (!Number.isInteger(action.destination) || !FIELD_LOCATIONS[g.tier].some((location) => location.id === action.destination))) throw new Error("Choose a destination on the district map.");
		g.field.destination = action.destination;
		if (g.immersion) g.immersion.destination = action.destination;
		return g;
	}
	if (action.type === "fieldSnapshot") {
		if (!validField(action.field, false)) throw new Error("The scouting position could not be saved.");
		if (g.immersion) return g;
		if (action.field.scene !== g.field.scene) throw new Error("Use the headquarters entrance to change locations.");
		const field = boundedField(action.field);
		field.met = [...g.field.met];
		field.visited = [...g.field.visited];
		field.destination = g.field.destination;
		field.fuel = Math.min(g.field.fuel, field.fuel);
		if (field.driving) field.player = { ...field.car };
		g.field = field;
		FIELD_LOCATIONS[g.tier].forEach((location) => {
			if (atVenue(g, location.id) && !field.visited.includes(location.id)) field.visited.push(location.id);
		});
		return g;
	}
	if (action.type === "refuel") {
		if (!canRefuel(g)) throw new Error("Park beside the fuel station and walk to the pump to refuel.");
		const remaining = 12 - g.field.fuel;
		if (remaining < 1e-6) throw new Error("The tank is already full.");
		const requested = action.gallons === void 0 ? remaining : action.gallons;
		if (!Number.isFinite(requested) || requested <= 0 || requested > 12) throw new Error("Choose a fuel amount between 0 and 12 gallons.");
		const gallons = Math.min(requested, remaining);
		const cost = Math.round(gallons * GAS_PRICES[g.tier] * 100) / 100;
		if (cost <= 0) throw new Error("Choose at least one cent of fuel.");
		need(0, cost);
		g.cash = Math.round(g.cash * 100) / 100;
		g.field.fuel = Math.min(12, g.field.fuel + gallons);
		if (g.immersion) g.immersion.vehicle.fuel = g.field.fuel;
		log(g, `Bought ${gallons.toFixed(2)} gallons at $${GAS_PRICES[g.tier].toFixed(2)} per gallon ($${cost.toFixed(2)} total).`);
		return g;
	}
	if (action.type === "roadside") {
		if (g.field.scene !== "district" || g.field.driving || g.field.fuel > .05) throw new Error("Roadside assistance is available when you are on foot beside an empty vehicle.");
		need(0, 150);
		const station = FIELD_LOCATIONS[g.tier][4];
		g.field = {
			...g.field,
			car: { ...station.point },
			player: {
				x: station.door.x + 40,
				y: station.door.y + 30
			},
			fuel: 0,
			heading: 0,
			destination: 4,
			visited: [...new Set([...g.field.visited, 4])]
		};
		log(g, "Roadside assistance brought your vehicle to the fuel station for $150. Fuel is sold separately.", "warn");
		if (g.immersion) {
			g.immersion.vehicle = {
				...g.immersion.vehicle,
				x: station.point.x,
				z: station.point.y,
				speed: 0,
				fuel: 0,
				heading: 0
			};
			g.immersion.player = {
				...g.immersion.player,
				x: station.point.x + 2.5,
				z: station.point.y
			};
			g.immersion.interior = null;
			g.immersion.mode = "foot";
			g.immersion.destination = 4;
			g.immersion.parkedAt = [...new Set([...g.immersion.parkedAt, 4])];
			g.field.player = {
				x: g.immersion.player.x,
				y: g.immersion.player.z
			};
		}
		return g;
	}
	if (action.type === "meet") {
		const contact = find(action.id, true);
		if (!canMeet(g, contact.id)) throw new Error("Park and walk closer to this contact to meet them.");
		if (!g.field.met.includes(contact.id)) {
			g.field.met.push(contact.id);
			log(g, `Met ${contact.name} at ${FIELD_LOCATIONS[g.tier][candidateLocation(contact.id)].name}.`);
		}
		return g;
	}
	if (action.type === "briefing") {
		g.briefing = false;
		return g;
	}
	if (action.type === "dismissReport") {
		g.report = null;
		return g;
	}
	if (action.type === "star") {
		const c = find(action.id);
		c.starred = !c.starred;
		return g;
	}
	if (action.type === "scout") {
		if (!Number.isInteger(action.source) || action.source < 0 || action.source > 2) throw new Error("Choose a scouting source.");
		if (!atVenue(g, action.source + 1)) throw new Error(`Park and visit ${FIELD_LOCATIONS[g.tier][action.source + 1].name} to find new leads.`);
		need(1, intelCost(g, t.sourceCost));
		const hiddenAtVenue = () => g.candidates.filter((c) => !c.discovered && c.status === "available" && candidateLocation(c.id) === action.source + 1);
		let hidden = hiddenAtVenue();
		if (hidden.length < 3) {
			let index = Math.max(...g.candidates.map((c) => Number(c.id.split("-")[1]) || 0)) + 1;
			if (g.candidates.length >= 175) {
				g.candidates = g.candidates.filter((c) => c.status !== "rival");
				const retained = new Set(g.candidates.map((c) => c.id));
				g.field.met = g.field.met.filter((id) => retained.has(id));
			}
			while (hidden.length < 3 && g.candidates.length < 200) {
				const contact = createCandidate(g, index++);
				contact.discovered = false;
				g.candidates.push(contact);
				if (candidateLocation(contact.id) === action.source + 1) hidden.push(contact);
			}
			if (hidden.length < 3) throw new Error("Your fieldbook is full. Follow up on current leads before searching again.");
		}
		const discovered = action.source === 2 ? hidden.slice(-3) : hidden.slice(0, 3);
		discovered.forEach((c) => {
			c.discovered = true;
			c.deadline = g.week + 3 + Math.floor(random(g) * 4);
		});
		log(g, `${t.sources[action.source].name}: discovered ${discovered.map((c) => c.name).join(", ")}.`, "good");
		g.report = {
			title: "Three new leads",
			body: `${discovered.map((c) => c.name).join(", ")} can be found at ${FIELD_LOCATIONS[g.tier][action.source + 1].name}. Park nearby and walk over for a first conversation.`,
			success: true
		};
	}
	if (action.type === "investigate") {
		const c = find(action.id, true);
		if (!g.field.met.includes(c.id)) throw new Error("Meet this candidate in person before following up on their dossier.");
		if (c.tested.includes(action.method)) throw new Error("This investigation is already in the dossier.");
		const cost = intelCost(g, action.method === "trial" ? t.trial : action.method === "sample" ? t.trial * .25 : action.method === "reference" ? t.trial * .15 : 0);
		need(action.method === "trial" ? 2 : 1, cost);
		const reveal = (skill, width) => {
			const value = c.skills[skill];
			const offset = Math.round(random(g) * 6 - 3);
			const band = [clamp(value - width + offset), clamp(value + width + offset)];
			const old = c.ranges[skill];
			c.ranges[skill] = old ? [Math.max(old[0], band[0]), Math.min(old[1], band[1])] : band;
			if (c.ranges[skill][0] > value) c.ranges[skill][0] = value;
			if (c.ranges[skill][1] < value) c.ranges[skill][1] = value;
		};
		let evidence;
		if (action.method === "interview") {
			reveal("nerve", 17);
			reveal("teamwork", 17);
			c.trust = clamp(c.trust + 6);
			evidence = {
				title: "First conversation",
				kind: "interview",
				week: g.week,
				text: `${c.name.split(" ")[0]} values ${MOTIVES[c.motive].name.toLowerCase()}. “${{
					autonomy: "Give me a problem worth solving and let me decide how.",
					security: "I need to know this role will still exist next month.",
					mentorship: "I want to work with someone who can help me grow.",
					purpose: "Tell me why this work matters to someone.",
					privacy: "I need to know who gets access to my information."
				}[c.motive]}” ${c.skills.teamwork >= 80 ? "They describe past work generously, crediting others." : c.skills.teamwork < 50 ? "They are reluctant to discuss collaborating with colleagues." : "They prefer clear ownership of their tasks."}`
			};
		} else if (action.method === "sample") {
			reveal("craft", 13);
			reveal("insight", 13);
			evidence = {
				title: g.tier === 2 ? "Controlled observation" : "Work sample",
				kind: "sample",
				week: g.week,
				text: `${c.skills.craft >= 85 ? "The result is unusually precise." : c.skills.craft >= 70 ? "The fundamentals are strong, with a few rough edges." : "The result falls short of the claims in the profile."} ${c.skills.insight >= 85 ? "Their approach is original and resolves a problem the brief did not mention." : c.skills.insight >= 65 ? "They make a sensible improvement to the standard approach." : "They rely on a familiar approach and struggle when the conditions change."}`
			};
		} else if (action.method === "reference") {
			reveal("teamwork", 9);
			evidence = {
				title: "Independent reference",
				kind: "reference",
				week: g.week,
				text: `${c.reliability >= 90 ? "Former collaborators describe someone who follows through, even under pressure." : c.reliability >= 80 ? "The work is dependable when expectations are clear." : "Several collaborators mention missed commitments."} ${c.growth >= 4 ? "They learned noticeably faster than their peers." : c.growth >= 2 ? "They steadily improved with experience." : "Their recent work is similar to work from several years ago."}`
			};
		} else {
			SKILLS.forEach((s) => reveal(s, 5));
			c.trust = clamp(c.trust + 10);
			evidence = {
				title: g.tier === 2 ? "Containment trial" : "Paid trial",
				kind: "trial",
				week: g.week,
				text: `A full trial narrowed all four estimates. ${c.skills.nerve >= 85 ? "They stayed effective when the conditions changed unexpectedly." : c.skills.nerve >= 65 ? "They recovered from a setback after a short pause." : "Performance dropped substantially under pressure."} ${c.skills.teamwork >= 85 ? "Their presence also improved the rest of the team." : c.skills.teamwork < 50 ? "The individual result was better than the group result." : "They worked adequately alongside the team."}`
			};
		}
		c.evidence.push(evidence);
		c.tested.push(action.method);
		log(g, `${evidence.title} completed for ${c.name}.`);
	}
	if (action.type === "offer") {
		const c = find(action.id, true);
		if (!g.field.met.includes(c.id)) throw new Error("Meet this candidate in person before making a recruitment offer.");
		if (members(g).length >= 5) throw new Error("Your team has five people. Release a member before recruiting another.");
		if (c.lastOffer === g.week) throw new Error("They asked for time to consider. Try a new offer next week.");
		if (!Number.isFinite(action.salary) || action.salary < c.salary * .75 || action.salary > c.salary * 1.5) throw new Error("Choose a salary between 75% and 150% of their request.");
		if (action.perk !== "none" && !MOTIVES[action.perk]) throw new Error("Choose a valid offer benefit.");
		const perkCost = action.perk === "none" ? 0 : MOTIVES[action.perk].cost * (g.tier + 1);
		const signOn = Math.round(action.salary * 1.5) + perkCost;
		need(1, signOn);
		c.lastOffer = g.week;
		const fit = action.perk === c.motive;
		if (action.salary / c.salary + (fit ? .2 : 0) + c.trust / 200 + g.reputation / 1e3 >= 1.1) {
			c.status = "hired";
			c.wage = Math.round(action.salary);
			c.hiredWeek = g.week;
			c.morale = fit ? 98 : 82;
			c.verified = false;
			c.completed = 0;
			log(g, `${c.name} joined ${t.employer} at ${money(c.wage)} per week.`, "good");
			g.report = {
				title: "Offer accepted",
				body: `${c.name} is on the team. ${fit ? "Your offer addressed what mattered most to them." : "The compensation convinced them to take a chance."} Assign them to a project to see how they perform.`,
				success: true
			};
			const referral = g.candidates.find((x) => !x.discovered && x.status === "available");
			if (referral) {
				referral.discovered = true;
				referral.deadline = g.week + 6;
				log(g, `${c.name.split(" ")[0]} suggested a contact: ${referral.name}.`);
			}
		} else {
			g.cash += signOn;
			c.trust = Math.max(0, c.trust - 3);
			g.report = {
				title: "They need a better reason",
				body: `${c.name} declined. Learn what matters to them or improve the salary. They will reconsider next week.`,
				success: false
			};
			log(g, `${c.name} declined your offer.`, "warn");
		}
	}
	if (action.type === "mission") {
		if (g.missionThisWeek) throw new Error("Your team already took a project this week.");
		const mission = missions(g).find((m) => m.id === action.mission);
		if (!mission) throw new Error("Choose a current project.");
		const ids = [...new Set(action.ids)];
		if (ids.length < 2 || ids.length > 3 || ids.some((id) => find(id).status !== "hired")) throw new Error("Assign two or three members of your team.");
		need(1);
		g.missionThisWeek = true;
		g.attempts++;
		const result = projectScore(g, mission, ids);
		const success = result.score >= mission.difficulty;
		const reward = success ? mission.reward : Math.round(mission.reward * .3);
		g.cash += reward;
		g.reputation = clamp(g.reputation + (success ? mission.reputation : -4));
		if (success) g.completed++;
		if (g.tier === 2) g.exposure = clamp(g.exposure + mission.exposure + (success ? 0 : 12));
		ids.forEach((id) => {
			const c = find(id);
			c.verified = true;
			c.completed = (c.completed || 0) + 1;
			c.morale = clamp((c.morale || 85) + (success ? 3 : -8));
			SKILLS.forEach((s) => c.skills[s] = clamp(c.skills[s] + c.growth * .35, 20, 99));
		});
		g.report = {
			title: success ? "Assignment accomplished" : "A result to learn from",
			body: `${mission.name}: ${success ? "the team delivered." : "the outcome fell short."} Team score ${result.score}; target ${mission.difficulty}. ${result.coverage < mission.roles.length ? "An uncovered specialty limited the team." : "The required specialties were covered."} ${g.tier === 1 ? "Different specialties contributed an institute collaboration bonus." : ""}`,
			success,
			score: result.score,
			reward,
			contributions: result.contributions
		};
		log(g, `${mission.name}: ${success ? "success" : "setback"}. ${money(reward)} earned; reputation ${success ? "+" + mission.reputation : "−4"}.`, success ? "good" : "warn");
	}
	if (action.type === "mentor") {
		const c = find(action.id);
		if (c.status !== "hired") throw new Error("Only team members can receive mentoring.");
		need(1, intelCost(g, t.trial * .6));
		SKILLS.forEach((s) => {
			const previous = c.skills[s];
			c.skills[s] = clamp(previous + c.growth * 1.1, 20, 99);
			const band = c.ranges[s];
			if (band && !c.verified) {
				const improvement = c.skills[s] - previous;
				c.ranges[s] = [clamp(band[0] + improvement), clamp(band[1] + improvement)];
			}
		});
		c.morale = clamp((c.morale || 85) + 6);
		g.mentoring++;
		log(g, `${c.name} completed a mentoring session. Their skills and confidence improved.`, "good");
	}
	if (action.type === "release") {
		const c = find(action.id);
		if (c.status !== "hired") throw new Error("This person is not on your team.");
		need(0, c.wage || 0);
		c.status = "rival";
		log(g, `${c.name} left with one week's severance.`, "warn");
	}
	if (action.type === "cover") {
		if (g.tier !== 2) throw new Error("Cover operations are only available at The Veil.");
		need(1, 3500);
		g.exposure = Math.max(0, g.exposure - 25);
		log(g, "A cover operation removed 25 exposure.", "good");
	}
	if (action.type === "rescue") {
		if (g.rescueUsed) throw new Error("Emergency funding was already used this chapter.");
		if (g.cash > t.budget * .25) throw new Error("Emergency funding is available when your budget drops below 25%.");
		g.rescueUsed = true;
		g.cash += t.budget * .45;
		g.reputation = Math.max(0, g.reputation - 10);
		log(g, "Emergency funding secured. Reputation −10.", "warn");
	}
	if (action.type === "nextWeek") {
		const wages = payroll(g);
		g.week++;
		g.cash += t.stipend - wages;
		g.actions = weeklyActions(g);
		g.missionThisWeek = false;
		g.report = null;
		if (g.cash < 0) {
			g.cash = 0;
			g.reputation = Math.max(0, g.reputation - 8);
			members(g).forEach((c) => c.morale = Math.max(30, (c.morale || 85) - 15));
			log(g, "Payroll was missed. Reputation and team morale fell. Seek emergency funding or complete an assignment.", "warn");
		} else log(g, `Week ${g.week}: ${money(t.stipend)} operating support; ${money(wages)} payroll.`);
		const lost = g.candidates.filter((c) => c.status === "available" && c.discovered && c.deadline < g.week);
		lost.forEach((c) => c.status = "rival");
		if (lost.length) log(g, `${t.rival} recruited ${lost.map((c) => c.name).join(", ")}.`, "warn");
		const hidden = g.candidates.filter((c) => !c.discovered && c.status === "available");
		hidden.forEach((c) => c.deadline = g.week + 5);
		if (g.week % 3 === 0) {
			const c = hidden[0];
			if (c) {
				c.discovered = true;
				log(g, `An unsolicited lead arrived: ${c.name}.`);
			}
		}
		if (g.tier === 2) {
			g.exposure = Math.max(0, g.exposure - 3);
			if (g.exposure >= 75) {
				g.cash = Math.max(0, g.cash - 1e4);
				g.reputation = Math.max(0, g.reputation - 5);
				log(g, "Your operations attracted outside attention. A disrupted facility cost $10,000 and 5 reputation. Run a cover operation.", "warn");
			}
		}
	}
	if (action.type === "prestige" || action.type === "repeat") {
		if (action.type === "prestige" && !canPrestige(g)) throw new Error("Complete the chapter mandate before advancing.");
		if (action.type === "prestige" && g.tier === 2) {
			g.won = true;
			g.report = {
				title: "Director clearance granted",
				body: "You found overlooked talent, brought exceptional minds together, and built a team trusted with the impossible. All three organizations recognize your judgment. You can keep running The Veil or begin another career.",
				success: true
			};
			return g;
		}
		const old = g.tier;
		if (action.type === "prestige") g.history.push({
			tier: old,
			week: g.week,
			hires: members(g).length,
			successes: g.completed,
			reputation: g.reputation
		});
		if (action.type === "prestige") {
			g.tier = g.tier + 1;
			g.prestige++;
		}
		const next = TIERS[g.tier];
		g.week = 1;
		g.cash = next.budget;
		g.reputation = 0;
		g.completed = 0;
		g.attempts = 0;
		g.exposure = 0;
		g.actions = weeklyActions(g);
		g.missionThisWeek = false;
		g.rescueUsed = false;
		g.won = false;
		g.briefing = true;
		g.report = null;
		g.log = [];
		g.field = freshField(g.tier);
		g.candidates = [];
		g.candidates = Array.from({ length: 12 }, (_, i) => createCandidate(g, i));
		if (g.immersion) g.immersion = freshImmersion(g);
		log(g, action.type === "prestige" ? `Your next chapter begins at ${next.employer}. ${TIERS[old].perk}` : `A fresh recruiting season begins at ${next.employer}.`, "good");
	}
	return g;
}
function validGame(value) {
	const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
	const finite = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
	const integer = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => finite(v, min, max) && Number.isSafeInteger(v);
	const text = (v) => typeof v === "string";
	const nonempty = (v) => text(v) && v.trim().length > 0;
	const boolean = (v) => typeof v === "boolean";
	const methods = [
		"interview",
		"sample",
		"reference",
		"trial"
	];
	if (!record(value)) return false;
	const g = value;
	if (g.version !== 1 || !integer(g.seed, 0, 4294967295) || !integer(g.tier, 0, 2) || !integer(g.week, 1) || !finite(g.cash) || !finite(g.reputation, 0, 100) || !integer(g.actions, 0, 8) || !integer(g.prestige, 0, 2) || !integer(g.completed) || !integer(g.attempts) || !finite(g.exposure, 0, 100) || !integer(g.event) || !integer(g.mentoring) || !boolean(g.missionThisWeek) || !boolean(g.briefing) || !boolean(g.rescueUsed) || !boolean(g.won)) return false;
	const candidates = g.candidates;
	if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 200) return false;
	const ids = /* @__PURE__ */ new Set();
	for (const c of candidates) {
		if (!record(c) || !nonempty(c.id) || ids.has(c.id) || !nonempty(c.name) || !nonempty(c.role) || !text(c.origin) || !text(c.bio) || !text(c.hook) || !record(c.skills) || !record(c.ranges) || !finite(c.growth, 0, 100) || !finite(c.reliability, 0, 100) || !text(c.motive) || !Object.hasOwn(MOTIVES, c.motive) || !finite(c.salary, 1) || !integer(c.deadline, 1) || !boolean(c.discovered) || !boolean(c.starred) || !text(c.status) || ![
			"available",
			"hired",
			"rival"
		].includes(c.status) || !integer(c.lastOffer) || !finite(c.trust, 0, 100)) return false;
		ids.add(c.id);
		const skills = c.skills, ranges = c.ranges;
		if (!SKILLS.every((skill) => finite(skills[skill], 0, 100)) || Object.keys(ranges).some((skill) => !SKILLS.includes(skill))) return false;
		if (!Object.values(ranges).every((range) => Array.isArray(range) && range.length === 2 && finite(range[0], 0, 100) && finite(range[1], 0, 100) && range[0] <= range[1])) return false;
		if (!Array.isArray(c.tested) || c.tested.length > 4 || new Set(c.tested).size !== c.tested.length || !c.tested.every((method) => text(method) && methods.includes(method))) return false;
		if (!Array.isArray(c.evidence) || c.evidence.length > 4 || !c.evidence.every((note) => record(note) && nonempty(note.title) && text(note.text) && text(note.kind) && methods.includes(note.kind) && integer(note.week, 1))) return false;
		if (c.hiredWeek !== void 0 && !integer(c.hiredWeek, 1) || c.wage !== void 0 && !finite(c.wage, 1) || c.morale !== void 0 && !finite(c.morale, 0, 100) || c.verified !== void 0 && !boolean(c.verified) || c.completed !== void 0 && !integer(c.completed)) return false;
		if (c.status === "hired" && (!integer(c.hiredWeek, 1) || !finite(c.wage, 1) || !finite(c.morale, 0, 100) || !boolean(c.verified) || !integer(c.completed))) return false;
	}
	const history = g.history, entries = g.log;
	if (!Array.isArray(history) || history.length > 3 || !history.every((h) => record(h) && integer(h.tier, 0, 2) && integer(h.week, 1) && integer(h.hires, 0, 5) && integer(h.successes) && finite(h.reputation, 0, 100))) return false;
	if (!Array.isArray(entries) || entries.length > 60 || !entries.every((entry) => record(entry) && integer(entry.id) && integer(entry.week, 1) && text(entry.text) && text(entry.tone) && [
		"good",
		"warn",
		"neutral"
	].includes(entry.tone))) return false;
	const report = g.report;
	if (report !== null) {
		if (!record(report) || !nonempty(report.title) || !text(report.body) || !boolean(report.success) || report.score !== void 0 && !finite(report.score) || report.reward !== void 0 && !finite(report.reward)) return false;
		if (report.contributions !== void 0 && (!Array.isArray(report.contributions) || report.contributions.length > 5 || !report.contributions.every((contribution) => record(contribution) && nonempty(contribution.name) && finite(contribution.score)))) return false;
	}
	if (g.style !== void 0 && !validScoutStyle(g.style)) return false;
	if (g.story !== void 0 && !validPrologue(g.story)) return false;
	if (g.field !== void 0 && (!validField(g.field, true, true) || !g.field.met.every((id) => ids.has(id)))) return false;
	if (g.immersion !== void 0 && (!validImmersion(g.immersion) || g.immersion.tier !== g.tier)) return false;
	if (g.playerProfile !== void 0 && (!record(g.playerProfile) || ![
		"observer",
		"connector",
		"analyst"
	].includes(g.playerProfile.background))) return false;
	return true;
}
//#endregion
exports.MOTIVES = MOTIVES;
exports.SKILLS = SKILLS;
exports.TIERS = TIERS;
exports.act = act;
exports.canPrestige = canPrestige;
exports.goalProgress = goalProgress;
exports.intelCost = intelCost;
exports.members = members;
exports.missions = missions;
exports.money = money;
exports.newGame = newGame;
exports.normalizeGame = normalizeGame;
exports.payroll = payroll;
exports.projectScore = projectScore;
exports.validGame = validGame;
exports.weeklyActions = weeklyActions;
