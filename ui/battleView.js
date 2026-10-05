// ui/battleView.js
// Owns the battle screen: deployment (drag your units within the lit ground; woods hide them),
// then real time with pause and speed. Tap a unit (or its card) to select it; tap ground to march
// there, drag to march and face the way you drag; tap an enemy to attack it, the gate to batter
// it. Formation and ability buttons act on the selection. Drag empty ground with nothing selected
// to pan; pinch or the buttons to zoom. All rules live in simulation/battle/engine.js.

import { BALANCE } from "../config/balance.js";
import {
  abilityReady, autoResolve, orderUnits, setFormation, soundRetreat, startBattle, tick, unitSize, useAbility,
} from "../simulation/battle/engine.js";
import { deployZone } from "../simulation/battle/setup.js";
import { drawFrame, paintGround, toWorld } from "./battleArt.js";

const B = BALANCE.battle;
const U = BALANCE.units;

export function openBattle(root, b, { factions, onEnd, sfx = () => {} }) {
  const side = b.playerSide;
  const enemy = side === "attacker" ? "defender" : "attacker";
  const abilities = factions[side] === "rome" ? BALANCE.romeAbilities : BALANCE.pictAbilities;
  const selected = new Set();
  let paused = false, speed = 1, multi = false, last = performance.now(), acc = 0, raf = 0, ended = false;

  root.innerHTML = `
    <header class="b-top">
      <b>${b.siege ? "Siege of" : "Battle of"} ${b.regionName}</b>
      <span class="b-clock" id="b-clock"></span>
      <span class="b-ctl"><button id="b-pause">❚❚</button><button id="b-speed">1×</button></span>
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
  const dpr = () => window.devicePixelRatio || 1;

  function fit() {
    const box = root.querySelector("#b-stage");
    canvas.width = box.clientWidth * dpr();
    canvas.height = box.clientHeight * dpr();
    canvas.style.width = `${box.clientWidth}px`;
    canvas.style.height = `${box.clientHeight}px`;
    const s = Math.min(box.clientWidth / B.width, box.clientHeight / B.height);
    cam.min = s;
    // until the player zooms, keep refitting as the layout settles
    if (!cam.userZoom) { cam.scale = box.clientWidth >= 900 ? s : Math.max(s, Math.min(box.clientWidth / 700, box.clientHeight / 500, s * 1.6)); centreOn(side); }
    clamp();
  }
  function clamp() {
    const box = root.querySelector("#b-stage");
    const vw = box.clientWidth / cam.scale, vh = box.clientHeight / cam.scale;
    cam.x = vw >= B.width ? (B.width - vw) / 2 : Math.max(0, Math.min(B.width - vw, cam.x));
    cam.y = vh >= B.height ? (B.height - vh) / 2 : Math.max(0, Math.min(B.height - vh, cam.y));
  }
  function centreOn(s) {
    const mine = b.units.filter((u) => u.side === s);
    const box = root.querySelector("#b-stage");
    const cx = mine.reduce((n, u) => n + u.x, 0) / mine.length, cy = mine.reduce((n, u) => n + u.y, 0) / mine.length;
    const sx = cam.flip ? B.width - cx : cx, sy = cam.flip ? B.height - cy : cy;
    cam.x = sx - box.clientWidth / cam.scale / 2;
    cam.y = sy - box.clientHeight / cam.scale * 0.62;
  }
  const ro = new ResizeObserver(() => { fit(); });
  ro.observe(root.querySelector("#b-stage"));
  fit();

  // ---------- drawing loop ----------

  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (b.phase === "fight" && !paused && !b.over) {
      acc += dt * speed;
      while (acc >= B.tick && !b.over) {
        const before = b.units.filter((u) => u.foes.length).length;
        tick(b);
        acc -= B.tick;
        if (b.units.filter((u) => u.foes.length).length > before) sfx("clash");
      }
    }
    for (const u of b.units) if (selected.has(u.id) && (u.state === "gone" || u.state === "routing")) selected.delete(u.id);
    drawFrame(ctx, b, ground, cam, {
      dpr: dpr(), side, selected, factions,
      zone: b.phase === "deploy" ? deployZone(b, side) : null, drag: dragArrow,
    });
    if (b.over && !ended) { ended = true; setTimeout(() => close(false), 1400); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const panelTimer = setInterval(panels, 250);

  // ---------- panels ----------

  function panels() {
    const mins = Math.floor(b.time / 60), secs = String(Math.floor(b.time % 60)).padStart(2, "0");
    const limit = b.siege ? B.siegeTimeLimit : B.timeLimit;
    root.querySelector("#b-clock").textContent = b.phase === "deploy" ? "Deployment" : `${mins}:${secs} / ${Math.floor(limit / 60)}:00${b.terrain.siege ? ` · gate ${Math.max(0, Math.round(b.terrain.siege.gateHp))}%${b.plazaTimer > 0 ? ` · centre ${Math.round(b.plazaTimer)}/${B.plazaHold}s` : ""}` : ""}`;
    const mine = b.units.filter((u) => u.side === side && u.state !== "gone");
    root.querySelector("#b-cards").innerHTML = mine.map((u) => {
      const m = Math.max(0, Math.min(1, u.morale / 80));
      return `<button class="b-card ${selected.has(u.id) ? "on" : ""} ${u.state}" data-unit="${u.id}">
        <span class="b-card-name">${u.general ? "★ " : ""}${U[u.type].name}</span>
        <span class="b-card-men">${Math.round(u.men)}</span>
        <i class="b-bar men" style="width:${(u.men / u.start) * 100}%"></i><i class="b-bar mor ${m < 0.25 ? "low" : ""}" style="width:${m * 100}%"></i>
        <span class="b-card-state">${u.state === "routing" ? "Routing" : u.hidden ? "Hidden" : u.state === "fighting" ? "Fighting" : F(u)}</span></button>`;
    }).join("");
    const sel = [...selected].map((id) => b.units.find((u) => u.id === id)).filter(Boolean);
    const forms = [...new Set(sel.flatMap((u) => U[u.type].formations))];
    const deploying = b.phase === "deploy";
    root.querySelector("#b-orders").innerHTML = `
      <div class="b-row">
        <button data-cmd="all" title="Every unit but the chieftain">Select all</button>
        <button data-cmd="multi" class="${multi ? "on" : ""}">Multi-select</button>
        ${forms.map((f) => `<button data-form="${f}" class="${sel.every((u) => u.formation === f) && sel.length ? "on" : ""}">${BALANCE.formations[f].label}</button>`).join("")}
        ${deploying ? "" : `<button data-cmd="hold" ${sel.length ? "" : "disabled"}>Halt</button><button data-cmd="charge" ${sel.length ? "" : "disabled"}>Charge nearest</button>`}
      </div>
      <div class="b-row">
        ${deploying ? `<button class="primary" data-cmd="begin">Begin the battle</button><button data-cmd="auto">Auto-resolve</button>`
          : abilities.map((k) => {
            const A = BALANCE.abilities[k];
            const ready = abilityReady(b, side, k);
            const left = Math.max(0, Math.ceil((b.sides[side].cooldowns[k] ?? 0) - b.time));
            return `<button data-ability="${k}" class="ability" ${ready ? "" : "disabled"} title="${A.desc}">${A.label}${ready ? "" : ` (${b.sides[side].generalAlive ? `${left}s` : "no general"})`}</button>`;
          }).join("") + `<button data-cmd="retreat" class="danger">Sound the retreat</button>`}
      </div>`;
    const banner = root.querySelector("#b-banner");
    banner.innerHTML = deploying ? `Deploy your warriors: drag them within the lit ground. Warriors in woods lie hidden until the enemy is close.${b.siege ? (side === "attacker" ? " Send infantry at the gate, or let them climb the walls." : " Hold the walls and the centre until nightfall.") : ""}` : "";
    banner.hidden = !deploying;
    root.querySelector("#b-log").innerHTML = b.log.slice(-3).filter((l) => b.time - l.t < 8).map((l) => `<div>${l.text}</div>`).join("");
  }
  const F = (u) => BALANCE.formations[u.formation].label;
  panels();

  // ---------- input: buttons ----------

  root.querySelector(".b-panel").addEventListener("click", (e) => {
    const card = e.target.closest("[data-unit]");
    if (card) { pick(+card.dataset.unit, multi || e.shiftKey); return panels(); }
    const form = e.target.closest("[data-form]")?.dataset.form;
    if (form) { for (const id of selected) setFormation(b, id, form); if (b.phase === "deploy") for (const id of selected) b.units.find((u) => u.id === id).reform = 0; return panels(); }
    const ab = e.target.closest("[data-ability]")?.dataset.ability;
    if (ab) { if (useAbility(b, side, ab, [...selected][0])) sfx("battle"); return panels(); }
    const cmd = e.target.closest("[data-cmd]")?.dataset.cmd;
    const mine = b.units.filter((u) => u.side === side && u.state !== "gone" && u.state !== "routing");
    if (cmd === "all") { selected.clear(); mine.filter((u) => !u.general).forEach((u) => selected.add(u.id)); } // the chieftain stays your own call
    if (cmd === "multi") multi = !multi;
    if (cmd === "hold") orderUnits(b, [...selected], { kind: "hold" });
    if (cmd === "charge") for (const id of selected) {
      const u = b.units.find((x) => x.id === id);
      const t = nearest(u);
      if (t) orderUnits(b, [id], { kind: "attack", target: t.id });
    }
    if (cmd === "begin") { startBattle(b); selected.clear(); sfx("battle"); }
    if (cmd === "auto") { autoResolve(b); close(true); return; }
    if (cmd === "retreat") { soundRetreat(b, side); }
    panels();
  });
  root.querySelector(".b-top").addEventListener("click", (e) => {
    if (e.target.id === "b-pause") { paused = !paused; e.target.textContent = paused ? "▶" : "❚❚"; last = performance.now(); }
    if (e.target.id === "b-speed") { speed = B.speeds[(B.speeds.indexOf(speed) + 1) % B.speeds.length]; e.target.textContent = `${speed}×`; }
  });
  root.querySelector(".b-zoom").addEventListener("click", (e) => {
    const z = +e.target.closest("[data-zoom]")?.dataset.zoom;
    if (z) zoomAt(z, canvas.clientWidth / 2, canvas.clientHeight / 2);
  });

  function zoomAt(f, px, py) {
    const [wx, wy] = [px / cam.scale + cam.x, py / cam.scale + cam.y];
    cam.userZoom = true;
    cam.scale = Math.max(cam.min, Math.min(cam.min * 4, cam.scale * f));
    cam.x = wx - px / cam.scale; cam.y = wy - py / cam.scale;
    clamp();
  }

  function pick(id, add) {
    if (!add) { const only = selected.has(id) && selected.size === 1; selected.clear(); if (!only) selected.add(id); }
    else if (selected.has(id)) selected.delete(id); else selected.add(id);
  }

  function nearest(u) {
    return b.units.filter((e) => e.side === enemy && e.state !== "gone" && !e.hidden).sort((p, q) => Math.hypot(p.x - u.x, p.y - u.y) - Math.hypot(q.x - u.x, q.y - u.y))[0];
  }

  // ---------- input: the field ----------

  const pointers = new Map();
  let down = null, dragArrow = null, pinch = null;
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const unitAt = (wx, wy, who) => b.units.find((u) => u.state !== "gone" && (!who || u.side === who) && (!u.hidden || u.side === side) &&
    Math.hypot(u.x - wx, u.y - wy) < Math.max(18, unitSize(u).w / 2 + 6));

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
      const z = deployZone(b, side);
      down.unit.x = Math.max(z.x0, Math.min(z.x1, wx));
      down.unit.y = Math.max(z.y0, Math.min(z.y1, wy));
      if (!selected.has(down.unit.id)) { selected.clear(); selected.add(down.unit.id); }
    } else if (selected.size && !down.unit) {
      dragArrow = [down.wx, down.wy, wx, wy];
    } else if (!selected.size || down.unit) {
      if (!down.unit) { cam.userZoom = true; cam.x = down.cam.x - (px - down.px) / cam.scale; cam.y = down.cam.y - (py - down.py) / cam.scale; clamp(); }
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
    const foe = unitAt(d.wx, d.wy, enemy);
    if (d.unit) pick(d.unit.id, multi || e.shiftKey);
    else if (foe && selected.size && b.phase === "fight") { orderUnits(b, [...selected], { kind: "attack", target: foe.id }); sfx("march"); }
    else if (b.terrain.siege && selected.size && b.phase === "fight" && Math.hypot(d.wx - b.terrain.siege.gate.x, d.wy - b.terrain.siege.gate.y) < 40 && side === "attacker") { orderUnits(b, [...selected], { kind: "gate" }); sfx("march"); }
    else if (selected.size && b.phase === "fight") {
      const cx = avg("x"), cy = avg("y");
      march([...selected], d.wx, d.wy, Math.atan2(d.wx - cx, -(d.wy - cy)));
    } else selected.clear();
    panels();
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); const [px, py] = local(e); zoomAt(e.deltaY < 0 ? 1.12 : 0.9, px, py); }, { passive: false });

  const avg = (k) => [...selected].map((id) => b.units.find((u) => u.id === id)).reduce((n, u, _, a) => n + u[k] / a.length, 0);

  // March a group to a point, spread in a line across the facing.
  function march(ids, x, y, face) {
    if (b.phase !== "fight") return;
    const units = ids.map((id) => b.units.find((u) => u.id === id)).filter(Boolean);
    const sx = Math.cos(face), sy = Math.sin(face); // along the line (perpendicular to facing)
    const widths = units.map((u) => unitSize(u).w + 10);
    let off = -widths.reduce((n, w) => n + w, 0) / 2;
    // keep left-to-right order as seen along the line
    units.sort((p, q) => (p.x * sx + p.y * sy) - (q.x * sx + q.y * sy));
    units.forEach((u, i) => {
      const mid = off + widths[i] / 2;
      off += widths[i];
      let tx = x + sx * mid, ty = y + sy * mid;
      tx = Math.max(10, Math.min(B.width - 10, tx)); ty = Math.max(10, Math.min(B.height - 10, ty));
      orderUnits(b, [u.id], { kind: "move", x: tx, y: ty, face });
    });
    sfx("march");
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

