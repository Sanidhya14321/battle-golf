import React, { useEffect, useRef, useState } from "react";
import { Client, type Room } from "@colyseus/sdk";
import {
  Game,
  initPhysics,
  PROTOCOL,
  type Action,
  type Input,
  type Snapshot,
  type PlayerView,
} from "../../packages/game/simulation";
import {
  COURSES,
  COLORS,
  itemById,
  layout,
  type Mode,
} from "../../packages/game/content";
import { GolfRenderer } from "./renderer";
import { Controls, DEFAULT_KEYS, type Bindings } from "./controls";
import "./style.css";
const SERVER =
  import.meta.env.VITE_GAME_SERVER ||
  `${location.protocol}//${location.hostname}:2567`;
const read = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) =>
  localStorage.setItem(key, JSON.stringify(value));
type Settings = {
  sensitivity: number;
  invertY: boolean;
  low: boolean;
  muted: boolean;
  reducedMotion: boolean;
  master: number;
  music: number;
  sfx: number;
  keys: Bindings;
};
const defaults: Settings = {
  sensitivity: 0.003,
  invertY: false,
  low: false,
  muted: false,
  reducedMotion: false,
  master: 0.7,
  music: 0.25,
  sfx: 0.8,
  keys: DEFAULT_KEYS,
};
type Runtime = {
  renderer: GolfRenderer;
  controls: Controls;
  room?: Room;
  game?: Game;
  id: string;
  send: (a: Action) => void;
  timer: ReturnType<typeof setInterval>;
  dispose: () => void;
};
function Preview({ appearance }: { appearance: Partial<PlayerView> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true,
      r: GolfRenderer | undefined,
      g: Game | undefined;
    void (async () => {
      await initPhysics();
      if (!alive) return;
      g = new Game("practice");
      g.addPlayer("preview", "You", false, appearance);
      const p = g.players.get("preview")!;
      p.pos = { x: 0, y: 0.84, z: 0 };
      p.ball = { x: 1, y: 0.32, z: 0 };
      r = new GolfRenderer(host.current!, true);
      await r.ready;
      if (alive) r.update(g.snapshot(), "preview");
    })().catch(console.error);
    return () => {
      alive = false;
      r?.dispose();
      g?.world.free();
    };
  }, [
    appearance.color,
    appearance.outfit,
    appearance.hat,
    appearance.club,
    appearance.emote,
  ]);
  return (
    <div className="golfer-preview" ref={host}>
      <span className="preview-tag">YOUR GOLFER</span>
    </div>
  );
}
function MiniMap({ snapshot, selfId }: { snapshot: Snapshot; selfId: string }) {
  const c = COURSES.find((c) => c.id === snapshot.courseId)!,
    l = layout(c);
  return (
    <div className="minimap">
      <strong>COURSE MAP</strong>
      <svg viewBox={`-24 -14 48 ${c.length + 30}`} aria-label="Course map">
        {l.platforms.map((p, i) => (
          <rect
            key={i}
            x={p.x - p.w / 2}
            y={-p.z - p.d / 2}
            width={p.w}
            height={p.d}
            fill="#7aaf69"
          />
        ))}
        {l.water.map((w, i) => (
          <circle key={i} cx={w.x} cy={-w.z} r={w.r} fill="#69c7dc" />
        ))}
        {l.checkpoints.map((cp, i) => (
          <circle key={i} cx={cp.x} cy={-cp.z} r="1.7" fill="#ffc570" />
        ))}
        <circle cx={l.hole.x} cy={-l.hole.z} r="2" fill="#213d35" />
        {snapshot.players.map((p) => (
          <g key={p.id}>
            <circle
              cx={p.pos.x}
              cy={-p.pos.z}
              r={p.id === selfId ? 1.7 : 1}
              fill={p.color}
              stroke="#213d35"
              strokeWidth=".3"
            />
            <circle cx={p.ball.x} cy={-p.ball.z} r=".6" fill="white" />
          </g>
        ))}
      </svg>
      <small>● golfers · ○ balls · orange checkpoints</small>
    </div>
  );
}
export default function App() {
  const [name, setName] = useState(read("bg-name", "Golfer")),
    [appearance, setAppearance] = useState<Partial<PlayerView>>(
      read("bg-appearance", {
        color: COLORS[2],
        outfit: 0,
        hat: 0,
        club: 0,
        emote: 0,
      }),
    ),
    [settings, setSettings] = useState<Settings>(() => ({
      ...defaults,
      ...read("bg-settings", {}),
      keys: { ...DEFAULT_KEYS, ...read("bg-bindings", {}) },
    }));
  const [page, setPage] = useState("home"),
    [dialog, setDialog] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [code, setCode] = useState(""),
    [course, setCourse] = useState("clover"),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [selfId, setSelfId] = useState(""),
    [slot, setSlot] = useState(0),
    [power, setPower] = useState(0),
    [angle, setAngle] = useState(8),
    [paused, setPaused] = useState(true),
    [score, setScore] = useState(false),
    [map, setMap] = useState(false),
    [chat, setChat] = useState(false),
    [notice, setNotice] = useState(""),
    [tutorial, setTutorial] = useState(read("bg-tutorial", true)),
    [remap, setRemap] = useState<keyof Bindings | null>(null),
    [tutorialProgress, setTutorialProgress] = useState(0);
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    slotRef = useRef(slot),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    generation = useRef(0);
  slotRef.current = slot;
  const toast = (text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  };
  const me = snapshot?.players.find((p) => p.id === selfId),
    currentCourse = COURSES.find((c) => c.id === snapshot?.courseId),
    ordered = [...(snapshot?.players || [])].sort(
      (a, b) =>
        b.score - a.score ||
        a.totalStrokes - b.totalStrokes ||
        a.totalFinishTime - b.totalFinishTime,
    );
  useEffect(() => {
    save("bg-settings", settings);
    save("bg-bindings", settings.keys);
    const rt = runtime.current;
    if (rt) {
      rt.controls.configure({
        keys: settings.keys,
        sensitivity: settings.sensitivity,
        invertY: settings.invertY,
      });
      rt.renderer.muted = settings.muted;
      rt.renderer.shake = !settings.reducedMotion;
      rt.renderer.quality(settings.low);
      rt.renderer.audio.volume = settings.master;
      rt.renderer.audio.sfx = settings.sfx;
      rt.renderer.audio.music = settings.music;
      rt.renderer.audio.muted = settings.muted;
      rt.renderer.audio.setVolumes();
    }
  }, [settings]);
  useEffect(() => {
    save("bg-appearance", appearance);
  }, [appearance]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (remap) {
        e.preventDefault();
        if (e.key === "Escape") {
          setRemap(null);
          return;
        }
        setSettings((s) => ({
          ...s,
          keys: { ...s.keys, [remap]: e.key.toLowerCase() },
        }));
        setRemap(null);
        return;
      }
      if (page === "game" && ["1", "2", "3"].includes(e.key))
        setSlot(Number(e.key) - 1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [page, remap]);
  useEffect(
    () => () => {
      generation.current++;
      runtime.current?.dispose();
      clearTimeout(noticeTimer.current);
    },
    [],
  );
  function leave() {
    generation.current++;
    runtime.current?.dispose();
    runtime.current = null;
    setSnapshot(null);
    setPage("home");
    setPaused(true);
    setDialog("");
    setBusy("");
    setChat(false);
  }
  async function play(mode: Mode, join = false) {
    const attempt = ++generation.current;
    setError("");
    setBusy(
      mode === "practice"
        ? "Loading golfer and course…"
        : "Connecting to the clubhouse… The free server may take a minute to wake up.",
    );
    setDialog("");
    setPage("game");
    setPaused(true);
    save("bg-name", name);
    let renderer: GolfRenderer | undefined,
      room: Room | undefined,
      game: Game | undefined,
      timer: ReturnType<typeof setInterval> | undefined,
      controls: Controls | undefined;
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await initPhysics();
      if (attempt !== generation.current) return;
      renderer = new GolfRenderer(host.current!);
      renderer.quality(settings.low);
      renderer.muted = settings.muted;
      renderer.audio.volume = settings.master;
      renderer.audio.sfx = settings.sfx;
      renderer.audio.music = settings.music;
      await renderer.ready;
      if (attempt !== generation.current) {
        renderer.dispose();
        return;
      }
      let id: string, send: (a: Action) => void, input: (i: Input) => void;
      if (mode === "practice") {
        game = new Game("practice");
        game.course = COURSES.find((c) => c.id === course)!;
        game.buildWorld();
        game.addPlayer("local", name || "Golfer", false, appearance);
        game.start();
        id = "local";
        send = (a) => game!.action(id, a);
        input = (i) => game!.input(id, i);
      } else {
        const response = await fetch(`${SERVER}/api/guest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name || "Golfer" }),
          signal: AbortSignal.timeout(75000),
        });
        if (!response.ok)
          throw Error(
            "Clubhouse unavailable. Solo Practice is available while the server wakes up.",
          );
        const { token } = await response.json();
        const client = new Client(SERVER.replace(/^http/, "ws"));
        const options = { token, protocol: PROTOCOL, appearance, mode };
        if (join) {
          const result = await fetch(
            `${SERVER}/api/rooms?code=${encodeURIComponent(code.trim().toUpperCase())}`,
          );
          const rooms = await result.json();
          if (!rooms.length)
            throw Error("Room not found. Check the code with your friend.");
          room = await client.joinById(rooms[0].id, options);
        } else
          room =
            mode === "custom"
              ? await client.create("battle", options)
              : await client.joinOrCreate("battle", options);
        id = room.sessionId;
        send = (a) => room!.send("action", a);
        const channel = room.input<Input>();
        let seq = 0;
        input = (i) => {
          Object.assign(channel.data, { ...i, seq: ++seq });
          renderer!.predictInput({ ...i, seq });
          channel.send();
        };
      }
      if (attempt !== generation.current) {
        await room?.leave();
        game?.world.free();
        renderer.dispose();
        return;
      }
      const r = renderer;
      let lastHud = 0,
        lastPhase = "";
      const update = (s: Snapshot) => {
        if (s.protocol !== PROTOCOL) {
          toast("Game updated. Reload to join the latest version.");
          return;
        }
        r.update(s, id);
        if (performance.now() - lastHud >= 100 || s.phase !== lastPhase) {
          setSnapshot(s);
          lastHud = performance.now();
          lastPhase = s.phase;
        }
        const own = s.players.find((p) => p.id === id);
        if (own?.strokes) setTutorialProgress(2);
        else if (own && Math.hypot(own.velocity.x, own.velocity.z) > 0.2)
          setTutorialProgress((v) => Math.max(1, v));
        if (s.effects.some((e) => e.kind === "item" && e.playerId === id)) {
          setTutorial(false);
          save("bg-tutorial", false);
        }
        if (s.players.find((p) => p.id === id)?.finished && !r.spectating) {
          const next = s.players.find((p) => !p.finished && !p.eliminated);
          if (next) r.spectating = next.id;
        }
        if (s.phase === "results" || s.phase === "complete") {
          controls?.suspend();
          setPaused(true);
          setScore(true);
        }
        if (s.phase === "playing" && s.players.every((p) => !p.finished))
          r.spectating = "";
      };
      controls = new Controls(r, send, input, {
        keys: settings.keys,
        sensitivity: settings.sensitivity,
        invertY: settings.invertY,
        slot: () => slotRef.current,
        pause: () => setPaused(true),
        chat: () => {
          controls?.suspend();
          setChat(true);
        },
        score: setScore,
        map: () => setMap((v) => !v),
        status: (p, a) => {
          setPower(p);
          setAngle(a);
          if (controls?.locked) setPaused(false);
        },
      });
      if (room) {
        room.onMessage("snapshot", update);
        room.onMessage("notice", (text: string) => toast(text));
        room.onMessage("welcome", () => {});
        room.onMessage("saved", () => {});
        room.onError((_code, message) => toast(message || "Connection error"));
        room.onLeave(() => {
          toast(
            "Disconnected from the match. Return to the clubhouse to reconnect.",
          );
          setPaused(true);
        });
      }
      let tick = 0;
      timer = setInterval(() => {
        if (game) {
          game.tick();
          if (++tick % 6 === 0) {
            update(game.snapshot());
            for (const event of game.events.splice(0)) toast(event.text);
          }
        }
      }, 1000 / 60);
      runtime.current = {
        renderer: r,
        controls,
        game,
        room,
        id,
        send,
        timer,
        dispose: () => {
          clearInterval(timer);
          controls?.dispose();
          r.dispose();
          game?.world.free();
          void room?.leave();
        },
      };
      setSelfId(id);
      setBusy("");
      if (game) update(game.snapshot());
    } catch (e) {
      clearInterval(timer);
      controls?.dispose();
      renderer?.dispose();
      game?.world.free();
      void room?.leave();
      if (attempt === generation.current) {
        setBusy("");
        setPage("home");
        setError(e instanceof Error ? e.message : "Could not start the match");
      }
    }
  }
  const capture = () => {
    setPaused(false);
    setDialog("");
    setChat(false);
    runtime.current?.controls.capture();
  };
  const openSettings = () => {
    runtime.current?.controls.suspend();
    if (document.pointerLockElement) document.exitPointerLock();
    setDialog("settings");
  };
  const tutorialStep = tutorialProgress;
  return (
    <main className={page === "game" ? "game-shell" : "clubhouse"}>
      {page === "home" ? (
        <>
          <div className="clubhouse-top">
            <a className="brand" href="/">
              BATTLE<span>GOLF</span>
              <i>●</i>
            </a>
            <button className="quiet" onClick={openSettings}>
              Settings ⚙
            </button>
          </div>
          <div className="clubhouse-grid">
            <section className="welcome">
              <p className="eyebrow">SMALL BALL. BIG TROUBLE.</p>
              <h1>
                Golf with
                <br />
                <em>a grudge.</em>
              </h1>
              <p className="intro">
                Swing, sprint, and sabotage. Race your friends to the cup in
                three holes of joyful chaos.
              </p>
              <label className="name-field">
                YOUR NAME
                <input
                  maxLength={20}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Choose a golfer name"
                />
              </label>
              <button
                className="primary big"
                onClick={() => void play("party")}
              >
                PLAY PARTY <span>↗</span>
              </button>
              <div className="play-secondary">
                <button onClick={() => setDialog("friends")}>
                  Join friends
                </button>
                <button onClick={() => setDialog("practice")}>
                  Solo practice
                </button>
              </div>
              <div className="match-facts">
                <span>2–8 golfers</span>
                <span>3 holes</span>
                <span>6 power-ups</span>
              </div>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="character-card">
              <Preview appearance={appearance} />
              <div className="appearance">
                <div className="color-row">
                  {COLORS.map((c, i) => (
                    <button
                      key={c}
                      title={`Golfer color ${i + 1}`}
                      aria-label={`Golfer color ${i + 1}`}
                      className={appearance.color === c ? "selected" : ""}
                      style={{ background: c }}
                      onClick={() => setAppearance((a) => ({ ...a, color: c }))}
                    />
                  ))}
                </div>
                <div className="appearance-options">
                  <label>
                    Body
                    <select
                      value={appearance.club || 0}
                      onChange={(e) =>
                        setAppearance((a) => ({
                          ...a,
                          club: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Classic</option>
                      <option value="1">Broad</option>
                    </select>
                  </label>
                  <label>
                    Outfit
                    <select
                      value={appearance.outfit || 0}
                      onChange={(e) =>
                        setAppearance((a) => ({
                          ...a,
                          outfit: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Club shorts</option>
                      <option value="1">Sunday cream</option>
                    </select>
                  </label>
                  <label>
                    Hat
                    <select
                      value={appearance.hat || 0}
                      onChange={(e) =>
                        setAppearance((a) => ({
                          ...a,
                          hat: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Club cap</option>
                      <option value="1">Bucket</option>
                      <option value="2">Visor</option>
                    </select>
                  </label>
                  <label>
                    Face
                    <select
                      value={appearance.emote || 0}
                      onChange={(e) =>
                        setAppearance((a) => ({
                          ...a,
                          emote: Number(e.target.value),
                        }))
                      }
                    >
                      <option value="0">Cheeky</option>
                      <option value="1">Focused</option>
                      <option value="2">Surprised</option>
                      <option value="3">Sleepy</option>
                    </select>
                  </label>
                </div>
              </div>
            </section>
          </div>
          <footer>
            <span>EVERYONE PLAYS AT ONCE.</span>
            <span>Made for questionable friendships.</span>
          </footer>
        </>
      ) : (
        <>
          <div className="game-canvas" ref={host} />
          {busy ? (
            <div className="screen-overlay">
              <div className="panel loading">
                <span className="spinner" />
                <h2>Polishing the clubs</h2>
                <p>{busy}</p>
                <button onClick={leave}>Return to clubhouse</button>
              </div>
            </div>
          ) : (
            snapshot && (
              <>
                <div className="hud-course">
                  <small>
                    HOLE {snapshot.hole} / {snapshot.holes} · PAR{" "}
                    {currentCourse?.par}
                  </small>
                  <strong>{currentCourse?.name}</strong>
                  <span>
                    {snapshot.mode === "practice"
                      ? "SOLO PRACTICE"
                      : "PARTY MATCH"}
                  </span>
                </div>
                {snapshot.mode !== "practice" && (
                  <div
                    className={
                      "hud-timer " + (snapshot.finishWindow ? "urgent" : "")
                    }
                  >
                    <small>
                      {snapshot.finishWindow ? "FINISH WINDOW" : "TIME LEFT"}
                    </small>
                    <strong>
                      {Math.floor(snapshot.remaining / 60)}:
                      {String(Math.floor(snapshot.remaining % 60)).padStart(
                        2,
                        "0",
                      )}
                    </strong>
                  </div>
                )}
                {me?.finished && snapshot.phase === "playing" && (
                  <label className="spectator-picker">
                    SPECTATING
                    <select
                      onChange={(e) => {
                        if (runtime.current)
                          runtime.current.renderer.spectating = e.target.value;
                      }}
                    >
                      {snapshot.players
                        .filter((p) => !p.finished && !p.eliminated)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <div className="hud-menu">
                  <button onClick={openSettings} aria-label="Pause game">
                    Ⅱ
                  </button>
                </div>
                <div className="hud-score">
                  <strong>
                    {me?.strokes || 0}
                    <small>STROKES</small>
                  </strong>
                  <strong>
                    {me?.score || 0}
                    <small>POINTS</small>
                  </strong>
                  {me?.shield! > snapshot.time && (
                    <span>
                      ⬡ Shield {Math.ceil(me!.shield - snapshot.time)}s
                    </span>
                  )}
                  {me?.boost! > snapshot.time && (
                    <span>
                      ☕ Boost {Math.ceil(me!.boost - snapshot.time)}s
                    </span>
                  )}
                </div>
                <div className="hud-items">
                  {[0, 1, 2].map((i) => {
                    const item = me?.inventory[i],
                      data = item && itemById(item.kind);
                    return (
                      <button
                        key={i}
                        className={slot === i ? "active" : ""}
                        onClick={() => setSlot(i)}
                      >
                        <kbd>{i + 1}</kbd>
                        <span>{data?.icon || "+"}</span>
                        <small>{data?.name || "Empty slot"}</small>
                        {item && <b>×{item.ammo}</b>}
                      </button>
                    );
                  })}
                  <p>
                    <kbd>Q</kbd> use · <kbd>G</kbd> drop
                  </p>
                </div>
                {snapshot.projectiles.some((r) => r.target === selfId) && (
                  <div className="threat-warning">
                    ↗ INCOMING ROCKET · Dive or shield!
                  </div>
                )}
                <div className="quick-chat-feed">
                  {snapshot.effects
                    .filter((e) => e.kind === "chat")
                    .slice(-3)
                    .map((e) => (
                      <p key={e.id}>
                        <strong>
                          {
                            snapshot.players.find((p) => p.id === e.playerId)
                              ?.name
                          }
                          :
                        </strong>{" "}
                        {e.text}
                      </p>
                    ))}
                </div>
                <div className="hud-golf">
                  <div>
                    <strong>
                      {["Putt", "Chip", "Lob"][[8, 30, 55].indexOf(angle)]}
                    </strong>
                    <span>{angle}° · scroll to change</span>
                  </div>
                  <div className="power-track">
                    <i style={{ width: `${power * 100}%` }} />
                  </div>
                  <small>
                    {power > 0
                      ? `${Math.round(power * 100)}% · release to swing`
                      : me?.ready || "Find your ball"}
                  </small>
                  <p>Hold right mouse to aim · hold left to charge</p>
                </div>
                {runtime.current?.renderer.captureHint && (
                  <div className="capture-hint">
                    {runtime.current.renderer.captureHint}
                  </div>
                )}
                <div className="ball-direction">
                  ◉ YOUR BALL ·{" "}
                  {Math.round(
                    me
                      ? Math.hypot(me.ball.x - me.pos.x, me.ball.z - me.pos.z)
                      : 0,
                  )}
                  m{" "}
                  <span>
                    ⚑ CUP ·{" "}
                    {Math.round(
                      me && currentCourse
                        ? Math.hypot(
                            me.ball.x - layout(currentCourse).hole.x,
                            me.ball.z - layout(currentCourse).hole.z,
                          )
                        : 0,
                    )}
                    m
                  </span>
                </div>
                {map && <MiniMap snapshot={snapshot} selfId={selfId} />}
                {tutorial && snapshot.phase === "playing" && !paused && (
                  <div className="tutorial">
                    <small>GET THE HANG OF IT · {tutorialStep + 1} / 3</small>
                    <strong>
                      {
                        [
                          "WASD to run. Mouse to look. Space to dive.",
                          "Stand beside your ball. Hold right mouse, then hold and release left mouse.",
                          "Run through a yellow crate. Select 1–3, then Q to use.",
                        ][tutorialStep]
                      }
                    </strong>
                    <button
                      onClick={() => {
                        setTutorial(false);
                        save("bg-tutorial", false);
                      }}
                    >
                      Got it / skip
                    </button>
                  </div>
                )}
                {(score ||
                  snapshot.phase === "results" ||
                  snapshot.phase === "complete") && (
                  <div className="scoreboard panel">
                    <small>
                      {snapshot.phase === "complete"
                        ? "MATCH COMPLETE"
                        : snapshot.phase === "results"
                          ? `NEXT HOLE IN ${Math.max(0, 8 - Math.floor(snapshot.time - snapshot.phaseStart))}s`
                          : "LIVE STANDINGS"}
                    </small>
                    <h2>
                      {snapshot.phase === "complete"
                        ? `${ordered[0]?.name} wins!`
                        : "The scorecard"}
                    </h2>
                    <div className="score-header">
                      <span>GOLFER</span>
                      <span>STROKES</span>
                      <span>POINTS</span>
                    </div>
                    {ordered.map((p, i) => (
                      <div
                        key={p.id}
                        className={
                          "score-row " + (p.id === selfId ? "you" : "")
                        }
                      >
                        <span>
                          <b>{i + 1}</b>
                          <i style={{ background: p.color }} />
                          {p.name}
                          {p.bot && <small>BOT</small>}
                          {p.finished ? " ✓" : ""}
                        </span>
                        <span>{p.strokes}</span>
                        <strong>{p.score}</strong>
                      </div>
                    ))}
                    {snapshot.phase === "complete" && (
                      <div className="dialog-actions">
                        <button
                          className="primary"
                          onClick={() => {
                            leave();
                            void play(
                              snapshot.mode === "practice"
                                ? "practice"
                                : "party",
                            );
                          }}
                        >
                          Play again
                        </button>
                        <button onClick={leave}>Clubhouse</button>
                      </div>
                    )}
                  </div>
                )}
                {snapshot.phase === "lobby" ? (
                  <div className="screen-overlay">
                    <div className="panel lobby">
                      <p className="eyebrow">THE CLUBHOUSE</p>
                      <h2>Your rivals are arriving.</h2>
                      <p>
                        Room <strong>{snapshot.roomCode || "…"}</strong>{" "}
                        <button
                          onClick={() => {
                            void navigator.clipboard.writeText(
                              snapshot.roomCode || "",
                            );
                            toast("Room code copied");
                          }}
                        >
                          Copy code
                        </button>
                      </p>
                      <div className="lobby-lineup">
                        {snapshot.players.map((p) => (
                          <div key={p.id}>
                            <i style={{ background: p.color }} />
                            {p.name}
                            <small>{p.bot ? "BOT" : "READY"}</small>
                          </div>
                        ))}
                      </div>
                      <p>
                        {snapshot.mode === "custom"
                          ? "The host starts when everyone is ready. Empty places fill with bots."
                          : "Match starts in " +
                            Math.max(0, 30 - Math.floor(snapshot.time)) +
                            "s. Bots fill empty places."}
                      </p>
                      {snapshot.owner === selfId && (
                        <button
                          className="primary"
                          onClick={() => runtime.current?.room?.send("start")}
                        >
                          Start match
                        </button>
                      )}
                      <button onClick={leave}>Leave room</button>
                    </div>
                  </div>
                ) : (
                  paused &&
                  snapshot.phase === "playing" &&
                  !dialog &&
                  !chat && (
                    <div className="screen-overlay">
                      <div className="panel pause">
                        <small>
                          {me?.finished ? "IN THE CUP" : "READY WHEN YOU ARE"}
                        </small>
                        <h2>
                          {me?.finished
                            ? "Watch the chaos."
                            : "Back to the fairway."}
                        </h2>
                        <p>
                          WASD run · Space dive · F club
                          <br />
                          Right mouse aim · Left mouse charge / release
                        </p>
                        <button className="primary" onClick={capture}>
                          Click to play
                        </button>
                        <div className="dialog-actions">
                          <button onClick={openSettings}>Settings</button>
                          <button onClick={leave}>Clubhouse</button>
                          {snapshot.mode === "practice" && (
                            <button
                              onClick={() =>
                                runtime.current?.send({ type: "reset" })
                              }
                            >
                              Reset ball
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </>
            )
          )}
        </>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {chat && (
        <div className="screen-overlay">
          <div className="panel">
            <h2>Say it on the fairway</h2>
            <div className="chat-grid">
              {[
                "Nice shot!",
                "Fore!",
                "Good game!",
                "Oops…",
                "Catch me!",
                "Thanks!",
              ].map((s, i) => (
                <button
                  key={s}
                  onClick={() => {
                    runtime.current?.send({ type: "chat", slot: i });
                    capture();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <button onClick={capture}>Back</button>
          </div>
        </div>
      )}
      {dialog && (
        <div className="screen-overlay">
          <div className="panel dialog">
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setDialog("")}
            >
              ×
            </button>
            {dialog === "friends" ? (
              <>
                <p className="eyebrow">BETTER WITH FRIENDS</p>
                <h2>Bring your worst rivals.</h2>
                <label>
                  Room code
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={8}
                  />
                </label>
                <button
                  className="primary"
                  disabled={!code.trim()}
                  onClick={() => void play("party", true)}
                >
                  Join room
                </button>
                <div className="divider">OR</div>
                <button onClick={() => void play("custom")}>
                  Create private party
                </button>
              </>
            ) : dialog === "practice" ? (
              <>
                <p className="eyebrow">NO PRESSURE. ALL PLAY.</p>
                <h2>Find your swing.</h2>
                <div className="course-picks">
                  {COURSES.map((c, i) => (
                    <button
                      className={course === c.id ? "active" : ""}
                      key={c.id}
                      onClick={() => setCourse(c.id)}
                    >
                      <small>
                        0{i + 1} · PAR {c.par}
                      </small>
                      <strong>{c.name}</strong>
                      <span>{c.tag}</span>
                    </button>
                  ))}
                </div>
                <button
                  className="primary"
                  onClick={() => void play("practice")}
                >
                  Tee off solo
                </button>
              </>
            ) : (
              <>
                <p className="eyebrow">MAKE YOURSELF COMFORTABLE</p>
                <h2>Settings</h2>
                <label>
                  Mouse sensitivity
                  <input
                    type="range"
                    min="0.001"
                    max="0.008"
                    step="0.0005"
                    value={settings.sensitivity}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        sensitivity: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                {(
                  [
                    ["invertY", "Invert vertical look"],
                    ["low", "Low graphics / no shadows"],
                    ["muted", "Mute audio"],
                    ["reducedMotion", "Reduced motion"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="toggle" key={key}>
                    {label}
                    <input
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [key]: e.target.checked }))
                      }
                    />
                  </label>
                ))}
                {(["master", "music", "sfx"] as const).map((key) => (
                  <label key={key}>
                    {key.toUpperCase()} VOLUME
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={settings[key]}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          [key]: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
                <details>
                  <summary>Change keyboard controls</summary>
                  <div className="key-bindings">
                    {Object.entries(settings.keys).map(([key, value]) => (
                      <button
                        key={key}
                        onClick={() => setRemap(key as keyof Bindings)}
                      >
                        {key}
                        <kbd>
                          {remap === key
                            ? "Press key…"
                            : value === " "
                              ? "Space"
                              : value}
                        </kbd>
                      </button>
                    ))}
                  </div>
                </details>
                <button
                  onClick={() => {
                    setTutorial(true);
                    save("bg-tutorial", true);
                    setDialog("");
                  }}
                >
                  Replay quick tutorial
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setDialog("");
                    if (page === "game") capture();
                  }}
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
