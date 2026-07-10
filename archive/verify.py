import json
with open('C:/Projects/Stella Mobili BOM Tool/archive/sm_price_data.json') as f:
    d = json.load(f)
for cat, items in d['kitchen'].items():
    if items:
        it = items[0]
        desc = it['desc']
        subcat = it.get('subcat','')
        prices_sample = dict(list(it['prices'].items())[:2])
        print(cat + ': ' + desc + ' | ' + subcat)
        print('  prices: ' + str(prices_sample))
