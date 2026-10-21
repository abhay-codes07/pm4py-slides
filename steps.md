# Timed Coffee Shop – cpnpy steps

3 orders, 2 baristas, milk sirf 1 latte ke liye.
Espresso **2 min**, latte **4 min**, milk restock **5 min**.

> Har code block ke upar-right me GitHub ka **copy** button hai. Steps ko upar se neeche order me run karo (same notebook / same Python session).

## Steps

- [Step 0 – Setup: colour sets, places, `start` transition](#step-0)
- [Step 1 – `finish` transition banao](#step-1)
- [Step 2 – `restock` transition banao](#step-2)
- [Step 3 – Initial marking set karo](#step-3)
- [Step 4 – Espresso aur latte start karo](#step-4)
- [Step 5 – Restock schedule karo](#step-5)
- [Step 6 – Clock ko next event (2) tak advance karo](#step-6)
- [Step 7 – Espresso finish karo](#step-7)
- [Step 8 – Clock ko 4 tak advance karo](#step-8)
- [Step 9 – Pehla latte finish karo](#step-9)
- [Step 10 – Clock ko 5 tak advance karo](#step-10)
- [Step 11 – Last latte aur restock start karo](#step-11)
- [Step 12 – Clock ko 9 tak advance karo](#step-12)
- [Step 13 – Last latte finish karo](#step-13)
- [Expected timeline](#timeline)
- [Poora code ek saath](#full-code)

---

<a id="step-0"></a>
## Step 0 – Setup: colour sets, places, `start` transition

Install: `pip install cpnpy`

`brewing` aur `milk` **timed** places hain. Delay (`@+N`, `transition_delay`) sirf timed places ke tokens par lagta hai; untimed place me chupchaap ignore ho jaata hai.

```python
from cpnpy.cpn.cpn_imp import CPN, Place, Transition, Arc, Marking, EvaluationContext
from cpnpy.cpn.colorsets import ColorSetParser

# Colour sets (ek line me ek hi colset)
cs = ColorSetParser().parse_definitions("""
colset INT = int;
colset STRING = string;
colset UNIT = unit;
colset ORDER = product(INT, STRING);
colset ORDER_T = product(INT, STRING) timed;
colset INT_T = int timed;
""")

timed_cpn = CPN()

# Places
t_orders = Place("orders", cs["ORDER"])
t_baristas = Place("baristas", cs["UNIT"])
t_milk = Place("milk", cs["INT_T"])          # timed
t_brewing = Place("brewing", cs["ORDER_T"])  # timed
t_served = Place("served", cs["ORDER"])

for p in (t_orders, t_baristas, t_milk, t_brewing, t_served):
    timed_cpn.add_place(p)

# Guard helper: cpnpy har variable ke liye har token try karta hai,
# isliye guard pehle type check karta hai
ctx = EvaluationContext(user_code="""
def is_order(x):
    return isinstance(x, (tuple, list)) and len(x) == 2
""")

# Start transition: order + barista lo, latte ko milk chahiye
t_start = Transition(
    "start",
    guard="is_order(o) and isinstance(m, int) and (o[1] != 'latte' or m > 0)",
    variables=["o", "b", "m"]
)
timed_cpn.add_transition(t_start)

timed_cpn.add_arc(Arc(t_orders, t_start, "o"))
timed_cpn.add_arc(Arc(t_baristas, t_start, "b"))
timed_cpn.add_arc(Arc(t_milk, t_start, "m"))
timed_cpn.add_arc(Arc(t_start, t_milk, "m - 1 if o[1] == 'latte' else m"))

# Brewing time: latte 4 min, espresso 2 min
timed_cpn.add_arc(Arc(t_start, t_brewing, "o @+ (4 if o[1] == 'latte' else 2)"))

print("Setup done!")
```

---

<a id="step-1"></a>
## Step 1 – `finish` transition banao

Jab coffee brewing complete ho jaaye, order `served` me jaayega aur barista wapas available ho jaayega.

```python
# Finish transition
t_finish = Transition(
    "finish",
    variables=["o"]
)

timed_cpn.add_transition(t_finish)

# Brewing se order consume hoga
timed_cpn.add_arc(Arc(t_brewing, t_finish, "o"))

# Order served place me jaayega
timed_cpn.add_arc(Arc(t_finish, t_served, "o"))

# Barista wapas available hoga
timed_cpn.add_arc(Arc(t_finish, t_baristas, "()"))

print("Finish transition created!")
```

---

<a id="step-2"></a>
## Step 2 – `restock` transition banao

Jab milk zero ho jaata hai, restock transition trigger hoga. Milk wapas aane me **5 minutes** lagenge.

```python
t_restock = Transition(
    "restock",
    guard="m == 0",
    variables=["m"],
    transition_delay=5
)

timed_cpn.add_transition(t_restock)

# Zero milk token consume karo
timed_cpn.add_arc(Arc(t_milk, t_restock, "m"))

# Ek milk token wapas produce karo
timed_cpn.add_arc(Arc(t_restock, t_milk, "1"))

print("Restock transition created!")
```

---

<a id="step-3"></a>
## Step 3 – Initial marking set karo

Experiment ko clean initial state se start karenge.

```python
tm = Marking()

tm.set_tokens("orders", [
    (1, "espresso"),
    (2, "latte"),
    (3, "latte")
])

tm.set_tokens("baristas", [(), ()])
tm.set_tokens("milk", [1])

print(tm)
print("Global clock:", tm.global_clock)
```

Initial state me:
- 3 orders hain
- 2 baristas available hain
- 1 milk token hai
- Global clock `0` se start hoga

---

<a id="step-4"></a>
## Step 4 – Espresso aur latte start karo

Dono baristas ko orders assign karenge. Espresso 2 minutes lega, latte 4 minutes.

```python
# Espresso start
timed_cpn.fire_transition(
    t_start,
    tm,
    ctx,
    binding={"o": (1, "espresso"), "b": (), "m": 1}
)

print("Espresso started")
print(tm)
```

Iske baad latte start karne ke liye:

```python
# Latte start
timed_cpn.fire_transition(
    t_start,
    tm,
    ctx,
    binding={"o": (2, "latte"), "b": (), "m": 1}
)

print("Latte started")
print(tm)
```

**Kya hua?** Milk token consume hua (milk = `0`). Brewing tokens apne completion timestamp ke saath store hote hain: espresso `t=2`, latte `t=4`.

---

<a id="step-5"></a>
## Step 5 – Restock schedule karo

Latte ke liye milk use hone ke baad milk zero ho gaya hai. Ab restocking start karenge.

```python
timed_cpn.fire_transition(
    t_restock,
    tm,
    ctx,
    binding={"m": 0}
)

print("Restocking started")
print(tm)
```

Restock ka delay 5 minutes hai, isliye naya milk token time `5` par available hoga (`Token(1, t=5)`).

---

<a id="step-6"></a>
## Step 6 – Clock ko next event tak advance karo

```python
timed_cpn.advance_global_clock(tm)

print("Global clock:", tm.global_clock)
print(tm)
```

Expected clock: `2`. Clock seedha `2` par jaata hai kyunki espresso ka brewing token sabse pehle ready hota hai.

---

<a id="step-7"></a>
## Step 7 – Espresso finish karo

```python
timed_cpn.fire_transition(
    t_finish,
    tm,
    ctx,
    binding={"o": (1, "espresso")}
)

print("Espresso served at clock:", tm.global_clock)
print(tm)
```

Espresso `served` place me chala jaayega aur ek barista free ho jaayega.

---

<a id="step-8"></a>
## Step 8 – Clock ko 4 tak advance karo

```python
timed_cpn.advance_global_clock(tm)

print("Global clock:", tm.global_clock)
print(tm)
```

Expected clock: `4`.

---

<a id="step-9"></a>
## Step 9 – Pehla latte finish karo

```python
timed_cpn.fire_transition(
    t_finish,
    tm,
    ctx,
    binding={"o": (2, "latte")}
)

print("First latte served at clock:", tm.global_clock)
print(tm)
```

Ab espresso aur pehla latte serve ho chuke hain.

---

<a id="step-10"></a>
## Step 10 – Clock ko 5 tak advance karo

```python
timed_cpn.advance_global_clock(tm)

print("Global clock:", tm.global_clock)
print(tm)
```

Expected clock: `5`. Is time par restocking complete ho chuki hai aur milk available hai.

---

<a id="step-11"></a>
## Step 11 – Last latte aur restock start karo

```python
# Third order: latte
timed_cpn.fire_transition(
    t_start,
    tm,
    ctx,
    binding={"o": (3, "latte"), "b": (), "m": 1}
)

print("Last latte started")
print(tm)
```

Milk phir zero ho gaya hai, isliye dobara restock fire karo:

```python
timed_cpn.fire_transition(
    t_restock,
    tm,
    ctx,
    binding={"m": 0}
)

print("Second restock started")
print(tm)
```

Last latte `t=9` par ready hoga, naya milk `t=10` par.

---

<a id="step-12"></a>
## Step 12 – Clock ko 9 tak advance karo

```python
timed_cpn.advance_global_clock(tm)

print("Global clock:", tm.global_clock)
print(tm)
```

Expected clock: `9`.

---

<a id="step-13"></a>
## Step 13 – Last latte finish karo

```python
timed_cpn.fire_transition(
    t_finish,
    tm,
    ctx,
    binding={"o": (3, "latte")}
)

print("Last latte served at clock:", tm.global_clock)
print("Final marking:")
print(tm)
```

Final marking: `orders` khaali, dono baristas free, `served` me teeno orders, milk `Token(1, t=10)`.

---

<a id="timeline"></a>
## Expected timeline

| Clock | Event |
|---|---|
| 0 | Espresso aur pehla latte start |
| 0 | Restocking schedule (milk ready at 5) |
| 2 | Espresso finish |
| 4 | Pehla latte finish |
| 5 | Milk wapas, last latte start |
| 5 | Restocking schedule dobara (milk ready at 10) |
| 9 | Last latte finish – **saare orders served** |

---

<a id="full-code"></a>
## Poora code ek saath

<details>
<summary>Click karke kholo (Step 0 se 13 tak ek hi block)</summary>

```python
from cpnpy.cpn.cpn_imp import CPN, Place, Transition, Arc, Marking, EvaluationContext
from cpnpy.cpn.colorsets import ColorSetParser

cs = ColorSetParser().parse_definitions("""
colset INT = int;
colset STRING = string;
colset UNIT = unit;
colset ORDER = product(INT, STRING);
colset ORDER_T = product(INT, STRING) timed;
colset INT_T = int timed;
""")

timed_cpn = CPN()
t_orders = Place("orders", cs["ORDER"])
t_baristas = Place("baristas", cs["UNIT"])
t_milk = Place("milk", cs["INT_T"])
t_brewing = Place("brewing", cs["ORDER_T"])
t_served = Place("served", cs["ORDER"])
for p in (t_orders, t_baristas, t_milk, t_brewing, t_served):
    timed_cpn.add_place(p)

ctx = EvaluationContext(user_code="""
def is_order(x):
    return isinstance(x, (tuple, list)) and len(x) == 2
""")

t_start = Transition("start", variables=["o", "b", "m"],
                     guard="is_order(o) and isinstance(m, int) and (o[1] != 'latte' or m > 0)")
timed_cpn.add_transition(t_start)
timed_cpn.add_arc(Arc(t_orders, t_start, "o"))
timed_cpn.add_arc(Arc(t_baristas, t_start, "b"))
timed_cpn.add_arc(Arc(t_milk, t_start, "m"))
timed_cpn.add_arc(Arc(t_start, t_milk, "m - 1 if o[1] == 'latte' else m"))
timed_cpn.add_arc(Arc(t_start, t_brewing, "o @+ (4 if o[1] == 'latte' else 2)"))

t_finish = Transition("finish", variables=["o"])
timed_cpn.add_transition(t_finish)
timed_cpn.add_arc(Arc(t_brewing, t_finish, "o"))
timed_cpn.add_arc(Arc(t_finish, t_served, "o"))
timed_cpn.add_arc(Arc(t_finish, t_baristas, "()"))

t_restock = Transition("restock", guard="m == 0", variables=["m"], transition_delay=5)
timed_cpn.add_transition(t_restock)
timed_cpn.add_arc(Arc(t_milk, t_restock, "m"))
timed_cpn.add_arc(Arc(t_restock, t_milk, "1"))

tm = Marking()
tm.set_tokens("orders", [(1, "espresso"), (2, "latte"), (3, "latte")])
tm.set_tokens("baristas", [(), ()])
tm.set_tokens("milk", [1])

def fire(t, binding):
    timed_cpn.fire_transition(t, tm, ctx, binding=binding)
    print(f"clock {tm.global_clock}: {t.name} {binding.get('o', '')}")

def tick():
    timed_cpn.advance_global_clock(tm)
    print("-> clock", tm.global_clock)

fire(t_start, {"o": (1, "espresso"), "b": (), "m": 1})
fire(t_start, {"o": (2, "latte"), "b": (), "m": 1})
fire(t_restock, {"m": 0})
tick()                                        # 2
fire(t_finish, {"o": (1, "espresso")})
tick()                                        # 4
fire(t_finish, {"o": (2, "latte")})
tick()                                        # 5
fire(t_start, {"o": (3, "latte"), "b": (), "m": 1})
fire(t_restock, {"m": 0})
tick()                                        # 9
fire(t_finish, {"o": (3, "latte")})
print(tm)
```

</details>
