import { Button } from '@/components/ui/button';
import { NativeNavigationLink } from '@/components/native-navigation-link';

export default function NotFound() {
  return (
    <main className="standalone-state">
      <span className="eyebrow">404 · Uncharted realm</span>
      <h1>This TCG Scout page does not exist.</h1>
      <p>
        The requested route is not part of the market intelligence workspace.
      </p>
      <Button
        className="gold-button"
        nativeButton={false}
        render={
          <NativeNavigationLink href="/" aria-label="Return to Scout Board" />
        }
      >
        Return to Scout Board
      </Button>
    </main>
  );
}
