# Coffee shop as a Petri net in PM4Py  (pip install pm4py)
import os, warnings
os.environ["PM4PY_SHOW_PROGRESS_BAR"] = "False"
warnings.filterwarnings("ignore")
import pm4py
from pm4py.objects.petri_net.obj import PetriNet, Marking, InhibitorNet
from pm4py.objects.petri_net.utils.petri_utils import add_arc_from_to as arc
from pm4py.objects.petri_net.inhibitor_reset.semantics import InhibitorResetSemantics
from pm4py.objects.petri_net.utils import reachability_graph as rg

net = InhibitorNet("CoffeeShop")
P = {n: PetriNet.Place(n) for n in ["latte_orders", "espresso_orders", "baristas", "milk",
                                    "brewing_latte", "brewing_espresso", "served"]}
T = {n: PetriNet.Transition(n, n) for n in ["start_latte", "start_espresso",
                                            "finish_latte", "finish_espresso"]}
net.places.update(P.values()); net.transitions.update(T.values())

arc(P["latte_orders"], T["start_latte"], net); arc(P["baristas"], T["start_latte"], net)
arc(P["milk"], T["start_latte"], net)                  # latte uses the milk token
arc(T["start_latte"], P["brewing_latte"], net)
arc(P["espresso_orders"], T["start_espresso"], net); arc(P["baristas"], T["start_espresso"], net)
arc(T["start_espresso"], P["brewing_espresso"], net)
for d in ("latte", "espresso"):
    arc(P[f"brewing_{d}"], T[f"finish_{d}"], net); arc(T[f"finish_{d}"], P["served"], net)
    arc(T[f"finish_{d}"], P["baristas"], net)          # barista free again

im = Marking({P["latte_orders"]: 2, P["espresso_orders"]: 1, P["baristas"]: 2, P["milk"]: 1})
fm = Marking({P["served"]: 3, P["baristas"]: 2})       # final marking = all served

sem = InhibitorResetSemantics()


def check(final):
    _, out, _ = rg.marking_flow_petri(net, im, parameters={rg.Parameters.PETRI_SEMANTICS: sem})
    dead = [m for m, nxt in out.items() if not nxt and m != final]
    print("states:", len(out), "| deadlocks:", len(dead))


print(sorted(t.name for t in sem.enabled_transitions(net, im)))
m1 = sem.execute(T["start_latte"], net, im)            # returns a new marking
print(m1)
check(fm)                                              # states: 9 | deadlocks: 1

# fix: restock only when milk is empty -> inhibitor arc
T["restock"] = PetriNet.Transition("restock", "restock"); net.transitions.add(T["restock"])
arc(P["milk"], T["restock"], net, type="inhibitor")
arc(T["restock"], P["milk"], net)
check(Marking({P["served"]: 3, P["baristas"]: 2, P["milk"]: 1}))   # states: 31 | deadlocks: 0
pm4py.write_pnml(net, im, fm, "coffee_shop.pnml")
