import re, json

with open('C:/Projects/Stella Mobili BOM Tool/StellaMobili_BOM_Tool.html', encoding='utf-8') as f:
    content = f.read()

print('Has DOCTYPE:', content.startswith('<!DOCTYPE'))
print('Has </html>:', content.strip().endswith('</html>'))
print('Has PRICE_DATA:', 'const PRICE_DATA' in content)
print('Has KIT_CATS:', 'KIT_CATS' in content)
print('Has JUN 2026:', 'JUN 2026' in content)
print('Has MAR 2026:', 'MAR 2026' in content)
print('Lines:', content.count('\n'))

# Find PRICE_DATA block
idx = content.find('const PRICE_DATA = ')
if idx == -1:
    print('PRICE_DATA not found')
else:
    # Find the end - look for }; after the JSON
    json_start = idx + len('const PRICE_DATA = ')
    # Find matching close brace
    depth = 0
    i = json_start
    while i < len(content):
        c = content[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                json_end = i + 1
                break
        i += 1
    json_str = content[json_start:json_end]
    try:
        d = json.loads(json_str)
        cats = list(d.get('kitchen', {}).keys())
        print('PRICE_DATA valid JSON: True')
        print('Kitchen categories:', cats)
        for cat in cats:
            print('  ' + cat + ': ' + str(len(d['kitchen'][cat])) + ' items')
    except Exception as e:
        print('PRICE_DATA JSON error:', str(e)[:200])
