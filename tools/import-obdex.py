#!/usr/bin/env python3
"""OBDex (YAML) -> AC OBD (JSON) çevirici.

İstifadə:
    python3 tools/import-obdex.py /yol/OBDex-main

OBDex-in data/generic/*_enriched.yaml, data/pids/*.yaml və schema/*.json
fayllarını oxuyur, bu layihədə aşağıdakıları yazır:
    data/obdex/generic/<Ailə>.json   (B0xxx, C0xxx, P0xxx, P2xxx, P3xxx, U0xxx, U3xxx)
    data/obdex/pids/mode01.json, mode09.json
    schema/code.schema.json, schema/pid.schema.json
Hər kod ayrı sətirdə yazılır (git fərqləri oxunaqlı olsun deyə).
Tələb: pip install pyyaml
"""
import glob, json, os, shutil, sys

try:
    import yaml
except ImportError:
    sys.exit('PyYAML yoxdur: pip install pyyaml')

LOADER = getattr(yaml, 'CSafeLoader', yaml.SafeLoader)


def dump_list(path, items):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('[\n')
        f.write(',\n'.join(json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in items))
        f.write('\n]\n')


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    total = 0
    for f in sorted(glob.glob(os.path.join(src, 'data', 'generic', '*_enriched.yaml'))):
        fam = os.path.basename(f).split('_')[0]
        with open(f, encoding='utf-8') as fh:
            items = yaml.load(fh, Loader=LOADER)
        dump_list(os.path.join(root, 'data', 'obdex', 'generic', fam + '.json'), items)
        total += len(items)
        print(fam, len(items))
    for f in sorted(glob.glob(os.path.join(src, 'data', 'pids', '*.yaml'))):
        with open(f, encoding='utf-8') as fh:
            items = yaml.load(fh, Loader=LOADER)
        dump_list(os.path.join(root, 'data', 'obdex', 'pids', os.path.basename(f)[:-5] + '.json'), items)
        print(os.path.basename(f), len(items))
    os.makedirs(os.path.join(root, 'schema'), exist_ok=True)
    for n in ('code.schema.json', 'pid.schema.json'):
        shutil.copyfile(os.path.join(src, 'schema', n), os.path.join(root, 'schema', n))
    print('Cəmi kod:', total)


if __name__ == '__main__':
    main()
