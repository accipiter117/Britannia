// ui/battleView.js
// Owns the tactical battle screen: draws the 12x12 field on a canvas, runs the simulation clock
// (real time with pause and speed), and turns taps into orders. Tap your blocks to select them;
// tap open ground to move there, tap an enemy to attack. All rules live in simulation/battle.js.

import { BALANCE } from "../config/balance.js";
import { PLANS, isActive, orderUnits, retreatAll, setPlan, sideSummary, tick } from "../simulation/battle.js";
import { esc, num } from "./format.js";
import { drawBlock, drawStronghold, paintTerrain } from "./battleArt.js";
import { icon } from "./icons.js";

const B = BALANCE.battle;
const N = B.gridSize;

export function openBattle(root, battle, colours, onEnd, hooks = {}) {
  const player = battle.playerSide;
  let selected = new Set();
  let paused = true;
  let speed = B.speeds[0];
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let finished = false;

  root.innerHTML = `
    <header class="b-head">
      <b>${icon("armies")} ${esc(battle.districtName)}</b>
      <span id="b-clock"></span>
      <span class="b-ctl">
        <button id="b-play">▶ Play</button>
        <button id="b-speed">${speed}×</button>
      </span>
    </header>
    <div class="b-bars" id="b-bars"></div>
    <div class="b-plan" id="b-plan">
      <span>Battle plan</span>
      ${PLANS.map((p) => `<button data-plan="${p}" class="${(battle.plans?.[player] || "line") === p ? "on" : ""}">${PLAN_TEXT[p].name}</button>`).join("")}
      <small id="b-plan-hint">${PLAN_TEXT[battle.plans?.[player] || "line"].hint}</small>
    </div>
    <div class="b-field"><canvas id="b-canvas"></canvas></div>
    <p class="b-hint" id="b-hint"></p>
    <div class="b-cmds">
      <button data-b="all">Select all</button>
      <button data-b="advance">Advance</button>
      <button data-b="hold">Hold</button>
      <button data-b="retreat">Retreat</button>
      <button data-b="retreat-all" class="danger">Sound the retreat</button>
      <button data-b="auto">Auto-resolve</button>
    </div>`;
  root.hidden = false;

  const canvas = root.querySelector("#b-canvas");
  const ctx = canvas.getContext("2d");

  function size() {
    const box = root.querySelector(".b-field"); // layout size, unaffected by the entrance animation
    const px = Math.floor(Math.min(box.clientWidth, box.clientHeight));
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = canvas.style.height = `${px}px`;
    canvas.width = canvas.height = Math.floor(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return px;
  }
  let terrain = null;
  let px = size();
  const onResize = () => { px = size(); draw(); };
  window.addEventListener("resize", onResize);
  // the field box settles after the header and plan bar lay out, so size to it as it changes
  const fieldObserver = new ResizeObserver(onResize);
  fieldObserver.observe(root.querySelector(".b-field"));

  // ---------- drawing ----------

  function draw() {
    const c = px / N;
    if (!terrain || terrain.size !== px) { terrain = paintTerrain(battle.grid, px, window.devicePixelRatio || 1); terrain.size = px; }
    ctx.drawImage(terrain, 0, 0, px, px);
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i <= N; i++) { line(i * c, 0, i * c, px); line(0, i * c, px, i * c); }
    if (battle.objective) drawStronghold(ctx, battle.objective, c, B.fortifiedRadius, B.objectiveRadius);
    for (const u of battle.units) {
      if (u.state === "Gone") continue;
      u.dx = u.dx === undefined ? u.x : u.dx + (u.x - u.dx) * 0.35;
      u.dy = u.dy === undefined ? u.y : u.dy + (u.y - u.dy) * 0.35;
      const x = u.dx * c, y = u.dy * c;
      const mine = u.side === player;
      if (mine && u.order.kind === "move") {
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.setLineDash([4, 4]);
        line(x + c / 2, y + c / 2, u.order.x * c + c / 2, u.order.y * c + c / 2);
        ctx.setLineDash([]);
      }
      drawBlock(ctx, u, x, y, c, colours[u.side], { mine, selected: selected.has(u.id) });
    }
    const a = sideSummary(battle, "attacker"), d = sideSummary(battle, "defender");
    const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    root.querySelector("#b-clock").textContent = `${mm(battle.time)}${battle.objective ? ` / hold ${mm(B.defensiveTimerSeconds)}` : ""}`;
    root.querySelector("#b-bars").innerHTML = [["attacker", a], ["defender", d]].map(([side, s]) =>
      `<div class="b-bar ${side === player ? "mine" : ""}"><span>${side === player ? "You" : "Enemy"} (${side})</span>
        <i style="background:${colours[side]};width:${(s.fighting / Math.max(1, s.start)) * 100}%"></i><small>${num(s.fighting)} / ${num(s.start)}</small></div>`).join("");
    const fell = battle.log.filter((l) => battle.time - l.time < 4).map((l) => `${l.side === player ? "Your" : "The enemy"} commander has fallen!`)[0];
    root.querySelector("#b-hint").textContent = finished ? battle.result.reason : fell ? fell
      : selected.size ? `${selected.size} selected: tap ground to move, tap an enemy to attack.`
      : paused && battle.time === 0 ? "Choose a battle plan, then press Play. Tap your blocks (light outline) to give them orders first if you like."
      : paused ? "Paused. Tap your blocks (light outline) to select them, then give orders. Press Play to fight. L levies · W warriors · S skirmishers · R legionaries." : "Tap your blocks to command them.";
  }

  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  // ---------- clock ----------

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!paused && !finished) {
      acc += dt * speed;
      while (acc >= B.tickSeconds && !battle.over) {
        tick(battle);
        acc -= B.tickSeconds;
        if (hooks.onClash && battle.units.some((u) => u.state === "Engaging") && Math.random() < 0.35) hooks.onClash();
      }
      if (battle.over) end();
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  function end() {
    finished = true;
    paused = true;
    draw();
    setTimeout(() => close(true), 900);
  }

  function close(done) {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    fieldObserver.disconnect();
    root.hidden = true;
    root.innerHTML = "";
    if (done) onEnd(battle);
  }

  // ---------- input ----------

  canvas.addEventListener("pointerdown", (e) => {
    if (finished) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * N);
    const y = Math.floor(((e.clientY - r.top) / r.height) * N);
    const u = battle.units.find((v) => v.state !== "Gone" && v.x === x && v.y === y);
    if (u && u.side === player && isActive(u)) {
      if (selected.has(u.id) && selected.size === 1) selected.clear();
      else if (e.shiftKey || selected.has(u.id)) selected.has(u.id) ? selected.delete(u.id) : selected.add(u.id);
      else { selected.clear(); selected.add(u.id); }
    } else if (selected.size && u && u.side !== player) {
      orderUnits(battle, [...selected], { kind: "attack", targetId: u.id });
    } else if (selected.size && !u) {
      // spread a group around the tapped cell so they do not queue for one square
      const ids = [...selected];
      ids.forEach((id, i) => {
        const off = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [-1, 1], [1, 1], [-3, 0], [3, 0]][i % 10];
        orderUnits(battle, [id], { kind: "move", x: clamp(x + off[0]), y: clamp(y + off[1]) });
      });
    }
    draw();
  });

  const planBox = root.querySelector("#b-plan");
  planBox.onclick = (e) => {
    const plan = e.target.closest("[data-plan]")?.dataset.plan;
    if (!plan || battle.time > 0 || !player) return;
    setPlan(battle, player, plan);
    planBox.querySelectorAll("[data-plan]").forEach((b) => b.classList.toggle("on", b.dataset.plan === plan));
    root.querySelector("#b-plan-hint").textContent = PLAN_TEXT[plan].hint;
    draw();
  };
  if (!player) planBox.hidden = true;
  root.classList.remove("entering");
  void root.offsetWidth;
  root.classList.add("entering");

  root.querySelector("#b-play").onclick = (e) => {
    planBox.hidden = true; // the plan is fixed once battle is joined
    paused = !paused;
    e.target.textContent = paused ? "▶ Play" : "⏸ Pause";
    last = performance.now();
  };
  root.querySelector("#b-speed").onclick = (e) => {
    speed = B.speeds[(B.speeds.indexOf(speed) + 1) % B.speeds.length];
    e.target.textContent = `${speed}×`;
  };
  root.querySelector(".b-cmds").onclick = (e) => {
    const cmd = e.target.closest("[data-b]")?.dataset.b;
    if (!cmd || finished) return;
    const mine = battle.units.filter((u) => u.side === player && isActive(u)).map((u) => u.id);
    const sel = selected.size ? [...selected] : mine;
    if (cmd === "all") selected = new Set(mine);
    if (cmd === "advance") orderUnits(battle, sel, { kind: "auto" });
    if (cmd === "hold") orderUnits(battle, sel, { kind: "hold" });
    if (cmd === "retreat") orderUnits(battle, sel, { kind: "retreat" });
    if (cmd === "retreat-all") retreatAll(battle, player);
    if (cmd === "auto") { close(false); onEnd(battle, true); return; }
    draw();
  };
}

const PLAN_TEXT = {
  line: { name: "Line", hint: "One wide front: steady, no surprises." },
  deep: { name: "Deep", hint: `A narrow, stacked centre. Morale +${BALANCE.battle.plans.deep.morale}; harder to break, easier to wrap round.` },
  wings: { name: "Wings", hint: `Strength on the flanks to envelop them. Morale ${BALANCE.battle.plans.wings.morale}; a thin centre.` },
};

const clamp = (v) => Math.max(0, Math.min(N - 1, v));
