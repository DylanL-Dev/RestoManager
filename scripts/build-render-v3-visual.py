#!/usr/bin/env python3
"""Build a visual-only copy of the existing V3 UI for Render.
No Supabase writes, no local booking actions, no production deploy.
"""
from pathlib import Path
import re, shutil
root=Path(__file__).resolve().parent.parent
out=root/'render-v3-visual'
out.mkdir(exist_ok=True)
for item in root.iterdir():
    if item.is_file() and item.suffix in ('.html','.css','.js','.json','.svg','.png','.ico','.webp'):
        shutil.copy2(item,out/item.name)
shutil.copytree(root/'asset',out/'asset',dirs_exist_ok=True)
html=(root/'index.html').read_text(encoding='utf-8')
# Preserve the exact V3 markup, theme and assets, but disable application scripts
# until the Supabase-backed implementation is ready.
html=re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html, flags=re.I)
html=re.sub(r'<script\b[^>]*/>', '', html, flags=re.I)
banner='''<style>
#previewNotice{position:fixed;z-index:999999;top:0;left:0;right:0;padding:12px 18px;background:#103e31;color:#fff;font:600 14px system-ui;text-align:center;box-shadow:0 3px 16px #0003}
body{padding-top:52px!important}body>*:not(#previewNotice){pointer-events:none!important}
</style><div id="previewNotice" role="status">Préversion visuelle V3 · interactions désactivées jusqu’au raccordement sécurisé Supabase</div>'''
html=html.replace('<body>', '<body>'+banner,1)
(out/'index.html').write_text(html,encoding='utf-8')
print('Visual-only V3 staging ready:',out)
