import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View, useWindowDimensions } from 'react-native';
import { api, type Beacon as BeaconToken, type Mark, type SessionDetail } from '../api/client';
import { createBeacon, type Beacon } from '../ble';
import { shareCsv } from '../lib/share';
import { REASON_LABEL, fmtAgo, fmtClock, fmtCountdown, fmtDay, initials } from '../lib/format';
import { useApp } from '../store/app';
import { colors, space } from '../theme/tokens';
import { Icon } from './Icon';
import { PulseRing } from './PulseRing';
import { Screen } from './Screen';
import { SignalBand } from './Signal';
import { Banner, Bar, Button, Card, Chip, Mono, T } from './ui';

type Roster = { id: number; name: string; rollNo: string }[];

export function SessionView({ id, onDone, backLabel }: { id: number; onDone?: () => void; backLabel?: string }) {
  const { live, bleMode, setBleMode } = useApp();
  const { width } = useWindowDimensions();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [roster, setRoster] = useState<Roster>([]);
  const [token, setToken] = useState<BeaconToken | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [bleError, setBleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const beaconRef = useRef<Beacon | null>(null);

  const open = detail?.status === 'open';

  const refresh = useCallback(async () => {
    try {
      const d = await api.get<SessionDetail>(`/sessions/${id}`);
      setDetail(d);
      if (d.beacon) setToken(d.beacon);
      setRoster(await api.get<Roster>(`/courses/${d.courseId}/students`));
      setError(null);
    } catch (e) { setError((e as Error).message); }
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Clock for the time-left readout
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Live events: token rotations, marks, close
  useEffect(() => {
    live.subscribe(id);
    const off = live.on((e) => {
      if (e.sessionId !== id) return;
      if (e.type === 'token') {
        setToken({ token: e.token, windowIdx: e.windowIdx, expiresAt: e.expiresAt, rotateS: e.rotateS });
        setPulseKey((k) => k + 1);
      } else if (e.type === 'mark') {
        setDetail((d) => d && !d.marks.some((m) => m.userId === e.mark.userId) ? { ...d, marks: [e.mark, ...d.marks] } : d);
      } else if (e.type === 'unmark') {
        setDetail((d) => d && { ...d, marks: d.marks.filter((m) => m.userId !== e.userId) });
      } else if (e.type === 'closed') {
        void refresh();
      }
    });
    return () => { off(); live.unsubscribe(id); };
  }, [id, live, refresh]);

  // Rejections change without a socket event, so refresh them when a mark lands or on a slow timer.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => {
      api.get<SessionDetail>(`/sessions/${id}`).then((d) => setDetail((cur) => cur && { ...cur, rejections: d.rejections, status: d.status, endsAt: d.endsAt })).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [id, open]);

  // Broadcast every token the server hands us
  useEffect(() => {
    if (!open) return;
    const beacon = createBeacon(bleMode, live);
    beaconRef.current = beacon;
    return () => { void beacon.stop(); beaconRef.current = null; };
  }, [open, bleMode, live]);

  useEffect(() => {
    if (!open || !token || !beaconRef.current) return;
    beaconRef.current
      .broadcast({ sessionId: id, token: token.token })
      .then(() => setBleError(null))
      .catch((e: Error) => setBleError(e.message));
  }, [open, token, id, bleMode]);

  const marked = useMemo(() => new Set(detail?.marks.map((m) => m.userId)), [detail?.marks]);
  const absent = roster.filter((r) => !marked.has(r.id));

  const addManual = async (rollNo: string) => {
    try { await api.post(`/sessions/${id}/marks/manual`, { rollNo }); }
    catch (e) { Alert.alert('Could not add', (e as Error).message); }
  };
  const remove = (m: Mark) => {
    Alert.alert(`Remove ${m.name}?`, 'They will show as absent for this session.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { api.del(`/sessions/${id}/marks/${m.userId}`).catch((e) => Alert.alert('Could not remove', e.message)); } },
    ]);
  };
  const close = () => {
    Alert.alert('Close this session?', 'Students will no longer be marked. You can still add or remove marks afterwards.', [
      { text: 'Keep running', style: 'cancel' },
      { text: 'Close session', style: 'destructive', onPress: async () => { try { await api.post(`/sessions/${id}/close`); await refresh(); } catch (e) { Alert.alert('Could not close', (e as Error).message); } } },
    ]);
  };
  const exportCsv = async () => {
    if (!detail) return;
    setExporting(true);
    try { await shareCsv(`/sessions/${id}/export.csv`, `${detail.course.code}-${new Date(detail.startedAt).toISOString().slice(0, 10)}.csv`); }
    catch (e) { Alert.alert('Could not export', (e as Error).message); }
    finally { setExporting(false); }
  };

  if (!detail) {
    return (
      <Screen eyebrow="Session" title="Loading">
        {error ? <Banner tone="flare" title="Can’t load this session">{error}</Banner> : null}
      </Screen>
    );
  }

  const present = detail.marks.length;
  const percent = detail.enrolled ? Math.round((present / detail.enrolled) * 100) : 0;
  const msLeft = detail.endsAt - now;
  const ring = Math.min(width - space.xl * 2 - space.xl, 280);

  return (
    <Screen
      eyebrow={open ? `${detail.course.code} · live` : `${detail.course.code} · ${fmtDay(detail.startedAt)}`}
      title={detail.course.name}
      right={open ? (
        <View style={{ alignItems: 'flex-end' }}>
          <T variant="label" color={colors.inkSoft}>Time left</T>
          <Mono size={22} bold color={msLeft < 30_000 ? colors.flare : colors.ink}>{fmtCountdown(msLeft)}</Mono>
        </View>
      ) : <Chip label="Closed" />}
    >
      {backLabel && onDone ? (
        <Pressable onPress={onDone} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
          <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="chevron" size={16} color={colors.signal} /></View>
          <T variant="small" color={colors.signal} style={{ fontFamily: 'Archivo_700Bold' }}>{backLabel}</T>
        </Pressable>
      ) : null}

      {open ? (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: space.xl }}>
            <PulseRing state="broadcast" size={ring} token={token?.token} expiresAt={token?.expiresAt} rotateS={detail.rotateS} pulseKey={pulseKey} />
          </Card>
          <View style={{ alignItems: 'center', gap: space.sm }}>
            <T variant="body" color={colors.inkSoft} style={{ textAlign: 'center' }}>
              Keep this screen open. The code changes every {detail.rotateS} seconds, so a screenshot is useless.
            </T>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Chip label={bleMode === 'native' ? 'Bluetooth' : 'Simulated signal'} tone={bleMode === 'native' ? 'signal' : 'neutral'} />
              <Chip label={`Range ${detail.rssiMin} dBm`} />
            </View>
          </View>
          {bleError ? (
            <Banner tone="flare" title="Not broadcasting">
              {bleError}
            </Banner>
          ) : null}
          {bleError && bleMode === 'native' ? <Button small variant="ghost" label="Switch to simulated signal" onPress={() => { setBleError(null); setBleMode('sim'); }} /> : null}
        </>
      ) : (
        <Card tone={percent >= 75 ? 'locked' : 'paper'} style={{ gap: space.sm }}>
          <T variant="label" color={colors.inkSoft}>Final attendance</T>
          <T variant="display" color={colors.ink}>{percent}%</T>
          <T variant="small" color={colors.inkSoft}>{fmtClock(detail.startedAt)} to {fmtClock(detail.closedAt ?? detail.endsAt)}</T>
        </Card>
      )}

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T variant="label" color={colors.inkSoft}>Present</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T variant="display" color={colors.locked}>{present}</T>
            <T variant="h2" color={colors.inkSoft}>/ {detail.enrolled}</T>
          </View>
        </View>
        <Bar value={detail.enrolled ? present / detail.enrolled : 0} />
      </Card>

      {detail.rejections.length > 0 ? (
        <Card tone="flare" style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Icon name="shield" size={18} color={colors.flare} />
            <T variant="title">{detail.rejections.length} blocked {detail.rejections.length === 1 ? 'attempt' : 'attempts'}</T>
          </View>
          {detail.rejections.slice(0, 4).map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
              <T variant="small" style={{ flex: 1 }}>{r.name ?? 'Unknown device'} · {REASON_LABEL[r.reason] ?? r.reason}</T>
              <T variant="small" color={colors.inkSoft}>{fmtAgo(r.at, now)}</T>
            </View>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <T variant="label" color={colors.inkSoft}>Marked ({present})</T>
        {present === 0 ? <T variant="small" color={colors.inkSoft}>{open ? 'Nobody yet. Students appear here the moment their phone hears the signal.' : 'Nobody was marked.'}</T> : null}
        {detail.marks.map((m) => (
          <Card key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lockedSoft, alignItems: 'center', justifyContent: 'center' }}>
              <T variant="title" color={colors.locked}>{initials(m.name)}</T>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="title" numberOfLines={1}>{m.name}</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <Mono size={12} color={colors.inkSoft}>{m.rollNo}</Mono>
                {m.source === 'manual' ? <Chip label="Added by you" /> : <SignalBand rssi={m.rssi} min={detail.rssiMin} showDbm={false} />}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Mono size={12} color={colors.inkSoft}>{fmtClock(m.at)}</Mono>
              <Pressable onPress={() => remove(m)} accessibilityRole="button" accessibilityLabel={`Remove ${m.name}`} hitSlop={10}>
                <Icon name="x" size={18} color={colors.flare} />
              </Pressable>
            </View>
          </Card>
        ))}
      </View>

      {absent.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <T variant="label" color={colors.inkSoft}>Not marked ({absent.length})</T>
          {absent.map((r) => (
            <Card key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="title" numberOfLines={1}>{r.name}</T>
                <Mono size={12} color={colors.inkSoft}>{r.rollNo}</Mono>
              </View>
              <Button small variant="ghost" label="Mark present" onPress={() => addManual(r.rollNo)} />
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Button label="Export CSV" icon="download" variant={open ? 'ghost' : 'primary'} onPress={exportCsv} loading={exporting} />
        {open ? <Button label="Close session" variant="danger" onPress={close} /> : null}
        {!open && onDone && !backLabel ? <Button label="Done" variant="ink" onPress={onDone} /> : null}
      </View>
    </Screen>
  );
}
