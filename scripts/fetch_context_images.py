"""Download a Wikipedia lead image for Context-Reranker substitutes that have no local photo.
Saves to eval/public/ctx_<name>.jpg. Run: python3 eval/scripts/fetch_context_images.py"""
import json, os, time, urllib.parse, urllib.request
OUT = os.path.join(os.path.dirname(__file__), '..', 'public')
UA = {'User-Agent': 'GastroGraphHumanEval/1.0 (academic research)'}
PAGES = {
 'agave syrup': 'Agave syrup', 'almond milk': 'Almond milk', 'baby shrimp': 'Shrimp and prawn as food',
 'bean sprout': 'Bean sprout', 'black walnut': 'Juglans nigra', 'brazil nut': 'Brazil nut',
 'broccoli spear': 'Broccoli', 'brown sugar': 'Brown sugar', 'caramel sauce': 'Caramel',
 'chard leaf': 'Chard', 'ciabatta': 'Ciabatta', 'citrus peel': 'Zest (ingredient)', 'cod fish fillet': 'Cod as food',
 'cooked basmati rice': 'Basmati', 'duck fat': 'Duck fat', 'epazote': 'Dysphania ambrosioides',
 'fresh chervil': 'Chervil', 'fresh goat cheese': 'Goat cheese', 'golden beet': 'Beetroot', 'green pepper': 'Bell pepper',
 'gremolata': 'Gremolata', 'head of cabbage': 'Cabbage', 'lean stewing beef': 'Beef', 'littleneck clam': 'Mercenaria mercenaria',
 'low fat whipping cream': 'Whipped cream', 'mint jelly': 'Mint sauce', 'mung bean': 'Mung bean', 'octopus': 'Octopus as food',
 'orange flower water': 'Orange flower water', 'parsley root': 'Parsley root', 'pastrami': 'Pastrami', 'pepper': 'Black pepper',
 'pork fat': 'Lard', 'schmaltz': 'Schmaltz', 'sliced water chestnut': 'Eleocharis dulcis', 'small potato': 'Potato',
 'snail': 'Escargot', 'sorghum': 'Sorghum bicolor', 'sorrel': 'Sorrel', 'swordfish': 'Swordfish',
 'tamari soy sauce': 'Soy sauce', 'whipped cream cheese': 'Cream cheese', 'white truffle': 'Tuber magnatum', 'winter squash': 'Winter squash',
}
def get(url):
    for i in range(5):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
        except Exception as e:
            if i == 4: raise
            time.sleep(15 * (i + 1))
for name, page in PAGES.items():
    dest = os.path.join(OUT, 'ctx_' + name.replace(' ', '_') + '.jpg')
    if os.path.exists(dest): continue
    q = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode(
        {'action': 'query', 'prop': 'pageimages', 'piprop': 'thumbnail', 'pithumbsize': 600,
         'titles': page, 'redirects': 1, 'format': 'json'})
    pages = json.loads(get(q))['query']['pages']
    thumb = next(iter(pages.values())).get('thumbnail', {}).get('source')
    if not thumb: print('NO IMAGE', name, page); continue
    open(dest, 'wb').write(get(thumb)); print('ok', name); time.sleep(2)
