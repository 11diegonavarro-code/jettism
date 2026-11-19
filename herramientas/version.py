# Pone al día la versión del juego en index.html antes de publicar: la lista de módulos JS y una marca que cambia con
# su contenido. Al abrir la página, si la marca es distinta de la guardada, el navegador vuelve a descargar todos los
# módulos (saltándose su caché) antes de arrancar. Uso: python -I herramientas/version.py
import hashlib, pathlib, re, json
root = pathlib.Path(__file__).resolve().parent.parent
files = sorted(str(p.relative_to(root)).replace('\\', '/') for p in (root / 'js').rglob('*.js'))
h = hashlib.sha1()
for f in files: h.update((root / f).read_bytes())
ver = h.hexdigest()[:10]
idx = root / 'index.html'
t = idx.read_text(encoding='utf-8')
loader = f'''<script type="module">
// Arranque con versión: si los archivos del juego han cambiado desde la última visita, se descargan de nuevo
// (saltándose la caché del navegador) antes de arrancar, para que nadie juegue con una mezcla de versiones.
const V = '{ver}', FILES = {json.dumps(files)};
let old = null; try {{ old = localStorage.getItem('jt-ver'); }} catch {{}}
if (old !== V) {{ try {{ await Promise.all(FILES.map(f => fetch(f, {{ cache: 'reload' }}))); localStorage.setItem('jt-ver', V); }} catch {{}} }}
await import('./js/main.js');
</script>'''
t2 = re.sub(r'<script type="module">\n// Arranque con versión:.*?</script>|<script type="module" src="js/main.js"></script>', lambda m: loader, t, count=1, flags=re.S)
assert t2 != t or ver in t, 'no se encontró el script principal'
idx.write_text(t2, encoding='utf-8')
print('versión', ver, '·', len(files), 'módulos')
