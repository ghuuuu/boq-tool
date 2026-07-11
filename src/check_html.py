import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(ROOT, 'StellaMobili_BOM_Tool.html'), encoding='utf-8') as f:
    content = f.read()

body_idx = content.find('<body>')
print('Body tag at:', body_idx)
print('After body tag:')
print(content[body_idx:body_idx+300])

print()
print('Topbar in HTML:', '<header class="topbar">' in content)
print('Shell in HTML:', '<div class="shell">' in content)
print('Sidebar in HTML:', '<aside class="sidebar"' in content)
print('Script tag:', '<script>' in content)

# Check if the header portion was captured correctly
header_end = content.find('<script>')
print('Content before script tag (last 100):', content[header_end-100:header_end])
