export type Mode = "party" | "royale" | "ranked" | "custom" | "practice";
export type Vec = { x: number; y: number; z: number };
export const COLORS = [
  "#e9f769",
  "#72dded",
  "#fc9074",
  "#d4a9ff",
  "#f8c4db",
  "#86e5b2",
  "#ffce65",
  "#c9d8ef",
];
export const ITEMS = [
  {
    id: "rocket",
    name: "Homing rocket",
    icon: "↗",
    category: "Attack",
    weight: 10,
    ammo: 1,
    description:
      "Locks onto the opponent in front of you. A very pointed greeting.",
  },
  {
    id: "pistol",
    name: "Dueling pistol",
    icon: "⌖",
    category: "Attack",
    weight: 12,
    ammo: 1,
    description: "One precise close-range shot. Make it count.",
  },
  {
    id: "rifle",
    name: "Elephant gun",
    icon: "⇢",
    category: "Attack",
    weight: 5,
    ammo: 2,
    description: "Two shots. Huge knockback. Mind the recoil.",
  },
  {
    id: "mine",
    name: "Landmines",
    icon: "✹",
    category: "Attack",
    weight: 12,
    ammo: 3,
    description: "Three little surprises for your least favorite shortcut.",
  },
  {
    id: "horn",
    name: "Air horn",
    icon: "◖",
    category: "Attack",
    weight: 8,
    ammo: 1,
    description: "Catch someone lining up a shot to send their swing wild.",
  },
  {
    id: "laser",
    name: "Orbital laser",
    icon: "◎",
    category: "Attack",
    weight: 1,
    ammo: 1,
    description:
      "Mark the ground. A spectacular strike arrives in 1.5 seconds.",
  },
  {
    id: "shield",
    name: "EM shield",
    icon: "⬡",
    category: "Defense",
    weight: 14,
    ammo: 1,
    description: "Six seconds of protection from item attacks.",
  },
  {
    id: "freeze",
    name: "Freeze bomb",
    icon: "❄",
    category: "Defense",
    weight: 10,
    ammo: 1,
    description: "Freeze nearby opponents for two seconds.",
  },
  {
    id: "boots",
    name: "Spring boots",
    icon: "⇡",
    category: "Movement",
    weight: 10,
    ammo: 1,
    description: "One enormous forward leap. Shortcuts encouraged.",
  },
  {
    id: "coffee",
    name: "Coffee boost",
    icon: "☕",
    category: "Movement",
    weight: 12,
    ammo: 1,
    description: "Ten seconds of get-there-first energy.",
  },
  {
    id: "cart",
    name: "Golf cart",
    icon: "▰",
    category: "Movement",
    weight: 6,
    ammo: 1,
    description: "Room for four. E to board, H to honk. Bump responsibly.",
  },
] as const;
export type ItemId = (typeof ITEMS)[number]["id"];
export const itemById = (id: ItemId) => ITEMS.find((i) => i.id === id)!;
export const THEMES = {
  park: {
    name: "Parkland",
    ground: "#6dad67",
    edge: "#315948",
    sky: "#b6d3cd",
    sand: "#e6cf94",
    water: "#68bdc7",
    accent: "#edfa79",
  },
  desert: {
    name: "Desert",
    ground: "#d6ab71",
    edge: "#a96e4b",
    sky: "#e9c9a3",
    sand: "#f1d392",
    water: "#66bdc4",
    accent: "#ffdf84",
  },
  ice: {
    name: "Snow & ice",
    ground: "#c5e8ed",
    edge: "#91bfce",
    sky: "#c9dee9",
    sand: "#eaf6fa",
    water: "#6296c4",
    accent: "#85eef2",
  },
  tropical: {
    name: "Tropical",
    ground: "#71b783",
    edge: "#335e4a",
    sky: "#a1d9d8",
    sand: "#f3dcb2",
    water: "#3caabc",
    accent: "#ff9984",
  },
  industrial: {
    name: "Industrial",
    ground: "#7c9691",
    edge: "#445b59",
    sky: "#bec9c3",
    sand: "#bba97a",
    water: "#dd975b",
    accent: "#ffc969",
  },
  fantasy: {
    name: "Fantasy",
    ground: "#9b95bd",
    edge: "#59516c",
    sky: "#d3c9e1",
    sand: "#dfc7ed",
    water: "#7d89ce",
    accent: "#ead1ff",
  },
};
export type Theme = keyof typeof THEMES;
export const COURSES = [
  {
    id: "clover",
    name: "Clover Club",
    theme: "park",
    length: 100,
    par: 4,
    curve: 0,
    gap: 0,
    obstacle: "windmill",
    tag: "A friendly start. Allegedly.",
  },
  {
    id: "bridge",
    name: "Bramble Bridges",
    theme: "park",
    length: 135,
    par: 5,
    curve: 5,
    gap: 1,
    obstacle: "spinner",
    tag: "Take the scenic route. Or don’t.",
  },
  {
    id: "dunes",
    name: "Dune Dash",
    theme: "desert",
    length: 120,
    par: 4,
    curve: 4,
    gap: 0,
    obstacle: "windmill",
    tag: "Hot sand. Heated competition.",
  },
  {
    id: "mesa",
    name: "Mesa Madness",
    theme: "desert",
    length: 145,
    par: 5,
    curve: -5,
    gap: 1,
    obstacle: "elevator",
    tag: "Watch your step. And your friends.",
  },
  {
    id: "glacier",
    name: "Glacier Glide",
    theme: "ice",
    length: 115,
    par: 4,
    curve: -3,
    gap: 0,
    obstacle: "spinner",
    tag: "A slippery slope to victory.",
  },
  {
    id: "frost",
    name: "Frostbite Falls",
    theme: "ice",
    length: 150,
    par: 5,
    curve: 5,
    gap: 1,
    obstacle: "elevator",
    tag: "Cool heads make warmer scoreboards.",
  },
  {
    id: "cove",
    name: "Coconut Cove",
    theme: "tropical",
    length: 110,
    par: 4,
    curve: 4,
    gap: 0,
    obstacle: "windmill",
    tag: "Paradise with projectiles.",
  },
  {
    id: "reef",
    name: "Riptide Reef",
    theme: "tropical",
    length: 140,
    par: 5,
    curve: -5,
    gap: 1,
    obstacle: "spinner",
    tag: "The water hazard is very literal.",
  },
  {
    id: "factory",
    name: "Fairway Factory",
    theme: "industrial",
    length: 125,
    par: 4,
    curve: 3,
    gap: 0,
    obstacle: "spinner",
    tag: "Clock in. Tee off. Cause trouble.",
  },
  {
    id: "foundry",
    name: "Foundry Run",
    theme: "industrial",
    length: 155,
    par: 5,
    curve: -4,
    gap: 1,
    obstacle: "elevator",
    tag: "Your shortcut has moving parts.",
  },
  {
    id: "mushroom",
    name: "Mushroom Meadows",
    theme: "fantasy",
    length: 120,
    par: 4,
    curve: -4,
    gap: 0,
    obstacle: "windmill",
    tag: "Somewhere over the leaderboard.",
  },
  {
    id: "sky",
    name: "Skybound Isles",
    theme: "fantasy",
    length: 150,
    par: 5,
    curve: 5,
    gap: 1,
    obstacle: "elevator",
    tag: "Aim high. Try to land somewhere.",
  },
] as const;
export type Course = (typeof COURSES)[number];
export type Rules = {
  holes: number;
  timeLimit: number;
  gravity: number;
  friction: number;
  bounce: number;
  speed: number;
  knockback: number;
  items: ItemId[];
  bots: number;
  collisions: boolean;
  combat: boolean;
  wind: boolean;
  courseIds: string[];
  finishPoints: number[];
  attackPoints: number;
  stylePoints: number;
};
export function rulesFor(mode: Mode, custom: Partial<Rules> = {}): Rules {
  const restricted = ["laser", "cart", "rifle", "horn"];
  const r: Rules = {
    holes: 3,
    timeLimit: 180,
    gravity: 1,
    friction: 1,
    bounce: 0.65,
    speed: 1,
    knockback: 1,
    items: ITEMS.filter(
      (i) => mode !== "ranked" || !restricted.includes(i.id),
    ).map((i) => i.id),
    bots:
      mode === "ranked" || mode === "practice" ? 0 : mode === "royale" ? 7 : 3,
    collisions: true,
    combat: true,
    wind: true,
    courseIds: COURSES.filter((_, i) => mode !== "ranked" || i % 2 === 0).map(
      (c) => c.id,
    ),
    finishPoints: [30, 24, 19, 15, 12, 9, 6, 3],
    attackPoints: 2,
    stylePoints: 2,
  };
  if (mode === "practice") return { ...r, holes: 1, timeLimit: 86400 };
  if (mode !== "custom") return r;
  for (const key of [
    "holes",
    "timeLimit",
    "gravity",
    "friction",
    "bounce",
    "speed",
    "knockback",
    "bots",
    "attackPoints",
    "stylePoints",
  ] as const) {
    const v = custom[key];
    if (typeof v === "number" && Number.isFinite(v))
      r[key] = Math.max(
        key === "timeLimit" ? 30 : key === "holes" ? 1 : 0,
        Math.min(
          key === "timeLimit"
            ? 600
            : key === "holes"
              ? 12
              : key === "bots"
                ? 7
                : key === "attackPoints" || key === "stylePoints"
                  ? 10
                  : 2,
          v,
        ),
      );
  }
  r.holes = Math.floor(r.holes);
  r.bots = Math.floor(r.bots);
  r.gravity = Math.max(0.5, r.gravity);
  r.speed = Math.max(0.5, r.speed);
  r.friction = Math.max(0.1, r.friction);
  for (const key of ["collisions", "combat", "wind"] as const)
    if (typeof custom[key] === "boolean") r[key] = custom[key];
  if (Array.isArray(custom.items))
    r.items = custom.items.filter((id) => ITEMS.some((i) => i.id === id));
  if (Array.isArray(custom.courseIds)) {
    const ids = custom.courseIds.filter((id) =>
      COURSES.some((c) => c.id === id),
    );
    if (ids.length) r.courseIds = ids;
  }
  if (Array.isArray(custom.finishPoints) && custom.finishPoints.length === 8)
    r.finishPoints = custom.finishPoints.map((n) =>
      Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0)),
    );
  return r;
}
export function layout(course: Course) {
  const platforms = Array.from({ length: 5 }, (_, i) => ({
    x: Math.sin(i * 1.7) * course.curve,
    z: 8 - ((i + 0.5) * course.length) / 5,
    w: 28 - (i === 2 ? 8 : 0),
    d: course.length / 5 - (course.gap && i === 2 ? 4 : 0),
  }));
  const tee = { x: 0, y: 1, z: 8 };
  const hole = { x: platforms[4].x, y: 0.12, z: 8 - course.length + 5 };
  return {
    platforms,
    tee,
    hole,
    checkpoints: [1, 2, 3, 4].map((i) => ({
      x: platforms[i].x,
      y: 1,
      z: platforms[i].z + platforms[i].d / 2 - 3,
    })),
    sand: [
      { x: -7, z: platforms[1].z, w: 7, d: 9 },
      { x: 6, z: platforms[3].z, w: 8, d: 8 },
    ],
    water: [
      { x: 7, z: platforms[1].z + 6, r: 3.5 },
      { x: -7, z: platforms[3].z - 4, r: 3 },
    ],
    crates: [0, 1, 2, 3, 4].map((i) => ({
      x: platforms[i].x + (i % 2 ? 8 : -8),
      y: 1,
      z: platforms[i].z,
    })),
    boosts: [
      { x: platforms[1].x, z: platforms[1].z - 5 },
      { x: platforms[3].x, z: platforms[3].z - 5 },
    ],
    ramp: { x: platforms[2].x, z: platforms[2].z + platforms[2].d / 2 - 2 },
    obstacle: { x: platforms[2].x, z: platforms[2].z },
  };
}
export type Cosmetic = {
  id: string;
  category: string;
  name: string;
  color: string;
  variant: number;
  cost: number;
};
const categories = ["Outfit", "Club", "Ball", "Hat", "Emote"];
const names = [
  "Clover",
  "Sunset",
  "Lagoon",
  "Lavender",
  "Tangerine",
  "Frost",
  "Midnight",
  "Daydream",
];
export const COSMETICS: Cosmetic[] = categories.flatMap((category, c) =>
  Array.from({ length: 48 }, (_, i) => ({
    id: `${category.toLowerCase()}-${i}`,
    category,
    name: `${names[i % 8]} ${["Classic", "Sport", "Retro", "Orbit", "Bloom", "Champion"][Math.floor(i / 8)]}`,
    color: COLORS[i % 8],
    variant: Math.floor(i / 8),
    cost: i === 0 ? 0 : 20 + Math.floor(i / 8) * 20,
  })),
);
export const rankOf = (rating: number) =>
  rating >= 1600
    ? "Diamond"
    : rating >= 1400
      ? "Platinum"
      : rating >= 1200
        ? "Gold"
        : rating >= 1000
          ? "Silver"
          : "Bronze";
export function ratingChanges(
  players: { id: string; rating: number; score: number }[],
) {
  return players.map((p) => ({
    id: p.id,
    change: Math.round(
      (32 *
        players
          .filter((o) => o.id !== p.id)
          .reduce(
            (sum, o) =>
              sum +
              (p.score > o.score ? 1 : p.score === o.score ? 0.5 : 0) -
              1 / (1 + 10 ** ((o.rating - p.rating) / 400)),
            0,
          )) /
        Math.max(1, players.length - 1),
    ),
  }));
}
