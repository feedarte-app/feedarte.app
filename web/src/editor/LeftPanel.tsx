import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Store, Type, Image as ImageIcon, Shapes, Layers, Plus, ChevronRight, FolderOpen, Sparkles, Eye, EyeOff, Lock, Unlock, Upload, Trash2, Search, GitBranch, Square, Circle, Minus, Triangle, Star, GripVertical, LayoutTemplate,
} from 'lucide-react';
import type { DesignDoc, FeedField, Layer, LayerGroup, LogoMaps, ProductData } from '../../../src/shared/types';
import { COMPUTED_FIELDS, ProductContext, renderTemplate } from '../../../src/shared/fields';
import { makeIcon, makeImage, makeShape, makeText, IF_DISCOUNT, makePriceBlock, makeDiscountBadge } from '../../../src/shared/layers';
import { LogoLibrary } from './LogoLibrary';
import { api, imgProxy } from '../api';
import { useToast } from '../ui';
import { DesignPreview } from './Preview';

export type LeftTab = 'product' | 'text' | 'photo' | 'objects' | 'layers' | 'templates';

const IMAGE_KEYS = ['image_link', 'additional_image_link', 'picture', 'image', 'images'];
const PRICE_KEYS = ['price', 'sale_price', 'current_price_fmt', 'price_fmt', 'sale_price_fmt', 'old_price_fmt'];
const DISCOUNT_KEYS = ['discount_percent', 'discount_amount_fmt', 'has_discount'];
const MAIN_KEYS = ['title', 'brand', 'description', 'product_type'];

interface Props {
  tab: LeftTab;
  setTab: (t: LeftTab) => void;
  doc: DesignDoc;
  fields: FeedField[];
  product: ProductData | null;
  projectId: string;
  formatId: string;
  sel: string[];
  setSel: (ids: string[]) => void;
  pick: (id: string | null, additive: boolean) => string[];
  addLayer: (l: Layer) => void;
  addGroup: (layers: Layer[], name: string) => void;
  maps: LogoMaps;
  onLogosChanged: () => void;
  update: (fn: (d: DesignDoc) => DesignDoc, key?: string) => void;
  applyTemplate: (doc: DesignDoc) => void;
}

export function LeftRail({ tab, setTab }: { tab: LeftTab; setTab: (t: LeftTab) => void }) {
  const items: [LeftTab, string, any][] = [
    ['product', 'Товар', Store],
    ['text', 'Текст', Type],
    ['photo', 'Фото', ImageIcon],
    ['objects', "Об'єкти", Shapes],
    ['layers', 'Шари', Layers],
    ['templates', 'Шаблони', LayoutTemplate],
  ];
  return (
    <div className="w-[84px] flex flex-col items-center py-3 px-2 gap-1.5 shrink-0">
      {items.map(([t, label, Icon]) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`flex flex-col items-center justify-center gap-1 w-full h-[64px] rounded-2xl border transition-all duration-150 ${tab === t ? 'bg-brand-50 border-brand-200 text-brand-600 shadow-[0_4px_14px_-6px_rgba(255,107,26,.45)]' : 'border-transparent text-ink-700 hover:bg-ink-100'}`}
        >
          <Icon className="w-5 h-5" strokeWidth={1.75} />
          <span className={`text-[11px] ${tab === t ? 'font-semibold' : 'text-ink-500'}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function LeftPanel(p: Props) {
  return (
    <div key={p.tab} className="w-[296px] border-l border-ink-100 overflow-y-auto shrink-0 animate-fade-in">
      {p.tab === 'product' && <ProductTab {...p} />}
      {p.tab === 'text' && <TextTab {...p} />}
      {p.tab === 'photo' && <PhotoTab {...p} />}
      {p.tab === 'objects' && <ObjectsTab {...p} />}
      {p.tab === 'layers' && <LayersTab {...p} />}
      {p.tab === 'templates' && <TemplatesTab {...p} />}
    </div>
  );
}

function Title({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="px-4 pt-4 pb-2">
      <div className="text-[17px] font-semibold tracking-tight">{children}</div>
      {hint && <div className="text-xs text-ink-500 mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

function FieldCard({ label, value, onAdd, image }: { label: string; value: string; onAdd: () => void; image?: string }) {
  return (
    <button onClick={onAdd} className="text-left rounded-2xl bg-ink-100 hover:bg-brand-50 hover:shadow-[inset_0_0_0_1px_rgba(255,107,26,.3)] active:scale-[.98] p-3 relative min-h-[76px] flex flex-col group transition-all" title="Додати на полотно">
      {image ? (
        <img src={imgProxy(image)} className="w-full h-20 object-contain rounded-xl bg-white" alt="" loading="lazy" />
      ) : (
        <>
          <span className="text-[13px] font-semibold text-ink-900 leading-tight">{label}</span>
          <span className="text-[12px] text-ink-500 mt-1 line-clamp-2 break-all leading-tight">{value || '—'}</span>
        </>
      )}
      <span className="absolute right-2 bottom-2 w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-ink-500 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 group-hover:text-brand-600 transition-all">
        <Plus className="w-3 h-3" />
      </span>
    </button>
  );
}

function center(doc: DesignDoc, w: number, h: number) {
  return { x: Math.round((doc.width - w) / 2), y: Math.round((doc.height - h) / 2), w, h };
}

function ProductTab({ doc, fields, product, addLayer }: Props) {
  const ctx = useMemo(() => new ProductContext(product ?? {}, doc.format), [product, doc.format]);
  const labelOf = (k: string) => COMPUTED_FIELDS.find((f) => f.key === k)?.label ?? k;
  const keys = fields.map((f) => f.key);
  const images: { key: string; idx: number; url: string }[] = [];
  for (const k of keys.filter((k) => IMAGE_KEYS.includes(k))) ctx.images(k).forEach((url, idx) => images.push({ key: k, idx, url }));
  const addText = (key: string) => {
    const isPrice = PRICE_KEYS.includes(key) || key.includes('price');
    addLayer(
      makeText({
        name: labelOf(key),
        text: `{{${key}}}`,
        ...center(doc, Math.round(doc.width * 0.5), isPrice ? 90 : 70),
        size: isPrice ? 56 : 40,
        weight: isPrice ? 700 : 400,
        decoration: key === 'old_price_fmt' ? 'line-through' : 'none',
        color: key === 'old_price_fmt' ? '#9E9E9E' : '#111111',
        maxLines: key === 'description' ? 3 : key === 'title' ? 2 : 1,
        autoFit: true,
      }),
    );
  };
  const group = (title: string, list: string[]) =>
    list.length > 0 && (
      <div className="px-4 pb-4">
        <div className="eyebrow mb-2">{title}</div>
        <div className="grid grid-cols-2 gap-2">
          {list.map((k) => (
            <FieldCard key={k} label={labelOf(k)} value={ctx.get(k)} onAdd={() => addText(k)} />
          ))}
        </div>
      </div>
    );
  const other = keys.filter((k) => !IMAGE_KEYS.includes(k) && !PRICE_KEYS.includes(k) && !MAIN_KEYS.includes(k));
  return (
    <div>
      <Title hint="Клікніть поле, щоб додати його на полотно. Значення підставляються автоматично для кожного товару.">Товар</Title>
      {images.length > 0 && (
        <div className="px-4 pb-4">
          <div className="eyebrow mb-2">Зображення</div>
          <div className="grid grid-cols-2 gap-2">
            {images.slice(0, 8).map((im) => (
              <FieldCard
                key={im.key + im.idx}
                label=""
                value=""
                image={im.url}
                onAdd={() => addLayer(makeImage({ name: im.idx ? `Фото ${im.idx + 1}` : 'Фото товару', source: { kind: 'field', field: im.key, index: im.idx }, ...center(doc, Math.round(doc.width * 0.6), Math.round(doc.width * 0.6)) }))}
              />
            ))}
          </div>
        </div>
      )}
      {group('Ціна', ['current_price_fmt', 'price_fmt', 'sale_price_fmt', 'old_price_fmt'])}
      {group('Знижка', ['discount_percent', 'discount_amount_fmt'])}
      {group('Основне', MAIN_KEYS.filter((k) => keys.includes(k)))}
      {group('Інше', other)}
    </div>
  );
}

function TextTab({ doc, addLayer, addGroup }: Props) {
  const presets: { label: string; make: () => Layer; preview: string; cls: string }[] = [
    { label: 'Заголовок', preview: 'Заголовок', cls: 'text-2xl font-bold', make: () => makeText({ name: 'Заголовок', text: 'Заголовок', ...center(doc, 700, 100), size: 72, weight: 800, align: 'center', autoFit: true, maxLines: 1 }) },
    { label: 'Підзаголовок', preview: 'Підзаголовок', cls: 'text-lg font-semibold', make: () => makeText({ name: 'Підзаголовок', text: 'Підзаголовок', ...center(doc, 600, 70), size: 44, weight: 600, align: 'center' }) },
    { label: 'Основний текст', preview: 'Основний текст', cls: 'text-sm', make: () => makeText({ name: 'Текст', text: 'Основний текст', ...center(doc, 500, 60), size: 32 }) },
    { label: 'Назва товару', preview: '{{title}}', cls: 'text-sm font-medium', make: () => makeText({ name: 'Назва', text: '{{title}}', ...center(doc, 800, 110), size: 40, weight: 600, maxLines: 2, autoFit: true }) },
    { label: 'Ціна', preview: '1 170 грн', cls: 'text-xl font-bold text-red-600', make: () => makeText({ name: 'Ціна', text: '{{current_price_fmt}}', ...center(doc, 400, 90), size: 60, weight: 800, color: '#E53935' }) },
    { label: 'Стара ціна', preview: '1 470 грн', cls: 'text-base text-ink-400 line-through', make: () => makeText({ name: 'Стара ціна', text: '{{old_price_fmt}}', ...center(doc, 400, 60), size: 36, color: '#9E9E9E', decoration: 'line-through' }) },
    {
      label: 'Бейдж знижки',
      preview: '-30%',
      cls: 'inline-block bg-red-600 text-white font-bold rounded-full px-3',
      make: () => makeText({ name: 'Бейдж знижки', text: '-{{discount_percent}}%', ...center(doc, 300, 80), size: 44, weight: 800, color: '#ffffff', autoWidth: true, align: 'center', bg: { color: '#E53935', radius: 40, padX: 28, padY: 0 } }),
    },
    {
      label: 'Плашка з ціною',
      preview: '1 170 грн',
      cls: 'inline-block bg-ink-900 text-white font-bold rounded-lg px-3',
      make: () => makeText({ name: 'Ціна (плашка)', text: '{{current_price_fmt}}', ...center(doc, 420, 100), size: 50, weight: 800, color: '#ffffff', autoWidth: true, align: 'center', bg: { color: '#111111', radius: 14, padX: 32, padY: 0 } }),
    },
  ];
  return (
    <div>
      <Title hint="Текст може містити змінні фіду, напр. {{brand}} або {{discount_percent}}.">Текст</Title>
      <div className="px-4 pb-4">
        <div className="eyebrow mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-brand-500" /> Розумні блоки</div>
        <div className="space-y-2">
          <SmartBlock
            title="Ціна: стара над новою"
            hint="Є знижка → закреслена стара + нова кольором. Немає → одна ціна."
            onClick={() => {
              const w = Math.round(doc.width * 0.45);
              addGroup(makePriceBlock({ x: Math.round((doc.width - w) / 2), y: Math.round(doc.height * 0.7), w }, 'stack'), 'Блок ціни');
            }}
            preview={
              <div className="flex flex-col items-center leading-none">
                <span className="text-[11px] text-ink-400 line-through">1 470 грн</span>
                <span className="text-[17px] font-extrabold text-[#E53935]">1 170 грн</span>
              </div>
            }
          />
          <SmartBlock
            title="Ціна: в рядок"
            hint="Стара й нова поруч. Без знижки — одна ціна по центру."
            onClick={() => {
              const w = Math.round(doc.width * 0.6);
              addGroup(makePriceBlock({ x: Math.round((doc.width - w) / 2), y: Math.round(doc.height * 0.75), w }, 'row'), 'Блок ціни');
            }}
            preview={
              <div className="flex items-baseline gap-1.5 leading-none">
                <span className="text-[11px] text-ink-400 line-through">1 470</span>
                <span className="text-[16px] font-extrabold text-[#E53935]">1 170 грн</span>
              </div>
            }
          />
          <SmartBlock
            title="Бейдж знижки"
            hint="Коло з «-30%» — лише для товарів зі знижкою."
            onClick={() => {
              const s = Math.round(doc.width * 0.17);
              addGroup(makeDiscountBadge({ x: doc.width - s - Math.round(doc.width * 0.04), y: Math.round(doc.width * 0.04), w: s, h: s }), 'Бейдж знижки');
            }}
            preview={<span className="w-9 h-9 rounded-full bg-[#E53935] text-white text-[11px] font-bold flex items-center justify-center">-30%</span>}
          />
        </div>
      </div>
      <div className="px-4 space-y-2 pb-4">
        <div className="eyebrow mb-2">Текст</div>
        {presets.map((p) => (
          <button key={p.label} onClick={() => addLayer(p.make())} className="w-full text-left rounded-2xl bg-ink-100 hover:bg-brand-50 hover:shadow-[inset_0_0_0_1px_rgba(255,107,26,.3)] active:scale-[.98] px-4 py-3 transition-all">
            <div className="text-[11px] text-ink-400 mb-1">{p.label}</div>
            <div className={p.cls}>{p.preview}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PhotoTab({ doc, projectId, addLayer, maps, onLogosChanged, fields }: Props) {
  const [libOpen, setLibOpen] = useState(false);
  const brandField = fields.some((f) => f.key === 'brand') ? 'brand' : fields.find((f) => /brand|vendor|бренд/i.test(f.key))?.key ?? 'brand';
  const logoCount = Object.keys(maps[brandField] ?? {}).length;
  const [assets, setAssets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const load = () => api.get(`/api/projects/${projectId}/assets`).then((r) => setAssets(r.assets));
  useEffect(() => {
    load();
  }, [projectId]);
  const add = (a: any) => {
    const img = new Image();
    img.onload = () => {
      const max = doc.width * 0.35;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      addLayer(makeImage({ name: a.name, source: { kind: 'url', url: a.url }, ...center(doc, Math.round(img.width * s) || 300, Math.round(img.height * s) || 300) }));
    };
    img.onerror = () => addLayer(makeImage({ name: a.name, source: { kind: 'url', url: a.url }, ...center(doc, 300, 300) }));
    img.src = a.url;
  };
  return (
    <div>
      <Title hint="Логотипи, бейджі, фони — PNG з прозорістю, SVG, JPG, WEBP. Доступні в усіх дизайнах проєкту.">Фото</Title>
      <div className="px-4 pb-4">
        <div className="rounded-2xl bg-gradient-to-b from-brand-50 to-white border border-brand-100 p-3.5">
          <div className="font-semibold text-[14px] flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-brand-500" /> Динамічні логотипи брендів</div>
          <p className="text-xs text-ink-500 mt-1 leading-snug">Кожен товар отримує логотип свого бренду з поля <code>{brandField}</code>. Завантажено: <b className="text-ink-700">{logoCount}</b>.</p>
          <div className="flex gap-2 mt-3">
            <button
              className="btn-primary btn-sm flex-1"
              onClick={() => {
                const w = Math.round(doc.width * 0.28);
                const h = Math.round(w * 0.45);
                addLayer(
                  makeImage({
                    name: 'Логотип бренду',
                    source: { kind: 'map', field: brandField },
                    fit: 'contain',
                    x: Math.round(doc.width * 0.05),
                    y: Math.round(doc.width * 0.05),
                    w,
                    h,
                    fallback: { mode: 'text', font: 'Montserrat', weight: 800, color: '#111111', uppercase: true },
                  }),
                );
              }}
            >
              <Plus className="w-3.5 h-3.5" /> На полотно
            </button>
            <button className="btn-outline btn-sm flex-1" onClick={() => setLibOpen(true)}>
              Бібліотека
            </button>
          </div>
        </div>
        <LogoLibrary open={libOpen} onClose={() => setLibOpen(false)} projectId={projectId} field={brandField} onChanged={onLogosChanged} />
      </div>
      <div className="px-4 pb-3">
        <div className="eyebrow mb-2">Мої зображення</div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            setBusy(true);
            for (const f of files) {
              const fd = new FormData();
              fd.append('file', f);
              try {
                await api.post(`/api/projects/${projectId}/assets`, fd);
              } catch (err) {
                toast((err as Error).message, 'error');
              }
            }
            setBusy(false);
            e.target.value = '';
            load();
          }}
        />
        <button className="btn-outline w-full" onClick={() => input.current?.click()} disabled={busy}>
          <Upload className="w-4 h-4" /> {busy ? 'Завантаження…' : 'Завантажити зображення'}
        </button>
      </div>
      <div className="px-4 grid grid-cols-2 gap-2 pb-4">
        {assets.map((a) => (
          <div key={a.id} className="relative group">
            <button onClick={() => add(a)} className="w-full aspect-square rounded-2xl bg-ink-100 hover:shadow-[inset_0_0_0_1px_rgba(255,107,26,.35)] p-2 transition-all flex items-center justify-center bg-[repeating-conic-gradient(#f3f3f5_0_25%,#fff_0_50%)] bg-[length:14px_14px]">
              <img src={a.url} className="max-w-full max-h-full object-contain" alt={a.name} />
            </button>
            <button
              className="absolute top-1 right-1 w-6 h-6 rounded bg-white/90 border border-ink-200 items-center justify-center hidden group-hover:flex text-red-600"
              onClick={async () => {
                if (!confirm('Видалити зображення? Дизайни, що його використовують, втратять цей елемент.')) return;
                await api.del(`/api/assets/${a.id}`);
                load();
              }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

let iconCache: string[] | null = null;
const POPULAR = ['truck', 'package', 'badge-percent', 'percent', 'flame', 'globe', 'shield-check', 'star', 'heart', 'gift', 'tag', 'clock', 'check-circle', 'sparkles', 'zap', 'shopping-bag', 'shopping-cart', 'credit-card', 'rotate-ccw', 'award', 'crown', 'thumbs-up', 'phone', 'map-pin'];

function ObjectsTab({ doc, addLayer }: Props) {
  const [icons, setIcons] = useState<string[]>(iconCache ?? []);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(48);
  useEffect(() => {
    if (!iconCache)
      api.get('/api/icons').then((r) => {
        iconCache = r.icons;
        setIcons(r.icons);
      });
  }, []);
  const list = q ? icons.filter((i) => i.includes(q.toLowerCase().trim())) : [...POPULAR.filter((p) => icons.includes(p)), ...icons.filter((i) => !POPULAR.includes(i))];
  const s = Math.round(doc.width * 0.3);
  const shapes: [string, any, () => Layer][] = [
    ['Прямокутник', Square, () => makeShape({ name: 'Прямокутник', ...center(doc, s, s) })],
    ['Заокруглений', Square, () => makeShape({ name: 'Плашка', radius: 24, fill: { color: '#111111' }, ...center(doc, s, Math.round(s / 2.5)) })],
    ['Коло', Circle, () => makeShape({ name: 'Коло', shape: 'ellipse', ...center(doc, s, s) })],
    ['Лінія', Minus, () => makeShape({ name: 'Лінія', shape: 'line', fill: null, stroke: { color: '#111111', width: 4 }, ...center(doc, s, 10) })],
    ['Кут', Triangle, () => makeShape({ name: 'Кут', shape: 'triangle', corner: 'tl', x: 0, y: 0, w: Math.round(doc.width * 0.28), h: Math.round(doc.width * 0.28), condition: IF_DISCOUNT })],
    ['Вибух', Star, () => makeShape({ name: 'Бейдж-вибух', shape: 'burst', points: 18, ...center(doc, Math.round(s * 0.7), Math.round(s * 0.7)) })],
  ];
  return (
    <div>
      <Title>Об'єкти</Title>
      <div className="px-4 pb-4">
        <div className="eyebrow mb-2">Фігури</div>
        <div className="grid grid-cols-3 gap-2">
          {shapes.map(([label, Icon, make]) => (
            <button key={label} onClick={() => addLayer(make())} className="aspect-square rounded-2xl bg-ink-100 hover:bg-brand-50 hover:text-brand-600 active:scale-95 flex flex-col items-center justify-center gap-1 transition-all">
              <Icon className={`w-7 h-7 ${label === 'Кут' ? '-rotate-90' : ''}`} strokeWidth={1.5} />
              <span className="text-[11px] text-ink-500">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="eyebrow mb-2">Іконки</div>
        <div className="relative mb-2">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-ink-400" />
          <input className="ed-input pl-8" placeholder="Пошук англ.: truck, gift, star…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(48); }} onKeyDown={(e) => e.stopPropagation()} />
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {list.slice(0, limit).map((name) => (
            <button
              key={name}
              title={name}
              onClick={() => addLayer(makeIcon({ name: `Іконка ${name}`, icon: name, ...center(doc, Math.round(doc.width * 0.08), Math.round(doc.width * 0.08)) }))}
              className="aspect-square rounded-xl bg-ink-100 hover:bg-brand-50 active:scale-95 flex items-center justify-center transition-all"
            >
              <img src={`/api/icons/${name}.svg?color=%23111111&sw=1.75`} className="w-6 h-6" alt={name} loading="lazy" />
            </button>
          ))}
        </div>
        {list.length > limit && (
          <button className="btn-outline btn-sm w-full mt-2" onClick={() => setLimit(limit + 96)}>
            <Plus className="w-3.5 h-3.5" /> Показати більше іконок
          </button>
        )}
      </div>
    </div>
  );
}

const TYPE_ICON: Record<string, any> = { text: Type, image: ImageIcon, shape: Square, icon: Star };

function LayersTab({ doc, sel, setSel, update }: Props) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const top = [...doc.layers].reverse();
  const groups = new Map((doc.groups ?? []).map((g) => [g.id, g]));
  const set = (id: string, patch: Partial<Layer>) => update((d) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) }));
  const setG = (gid: string, patch: Partial<LayerGroup>) => update((d) => ({ ...d, groups: (d.groups ?? []).map((g) => (g.id === gid ? { ...g, ...patch } : g)) }));

  // rows: group header at the position of its topmost member, members indented under it
  const rows: ({ kind: 'layer'; l: Layer; depth: number } | { kind: 'group'; g: LayerGroup; members: Layer[] })[] = [];
  const done = new Set<string>();
  for (const l of top) {
    if (done.has(l.id)) continue;
    const g = l.groupId ? groups.get(l.groupId) : undefined;
    if (g) {
      const members = top.filter((x) => x.groupId === g.id);
      members.forEach((m) => done.add(m.id));
      rows.push({ kind: 'group', g, members });
      if (!collapsed[g.id]) members.forEach((m) => rows.push({ kind: 'layer', l: m, depth: 1 }));
    } else {
      done.add(l.id);
      rows.push({ kind: 'layer', l, depth: 0 });
    }
  }

  const onDrop = (targetId: string) => {
    if (!drag || drag === targetId) return;
    update((d) => {
      const layers = [...d.layers];
      const from = layers.findIndex((x) => x.id === drag);
      const [m] = layers.splice(from, 1);
      const to = layers.findIndex((x) => x.id === targetId);
      const target = layers[to];
      layers.splice(to + 1, 0, { ...m, groupId: target?.groupId ?? null } as Layer);
      return { ...d, layers };
    });
    setDrag(null);
    setOver(null);
  };

  const Row = ({ l, depth }: { l: Layer; depth: number }) => {
    const Icon = TYPE_ICON[l.type];
    const isSel = sel.includes(l.id);
    return (
      <div
        draggable
        onDragStart={() => setDrag(l.id)}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(l.id);
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        onDrop={() => onDrop(l.id)}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) setSel(sel.includes(l.id) ? sel.filter((x) => x !== l.id) : [...sel, l.id]);
          else setSel([l.id]);
        }}
        className={`group flex items-center gap-2 h-10 pr-2.5 rounded-xl cursor-pointer text-[13px] transition-colors ${isSel ? 'bg-brand-50 text-brand-700 shadow-[inset_0_0_0_1px_rgba(255,107,26,.25)]' : 'hover:bg-ink-50'} ${over === l.id && drag !== l.id ? 'ring-2 ring-brand-300' : ''}`}
        style={{ paddingLeft: 10 + depth * 18 }}
      >
        <GripVertical className="w-3.5 h-3.5 text-ink-300 shrink-0" />
        <Icon className="w-3.5 h-3.5 shrink-0 text-ink-500" />
        {renaming === l.id ? (
          <input
            autoFocus
            className="ed-input h-7"
            defaultValue={l.name}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              set(l.id, { name: e.target.value || l.name });
              setRenaming(null);
            }}
          />
        ) : (
          <span className={`truncate flex-1 ${l.visible ? '' : 'text-ink-400'}`} onDoubleClick={() => setRenaming(l.id)}>
            {l.name}
          </span>
        )}
        {l.condition?.rules?.length ? <span title="Має умову відображення"><GitBranch className="w-3.5 h-3.5 text-amber-600 shrink-0" /></span> : null}
        <button className={`shrink-0 ${l.locked ? 'text-ink-700' : 'text-ink-300 opacity-0 group-hover:opacity-100'}`} onClick={(e) => { e.stopPropagation(); set(l.id, { locked: !l.locked }); }} title="Заблокувати">
          {l.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
        <button className={`shrink-0 ${!l.visible ? 'text-ink-700' : 'text-ink-300 opacity-0 group-hover:opacity-100'}`} onClick={(e) => { e.stopPropagation(); set(l.id, { visible: !l.visible }); }} title="Показати/сховати">
          {l.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  };

  return (
    <div>
      <Title hint="Shift+клік — виділити кілька, Ctrl+G — згрупувати. Клік по елементу групи на полотні виділяє всю групу, повторний — окремий елемент.">Шари</Title>
      <div className="px-2 pb-4">
        {rows.map((r) =>
          r.kind === 'layer' ? (
            <Row key={r.l.id} l={r.l} depth={r.depth} />
          ) : (
            <div
              key={r.g.id}
              onClick={() => setSel(r.members.map((m) => m.id))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drag && update((d) => ({ ...d, layers: d.layers.map((x) => (x.id === drag ? ({ ...x, groupId: r.g.id } as Layer) : x)) }))}
              className={`group flex items-center gap-2 h-10 px-2.5 rounded-xl cursor-pointer text-[13px] font-medium transition-colors ${r.members.length && r.members.every((m) => sel.includes(m.id)) ? 'bg-brand-50 text-brand-700 shadow-[inset_0_0_0_1px_rgba(255,107,26,.25)]' : 'hover:bg-ink-50'}`}
            >
              <button className="text-ink-400 shrink-0" onClick={(e) => { e.stopPropagation(); setCollapsed({ ...collapsed, [r.g.id]: !collapsed[r.g.id] }); }}>
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed[r.g.id] ? '' : 'rotate-90'}`} />
              </button>
              <FolderOpen className="w-4 h-4 shrink-0 text-brand-500" />
              {renaming === r.g.id ? (
                <input autoFocus className="ed-input h-7" defaultValue={r.g.name} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} onBlur={(e) => { setG(r.g.id, { name: e.target.value || r.g.name }); setRenaming(null); }} />
              ) : (
                <span className="truncate flex-1" onDoubleClick={() => setRenaming(r.g.id)}>{r.g.name}</span>
              )}
              {r.g.condition?.rules?.length ? <GitBranch className="w-3.5 h-3.5 text-amber-600 shrink-0" /> : null}
              <button className={`shrink-0 ${r.g.visible === false ? 'text-ink-700' : 'text-ink-300 opacity-0 group-hover:opacity-100'}`} onClick={(e) => { e.stopPropagation(); setG(r.g.id, { visible: r.g.visible === false }); }} title="Показати/сховати групу">
                {r.g.visible === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          ),
        )}
        {!top.length && <div className="text-sm text-ink-500 px-2">Порожньо. Додайте елементи з вкладок зліва.</div>}
      </div>
    </div>
  );
}

function TemplatesTab({ doc, formatId, product, applyTemplate }: Props) {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState('');
  const toast = useToast();
  const load = () => api.get('/api/templates').then((r) => setList(r.templates));
  useEffect(() => {
    load();
  }, []);
  const mine = list.filter((t) => t.formatId === formatId || (t.doc.width === doc.width && t.doc.height === doc.height));
  return (
    <div>
      <Title hint="Застосування шаблону замінює поточний дизайн (можна скасувати через Ctrl+Z).">Шаблони</Title>
      <div className="px-4 pb-3 flex gap-2">
        <input className="ed-input" placeholder="Назва шаблону" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button
          className="btn-outline btn-sm h-9"
          disabled={!name.trim()}
          onClick={async () => {
            await api.post('/api/templates', { name, formatId, doc });
            setName('');
            toast('Шаблон збережено');
            load();
          }}
        >
          Зберегти
        </button>
      </div>
      <div className="px-4 grid grid-cols-2 gap-2 pb-4">
        {mine.map((t) => (
          <div key={t.id} className="relative group">
            <button onClick={() => applyTemplate(structuredClone(t.doc))} className="w-full rounded-2xl bg-ink-100 hover:bg-brand-50 p-2 flex flex-col items-center gap-1.5 transition-all hover:-translate-y-0.5">
              <DesignPreview doc={t.doc} product={product} width={t.doc.height > t.doc.width ? 74 : 120} />
              <span className="text-[11px] text-center leading-tight">{t.name}</span>
            </button>
            {!t.builtin && (
              <button
                className="absolute top-1 right-1 w-6 h-6 rounded bg-white/90 border border-ink-200 items-center justify-center hidden group-hover:flex text-red-600"
                onClick={async () => {
                  if (!confirm('Видалити шаблон?')) return;
                  await api.del(`/api/templates/${t.id}`);
                  load();
                }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { renderTemplate };

function SmartBlock({ title, hint, preview, onClick }: { title: string; hint: string; preview: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-2xl bg-ink-100 hover:bg-brand-50 hover:shadow-[inset_0_0_0_1px_rgba(255,107,26,.3)] active:scale-[.98] p-3 flex items-center gap-3 transition-all">
      <div className="w-[88px] h-14 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">{preview}</div>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold">{title}</div>
        <div className="text-[11px] text-ink-500 leading-snug mt-0.5">{hint}</div>
      </div>
    </button>
  );
}
