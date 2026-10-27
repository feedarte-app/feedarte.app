import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightLeft, Check, Mail, X, Clock } from 'lucide-react';
import { api, timeAgo } from '../api';
import { CopyField, Modal, Spinner, useToast } from '../ui';

type T = { id: string; toEmail: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'; emailSent: boolean; createdAt: string; expiresAt: string };

/** Owner side: start / see / cancel a hand-over */
export function TransferModal({ open, onClose, projectId, projectName }: { open: boolean; onClose: () => void; projectId: string; projectName: string }) {
  const [state, setState] = useState<{ transfer: T | null; mailEnabled: boolean } | null>(null);
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const load = () => api.get(`/api/projects/${projectId}/transfer`).then(setState);
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setErr('');
    setEmail('');
    load();
  }, [open]);

  const start = async (to: string) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.post(`/api/projects/${projectId}/transfer`, { email: to });
      setLink(r.link);
      setState((s) => ({ mailEnabled: s?.mailEnabled ?? false, transfer: r.transfer }));
      toast(r.transfer.emailSent ? `Лист із підтвердженням надіслано на ${r.transfer.toEmail}` : 'Запрошення створено — передайте посилання отримувачу');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const t = state?.transfer && state.transfer.status === 'pending' ? state.transfer : null;

  return (
    <Modal open={open} onClose={onClose} title="Передати проєкт" width="max-w-md">
      {!state ? (
        <Spinner />
      ) : t ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-amber-900"><Clock className="w-4 h-4" /> Очікує підтвердження</div>
            <div className="text-amber-900/80 mt-1">
              Отримувач: <b>{t.toEmail}</b>. {t.emailSent ? 'Лист надіслано' : 'Лист не надсилався'} {timeAgo(t.createdAt)}. Посилання дійсне до {new Date(t.expiresAt).toLocaleDateString('uk-UA')}.
            </div>
          </div>
          {link && (
            <div>
              <div className="label">Посилання для підтвердження</div>
              <CopyField value={link} />
              <p className="text-xs text-ink-500 mt-1.5">Надішліть його отримувачу. Прийняти зможе лише власник пошти {t.toEmail}.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-outline flex-1" disabled={busy} onClick={() => start(t.toEmail)}>
              {busy && <Spinner />} Надіслати ще раз
            </button>
            <button
              className="btn-outline flex-1 text-red-600"
              onClick={async () => {
                await api.del(`/api/projects/${projectId}/transfer`);
                setLink(null);
                load();
                toast('Передачу скасовано');
              }}
            >
              Скасувати передачу
            </button>
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) start(email.trim());
          }}
        >
          <p className="text-sm text-ink-600 leading-relaxed">
            Проєкт <b>«{projectName}»</b> з усіма фідами, дизайнами й картинками перейде в інший акаунт. Вихідні фіди продовжать працювати за тими самими посиланнями — у рекламних кабінетах нічого міняти не треба.
          </p>
          <div>
            <label className="label">Пошта нового власника</label>
            <input className="input" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <ul className="text-xs text-ink-500 space-y-1 list-disc pl-4">
            <li>{state.mailEnabled ? 'На цю пошту прийде лист з посиланням для підтвердження.' : 'Пошта на сервері ще не налаштована — ви отримаєте посилання, яке треба надіслати отримувачу самостійно.'}</li>
            <li>Проєкт перейде лише після того, як отримувач увійде під цією поштою й натисне «Прийняти».</li>
            <li>Після передачі ви втратите доступ до проєкту.</li>
          </ul>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner /> : <ArrowRightLeft className="w-4 h-4" />} Надіслати запрошення
          </button>
        </form>
      )}
    </Modal>
  );
}

/** Recipient side: /transfer/:token */
export function TransferPage() {
  const { token } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    api.get(`/api/transfers/${token}`).then(setD).catch((e) => setErr(e.message));
  }, [token]);

  const act = async (a: 'accept' | 'decline') => {
    setBusy(a);
    try {
      const r = await api.post(`/api/transfers/${token}/${a}`, {});
      if (a === 'accept') {
        toast('Проєкт тепер у вашому акаунті');
        nav(`/projects/${r.projectId}`);
      } else {
        setD({ ...d, transfer: { ...d.transfer, status: 'declined' } });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const box = (icon: React.ReactNode, title: string, body: React.ReactNode) => (
    <div className="max-w-lg mx-auto island p-8 text-center animate-pop-in">
      <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">{icon}</div>
      <h1 className="text-[22px] font-semibold tracking-tight mt-5">{title}</h1>
      <div className="text-ink-600 mt-2 leading-relaxed">{body}</div>
    </div>
  );

  if (err && !d) return box(<X className="w-6 h-6" />, 'Посилання не працює', <>{err}. <Link className="text-brand-600 font-medium" to="/">До проєктів</Link></>);
  if (!d) return <Spinner className="w-5 h-5 text-ink-400" />;
  const t = d.transfer;
  if (t.status === 'accepted')
    return box(<Check className="w-6 h-6" />, 'Проєкт уже передано', d.projectId ? <Link className="text-brand-600 font-medium" to={`/projects/${d.projectId}`}>Відкрити «{d.projectName}»</Link> : 'Це запрошення вже використано.');
  if (t.status === 'declined') return box(<X className="w-6 h-6" />, 'Передачу відхилено', 'Проєкт залишився у попереднього власника.');
  if (t.status === 'cancelled') return box(<X className="w-6 h-6" />, 'Запрошення скасовано', 'Власник скасував передачу або надіслав нове посилання.');
  if (t.status === 'expired') return box(<Clock className="w-6 h-6" />, 'Термін дії минув', 'Попросіть власника проєкту надіслати нове запрошення.');
  if (!d.matches)
    return box(
      <Mail className="w-6 h-6" />,
      'Увійдіть під іншою поштою',
      <>
        Запрошення надіслано на <b>{t.toEmail}</b>, а ви зараз увійшли як <b>{d.youAre}</b>.
        <button
          className="btn-primary w-full mt-5"
          onClick={async () => {
            await api.post('/api/auth/logout', {}).catch(() => {});
            window.location.href = `/login?next=${encodeURIComponent(`/transfer/${token}`)}`;
          }}
        >
          Увійти як {t.toEmail}
        </button>
        <p className="text-xs text-ink-400 mt-2">Немає акаунта з цією поштою? На сторінці входу оберіть «Зареєструватися».</p>
      </>,
    );
  return (
    <div className="max-w-lg mx-auto island p-8 animate-pop-in">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-brand-300 to-brand-500 text-white flex items-center justify-center"><ArrowRightLeft className="w-6 h-6" /></div>
      <h1 className="text-[22px] font-semibold tracking-tight mt-5">Вам передають проєкт</h1>
      <p className="text-ink-600 mt-2 leading-relaxed">
        <b>{d.fromEmail}</b> передає вам проєкт <b>«{d.projectName}»</b> з усіма фідами, дизайнами й картинками. Після прийняття він з’явиться серед ваших проєктів, а вихідні фіди працюватимуть як і раніше.
      </p>
      {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
      <div className="flex gap-2 mt-6">
        <button className="btn-primary flex-1" disabled={!!busy} onClick={() => act('accept')}>
          {busy === 'accept' ? <Spinner /> : <Check className="w-4 h-4" />} Прийняти проєкт
        </button>
        <button className="btn-outline" disabled={!!busy} onClick={() => act('decline')}>
          Відхилити
        </button>
      </div>
      <p className="text-xs text-ink-400 mt-4">Запрошення дійсне до {new Date(t.expiresAt).toLocaleDateString('uk-UA')}.</p>
    </div>
  );
}
