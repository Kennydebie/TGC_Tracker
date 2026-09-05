'use client';

import {
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  CreatedScoutIntegrationCredential,
  ScoutIntegrationCredentialMetadata,
} from '@/lib/scout-integration';

const CREDENTIALS_PATH = '/api/integrations/scout-mcp/credentials';
const CHATGPT_OAUTH_SUBJECT = 'github:56995940';
const CHATGPT_SCOPES = ['scout:read', 'scout:write'] as const;

type ApiPayload<T> = { data?: T; error?: string };

async function readApiPayload<T>(response: Response): Promise<ApiPayload<T>> {
  try {
    return (await response.json()) as ApiPayload<T>;
  } catch {
    return {};
  }
}

function dateLabel(value: string | null) {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Unknown'
    : date.toLocaleString('nl-NL', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      });
}

function statusVariant(status: ScoutIntegrationCredentialMetadata['status']) {
  return status === 'active'
    ? ('secondary' as const)
    : status === 'revoked'
      ? ('destructive' as const)
      : ('outline' as const);
}

export function ScoutIntegrationCredentials() {
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState<
    ScoutIntegrationCredentialMetadata[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeTarget, setRevokeTarget] =
    useState<ScoutIntegrationCredentialMetadata | null>(null);
  const [oneTimeToken, setOneTimeToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sessionRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(CREDENTIALS_PATH, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload =
          await readApiPayload<ScoutIntegrationCredentialMetadata[]>(response);
        if (!response.ok || !Array.isArray(payload.data))
          throw new Error(
            payload.error ?? 'Integration credentials could not be loaded.',
          );
        setCredentials(payload.data);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Integration credentials could not be loaded.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen && creating) {
      setNotice(
        'Credential creation is still finishing. Keep this dialog open so the one-time token is not lost.',
      );
      return;
    }
    sessionRef.current += 1;
    setOpen(nextOpen);
    if (nextOpen) {
      setLoading(true);
      setError('');
    }
    if (!nextOpen) {
      setOneTimeToken(null);
      setCopied(false);
      setError('');
      setNotice('');
      setCreating(false);
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  const createCredential = async () => {
    const session = sessionRef.current;
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(CREDENTIALS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label: 'Hourly ChatGPT research task',
          oauthSubject: CHATGPT_OAUTH_SUBJECT,
          scopes: [...CHATGPT_SCOPES],
          expiresAt: null,
        }),
      });
      const payload =
        await readApiPayload<CreatedScoutIntegrationCredential>(response);
      if (
        !response.ok ||
        !payload.data?.credential ||
        typeof payload.data.token !== 'string'
      )
        throw new Error(
          payload.error ?? 'The integration credential could not be created.',
        );
      if (session !== sessionRef.current) return;
      setCredentials((current) => [
        payload.data!.credential,
        ...current.filter(
          (credential) => credential.id !== payload.data!.credential.id,
        ),
      ]);
      setCopied(false);
      setOneTimeToken(payload.data.token);
      setNotice('Credential created. Save the one-time token before leaving.');
    } catch (caught) {
      if (session !== sessionRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : 'The integration credential could not be created.',
      );
    } finally {
      if (session === sessionRef.current) setCreating(false);
    }
  };

  const copyToken = async () => {
    if (!oneTimeToken) return;
    try {
      await navigator.clipboard.writeText(oneTimeToken);
      setCopied(true);
      setError('');
    } catch {
      setCopied(false);
      setError(
        'Clipboard access was blocked. Select and copy the token manually before dismissing it.',
      );
    }
  };

  const revokeCredential = async () => {
    if (!revokeTarget) return;
    const targetId = revokeTarget.id;
    const session = sessionRef.current;
    setRevoking(true);
    setError('');
    try {
      const response = await fetch(
        `${CREDENTIALS_PATH}/${encodeURIComponent(targetId)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const payload = await readApiPayload<never>(response);
        throw new Error(
          payload.error ?? 'The integration credential could not be revoked.',
        );
      }
      if (session !== sessionRef.current) return;
      const revokedAt = new Date().toISOString();
      setCredentials((current) =>
        current.map((credential) =>
          credential.id === targetId
            ? { ...credential, revokedAt, status: 'revoked' }
            : credential,
        ),
      );
      setRevokeTarget(null);
      setNotice('Credential revoked. Future requests using it will be denied.');
    } catch (caught) {
      if (session !== sessionRef.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : 'The integration credential could not be revoked.',
      );
      setRevokeTarget(null);
    } finally {
      if (session === sessionRef.current) setRevoking(false);
    }
  };

  return (
    <div className="scout-integration-entry">
      <Button
        variant="outline"
        className="iron-button"
        onClick={() => changeOpen(true)}
      >
        <KeyRound /> Manage ChatGPT research access
      </Button>
      <span>
        Owner-only access for the hourly Community Scout research task.
      </span>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent
          className="scout-integration-dialog"
          showCloseButton={!creating}
        >
          <DialogHeader>
            <DialogTitle>ChatGPT research access</DialogTitle>
            <DialogDescription>
              Create and revoke the credential used by the hourly Community
              Scout task. This owner-only control never displays stored token
              secrets.
            </DialogDescription>
          </DialogHeader>

          <section
            className="scout-integration-binding"
            aria-label="Fixed integration identity"
          >
            <ShieldCheck />
            <div>
              <strong>Fixed GitHub identity</strong>
              <code>{CHATGPT_OAUTH_SUBJECT}</code>
            </div>
            <div className="scout-integration-scopes">
              {CHATGPT_SCOPES.map((scope) => (
                <Badge key={scope} variant="outline">
                  {scope}
                </Badge>
              ))}
            </div>
          </section>

          <div className="scout-integration-actions">
            <Button
              className="gold-button"
              disabled={creating || Boolean(oneTimeToken)}
              onClick={() => void createCredential()}
            >
              {creating ? <RefreshCw className="spin" /> : <KeyRound />}
              Create credential
            </Button>
            <small>
              {creating
                ? 'Creating credential—keep this dialog open until the one-time token appears.'
                : 'The scopes and OAuth subject are fixed. Revoke unused credentials promptly.'}
            </small>
          </div>

          {oneTimeToken ? (
            <section
              className="scout-integration-secret"
              aria-labelledby="scout-one-time-token-heading"
            >
              <header>
                <ShieldCheck />
                <div>
                  <strong id="scout-one-time-token-heading">
                    Save this token now—it cannot be shown again
                  </strong>
                  <p>
                    Copy it into a password manager or the Cloudflare Worker
                    secret. Closing this dialog or dismissing the token removes
                    it permanently from this screen.
                  </p>
                </div>
              </header>
              <input
                aria-label="One-time Community Scout bearer token"
                autoComplete="off"
                readOnly
                spellCheck={false}
                value={oneTimeToken}
              />
              <div>
                <Button variant="outline" onClick={() => void copyToken()}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? 'Copied' : 'Copy token'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setOneTimeToken(null);
                    setCopied(false);
                    setNotice('The one-time token was dismissed.');
                  }}
                >
                  I saved it — dismiss token
                </Button>
              </div>
            </section>
          ) : null}

          {error ? (
            <p
              className="community-notice scout-integration-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          {notice ? (
            <output className="community-notice" aria-live="polite">
              {notice}
            </output>
          ) : null}

          <section
            className="scout-integration-list"
            aria-label="Integration credentials"
            aria-busy={loading}
          >
            <header>
              <div>
                <span>ISSUED CREDENTIALS</span>
                <h3>Community Scout access</h3>
              </div>
              <small>{credentials.length} shown</small>
            </header>
            {loading ? (
              <p className="community-empty-evidence">
                <RefreshCw className="spin" /> Loading credentials…
              </p>
            ) : credentials.length ? (
              credentials.map((credential) => (
                <article key={credential.id}>
                  <header>
                    <div>
                      <strong>{credential.label}</strong>
                      <code>{credential.tokenId.slice(0, 10)}…</code>
                    </div>
                    <Badge variant={statusVariant(credential.status)}>
                      {credential.status}
                    </Badge>
                  </header>
                  <dl>
                    <div>
                      <dt>OAuth subject</dt>
                      <dd>{credential.oauthSubject}</dd>
                    </div>
                    <div>
                      <dt>Scopes</dt>
                      <dd>{credential.scopes.join(', ') || 'None'}</dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd>{dateLabel(credential.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>Last used</dt>
                      <dd>{dateLabel(credential.lastUsedAt)}</dd>
                    </div>
                    <div>
                      <dt>Expires</dt>
                      <dd>
                        {credential.expiresAt
                          ? dateLabel(credential.expiresAt)
                          : 'No expiry'}
                      </dd>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={credential.status === 'revoked'}
                    onClick={() => setRevokeTarget(credential)}
                  >
                    <Trash2 />
                    {credential.status === 'revoked' ? 'Revoked' : 'Revoke'}
                  </Button>
                </article>
              ))
            ) : (
              <p className="community-empty-evidence">
                No Community Scout credentials have been created.
              </p>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(nextOpen) => !nextOpen && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this credential?</AlertDialogTitle>
            <AlertDialogDescription>
              The hourly research task will immediately lose access if it uses
              this credential. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoking}
              onClick={() => void revokeCredential()}
            >
              {revoking ? <RefreshCw className="spin" /> : <Trash2 />}
              Revoke credential
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
