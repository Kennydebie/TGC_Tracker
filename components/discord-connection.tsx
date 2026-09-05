'use client';
import { useCallback, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Circle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Connection = {
  connected: boolean;
  status: string;
  inviteUrl: string | null;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
  lastHeartbeatAt: string | null;
  lastMessageAt: string | null;
  lastIngestAt: string | null;
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString('nl-NL') : 'Not yet received';
export function DiscordConnection({
  signedIn,
  signInPath,
  onRefresh,
}: {
  signedIn: boolean;
  signInPath: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Connection | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('TCG restocks');
  const [guild, setGuild] = useState('');
  const [channel, setChannel] = useState('');
  const load = useCallback(async (probe = false) => {
    try {
      const response = await fetch('/api/community/discord/setup', {
        method: probe ? 'POST' : 'GET',
        cache: 'no-store',
      });
      const result = (await response.json()) as {
        error?: string;
        data: Connection;
      };
      if (!response.ok)
        throw new Error(result.error ?? 'Connection check failed.');
      setData(result.data);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection check failed.');
    }
  }, []);
  const check = async () => {
    setBusy(true);
    await load(true);
    onRefresh();
    setBusy(false);
  };
  const save = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/community/sources', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          platform: 'discord',
          name,
          externalCommunityId: guild,
          externalChannelId: channel,
          enabled: true,
          games: ['Pokémon', 'Riftbound'],
          categories: ['Deals', 'Restocks', 'Prices', 'Reprints'],
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'Could not save channel.');
      setNotice(
        'Channel selected. A running listener picks up changes within 30 seconds. Check the connection below.',
      );
      await load();
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save channel.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        className="gold-button"
        onClick={() => {
          setOpen(true);
          if (signedIn) void load();
        }}
      >
        <Bot />
        Connect Discord
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="discord-connect-dialog">
          <DialogHeader>
            <DialogTitle>Connect Discord</DialogTitle>
            <DialogDescription>
              Read selected TCG channels through your official bot. Real
              community messages are visible only to the app owner.
            </DialogDescription>
          </DialogHeader>
          {!signedIn ? (
            <a
              className={buttonVariants({ variant: 'default' })}
              href={signInPath}
            >
              Sign in with ChatGPT to configure
            </a>
          ) : (
            <>
              {error && (
                <p role="alert" className="community-notice">
                  {error}
                </p>
              )}
              {notice && <output className="community-notice">{notice}</output>}
              <ol className="discord-connect-steps">
                <li>
                  <strong>1. Create your bot</strong>
                  <p>
                    Create “TCG Scout” in the Developer Portal. Under Bot,
                    enable Message Content Intent. Configure its bot token and
                    application ID as server secrets.
                  </p>
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Developer Portal <ExternalLink size={14} />
                  </a>
                </li>
                <li>
                  <strong>2. Add it to a TCG server</strong>
                  <p>
                    You need Manage Server permission, or an administrator must
                    install it for you. The bot can read only servers where it
                    is installed.
                  </p>
                  {data?.inviteUrl ? (
                    <a href={data.inviteUrl} target="_blank" rel="noreferrer">
                      Invite TCG Scout <ExternalLink size={14} />
                    </a>
                  ) : (
                    <p>Set the application ID to enable the invite link.</p>
                  )}
                  <small>
                    Requests View Channels and Read Message History. No
                    permission to send messages.
                  </small>
                </li>
                <li>
                  <strong>3. Choose a channel</strong>
                  <p>
                    In Discord, enable Settings → Advanced → Developer Mode.
                    Right-click the server and channel to copy their IDs.
                  </p>
                  <form className="community-source-form" onSubmit={save}>
                    <label>
                      Source name
                      <input
                        required
                        maxLength={200}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label>
                      Server ID
                      <input
                        required
                        inputMode="numeric"
                        pattern="[0-9]{5,30}"
                        value={guild}
                        onChange={(e) => setGuild(e.target.value.trim())}
                      />
                    </label>
                    <label>
                      Channel ID
                      <input
                        required
                        inputMode="numeric"
                        pattern="[0-9]{5,30}"
                        value={channel}
                        onChange={(e) => setChannel(e.target.value.trim())}
                      />
                    </label>
                    <Button type="submit" disabled={busy || !data}>
                      Save channel
                    </Button>
                  </form>
                </li>
                <li>
                  <strong>4. Start the listener</strong>
                  <p>
                    The bot needs the separate Discord worker running on an
                    always-on host. The web app alone does not keep it online.
                    The worker connects using its bot token and the app’s
                    ingestion secret.
                  </p>
                </li>
                <li>
                  <strong>5. Check a real message</strong>
                  <p>
                    After all checks pass, post a normal TCG restock or price
                    message in your selected channel, without mentioning the
                    bot. For example: “Pokémon Prismatic Evolutions ETB restock
                    €109 at Amazon DE”. Open Recent signals to confirm it
                    arrived. Direct messages and messages written by bots are
                    ignored.
                  </p>
                </li>
              </ol>
              <div className="discord-checks">
                <header>
                  <strong>
                    {data?.status.replaceAll('_', ' ') ?? 'Loading connection'}
                  </strong>
                  <Button onClick={() => void check()} disabled={busy}>
                    {busy ? <RefreshCw className="spin" /> : <RefreshCw />}Check
                    connection
                  </Button>
                </header>
                {data?.checks.map((item) => (
                  <div key={item.label}>
                    {item.ok ? <CheckCircle2 /> : <Circle />}
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                  </div>
                ))}
                {data && (
                  <dl>
                    <dt>Last listener heartbeat</dt>
                    <dd>{date(data.lastHeartbeatAt)}</dd>
                    <dt>Last accepted message</dt>
                    <dd>{date(data.lastMessageAt)}</dd>
                    <dt>Last successful ingestion</dt>
                    <dd>{date(data.lastIngestAt)}</dd>
                  </dl>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
