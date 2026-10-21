# Coffee Shop – PM4Py steps

3 orders (2 latte, 1 espresso), 2 baristas, milk sirf 1 latte ke liye.
**Part A:** coffee shop ko Petri net banao, deadlock dhoondo, inhibitor arc se fix karo.
**Part B:** PM4Py ka main use – event log se process mining.

> Har code block ke upar-right me GitHub ka **copy** button hai. Steps ko upar se neeche order me run karo (same notebook / same Python session). Install: `pip install pm4py`

## Steps

**Part A – Petri net modelling**
- [Step 1 – Imports](#step-1)
- [Step 2 – Places banao](#step-2)
- [Step 3 – Transitions banao](#step-3)
- [Step 4 – Arcs jodo](#step-4)
- [Step 5 – Initial aur final marking](#step-5)
- [Step 6 – Enabled transitions check karo](#step-6)
- [Step 7 – Ek latte start karo](#step-7)
- [Step 8 – Original model ko complete run karo (deadlock)](#step-8)
- [Step 9 – Deadlock fix: restock + inhibitor arc](#step-9)
- [Step 10 – Restock fire karke pending latte complete karo](#step-10)
- [Step 11 – State-space analysis](#step-11)
- [Step 12 – PNML me save aur load karo](#step-12)

**Part B – Process mining**
- [Step 13 – Sample event log banao](#step-13)
- [Step 14 – Event log format karo aur variants dekho](#step-14)
- [Step 15 – Directly-Follows Graph (DFG)](#step-15)
- [Step 16 – Event data se Petri net discover karo](#step-16)
- [Step 17 – Conformance checking](#step-17)
- [Step 18 – Final outputs save karo](#step-18)
- [Expected results](#results)

---

# Part A – Petri net modelling

<a id="step-1"></a>
## Step 1 – Imports

```python
import os, warnings
os.environ["PM4PY_SHOW_PROGRESS_BAR"] = "False"   # progress bars band
warnings.filterwarnings("ignore")

import pm4py
from pm4py.objects.petri_net.obj import PetriNet, Marking, InhibitorNet
from pm4py.objects.petri_net.utils.petri_utils import add_arc_from_to as arc
from pm4py.objects.petri_net.inhibitor_reset.semantics import InhibitorResetSemantics
from pm4py.objects.petri_net.utils import reachability_graph as rg

# Firing rules jo inhibitor arcs bhi samajhte hain (Step 9 me chahiye)
semantics = InhibitorResetSemantics()

print("PM4Py version:", pm4py.__version__)
```

PM4Py import par licence banner print karta hai – ye error nahi hai.

---

<a id="step-2"></a>
## Step 2 – Places banao

PM4Py me token sirf **count** hai, data nahi. Isliye drink type alag places me jaata hai (latte aur espresso ke liye alag).

```python
net = InhibitorNet("CoffeeShop")   # PetriNet jo inhibitor arcs bhi allow karta hai

P = {}
for name in ["latte_orders", "espresso_orders", "baristas", "milk",
             "brewing_latte", "brewing_espresso", "served"]:
    P[name] = PetriNet.Place(name)
    net.places.add(P[name])

print("Places:", sorted(P))
```

---

<a id="step-3"></a>
## Step 3 – Transitions banao

```python
T = {}
for name in ["start_latte", "start_espresso", "finish_latte", "finish_espresso"]:
    T[name] = PetriNet.Transition(name, name)   # (name, label)
    net.transitions.add(T[name])

print("Transitions:", sorted(T))
```

---

<a id="step-4"></a>
## Step 4 – Arcs jodo

Guards nahi hain, isliye "latte ko milk chahiye" bas ek arc hai: `milk -> start_latte`.

```python
# Latte: order + barista + milk lo, brewing me daalo
arc(P["latte_orders"], T["start_latte"], net)
arc(P["baristas"], T["start_latte"], net)
arc(P["milk"], T["start_latte"], net)
arc(T["start_latte"], P["brewing_latte"], net)

# Espresso: order + barista lo (milk nahi chahiye)
arc(P["espresso_orders"], T["start_espresso"], net)
arc(P["baristas"], T["start_espresso"], net)
arc(T["start_espresso"], P["brewing_espresso"], net)

# Finish: order served, barista wapas free
for d in ("latte", "espresso"):
    arc(P[f"brewing_{d}"], T[f"finish_{d}"], net)
    arc(T[f"finish_{d}"], P["served"], net)
    arc(T[f"finish_{d}"], P["baristas"], net)

print("Arcs:", len(net.arcs))
```

Expected: `Arcs: 13`

---

<a id="step-5"></a>
## Step 5 – Initial aur final marking

`im` = starting state, `fm` = "kaam khatam" state (teeno orders served, dono baristas free).

```python
im = Marking({P["latte_orders"]: 2, P["espresso_orders"]: 1,
              P["baristas"]: 2, P["milk"]: 1})
fm = Marking({P["served"]: 3, P["baristas"]: 2})

print("Initial:", im)
print("Final:  ", fm)
```

**Samjho:** `im` starting state hai, aur `fm` woh state hai jahan saare orders serve ho chuke hain aur dono baristas free hain.

---

<a id="step-6"></a>
## Step 6 – Enabled transitions check karo

```python
enabled = semantics.enabled_transitions(net, im)

print("Enabled transitions:")
for transition in enabled:
    print(transition.name)
```

Expected: `start_latte` aur `start_espresso` enabled hone chahiye.
- Latte start karne ke liye order, barista aur milk chahiye.
- Espresso start karne ke liye order aur barista chahiye.

---

<a id="step-7"></a>
## Step 7 – Ek latte start karo

`execute` ek **naya marking** return karta hai, purana `im` change nahi hota.

```python
m1 = semantics.execute(T["start_latte"], net, im)

print("After starting one latte:")
for place, count in m1.items():
    print(place.name, "=", count)

print("\nEnabled transitions after latte starts:")
for transition in semantics.enabled_transitions(net, m1):
    print(transition.name)
```

Ab milk token consume ho chuka hai. Isliye `start_latte` dobara fire nahi ho sakta, lekin espresso abhi bhi start ho sakta hai.

---

<a id="step-8"></a>
## Step 8 – Original model ko complete run karo

Pehle `m1` me ek latte start kiya tha. Ab espresso start karo, phir dono brewing orders finish karo.

```python
# Start espresso after the first latte
m2 = semantics.execute(T["start_espresso"], net, m1)

# Finish the latte
m3 = semantics.execute(T["finish_latte"], net, m2)

# Finish the espresso
m4 = semantics.execute(T["finish_espresso"], net, m3)

print("Marking after both drinks finish:")
for place, count in m4.items():
    print(place.name, "=", count)

print("Enabled transitions:", [
    t.name for t in semantics.enabled_transitions(net, m4)
])
```

Expected: `latte_orders = 1`, `served = 2`, `baristas = 2`, aur koi transition enabled nahi (`[]`).
Ye **deadlock** hai: ek latte pending hai, lekin milk nahi bacha.

---

<a id="step-9"></a>
## Step 9 – Deadlock fix karo: restock + inhibitor arc

Inhibitor arc ka matlab: restock tabhi fire ho sakta hai jab `milk` place me **zero** tokens hon.

```python
# Add a restock transition
T["restock"] = PetriNet.Transition("restock", "restock")
net.transitions.add(T["restock"])

# Inhibitor arc: restock enabled only when milk has zero tokens
arc(P["milk"], T["restock"], net, type="inhibitor")

# Restock produces one milk token
arc(T["restock"], P["milk"], net)

print("Restock transition and inhibitor arc added!")
print("Places:", len(net.places))
print("Transitions:", len(net.transitions))
print("Arcs:", len(net.arcs))
```

Expected: `Places: 7`, `Transitions: 5`, `Arcs: 15`

> Note: inhibitor arc ke liye `InhibitorResetSemantics` hi use karna (Step 1). PM4Py ka normal `semantics` module inhibitor arc ko normal arc samajhta hai, tab restock kabhi fire nahi hoga.

---

<a id="step-10"></a>
## Step 10 – Restock fire karke pending latte complete karo

```python
# Restock from the deadlocked marking
m5 = semantics.execute(T["restock"], net, m4)

# Start the remaining latte
m6 = semantics.execute(T["start_latte"], net, m5)

# Finish that latte
m7 = semantics.execute(T["finish_latte"], net, m6)

print("Final marking:")
for place, count in m7.items():
    print(place.name, "=", count)

print("Expected completion:", m7 == fm)
```

Expected final state me `served = 3` aur `baristas = 2` honge. `m7 == fm` → `True`.

---

<a id="step-11"></a>
## Step 11 – State-space analysis

State-space analysis = model ki **saari** reachable markings explore karna (sirf ek run nahi).
Deadlock = aisi marking jahan koi transition enabled nahi aur kaam khatam nahi hua.

```python
def check_deadlocks(net, im, final, label):
    _, outgoing, _ = rg.marking_flow_petri(
        net, im, parameters={rg.Parameters.PETRI_SEMANTICS: semantics})
    dead = [m for m, nxt in outgoing.items() if not nxt and m != final]
    print(f"[{label}] reachable markings: {len(outgoing)} | deadlocks: {len(dead)}")
    for m in dead:
        print("   deadlock:", m)

# Fix ke baad final state me milk = 1 bhi hota hai (restock wapas bhar deta hai)
fm_fixed = Marking({P["served"]: 3, P["baristas"]: 2, P["milk"]: 1})
check_deadlocks(net, im, fm_fixed, "with restock")
```

Expected: `[with restock] reachable markings: 31 | deadlocks: 0`

> Original model (Step 9 se pehle) par yahi function chalao to `reachable markings: 9 | deadlocks: 1` aata hai – ek latte milk ke bina atka hua. SNAKES/cpnpy me 15 states aate hain; PM4Py me 9 kyunki tokens ki identity nahi hoti ("order 2 atka" aur "order 3 atka" ek hi marking hai).

---

<a id="step-12"></a>
## Step 12 – Petri net ko PNML me save karo

PNML Petri net models ko save/share karne ka standard XML format hai.

```python
pm4py.write_pnml(net, im, fm, "coffee_shop.pnml")
print("Saved coffee_shop.pnml")
```

Read back karne ke liye:

```python
loaded_net, loaded_im, loaded_fm = pm4py.read_pnml("coffee_shop.pnml")

print("PNML loaded!")
print("Places:", len(loaded_net.places))
print("Transitions:", len(loaded_net.transitions))
```

Expected: `Places: 7`, `Transitions: 5` (inhibitor arc bhi save hota hai).

---

# Part B – PM4Py ka main use: Process Mining

Ab tak humne manually Petri net banaya. Ab PM4Py ko process ka **event data** denge, aur woh batayega ki process me actually kya ho raha hai.

<a id="step-13"></a>
## Step 13 – Sample event log banao

Har event me case ID, activity, timestamp aur resource hoga. Ye demo data hai, real coffee shop ka data nahi.

```python
import pandas as pd
from datetime import datetime, timedelta

# Four observed process patterns
patterns = (
    [["Place order", "Steam milk", "Brew coffee", "Serve"]] * 100
    + [["Place order", "Brew coffee", "Serve"]] * 64
    + [["Place order", "Brew coffee", "Steam milk", "Serve"]] * 30
    + [["Place order", "Serve"]] * 6           # mistake: brew hi nahi hua
)

rows = []
base_time = datetime(2026, 1, 1, 9, 0)

for i, activities in enumerate(patterns, start=1):
    start_time = base_time + timedelta(minutes=i * 10)

    for j, activity in enumerate(activities):
        rows.append({
            "case": f"order-{i}",
            "activity": activity,
            "time": start_time + timedelta(minutes=j * 2),
            "org:resource": (
                "Cashier" if activity == "Place order"
                else ["Asha", "Ravi"][i % 2]
            )
        })

df = pd.DataFrame(rows)
print(df.head(10))
print("Total orders:", df["case"].nunique())
print("Total events:", len(df))
```

Expected: `Total orders: 200`, `Total events: 724`

**Concept:** ek case = ek order. Us order me multiple activities ho sakti hain. Yahi event log ka basic structure hai.

---

<a id="step-14"></a>
## Step 14 – Event log format karo aur variants dekho

```python
log = pm4py.format_dataframe(
    df,
    case_id="case",
    activity_key="activity",
    timestamp_key="time"
)

variants = pm4py.get_variants(log)

print("Distinct process variants:", len(variants))
print("\nVariants and their frequencies:")

for variant, count in variants.items():      # count ek number hai
    print(count, "cases:", " -> ".join(variant))
```

Variants = alag-alag activity sequences. Hamare data me 4 patterns hain: `100, 64, 30, 6`.

---

<a id="step-15"></a>
## Step 15 – Directly-Follows Graph (DFG) discover karo

DFG batata hai ki ek activity ke baad kaunsi activity kitni baar hoti hai.

```python
dfg, start_activities, end_activities = pm4py.discover_dfg(log)

print("Start activities:", start_activities)
print("End activities:", end_activities)

print("\nActivity-to-activity counts:")
for (source, target), count in sorted(dfg.items()):
    print(f"{source} -> {target}: {count}")
```

Expected start activity `Place order` (200 cases), end activity `Serve`.

Ab waiting times bhi dekhte hain:

```python
performance_dfg, _, _ = pm4py.discover_performance_dfg(log)

print("Mean time between activities (seconds):")
for edge, stats in performance_dfg.items():     # stats ek dict hai: mean, median, max ...
    print(f"{edge[0]} -> {edge[1]}: {stats['mean']:.1f}")
```

Is demo data me har step 2 minute ka hai, isliye har edge `120.0` seconds aayega.

---

<a id="step-16"></a>
## Step 16 – Event data se Petri net discover karo

Ab model manually define karne ke bajaye PM4Py ko event log se process discover karne denge.

```python
discovered_net, discovered_im, discovered_fm = (
    pm4py.discover_petri_net_inductive(
        log,
        noise_threshold=0.2
    )
)

print("Discovered Petri Net!")
print("Places:", len(discovered_net.places))
print("Transitions:", len(discovered_net.transitions))
print("Process tree:", pm4py.discover_process_tree_inductive(log, noise_threshold=0.2))
```

Inductive Miner log se process structure seekhta hai. `noise_threshold=0.2` rare behaviour (jaise 6 galat orders) ko filter karta hai.
Process tree me `+( ... )` ka matlab **parallel**: "Steam milk" aur "Brew coffee" kisi bhi order me ho sakte hain.

---

<a id="step-17"></a>
## Step 17 – Conformance checking

Sawal: **kya observed event log hamare process model ko follow karta hai?**

Pehle token-based replay fitness:

```python
fitness = pm4py.fitness_token_based_replay(
    log,
    discovered_net,
    discovered_im,
    discovered_fm
)

print(fitness)
```

Alignments se exact deviations bhi milte hain:

```python
alignment_fitness = pm4py.fitness_alignments(
    log, discovered_net, discovered_im, discovered_fm
)
print("Alignment fitness:", round(alignment_fitness["log_fitness"], 3))
```

Discovered model usi log se seekha gaya hai, isliye uski fitness ko independent validation mat samajhna. Real use me model aur validation data alag rakhna behtar hota hai.

---

<a id="step-18"></a>
## Step 18 – Final outputs save karo

```python
# Save the event log as CSV
df.to_csv("coffee_shop_event_log.csv", index=False)

# Save the discovered Petri net as PNML
pm4py.write_pnml(
    discovered_net,
    discovered_im,
    discovered_fm,
    "coffee_shop_discovered.pnml"
)

print("Saved event log and discovered Petri Net!")
```

---

<a id="results"></a>
## Expected results

| Step | Result |
|---|---|
| 6 | `start_latte`, `start_espresso` enabled |
| 8 | Deadlock: `latte_orders = 1`, `served = 2`, koi transition enabled nahi |
| 10 | `m7 == fm` → `True` |
| 11 | Original: 9 markings, 1 deadlock → fix ke baad: 31 markings, 0 deadlocks |
| 13 | 200 orders, 724 events |
| 14 | 4 variants: 100, 64, 30, 6 |
| 16 | "Steam milk" aur "Brew coffee" parallel discover hote hain |

**PM4Py se kya seekha:**
- Petri net banana, fire karna, deadlock dhoondhna (P/T nets – tokens sirf count)
- Guard nahi hote, isliye fix inhibitor arc se
- Event log se process discover karna aur model ko real data se compare karna
