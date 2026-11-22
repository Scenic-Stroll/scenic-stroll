// /admin/pin/[id] — one page per pin. The expert adds sources, the "beyond Hong Kong" line and the AI
// reading versions; reviewers (admins) see every version and its questions next to the sources,
// edit them, approve or reject them, and publish. A pin goes live only when its adult version and
// all that version's questions are approved (the database checks too — publish_pin). D53.
import { PIN_LABEL_TEXT, type PinSource } from '@scenic/shared';
import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { generatePinVersions, lookupPinSource } from '@/lib/api';
import {
  addSource,
  pausePin,
  publishPin,
  removeSource,
  saveQuestion,
  saveVersionBody,
  setQuestionStatus,
  setVersionStatus,
  updatePin,
  useAdminPin,
  useMyPinRole,
  type AdminPin,
  type AdminQuestion,
  type AdminVersion,
} from '@/lib/pins-admin';
import { useAuth } from '@/providers/auth-provider';
import { radius, space, type, useAppTheme } from '@/theme';

import { Badge, Button, ErrorText, Field, Row, Section, STATUS_TEXT } from './parts';

/** Runs an action and shows its error, so every button reports failures the same way. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function PinReview({ id }: { id: string }) {
  const t = useAppTheme();
  const auth = useAuth();
  const role = useMyPinRole();
  const pin = useAdminPin(id);
  const actions = useAction();

  if (pin.isLoading || role.isLoading) return <ActivityIndicator style={styles.pad} />;
  if (pin.error) return <ErrorText text={pin.error.message} />;
  const p = pin.data;
  if (!p) return <Text style={styles.pad}>This pin doesn’t exist, or you can’t see it.</Text>;

  const me = auth.status === 'signed-in' ? auth.session.user.id : null;
  const admin = role.data === 'admin';
  const canEdit =
    admin || (p.author_expert_id === me && (p.status === 'draft' || p.status === 'in_review'));
  const adult = p.versions.find((v) => v.reading_level === 'adult');
  const readyToPublish =
    adult?.status === 'approved' &&
    adult.questions.length > 0 &&
    adult.questions.every((q) => q.status === 'approved');
  const status = STATUS_TEXT[p.status]!;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Row>
        <Text accessibilityRole="header" style={[type.heading, { color: t.textPrimary }]}>
          {p.title}
        </Text>
        <Badge text={status.text} tone={status.tone} />
        {p.status === 'live' ? <Badge text={PIN_LABEL_TEXT[p.label]} tone="ok" /> : null}
        {p.is_sample ? <Badge text="Sample content" tone="warn" /> : null}
      </Row>
      <Text style={[type.small, { color: t.textSecondary }]}>
        {p.place_kind === 'custom'
          ? p.place_description
          : `Attached to: ${p.place_kind.replace('_', ' ')}`}{' '}
        · radius {p.radius_m} m · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
        {p.topics.length ? ` · ${p.topics.join(', ')}` : ''}
        {p.sdg_tags.length ? ` · SDG ${p.sdg_tags.join(', ')}` : ''}
      </Text>

      <Row>
        {canEdit ? (
          <Button
            label={
              p.versions.length ? 'Regenerate reading versions (AI)' : 'Write reading versions (AI)'
            }
            disabled={actions.busy || !p.summary || p.sources.length === 0}
            onPress={() => void actions.run(() => generatePinVersions(p.id))}
          />
        ) : null}
        {p.author_expert_id === me && p.status === 'draft' ? (
          <Button
            label="Send for review"
            tone="primary"
            disabled={actions.busy || p.versions.length === 0}
            onPress={() => void actions.run(() => updatePin(p.id, { status: 'in_review' }))}
          />
        ) : null}
        {admin && p.status !== 'live' ? (
          <Button
            label="Publish (set live)"
            tone="primary"
            disabled={actions.busy || !readyToPublish}
            onPress={() => void actions.run(() => publishPin(p.id))}
          />
        ) : null}
        {admin && p.status === 'live' ? (
          <Button
            label="Pause"
            disabled={actions.busy}
            onPress={() => void actions.run(() => pausePin(p.id))}
          />
        ) : null}
      </Row>
      {actions.busy ? <ActivityIndicator /> : null}
      <ErrorText text={actions.error} />
      {admin && p.status !== 'live' && !readyToPublish ? (
        <Text style={[type.caption, { color: t.textSecondary }]}>
          Publishing needs the adult version and all its questions approved.
        </Text>
      ) : null}

      <View style={styles.columns}>
        <View style={styles.column}>
          <SummaryCard pin={p} canEdit={canEdit} />
          <SourcesCard pin={p} canEdit={canEdit} />
          <BeyondHongKong pin={p} canEdit={canEdit} />
        </View>
        <View style={styles.column}>
          {p.versions.length === 0 ? (
            <Section title="Reading versions">
              <Text>
                None yet. Add the summary and at least one source, then “Write reading versions”.
              </Text>
            </Section>
          ) : (
            p.versions.map((v) => (
              <VersionCard key={v.id} pinId={p.id} version={v} canEdit={canEdit} admin={admin} />
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}

function SummaryCard({ pin, canEdit }: { pin: AdminPin; canEdit: boolean }) {
  const [text, setText] = useState(pin.summary ?? '');
  const action = useAction();
  return (
    <Section title="Expert summary">
      {canEdit ? (
        <>
          <Field label="Summary" value={text} onChangeText={setText} multiline maxLength={2000} />
          <Button
            label="Save summary"
            disabled={action.busy || text.trim() === (pin.summary ?? '') || text.trim().length < 20}
            onPress={() => void action.run(() => updatePin(pin.id, { summary: text.trim() }))}
          />
          <ErrorText text={action.error} />
        </>
      ) : (
        <Text>{pin.summary ?? '—'}</Text>
      )}
    </Section>
  );
}

function SourcesCard({ pin, canEdit }: { pin: AdminPin; canEdit: boolean }) {
  const t = useAppTheme();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<PinSource | null | undefined>(undefined);
  const [webTitle, setWebTitle] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const action = useAction();

  const lookUp = () =>
    action.run(async () => {
      setFound(undefined);
      setFound(await lookupPinSource(query.trim()));
    });

  return (
    <Section title={`Sources cited (${pin.sources.length})`}>
      {pin.sources.map((s) => (
        <View key={s.id} style={styles.source}>
          <Text
            accessibilityRole="link"
            style={[type.body, { color: t.primary }]}
            onPress={() => void Linking.openURL(s.url)}
          >
            {s.title}
          </Text>
          <Row>
            <Badge text={s.source_db} />
            {s.doi ? <Badge text={`doi:${s.doi}`} /> : null}
            {s.is_open_access ? <Badge text="Open access" tone="ok" /> : null}
            {canEdit ? (
              <Button
                label="Remove"
                tone="danger"
                onPress={() => void action.run(() => removeSource(pin.id, s.id))}
              />
            ) : null}
          </Row>
        </View>
      ))}
      {canEdit ? (
        <>
          <Field
            label="Find a paper: DOI or title"
            hint="Looked up in OpenAlex, then Crossref."
            value={query}
            onChangeText={setQuery}
          />
          <Button
            label="Look up"
            disabled={action.busy || query.trim().length < 3}
            onPress={() => void lookUp()}
          />
          {found === null ? <Text>Nothing found — add it as a web source below.</Text> : null}
          {found ? (
            <View style={[styles.found, { backgroundColor: t.surface }]}>
              <Text>{found.title}</Text>
              <Text style={[type.caption, { color: t.textSecondary }]}>
                {found.source_db} · {found.is_open_access ? 'open access' : 'not open access'} ·{' '}
                {found.url}
              </Text>
              <Button
                label="Add this source"
                tone="primary"
                onPress={() =>
                  void action.run(async () => {
                    await addSource(pin.id, found);
                    setFound(undefined);
                    setQuery('');
                  })
                }
              />
            </View>
          ) : null}
          <Field label="Or a web page: title" value={webTitle} onChangeText={setWebTitle} />
          <Field
            label="Web page address"
            value={webUrl}
            onChangeText={setWebUrl}
            autoCapitalize="none"
            placeholder="https://…"
          />
          <Button
            label="Add web source"
            disabled={
              action.busy || webTitle.trim().length < 2 || !/^https?:\/\/\S+$/.test(webUrl.trim())
            }
            onPress={() =>
              void action.run(async () => {
                await addSource(pin.id, {
                  title: webTitle.trim(),
                  url: webUrl.trim(),
                  doi: null,
                  source_db: 'web',
                  is_open_access: true,
                });
                setWebTitle('');
                setWebUrl('');
              })
            }
          />
        </>
      ) : null}
      <ErrorText text={action.error} />
    </Section>
  );
}

function BeyondHongKong({ pin, canEdit }: { pin: AdminPin; canEdit: boolean }) {
  const [text, setText] = useState(pin.beyond_hk_text ?? '');
  const [sourceId, setSourceId] = useState<string | null>(pin.beyond_hk_source_id);
  const action = useAction();
  if (!canEdit && !pin.beyond_hk_text) return null;
  return (
    <Section title="Why it matters beyond Hong Kong (optional)">
      {canEdit ? (
        <>
          <Field label="One line" value={text} onChangeText={setText} maxLength={300} />
          <Text>Its source (needs its own):</Text>
          <Row>
            {pin.sources.map((s) => (
              <Chip
                key={s.id}
                small
                label={s.title.slice(0, 40)}
                selected={sourceId === s.id}
                onPress={() => setSourceId(s.id)}
              />
            ))}
          </Row>
          <Button
            label="Save"
            disabled={action.busy || (text.trim().length > 0 && !sourceId)}
            onPress={() =>
              void action.run(() =>
                updatePin(pin.id, {
                  beyond_hk_text: text.trim() || null,
                  beyond_hk_source_id: text.trim() ? sourceId : null,
                }),
              )
            }
          />
          <ErrorText text={action.error} />
        </>
      ) : (
        <Text>{pin.beyond_hk_text}</Text>
      )}
    </Section>
  );
}

const LEVEL_NAME = { child: 'Child', teen: 'Teen', adult: 'Adult' } as const;

function VersionCard({
  pinId,
  version,
  canEdit,
  admin,
}: {
  pinId: string;
  version: AdminVersion;
  canEdit: boolean;
  admin: boolean;
}) {
  const [body, setBody] = useState(version.body);
  const action = useAction();
  const status = STATUS_TEXT[version.status]!;
  return (
    <Section title={`${LEVEL_NAME[version.reading_level]} version`}>
      <Row>
        <Badge text={status.text} tone={status.tone} />
        {version.generated_by_ai ? <Badge text="Written by AI" tone="warn" /> : null}
        <Badge text={`${body.trim().split(/\s+/).length} words`} />
      </Row>
      {canEdit ? (
        <Field
          label={`${LEVEL_NAME[version.reading_level]} text`}
          hint="Saving a change sends this version and its questions back to review."
          value={body}
          onChangeText={setBody}
          multiline
        />
      ) : (
        <Text>{version.body}</Text>
      )}
      <Row>
        {canEdit ? (
          <Button
            label="Save text"
            disabled={action.busy || body === version.body}
            onPress={() => void action.run(() => saveVersionBody(pinId, version.id, body))}
          />
        ) : null}
        {admin && version.status !== 'approved' ? (
          <Button
            label="Approve text"
            tone="primary"
            disabled={action.busy || body !== version.body}
            onPress={() => void action.run(() => setVersionStatus(pinId, version.id, 'approved'))}
          />
        ) : null}
        {admin && version.status !== 'draft' ? (
          <Button
            label="Reject"
            tone="danger"
            disabled={action.busy}
            onPress={() => void action.run(() => setVersionStatus(pinId, version.id, 'draft'))}
          />
        ) : null}
      </Row>
      <ErrorText text={action.error} />
      {version.questions.map((q) => (
        <QuestionCard key={q.id} pinId={pinId} question={q} canEdit={canEdit} admin={admin} />
      ))}
    </Section>
  );
}

function QuestionCard({
  pinId,
  question,
  canEdit,
  admin,
}: {
  pinId: string;
  question: AdminQuestion;
  canEdit: boolean;
  admin: boolean;
}) {
  const t = useAppTheme();
  const [prompt, setPrompt] = useState(question.prompt);
  const [options, setOptions] = useState(question.options.join('\n'));
  const [answer, setAnswer] = useState(question.answer);
  const [explanation, setExplanation] = useState(question.explanation);
  const action = useAction();
  const optionList = options
    .split('\n')
    .map((o) => o.trim())
    .filter(Boolean);
  const changed =
    prompt !== question.prompt ||
    options !== question.options.join('\n') ||
    answer !== question.answer ||
    explanation !== question.explanation;
  const status = STATUS_TEXT[question.status]!;

  return (
    <View style={[styles.question, { borderColor: t.border }]}>
      <Row>
        <Text style={[type.small, styles.bold]}>Question</Text>
        <Badge text={status.text} tone={status.tone} />
      </Row>
      {canEdit ? (
        <>
          <Field label="Question" value={prompt} onChangeText={setPrompt} />
          <Field
            label="Options (one per line)"
            value={options}
            onChangeText={setOptions}
            multiline
          />
          <Field label="Answer (copy one option exactly)" value={answer} onChangeText={setAnswer} />
          <Field label="Explanation" value={explanation} onChangeText={setExplanation} multiline />
        </>
      ) : (
        <>
          <Text>{question.prompt}</Text>
          {question.options.map((o) => (
            <Text key={o}>
              {o === question.answer ? '✓ ' : '• '}
              {o}
            </Text>
          ))}
          <Text style={[type.caption, { color: t.textSecondary }]}>{question.explanation}</Text>
        </>
      )}
      <Row>
        {canEdit ? (
          <Button
            label="Save question"
            disabled={action.busy || !changed || !optionList.includes(answer.trim())}
            onPress={() =>
              void action.run(() =>
                saveQuestion(pinId, {
                  ...question,
                  prompt: prompt.trim(),
                  options: optionList,
                  answer: answer.trim(),
                  explanation: explanation.trim(),
                }),
              )
            }
          />
        ) : null}
        {admin && question.status !== 'approved' ? (
          <Button
            label="Approve question"
            tone="primary"
            disabled={action.busy || changed}
            onPress={() => void action.run(() => setQuestionStatus(pinId, question.id, 'approved'))}
          />
        ) : null}
        {canEdit ? (
          <Button
            label="Delete question"
            tone="danger"
            disabled={action.busy}
            onPress={() => void action.run(() => setQuestionStatus(pinId, question.id, 'rejected'))}
          />
        ) : null}
      </Row>
      <ErrorText text={action.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, maxWidth: 1280, width: '100%', alignSelf: 'center' },
  pad: { padding: space.xl },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, alignItems: 'flex-start' },
  column: { flexGrow: 1, flexBasis: 420, gap: space.lg },
  source: { gap: space.xs },
  found: { padding: space.md, borderRadius: radius.md, gap: space.xs },
  question: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  bold: { fontWeight: '600' },
});
