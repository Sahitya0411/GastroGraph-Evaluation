"""Compute the Context Reranker substitute for every eval ingredient.

Each eval ingredient gets a typical dish (scripts/dish_contexts.json) as its recipe
context R; the GastroGraph functional pool is reranked by recipe fit
(alpha=0.6, beta=0.4) and the top-ranked candidate that is not a variant of
the query itself is written to lib/context_subs.json.

Run from the GastroGraph repo root:  python3 eval/scripts/build_context_subs.py
"""
import os, sys, io, re, json, contextlib
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EVAL = os.path.join(ROOT, 'eval')
sys.path.insert(0, os.path.join(ROOT, 'src'))
from disjoint_context import DisjointContextRecommender

with contextlib.redirect_stdout(io.StringIO()):
    rec = DisjointContextRecommender(output_dir=os.path.join(ROOT, 'models'),
                                     input_dir=os.path.join(ROOT, 'data'),
                                     config_dir=os.path.join(ROOT, 'config'))
dishes = json.load(open(os.path.join(EVAL, 'scripts', 'dish_contexts.json')))
pool = re.findall(r'\{ ingredient: "([^"]+)", gastrograph_sub: "([^"]+)", embedding_sub: "([^"]+)" \}',
                  open(os.path.join(EVAL, 'lib', 'questions.ts')).read())
nice = lambda s: s.replace('_', ' ').strip().lower()
out, same_g = {}, 0
for ing, g, e in pool:
    dish, ctx = dishes[ing]
    with contextlib.redirect_stdout(io.StringIO()):
        r = rec.get_substitutes(ing.replace(' ', '_'), top_k=15, show_complements=False,
                                recipe_name=dish, recipe_ingredients=ctx)
    ca = r.get('context_aware') if r else None
    if not ca:
        print(f'!! no context result for {ing}', file=sys.stderr); continue
    # skip variants of the query itself (e.g. kiwi -> "kiwi fruit", squid -> "squid ring")
    q = nice(ing)
    names = [nice(x['name']) for x in ca]
    c = next((n for n in names if q not in n and n not in q), names[0])
    resolved = r['recipe_context'].resolved_nodes if r.get('recipe_context') else []
    same_g += c == g
    out[ing] = {'recipe': dish, 'recipe_ingredients': [nice(x) for x in ctx], 'context_sub': c}
    print(f'{ing:<12} {dish[:28]:<28} R={len(resolved)}/{len(ctx)} ctx={c:<24} gg={g:<22} emb={e}')
json.dump(out, open(os.path.join(EVAL, 'lib', 'context_subs.json'), 'w'), indent=1)
print(f'\n{len(out)} written; context == gastrograph for {same_g}', file=sys.stderr)
