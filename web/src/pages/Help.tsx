import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search, ChevronLeft, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react';
import { ARTICLES, GROUPS, findArticle } from '../help/articles';

/** **bold**, `code`, [text](/link) */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={i++} className="font-semibold text-ink-900">{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={i++} className="px-1.5 py-0.5 rounded-md bg-ink-100 text-[0.9em] font-mono text-ink-800">{t.slice(1, -1)}</code>);
    else {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(href.startsWith('/') ? <Link key={i++} to={href} className="text-brand-600 hover:underline">{label}</Link> : <a key={i++} href={href} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{label}</a>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Body({ src }: { src: string }) {
  const blocks = src.trim().split(/\n\s*\n/);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-ink-700">
      {blocks.map((b, bi) => {
        const lines = b.split('\n');
        if (lines[0].startsWith('## ')) {
          const rest = lines.slice(1).join('\n');
          return (
            <Fragment key={bi}>
              <h2 className="text-lg font-semibold text-ink-900 pt-3 tracking-tight">{lines[0].slice(3)}</h2>
              {rest && <Body src={rest} />}
            </Fragment>
          );
        }
        if (lines.every((l) => l.startsWith('- '))) return <ul key={bi} className="list-disc pl-5 space-y-1.5">{lines.map((l, i) => <li key={i}>{inline(l.slice(2))}</li>)}</ul>;
        if (lines.every((l) => /^\d+\. /.test(l))) return <ol key={bi} className="list-decimal pl-5 space-y-1.5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\. /, ''))}</li>)}</ol>;
        if (lines[0].startsWith('> ') || lines[0].startsWith('! ')) {
          const warn = lines[0].startsWith('! ');
          const Icon = warn ? AlertTriangle : Lightbulb;
          return (
            <div key={bi} className={`flex gap-3 rounded-2xl px-4 py-3 text-[14px] ${warn ? 'bg-amber-50 text-amber-900' : 'bg-brand-50 text-ink-800'}`}>
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${warn ? 'text-amber-600' : 'text-brand-500'}`} />
              <div>{inline(lines.map((l) => l.replace(/^[>!] /, '')).join(' '))}</div>
            </div>
          );
        }
        // mixed lines: paragraph with possible list after it
        const firstList = lines.findIndex((l) => l.startsWith('- ') || /^\d+\. /.test(l));
        if (firstList > 0) return <Body key={bi} src={lines.slice(0, firstList).join(' ') + '\n\n' + lines.slice(firstList).join('\n')} />;
        return <p key={bi}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}

export function HelpPage() {
  const { slug } = useParams();
  const [q, setQ] = useState('');
  const article = slug ? findArticle(slug) : null;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? ARTICLES.filter((a) => (a.title + ' ' + a.summary + ' ' + a.body).toLowerCase().includes(s)) : ARTICLES;
  }, [q]);

  const sidebar = (
    <aside className="lg:sticky lg:top-28 self-start space-y-5" data-testid="help-sidebar">
      <div className="relative">
        <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Пошук по довідці" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {GROUPS.map((g) => {
        const items = list.filter((a) => a.group === g);
        if (!items.length) return null;
        return (
          <div key={g}>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 px-3 mb-1">{g}</div>
            {items.map((a) => (
              <Link key={a.slug} to={`/help/${a.slug}`} className={`block px-3 py-1.5 rounded-xl text-[14px] ${a.slug === slug ? 'bg-brand-50 text-brand-700 font-medium' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'}`}>
                {a.title}
              </Link>
            ))}
          </div>
        );
      })}
      {!list.length && <div className="text-sm text-ink-500 px-3">Нічого не знайдено</div>}
    </aside>
  );

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-8">
      {sidebar}
      <div className="min-w-0">
        {article ? (
          <article className="card p-8 max-w-3xl" data-testid="help-article">
            <Link to="/help" className="text-sm text-ink-500 hover:text-ink-900 inline-flex items-center gap-1 mb-3">
              <ChevronLeft className="w-4 h-4" /> Усі статті
            </Link>
            <div className="text-[12px] font-medium text-brand-600 mb-1">{article.group}</div>
            <h1 className="text-[28px] font-semibold tracking-tight mb-2">{article.title}</h1>
            <p className="text-ink-500 mb-6">{article.summary}</p>
            <Body src={article.body} />
          </article>
        ) : (
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight flex items-center gap-2.5 mb-2">
              <BookOpen className="w-7 h-7 text-brand-500" /> База знань
            </h1>
            <p className="text-ink-500 mb-6 max-w-2xl">Як підключити фід, зібрати дизайн і запустити каталожну рекламу. Почніть зі «Швидкого старту» або знайдіть потрібне через пошук.</p>
            {GROUPS.map((g) => {
              const items = list.filter((a) => a.group === g);
              if (!items.length) return null;
              return (
                <section key={g} className="mb-7">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wider text-ink-400 mb-3">{g}</h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {items.map((a) => (
                      <Link key={a.slug} to={`/help/${a.slug}`} className="card p-5 hover:shadow-lift transition-shadow">
                        <div className="font-semibold text-ink-900">{a.title}</div>
                        <div className="text-[13px] text-ink-500 mt-1 leading-snug">{a.summary}</div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
