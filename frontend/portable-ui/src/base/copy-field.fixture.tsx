import { defineFixtures } from '../fixture';
import { CopyField } from './copy-field';
import { Field } from './field';

export default defineFixtures({
  component: 'base/copy-field',
  title: 'CopyField',
  frame: { width: 420, padding: 16 },
  cases: {
    'one line and several': () => (
      <div className="grid gap-4">
        <Field label="Invite link"><CopyField value="https://app.example/join/DEMO100-F26" /></Field>
        <Field label="Token setup" hint="Paste it into your shell.">
          <CopyField value={'export APP_SERVER=https://app.example\nexport APP_TOKEN=tok_3f9c2a71d8e44b05'} />
        </Field>
      </div>
    ),
  },
});
