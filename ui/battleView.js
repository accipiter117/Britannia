// ui/battleView.js
// Owns the battle screen. Deployment: drag your bands within the lit ground (woods hide them).
// Battle: real time with slow motion, pause and speed. Tap a soldier (or a card) to select his
// band; tap ground to march there, drag to march and face the way you drag; tap an enemy to attack.
// Throw: press the javelin button, then tap where the volley should land (a skill shot: aim where
// the enemy will be). Hand any band to the AI with its card's ⚙. Drag empty ground to pan; pinch,
// the wheel or the buttons to zoom. All rules live in simulation/battle/.

import { BALANCE } from "../config/balance.js";
import {
  abilityReady, autoResolve, canThrow, orderUnits, setAI, soundRetreat, startBattle, throwAt, tick, useAbility,
} from "../simulation/battle/engine.js";
import { deployZone, placeUnit, unitWidth } from "../simulation/battle/setup.js";
import { drawFrame, paintGround, toWorld } from "./battleArt.js";

const B = BALANCE.battle;

export function openBattle(root, b, { factions, onEnd, sfx = () => {} }) {
  const side = b.playerSide;
  const enemy = side === "attacker" ? "defender" : "attacker";
  const abilities = factions[side] === "rome" ? BALANCE.romeAbilities : BALANCE.celtAbilities;
  const selected = new Set();
  let paused = false, speed = 1, multi = false, last = performance.now(), acc = 0, raf = 0, ended = false, aiming = null;

  root.innerHTML = `
    <header class="b-top">
      <b>${b.siege ? "Siege of" : "Battle of"} ${b.regionName}</b>
      <span class="b-clock" id="b-clock"></span>
      <span class="b-ctl">${B.speeds.map((s) => `<button data-speed="${s}" class="${s === 1 ? "on" : ""}">${s === 0.5 ? "½" : s}×</button>`).join("")}<button id="b-pause">❚❚</button></span>
    </header>
    <div class="b-stage" id="b-stage">
      <canvas id="b-canvas"></canvas>
      <div class="b-zoom"><button data-zoom="1.25">+</button><button data-zoom="0.8">−</button></div>
      <div class="b-banner" id="b-banner"></div>
      <div class="b-log" id="b-log"></div>
    </div>
    <div class="b-panel">
      <div class="b-cards" id="b-cards"></div>
      <div class="b-orders" id="b-orders"></div>
    </div>`;
  root.hidden = false;
  root.classList.add("entering");
  const canvas = root.querySelector("#b-canvas");
  const ctx = canvas.getContext("2d");
  const ground = paintGround(b.terrain);
  const cam = { scale: 1, x: 0, y: 0, flip: b.top === side };
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  const stage = root.querySelector("#b-stage");

  function fit() {
    canvas.width = stage.clientWidth * dpr();
    canvas.height = stage.clientHeight * dpr();
    canvas.style.width = `${stage.clientWidth}px`;
    canvas.style.height = `${stage.clientHeight}px`;
    cam.min = Math.min(stage.clientWidth / B.width, stage.clientHeight / B.height);
    if (!cam.userZoom) {
      // the whole field on a big screen; on a phone, close enough to see the men
      cam.scale = stage.clientWidth >= 900 ? cam.min : Math.max(cam.min, Math.min(stage.clientWidth / 520, stage.clientHeight / 420));
      centreOn(side);
    }
    clamp();
  }
  function clamp() {
    const vw = stage.clientWidth / cam.scale, vh = stage.clientHeight / cam.scale;
    cam.x = vw >= B.width ? (B.width - vw) / 2 : Math.max(0, Math.min(B.width - vw, cam.x));
    cam.y = vh >= B.height ? (B.height - vh) / 2 : Math.max(0, Math.min(B.height - vh, cam.y));
  }
  function centreOn(s) {
    const mine = b.units.filter((u) => u.side === s);
    const cx = mine.reduce((n, u) => n + u.cx, 0) / mine.length, cy = mine.reduce((n, u) => n + u.cy, 0) / mine.length;
    const vx = cam.flip ? B.width - cx : cx, vy = cam.flip ? B.height - cy : cy;
    cam.x = vx - stage.clientWidth / cam.scale / 2;
    cam.y = vy - stage.clientHeight / cam.scale * 0.6;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(stage);
  fit();

  // ---------- loop ----------

  let clashTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (b.phase === "fight" && !paused && !b.over) {
      acc += dt * speed;
      let steps = 0;
      while (acc >= B.tick && !b.over && steps++ < 8) { tick(b); acc -= B.tick; }
      clashTimer -= dt;
      if (clashTimer <= 0 && b.units.some((u) => u.fighting > 3)) { sfx("clash"); clashTimer = 0.35 + Math.random() * 0.4; }
    }
    for (const u of b.units) if (selected.has(u.id) && (u.state === "gone" || u.state === "routing")) selected.delete(u.id);
    const aimUnit = aiming && b.units.find((u) => u.id === aiming);
    drawFrame(ctx, b, ground, cam, {
      dpr: dpr(), side, selected, factions,
      zone: b.phase === "deploy" ? deployZone(b, side) : null, drag: dragArrow,
      aim: aimUnit ? { x: aimUnit.cx, y: aimUnit.cy, r: aimUnit.def.throw.range + unitWidth(aimUnit) / 2 } : null,
    });
    if (b.over && !ended) { ended = true; setTimeout(() => close(false), 1600); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const panelTimer = setInterval(panels, 250);

  // ---------- panels ----------

  function panels() {
    const mins = Math.floor(b.time / 60), secs = String(Math.floor(b.time % 60)).padStart(2, "0");
    const s = b.terrain.siege;
    root.querySelector("#b-clock").textContent = b.phase === "deploy" ? "Deploy" : `${mins}:${secs}${s ? ` · gate ${Math.max(0, Math.round(100 * s.gateHp / B.gateHp))}%${b.plazaTimer > 0 ? ` · centre ${Math.round(b.plazaTimer)}/${B.plazaHold}s` : ""}` : ""}`;
    const mine = b.units.filter((u) => u.side === side && u.state !== "gone");
    root.querySelector("#b-cards").innerHTML = mine.map((u) => {
      const m = Math.max(0, Math.min(1, u.morale / 80));
      return `<div class="b-card ${selected.has(u.id) ? "on" : ""} ${u.state} ${u.ai ? "ai" : ""}" data-unit="${u.id}">
        <span class="b-card-name">${u.general ? "★ " : ""}${u.name}</span>
        <span class="b-card-men">${u.men}/${u.start}${u.throwLeft ? ` · ${u.throwLeft}🗡` : ""}</span>
        <i class="b-bar men" style="width:${(u.men / u.start) * 100}%"></i><i class="b-bar mor ${m < 0.25 ? "low" : ""}" style="width:${m * 100}%"></i>
        <i class="b-bar sta" style="width:${(u.stamina / u.def.stamina) * 100}%"></i>
        <span class="b-card-state">${u.state === "routing" ? "Fleeing" : u.hidden ? "Hidden" : u.fighting ? "Fighting" : u.state === "moving" ? "Marching" : "Ready"}</span>
        <button class="b-ai" data-ai="${u.id}" title="Hand this band to the AI">${u.ai ? "AI" : "⚙"}</button></div>`;
    }).join("");
    const sel = [...selected].map((id) => b.units.find((u) => u.id === id)).filter(Boolean);
    const thrower = sel.find((u) => canThrow(b, u));
    const deploying = b.phase === "deploy";
    root.querySelector("#b-orders").innerHTML = `
      <div class="b-row">
        <button data-cmd="all">Select all</button>
        <button data-cmd="multi" class="${multi ? "on" : ""}">Multi</button>
        ${deploying ? "" : `<button data-cmd="hold" ${sel.length ? "" : "disabled"}>Halt</button>
        <button data-cmd="charge" ${sel.length ? "" : "disabled"}>Charge!</button>
        <button data-cmd="throw" class="${aiming ? "on" : ""} skill" ${thrower ? "" : "disabled"}>${aiming ? "Tap where to throw…" : "Throw javelins"}</button>`}
      </div>
      <div class="b-row">
        ${deploying ? `<button class="primary" data-cmd="begin">Begin the battle</button><button data-cmd="auto">Auto-resolve</button>`
          : abilities.map((k) => {
            const A = BALANCE.abilities[k];
            const ready = abilityReady(b, side, k);
            const left = Math.max(0, Math.ceil((b.sides[side].cooldowns[k] ?? 0) - b.time));
            return `<button data-ability="${k}" class="ability" ${ready ? "" : "disabled"} title="${A.desc}">${A.label}${ready ? "" : ` ${b.sides[side].generalAlive ? `${left}s` : "✝"}`}</button>`;
          }).join("") + `<button data-cmd="allai">All to AI</button><button data-cmd="retreat" class="danger">Retreat</button>`}
      </div>`;
    const banner = root.querySelector("#b-banner");
    banner.innerHTML = deploying ? `Drag your bands into place within the lit ground. Bands in woods lie hidden until the enemy is close.${b.siege ? (side === "attacker" ? " Batter the gate or climb the palisade, then hold the centre." : " Hold the palisade and the centre until nightfall.") : ""}` : "";
    banner.hidden = !deploying;
    root.querySelector("#b-log").innerHTML = b.log.slice(-3).filter((l) => b.time - l.t < 8).map((l) => `<div>${l.text}</div>`).join("");
  }
  panels();

  // ---------- buttons ----------

  root.querySelector(".b-panel").addEventListener("click", (e) => {
    const ai = e.target.closest("[data-ai]");
    if (ai) { const u = b.units.find((x) => x.id === +ai.dataset.ai); setAI(b, u.id, !u.ai); return panels(); }
    const card = e.target.closest("[data-unit]");
    if (card) {
      const id = +card.dataset.unit;
      if (selected.has(id) && selected.size === 1) { const u = b.units.find((x) => x.id === id); lookAt(u.cx, u.cy); return; } // a second tap: go there
      pick(id, multi || e.shiftKey); aiming = null; return panels();
    }
    const ab = e.target.closest("[data-ability]")?.dataset.ability;
    if (ab) { if (useAbility(b, side, ab, [...selected][0])) sfx("battle"); return panels(); }
    const cmd = e.target.closest("[data-cmd]")?.dataset.cmd;
    const mine = b.units.filter((u) => u.side === side && u.state !== "gone" && u.state !== "routing");
    if (cmd === "all") { selected.clear(); mine.filter((u) => !u.general).forEach((u) => selected.add(u.id)); }
    if (cmd === "multi") multi = !multi;
    if (cmd === "hold") orderUnits(b, [...selected], { kind: "hold" });
    if (cmd === "charge") for (const id of selected) { const u = b.units.find((x) => x.id === id); const t = nearest(u); if (t) orderUnits(b, [id], { kind: "attack", target: t.id }); }
    if (cmd === "throw") aiming = aiming ? null : [...selected].find((id) => canThrow(b, b.units.find((u) => u.id === id))) || null;
    if (cmd === "allai") { const on = !mine.every((u) => u.ai); mine.forEach((u) => setAI(b, u.id, on)); }
    if (cmd === "begin") { startBattle(b); selected.clear(); sfx("battle"); }
    if (cmd === "auto") { autoResolve(b); close(true); return; }
    if (cmd === "retreat") soundRetreat(b, side);
    panels();
  });
  root.querySelector(".b-top").addEventListener("click", (e) => {
    const sp = e.target.closest("[data-speed]")?.dataset.speed;
    if (sp) { speed = +sp; paused = false; root.querySelectorAll("[data-speed]").forEach((x) => x.classList.toggle("on", +x.dataset.speed === speed)); root.querySelector("#b-pause").textContent = "❚❚"; }
    if (e.target.id === "b-pause") { paused = !paused; e.target.textContent = paused ? "▶" : "❚❚"; }
    last = performance.now();
  });
  root.querySelector(".b-zoom").addEventListener("click", (e) => {
    const z = +e.target.closest("[data-zoom]")?.dataset.zoom;
    if (z) zoomAt(z, stage.clientWidth / 2, stage.clientHeight / 2);
  });

  function zoomAt(f, px, py) {
    cam.userZoom = true;
    const wx = px / cam.scale + cam.x, wy = py / cam.scale + cam.y;
    cam.scale = Math.max(cam.min, Math.min(6, cam.scale * f));
    cam.x = wx - px / cam.scale; cam.y = wy - py / cam.scale;
    clamp();
  }
  function lookAt(x, y) {
    const vx = cam.flip ? B.width - x : x, vy = cam.flip ? B.height - y : y;
    cam.userZoom = true;
    cam.x = vx - stage.clientWidth / cam.scale / 2; cam.y = vy - stage.clientHeight / cam.scale / 2;
    clamp();
  }
  function pick(id, add) {
    if (!add) { const only = selected.has(id) && selected.size === 1; selected.clear(); if (!only) selected.add(id); }
    else if (selected.has(id)) selected.delete(id); else selected.add(id);
  }
  function nearest(u) {
    return b.units.filter((e) => e.side === enemy && e.state !== "gone" && !e.hidden).sort((p, q) => Math.hypot(p.cx - u.cx, p.cy - u.cy) - Math.hypot(q.cx - u.cx, q.cy - u.cy))[0];
  }

  // ---------- the field ----------

  const pointers = new Map();
  let down = null, dragArrow = null, pinch = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // the band of the soldier nearest the tap
  const unitAt = (wx, wy, who) => {
    let best = null, bd = 16 / Math.max(0.6, cam.scale) + 6;
    for (const s of b.soldiers) {
      if (!s.alive || s.fled || (who && s.u.side !== who) || (s.u.hidden && s.u.side !== side)) continue;
      const d = Math.hypot(s.x - wx, s.y - 5 - wy);
      if (d < bd) { bd = d; best = s.u; }
    }
    return best;
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]) }; down = null; return; }
    const [px, py] = local(e);
    const [wx, wy] = toWorld(cam, px, py);
    down = { px, py, wx, wy, unit: unitAt(wx, wy, side), moved: false, cam: { x: cam.x, y: cam.y } };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      zoomAt(d / pinch.d, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      pinch.d = d;
      return;
    }
    if (!down) return;
    const [px, py] = local(e);
    if (Math.hypot(px - down.px, py - down.py) > 8) down.moved = true;
    if (!down.moved) return;
    const [wx, wy] = toWorld(cam, px, py);
    if (b.phase === "deploy" && down.unit) {
      placeUnit(b, down.unit, wx, wy);
      if (!selected.has(down.unit.id)) { selected.clear(); selected.add(down.unit.id); }
    } else if (selected.size && !down.unit && !aiming) {
      dragArrow = [down.wx, down.wy, wx, wy];
    } else if (!down.unit) {
      cam.userZoom = true;
      const dx = (px - down.px) / cam.scale, dy = (py - down.py) / cam.scale;
      cam.x = down.cam.x - dx; cam.y = down.cam.y - dy; clamp();
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!down) return;
    const d = down;
    down = null;
    if (dragArrow) {
      const [x0, y0, x1, y1] = dragArrow;
      dragArrow = null;
      march([...selected], x0, y0, Math.atan2(x1 - x0, -(y1 - y0)));
      return panels();
    }
    if (d.moved) return panels();
    if (aiming) {
      if (throwAt(b, aiming, d.wx, d.wy)) sfx("march"); else flash("Too far: throw within the circle");
      aiming = null;
      return panels();
    }
    const foe = unitAt(d.wx, d.wy, enemy);
    if (d.unit) pick(d.unit.id, multi || e.shiftKey);
    else if (foe && selected.size && b.phase === "fight") { orderUnits(b, [...selected], { kind: "attack", target: foe.id }); sfx("march"); }
    else if (b.terrain.siege && selected.size && b.phase === "fight" && side === "attacker" && Math.hypot(d.wx - b.terrain.siege.gate.x, d.wy - b.terrain.siege.gate.y) < 40) { orderUnits(b, [...selected], { kind: "gate" }); sfx("march"); }
    else if (selected.size && b.phase === "fight") {
      const units = [...selected].map((id) => b.units.find((u) => u.id === id));
      const cx = units.reduce((n, u) => n + u.cx, 0) / units.length, cy = units.reduce((n, u) => n + u.cy, 0) / units.length;
      march([...selected], d.wx, d.wy, Math.atan2(d.wx - cx, -(d.wy - cy)));
    } else selected.clear();
    panels();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); const [px, py] = local(e); zoomAt(e.deltaY < 0 ? 1.12 : 0.9, px, py); }, { passive: false });

  // March a group to a point, side by side across the facing.
  function march(ids, x, y, face) {
    if (b.phase !== "fight") return;
    const units = ids.map((id) => b.units.find((u) => u.id === id)).filter(Boolean);
    const sx = Math.cos(face), sy = Math.sin(face);
    const widths = units.map((u) => unitWidth(u) + 12);
    let off = -widths.reduce((n, w) => n + w, 0) / 2;
    units.sort((p, q) => (p.cx * sx + p.cy * sy) - (q.cx * sx + q.cy * sy));
    units.forEach((u, i) => {
      const mid = off + widths[i] / 2;
      off += widths[i];
      orderUnits(b, [u.id], { kind: "move", x: Math.max(10, Math.min(B.width - 10, x + sx * mid)), y: Math.max(10, Math.min(B.height - 10, y + sy * mid)), face });
    });
    sfx("march");
  }

  let flashTimer = 0;
  function flash(text) {
    const log = root.querySelector("#b-log");
    log.innerHTML = `<div class="warn">${text}</div>`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(panels, 1500);
  }

  function close(auto) {
    cancelAnimationFrame(raf);
    clearInterval(panelTimer);
    ro.disconnect();
    root.hidden = true;
    root.innerHTML = "";
    onEnd(b, auto);
  }

  return { close };
}
