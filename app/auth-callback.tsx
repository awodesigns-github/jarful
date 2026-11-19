import { Redirect, type Href } from 'expo-router';

/**
 * The OAuth return (jarful://auth-callback). The sign-in hook finishes the exchange itself;
 * this route only lands the person back on Account instead of an unmatched route.
 */
export default function AuthCallback() {
  return <Redirect href={'/account' as Href} />;
}
