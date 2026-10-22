import { canFire, fire, reachableStates, enabledTransitions, terminalStates, isDeadlockFree, checkInvariant, analyse, toDot, createDispatcher, memoryAdapter } from "petri-ts";
// coffee shop as P/T net
const net = { initialMarking: { latte_orders: 2, espresso_orders: 1, baristas: 2, milk: 1, brewing_latte: 0, brewing_espresso: 0, served: 0 },
  transitions: [
    { name: "start_latte", inputs: ["latte_orders", "baristas", "milk"], outputs: ["brewing_latte"] },
    { name: "start_espresso", inputs: ["espresso_orders", "baristas"], outputs: ["brewing_espresso"] },
    { name: "finish_latte", inputs: ["brewing_latte"], outputs: ["served", "baristas"] },
    { name: "finish_espresso", inputs: ["brewing_espresso"], outputs: ["served", "baristas"] },
  ] };
console.log("canFire start_latte:", canFire(net.initialMarking, net.transitions[0]));
const m1 = fire(net.initialMarking, net.transitions[0]); console.log("after start_latte:", m1, "orig unchanged:", net.initialMarking.milk);
console.log("enabled:", enabledTransitions(net, m1).map(t => t.name));
const r = analyse(net, { invariants: [{ weights: { baristas: 1, brewing_latte: 1, brewing_espresso: 1 } }, { weights: { milk: 1 } }] });
console.log("states:", r.reachableStateCount, "terminal:", r.terminalStates.length, "deadlockFree:", r.isDeadlockFree, "inv:", r.invariants.map(i => i.holds));
console.log("terminal:", r.terminalStates);
try { fire(m1, net.transitions[0]); } catch (e) { console.log("fire error:", e.message); }
// missing output key -> NaN?
const bad = { initialMarking: { a: 1 }, transitions: [{ name: "t", inputs: ["a"], outputs: ["b"] }] };
console.log("missing output key:", fire(bad.initialMarking, bad.transitions[0]));
// weighted arc = repeated place
console.log("repeat input needs 2:", canFire({ a: 1 }, { name: "w", inputs: ["a", "a"], outputs: [] }), canFire({ a: 2 }, { name: "w", inputs: ["a", "a"], outputs: [] }));
// unbounded
const unb = { initialMarking: { a: 1 }, transitions: [{ name: "grow", inputs: ["a"], outputs: ["a", "a"] }] };
try { reachableStates(unb, 50); } catch (e) { console.log("limit error:", e.message); }
console.log("reachable(limit 50) on bounded:", reachableStates(net, 50).length);
// toDot
console.log(toDot({ initialMarking: { p: 1, q: 0 }, transitions: [{ name: "go", inputs: ["p"], outputs: ["q"] }] }));
console.log("toDot id collision test:", toDot({ initialMarking: { t0: 1 }, transitions: [{ name: "x", inputs: ["t0"], outputs: ["t0"] }] }).split("\n").filter(l => l.includes('"t0"')).length);
// dispatcher
const d = createDispatcher(net, memoryAdapter());
await d.create("order-1"); console.log("dispatch:", await d.dispatch("order-1", "start_espresso"));
const s = await d.inspect("order-1"); console.log("inspect version type:", typeof s.version, s.version.length);
try { await d.create("order-1"); } catch (e) { console.log("create twice:", e.message); }
try { await d.dispatch("order-1", "nope"); } catch (e) { console.log("unknown:", e.message); }
try { await d.dispatch("order-1", "finish_latte"); } catch (e) { console.log("not enabled:", e.message); }
try { await d.inspect("zzz"); } catch (e) { console.log("missing:", e.message); }
// version conflict
const ad = memoryAdapter(); const d2 = createDispatcher(net, ad); await d2.create("x", "v1");
try { await ad.save("x", { marking: net.initialMarking, version: "v2" }, "wrong"); } catch (e) { console.log("conflict:", e.message); }
// checkInvariant on empty / terminal default
console.log("checkInvariant default states:", checkInvariant(net, { baristas: 1, brewing_latte: 1, brewing_espresso: 1 }));
console.log("isDeadlockFree:", isDeadlockFree(net), "terminalStates:", terminalStates(net).length);
console.log("analyse dot:", typeof analyse(net, { dot: true }).dot, analyse(net, { dot: { marking: m1 } }).dot.includes("milk\\n0"));
