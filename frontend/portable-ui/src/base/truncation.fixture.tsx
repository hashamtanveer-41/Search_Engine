import { defineFixtures } from '../fixture';

export default defineFixtures({
  component: 'base/truncation',
  title: 'Full text for cut-off text',
  frame: { width: 420, padding: 16 },
  cases: {
    'one line and clamped': () => (
      <div className="grid gap-4 text-[13px]">
        <p className="w-64 truncate rounded-md border px-2 py-1.5 font-semibold">GET /authorize?client_id=demo-app&amp;redirect_uri=https://app.example/callback&amp;scope=openid</p>
        <p className="line-clamp-2 w-72 text-muted-foreground">The app sends the user to the identity provider, which asks them to sign in and to agree to share their name and email, then sends them back with a one-time code.</p>
        <p className="w-64 truncate">Fits on one line.</p>
      </div>
    ),
  },
  play: { 'one line and clamped': [{ wait: 300 }, { hover: 'p >> nth=0' }, { wait: 900 }, { hover: 'p >> nth=1' }, { wait: 900 }] },
});
