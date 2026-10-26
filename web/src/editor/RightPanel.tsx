import { useEffect, useRef, useState } from 'react';
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Copy, Trash2, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Plus, Italic, Minus, Info,
} from 'lucide-react';
import type { DesignDoc, FeedField, Fill, IconLayer, ImageLayer, Layer, ProductData, ShapeLayer, TextLayer } from '../../../src/shared/types';
import { FONTS } from '../../../src/shared/fonts';
import { COMPUTED_FIELDS, ProductContext, renderTemplate } from '../../../src/shared/fields';
import { ColorInput, NumberInput, Row, Section, Seg, Toggle } from './controls';
import { ConditionEditor } from './ConditionEditor';

const WEIGHTS = [
  [100, 'Thin (100)'],
  [200, 'Extra Light (200)'],
  [300, 'Light (300)'],
  [400, 'Звичайний (400)'],
  [500, 'Medium (500)'],
  [600, 'Semi Bold (600)'],
  [700, 'Жирний (700)'],
  [800, 'Extra Bold (800)'],
  [900, 'Black (900)'],
] as const;

interface Props {
  doc: DesignDoc;
  layer: Layer | null;
  fields: FeedField[];
  product: ProductData | null;
  focusText: number;
  setLayer: (patch: Partial<Layer>, key?: string) => void;
  setDoc: (fn: (d: DesignDoc) => DesignDoc, key?: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrder: (dir: 'up' | 'down' | 'top' | 'bottom') => void;
}

export function RightPanel(p: Props) {
  const { layer } = p;
  return (
    <div className="w-[320px] border-l border-ink-200 bg-white overflow-y-auto shrink-0" onKeyDown={(e) => e.stopPropagation()}>
      {!layer ? <CanvasProps {...p} /> : <LayerProps {...p} layer={layer} />}
    </div>
  );
}

function FieldInsert({ fields, onPick }: { fields: FeedField[]; onPick: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="w-7 h-7 rounded-md border border-ink-200 bg-white flex items-center justify-center hover:border-brand-500" onClick={() => setOpen(!open)} title="Вставити поле">
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 card w-60 max-h-80 overflow-y-auto py-1" onMouseLeave={() => setOpen(false)}>
          <div className="px-3 py-1 text-[11px] uppercase text-ink-400">Обчислювані</div>
          {COMPUTED_FIELDS.filter((f) => !f.key.endsWith('_value') && f.key !== 'has_discount').map((f) => (
            <button key={f.key} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-ink-50" onClick={() => { onPick(f.key); setOpen(false); }}>
              {f.label}
            </button>
          ))}
          <div className="px-3 py-1 text-[11px] uppercase text-ink-400 mt-1">Поля фіду</div>
          {fields.map((f) => (
            <button key={f.key} className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-ink-50 font-mono" onClick={() => { onPick(f.key); setOpen(false); }}>
              {f.key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LayerProps({ doc, layer, fields, product, focusText, setLayer, onDuplicate, onDelete, onOrder }: Props & { layer: Layer }) {
  const key = (k: string) => `${k}:${layer.id}`;
  return (
    <div>
      <div className="px-4 py-3 border-b border-ink-200 flex items-center gap-2">
        <input className="ed-input font-medium" value={layer.name} onChange={(e) => setLayer({ name: e.target.value }, key('name'))} />
        <button className="btn-ghost btn-sm px-1.5" title="Дублювати (Ctrl+D)" onClick={onDuplicate}><Copy className="w-4 h-4" /></button>
        <button className="btn-ghost btn-sm px-1.5 text-red-600" title="Видалити (Delete)" onClick={onDelete}><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="px-4 py-2 border-b border-ink-200 flex gap-1">
        <button className="btn-ghost btn-sm px-2 flex-1" title="На передній план" onClick={() => onOrder('top')}><ChevronsUp className="w-4 h-4" /></button>
        <button className="btn-ghost btn-sm px-2 flex-1" title="Вище" onClick={() => onOrder('up')}><ChevronUp className="w-4 h-4" /></button>
        <button className="btn-ghost btn-sm px-2 flex-1" title="Нижче" onClick={() => onOrder('down')}><ChevronDown className="w-4 h-4" /></button>
        <button className="btn-ghost btn-sm px-2 flex-1" title="На задній план" onClick={() => onOrder('bottom')}><ChevronsDown className="w-4 h-4" /></button>
      </div>
      {layer.type === 'text' && <TextContent layer={layer} fields={fields} product={product} doc={doc} focusText={focusText} setLayer={setLayer} />}
      {layer.type === 'image' && <ImageSourceProps layer={layer} fields={fields} setLayer={setLayer} />}

      <Section title="Загальне">
        <Row label="Позиція">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput prefix="X" value={layer.x} onChange={(v) => setLayer({ x: v })} />
            <NumberInput prefix="Y" value={layer.y} onChange={(v) => setLayer({ y: v })} />
          </div>
        </Row>
        <Row label="Розмір">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput prefix="W" value={layer.w} min={4} onChange={(v) => setLayer({ w: v })} />
            <NumberInput prefix="H" value={layer.h} min={4} onChange={(v) => setLayer({ h: v })} />
          </div>
        </Row>
        <Row label="Поворот">
          <NumberInput prefix="°" value={layer.rotation} min={-180} max={180} onChange={(v) => setLayer({ rotation: v })} />
        </Row>
        <Row label="Прозорість">
          <NumberInput suffix="%" value={layer.opacity} min={0} max={100} onChange={(v) => setLayer({ opacity: v })} />
        </Row>
        <Row label="Вирівняти">
          <div className="grid grid-cols-3 gap-1">
            <button className="btn-outline btn-sm px-1 text-[11px]" onClick={() => setLayer({ x: Math.round((doc.width - layer.w) / 2) })}>↔ центр</button>
            <button className="btn-outline btn-sm px-1 text-[11px]" onClick={() => setLayer({ y: Math.round((doc.height - layer.h) / 2) })}>↕ центр</button>
            <button className="btn-outline btn-sm px-1 text-[11px]" onClick={() => setLayer({ x: 0, y: 0, w: doc.width, h: doc.height })}>на весь</button>
          </div>
        </Row>
      </Section>

      <Section
        title="Умова відображення"
        defaultOpen={!!layer.condition?.rules?.length}
        right={layer.condition?.rules?.length ? <span className="chip bg-amber-50 text-amber-700">{layer.condition.rules.length}</span> : null}
      >
        <p className="text-xs text-ink-500 -mt-1">Напр.: показувати лише якщо «Є знижка» існує, або ховати, якщо бренд містить «Nike».</p>
        <ConditionEditor value={layer.condition} onChange={(c) => setLayer({ condition: c })} fields={fields} />
      </Section>

      {layer.type === 'text' && <TextStyle layer={layer} setLayer={setLayer} />}
      {layer.type === 'image' && <ImageStyle layer={layer} setLayer={setLayer} />}
      {layer.type === 'shape' && <ShapeStyle layer={layer} setLayer={setLayer} />}
      {layer.type === 'icon' && <IconStyle layer={layer} setLayer={setLayer} />}
      <ShadowProps layer={layer} setLayer={setLayer} />
    </div>
  );
}

function TextContent({ layer, fields, product, doc, focusText, setLayer }: { layer: TextLayer; fields: FeedField[]; product: ProductData | null; doc: DesignDoc; focusText: number; setLayer: Props['setLayer'] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusText) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusText]);
  const preview = renderTemplate(layer.text, new ProductContext(product ?? {}, doc.format));
  const insert = (k: string) => {
    const el = ref.current;
    const token = `{{${k}}}`;
    if (!el) return setLayer({ text: layer.text + token });
    const s = el.selectionStart ?? layer.text.length;
    const e = el.selectionEnd ?? s;
    setLayer({ text: layer.text.slice(0, s) + token + layer.text.slice(e) });
  };
  return (
    <Section title="Текст" right={<FieldInsert fields={fields} onPick={insert} />}>
      <textarea
        ref={ref}
        className="w-full rounded-md bg-ink-100 p-2.5 text-[13px] font-mono outline-none border border-transparent focus:border-brand-500 focus:bg-white min-h-[64px]"
        value={layer.text}
        onChange={(e) => setLayer({ text: e.target.value }, `text:${layer.id}`)}
      />
      <div className="text-xs text-ink-500 bg-ink-50 rounded-md px-2.5 py-2 break-words">
        <span className="text-ink-400">Для товару: </span>
        {preview || <i className="text-ink-400">порожньо — елемент приховано</i>}
      </div>
      <details className="text-xs text-ink-500">
        <summary className="cursor-pointer flex items-center gap-1"><Info className="w-3 h-3" /> Фільтри змінних</summary>
        <div className="mt-1.5 space-y-0.5 font-mono text-[11px]">
          <div>{'{{title|upper}}'} — ВЕЛИКІ</div>
          <div>{'{{title|truncate:30}}'} — обрізати</div>
          <div>{'{{title|first_word}}'} — перше слово</div>
          <div>{'{{price|money}}'} — як гроші</div>
          <div>{'{{color|default:—}}'} — значення за замовч.</div>
          <div>{'{{description|strip}}'} — без HTML</div>
        </div>
      </details>
      <Row label="Макс. рядків">
        <NumberInput value={layer.maxLines} min={0} max={20} onChange={(v) => setLayer({ maxLines: v })} />
      </Row>
      <Toggle label="Зменшувати шрифт, щоб вміститись" checked={layer.autoFit} onChange={(v) => setLayer({ autoFit: v })} />
      <Toggle label="Ширина за текстом (бейдж)" checked={layer.autoWidth} onChange={(v) => setLayer({ autoWidth: v })} />
      <Toggle label="Ховати, якщо поля порожні" checked={layer.hideIfEmpty} onChange={(v) => setLayer({ hideIfEmpty: v })} />
    </Section>
  );
}

function TextStyle({ layer, setLayer }: { layer: TextLayer; setLayer: Props['setLayer'] }) {
  const font = FONTS.find((f) => f.family === layer.font);
  return (
    <>
      <Section title="Стиль тексту">
        <select className="ed-input" value={layer.font} onChange={(e) => setLayer({ font: e.target.value })} style={{ fontFamily: layer.font }}>
          {FONTS.map((f) => (
            <option key={f.family} value={f.family}>{f.family}</option>
          ))}
        </select>
        <div className="grid grid-cols-[80px_1fr] gap-1.5">
          <NumberInput value={layer.size} min={4} max={600} onChange={(v) => setLayer({ size: v })} suffix="px" />
          <select className="ed-input" value={layer.weight} onChange={(e) => setLayer({ weight: Number(e.target.value) })}>
            {WEIGHTS.filter(([w]) => !font || (w >= font.weights[0] && w <= font.weights[1])).map(([w, l]) => (
              <option key={w} value={w}>{l}</option>
            ))}
          </select>
        </div>
        <Row label="Колір">
          <ColorInput value={layer.color} onChange={(v) => setLayer({ color: v })} />
        </Row>
        <Row label="Інтервали">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberInput value={layer.lineHeight} min={50} max={300} suffix="%" onChange={(v) => setLayer({ lineHeight: v })} />
            <NumberInput value={layer.letterSpacing} min={-20} max={100} suffix="px" step={0.5} onChange={(v) => setLayer({ letterSpacing: v })} />
          </div>
        </Row>
        <Row label="Вирівнюв.">
          <Seg
            value={layer.align}
            onChange={(v) => setLayer({ align: v })}
            options={[
              { v: 'left', label: <AlignLeft className="w-4 h-4" /> },
              { v: 'center', label: <AlignCenter className="w-4 h-4" /> },
              { v: 'right', label: <AlignRight className="w-4 h-4" /> },
              { v: 'justify', label: <AlignJustify className="w-4 h-4" /> },
            ]}
          />
        </Row>
        <Row label="По вертик.">
          <Seg
            value={layer.vAlign}
            onChange={(v) => setLayer({ vAlign: v })}
            options={[
              { v: 'top', label: <AlignVerticalJustifyStart className="w-4 h-4" /> },
              { v: 'middle', label: <AlignVerticalJustifyCenter className="w-4 h-4" /> },
              { v: 'bottom', label: <AlignVerticalJustifyEnd className="w-4 h-4" /> },
            ]}
          />
        </Row>
        <Row label="Оформлення">
          <Seg
            value={layer.decoration}
            onChange={(v) => setLayer({ decoration: v })}
            options={[
              { v: 'none', label: <Minus className="w-4 h-4" />, title: 'Без' },
              { v: 'underline', label: <span className="underline">A</span>, title: 'Підкреслений' },
              { v: 'overline', label: <span className="overline">A</span>, title: 'Надкреслений' },
              { v: 'line-through', label: <span className="line-through">A</span>, title: 'Закреслений (стара ціна)' },
            ]}
          />
        </Row>
        <Row label="Регістр">
          <Seg
            value={layer.transform}
            onChange={(v) => setLayer({ transform: v })}
            options={[
              { v: 'none', label: <Minus className="w-4 h-4" /> },
              { v: 'capitalize', label: 'Aa' },
              { v: 'uppercase', label: 'AA' },
              { v: 'lowercase', label: 'aa' },
            ]}
          />
        </Row>
        <Row label="Стиль">
          <Seg value={layer.italic ? 'i' : 'n'} onChange={(v) => setLayer({ italic: v === 'i' })} options={[{ v: 'n', label: <Minus className="w-4 h-4" /> }, { v: 'i', label: <Italic className="w-4 h-4" /> }]} />
        </Row>
      </Section>
      <Section title="Фон тексту (плашка)" defaultOpen={!!layer.bg} right={<Toggle label="" checked={!!layer.bg} onChange={(v) => setLayer({ bg: v ? { color: '#E53935', radius: 12, padX: 24, padY: 0 } : null })} />}>
        {layer.bg ? (
          <>
            <Row label="Колір">
              <ColorInput value={layer.bg.color} onChange={(v) => setLayer({ bg: { ...layer.bg!, color: v } })} />
            </Row>
            <Row label="Радіус">
              <NumberInput value={layer.bg.radius} min={0} onChange={(v) => setLayer({ bg: { ...layer.bg!, radius: v } })} />
            </Row>
            <Row label="Відступи">
              <div className="grid grid-cols-2 gap-1.5">
                <NumberInput prefix="↔" value={layer.bg.padX} min={0} onChange={(v) => setLayer({ bg: { ...layer.bg!, padX: v } })} />
                <NumberInput prefix="↕" value={layer.bg.padY} min={0} onChange={(v) => setLayer({ bg: { ...layer.bg!, padY: v } })} />
              </div>
            </Row>
          </>
        ) : (
          <p className="text-xs text-ink-500">Увімкніть, щоб зробити бейдж або плашку ціни, яка підлаштовується під довжину тексту.</p>
        )}
      </Section>
    </>
  );
}

const IMAGE_FIELD_HINT = ['image_link', 'additional_image_link'];

function ImageSourceProps({ layer, fields, setLayer }: { layer: ImageLayer; fields: FeedField[]; setLayer: Props['setLayer'] }) {
  const src = layer.source;
  const imgFields = fields.filter((f) => IMAGE_FIELD_HINT.includes(f.key) || /image|picture|photo|logo/i.test(f.key) || /^https?:\/\/.*\.(jpe?g|png|webp|gif|svg)/i.test(f.sample));
  return (
    <Section title="Джерело зображення">
      <Seg
        value={src.kind}
        onChange={(v) => setLayer({ source: v === 'field' ? { kind: 'field', field: 'image_link' } : { kind: 'url', url: '' } })}
        options={[
          { v: 'field', label: 'Поле фіду' },
          { v: 'url', label: 'Файл / URL' },
        ]}
      />
      {src.kind === 'field' ? (
        <div className="grid grid-cols-[1fr_70px] gap-1.5">
          <select className="ed-input" value={src.field} onChange={(e) => setLayer({ source: { ...src, field: e.target.value } })}>
            {(imgFields.length ? imgFields : fields).map((f) => (
              <option key={f.key} value={f.key}>{f.key}</option>
            ))}
          </select>
          <NumberInput prefix="#" value={(src.index ?? 0) + 1} min={1} max={20} onChange={(v) => setLayer({ source: { ...src, index: v - 1 } })} />
        </div>
      ) : (
        <input className="ed-input font-mono text-xs" placeholder="https://… або завантажте у вкладці Фото" value={src.url} onChange={(e) => setLayer({ source: { kind: 'url', url: e.target.value } })} />
      )}
    </Section>
  );
}

function ImageStyle({ layer, setLayer }: { layer: ImageLayer; setLayer: Props['setLayer'] }) {
  return (
    <Section title="Зображення">
      <Row label="Масштаб">
        <Seg value={layer.fit} onChange={(v) => setLayer({ fit: v })} options={[{ v: 'contain', label: 'Вписати' }, { v: 'cover', label: 'Заповнити' }, { v: 'fill', label: 'Розтягти' }]} />
      </Row>
      <Row label="По гориз.">
        <Seg value={layer.hAlign} onChange={(v) => setLayer({ hAlign: v })} options={[{ v: 'left', label: <AlignLeft className="w-4 h-4" /> }, { v: 'center', label: <AlignCenter className="w-4 h-4" /> }, { v: 'right', label: <AlignRight className="w-4 h-4" /> }]} />
      </Row>
      <Row label="По вертик.">
        <Seg value={layer.vAlign} onChange={(v) => setLayer({ vAlign: v })} options={[{ v: 'top', label: <AlignVerticalJustifyStart className="w-4 h-4" /> }, { v: 'middle', label: <AlignVerticalJustifyCenter className="w-4 h-4" /> }, { v: 'bottom', label: <AlignVerticalJustifyEnd className="w-4 h-4" /> }]} />
      </Row>
      <Row label="Радіус">
        <NumberInput value={layer.radius} min={0} onChange={(v) => setLayer({ radius: v })} />
      </Row>
      <Row label="Обведення">
        <div className="grid grid-cols-[1fr_64px] gap-1.5">
          <ColorInput value={layer.stroke?.color ?? '#111111'} onChange={(v) => setLayer({ stroke: { color: v, width: layer.stroke?.width || 2 } })} />
          <NumberInput value={layer.stroke?.width ?? 0} min={0} onChange={(v) => setLayer({ stroke: v ? { color: layer.stroke?.color ?? '#111111', width: v } : null })} />
        </div>
      </Row>
    </Section>
  );
}

function FillEditor({ fill, onChange, allowNone = true }: { fill: Fill | null; onChange: (f: Fill | null) => void; allowNone?: boolean }) {
  const mode = !fill ? 'none' : fill.gradient ? 'gradient' : 'solid';
  return (
    <>
      <Seg
        value={mode}
        onChange={(v) => onChange(v === 'none' ? null : v === 'solid' ? { color: fill?.color ?? '#E53935' } : { color: fill?.color ?? '#E53935', gradient: { from: fill?.color ?? '#FF2E4D', to: '#FF8A00', angle: 135 } })}
        options={[...(allowNone ? [{ v: 'none' as const, label: 'Немає' }] : []), { v: 'solid' as const, label: 'Колір' }, { v: 'gradient' as const, label: 'Градієнт' }]}
      />
      {fill && !fill.gradient && <ColorInput value={fill.color} onChange={(v) => onChange({ color: v })} />}
      {fill?.gradient && (
        <>
          <Row label="Від">
            <ColorInput value={fill.gradient.from} onChange={(v) => onChange({ ...fill, gradient: { ...fill.gradient!, from: v } })} />
          </Row>
          <Row label="До">
            <ColorInput value={fill.gradient.to} onChange={(v) => onChange({ ...fill, gradient: { ...fill.gradient!, to: v } })} />
          </Row>
          <Row label="Кут">
            <NumberInput suffix="°" value={fill.gradient.angle} min={0} max={360} onChange={(v) => onChange({ ...fill, gradient: { ...fill.gradient!, angle: v } })} />
          </Row>
        </>
      )}
    </>
  );
}

function ShapeStyle({ layer, setLayer }: { layer: ShapeLayer; setLayer: Props['setLayer'] }) {
  return (
    <Section title="Фігура">
      <select className="ed-input" value={layer.shape} onChange={(e) => setLayer({ shape: e.target.value as ShapeLayer['shape'] })}>
        <option value="rect">Прямокутник</option>
        <option value="ellipse">Еліпс / коло</option>
        <option value="triangle">Трикутник-кут</option>
        <option value="burst">Бейдж-вибух</option>
        <option value="line">Лінія</option>
      </select>
      {layer.shape === 'triangle' && (
        <Row label="Кут">
          <Seg value={layer.corner ?? 'tl'} onChange={(v) => setLayer({ corner: v })} options={[{ v: 'tl', label: '↖' }, { v: 'tr', label: '↗' }, { v: 'bl', label: '↙' }, { v: 'br', label: '↘' }]} />
        </Row>
      )}
      {layer.shape === 'burst' && (
        <Row label="Промені">
          <NumberInput value={layer.points ?? 16} min={5} max={40} onChange={(v) => setLayer({ points: v })} />
        </Row>
      )}
      {layer.shape === 'rect' && (
        <Row label="Радіус">
          <NumberInput value={layer.radius} min={0} onChange={(v) => setLayer({ radius: v })} />
        </Row>
      )}
      {layer.shape !== 'line' && (
        <>
          <div className="ed-label">Заливка</div>
          <FillEditor fill={layer.fill} onChange={(f) => setLayer({ fill: f })} />
        </>
      )}
      <div className="ed-label">{layer.shape === 'line' ? 'Лінія' : 'Обведення'}</div>
      <div className="grid grid-cols-[1fr_64px] gap-1.5">
        <ColorInput value={layer.stroke?.color ?? '#111111'} onChange={(v) => setLayer({ stroke: { color: v, width: layer.stroke?.width || 2 } })} />
        <NumberInput value={layer.stroke?.width ?? 0} min={0} onChange={(v) => setLayer({ stroke: v ? { color: layer.stroke?.color ?? '#111111', width: v } : null })} />
      </div>
    </Section>
  );
}

function IconStyle({ layer, setLayer }: { layer: IconLayer; setLayer: Props['setLayer'] }) {
  return (
    <Section title="Іконка">
      <Row label="Назва">
        <input className="ed-input font-mono" value={layer.icon} onChange={(e) => setLayer({ icon: e.target.value.trim() })} />
      </Row>
      <Row label="Колір">
        <ColorInput value={layer.color} onChange={(v) => setLayer({ color: v })} />
      </Row>
      <Row label="Товщина">
        <NumberInput value={layer.strokeWidth} min={0.5} max={4} step={0.25} onChange={(v) => setLayer({ strokeWidth: v })} />
      </Row>
    </Section>
  );
}

function ShadowProps({ layer, setLayer }: { layer: Layer; setLayer: Props['setLayer'] }) {
  const s = layer.shadow;
  return (
    <Section title="Тінь" defaultOpen={!!s} right={<Toggle label="" checked={!!s} onChange={(v) => setLayer({ shadow: v ? { color: 'rgba(0,0,0,0.25)', blur: 20, x: 0, y: 8 } : null })} />}>
      {s ? (
        <>
          <Row label="Колір">
            <ColorInput value={s.color} onChange={(v) => setLayer({ shadow: { ...s, color: v } })} />
          </Row>
          <Row label="Розмиття">
            <NumberInput value={s.blur} min={0} max={200} onChange={(v) => setLayer({ shadow: { ...s, blur: v } })} />
          </Row>
          <Row label="Зсув">
            <div className="grid grid-cols-2 gap-1.5">
              <NumberInput prefix="X" value={s.x} onChange={(v) => setLayer({ shadow: { ...s, x: v } })} />
              <NumberInput prefix="Y" value={s.y} onChange={(v) => setLayer({ shadow: { ...s, y: v } })} />
            </div>
          </Row>
        </>
      ) : (
        <p className="text-xs text-ink-500">Без тіні</p>
      )}
    </Section>
  );
}

function CanvasProps({ doc, fields, setDoc }: Props) {
  const bg = doc.background;
  const f = doc.format;
  const setFormat = (patch: Partial<DesignDoc['format']>) => setDoc((d) => ({ ...d, format: { ...d.format, ...patch } }));
  const imgFields = fields.filter((x) => /image|picture/i.test(x.key));
  return (
    <div>
      <div className="px-4 py-3 border-b border-ink-200">
        <div className="text-[13px] font-semibold">Полотно</div>
        <div className="text-xs text-ink-500 mt-0.5">{doc.width}×{doc.height}. Оберіть шар на полотні або в панелі «Шари», щоб змінити його.</div>
      </div>
      <Section title="Розмір">
        <div className="grid grid-cols-2 gap-1.5">
          <NumberInput prefix="W" value={doc.width} min={200} max={4000} onChange={(v) => setDoc((d) => ({ ...d, width: v }))} />
          <NumberInput prefix="H" value={doc.height} min={200} max={4000} onChange={(v) => setDoc((d) => ({ ...d, height: v }))} />
        </div>
      </Section>
      <Section title="Фон">
        <FillEditor fill={bg} allowNone={false} onChange={(fl) => setDoc((d) => ({ ...d, background: { ...d.background, ...(fl ?? { color: '#ffffff' }), gradient: fl?.gradient ?? null } }))} />
        <div className="ed-label pt-1">Фонове зображення</div>
        <select
          className="ed-input"
          value={bg.image ? (bg.image.kind === 'field' ? `f:${bg.image.field}` : 'url') : ''}
          onChange={(e) => {
            const v = e.target.value;
            setDoc((d) => ({ ...d, background: { ...d.background, image: !v ? null : v === 'url' ? { kind: 'url', url: '' } : { kind: 'field', field: v.slice(2) } } }));
          }}
        >
          <option value="">Немає</option>
          {imgFields.map((x) => (
            <option key={x.key} value={`f:${x.key}`}>Поле: {x.key}</option>
          ))}
          <option value="url">Файл / URL</option>
        </select>
        {bg.image?.kind === 'url' && (
          <input className="ed-input font-mono text-xs" placeholder="/a/... або https://..." value={bg.image.url} onChange={(e) => setDoc((d) => ({ ...d, background: { ...d.background, image: { kind: 'url', url: e.target.value } } }))} />
        )}
        {bg.image && (
          <Seg value={bg.imageFit ?? 'cover'} onChange={(v) => setDoc((d) => ({ ...d, background: { ...d.background, imageFit: v } }))} options={[{ v: 'cover', label: 'Заповнити' }, { v: 'contain', label: 'Вписати' }]} />
        )}
      </Section>
      <Section title="Формат цін">
        <Row label="Валюта">
          <input className="ed-input" value={f.currencyLabel} onChange={(e) => setFormat({ currencyLabel: e.target.value })} placeholder="грн, ₴, UAH" />
        </Row>
        <Row label="Позиція">
          <Seg value={f.currencyPosition} onChange={(v) => setFormat({ currencyPosition: v })} options={[{ v: 'after', label: '1 170 грн' }, { v: 'before', label: '₴1 170' }]} />
        </Row>
        <Row label="Розряди">
          <Seg value={f.thousandSep === ' ' ? 'space' : f.thousandSep === '' ? 'none' : f.thousandSep} onChange={(v) => setFormat({ thousandSep: v === 'space' ? ' ' : v === 'none' ? '' : v })} options={[{ v: 'space', label: '1 170' }, { v: 'none', label: '1170' }, { v: ',', label: '1,170' }, { v: '.', label: '1.170' }]} />
        </Row>
        <Row label="Копійки">
          <Seg value={String(f.decimals)} onChange={(v) => setFormat({ decimals: Number(v) })} options={[{ v: '0', label: 'Авто' }, { v: '2', label: '0,00' }]} />
        </Row>
        <Row label="Мін. знижка">
          <NumberInput suffix="%" value={f.discountMin} min={0} max={99} onChange={(v) => setFormat({ discountMin: v })} />
        </Row>
        <p className="text-xs text-ink-500">«Є знижка» спрацьовує, лише якщо sale_price менша за price щонайменше на цей відсоток.</p>
      </Section>
    </div>
  );
}
