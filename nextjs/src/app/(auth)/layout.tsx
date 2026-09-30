import { RedirectIfAuthenticated } from "./redirect-if-authenticated";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page flex items-center justify-center min-h-[calc(100vh-8rem)] py-12 px-4">
      <div className="auth-shell w-full max-w-md">
        <RedirectIfAuthenticated>{children}</RedirectIfAuthenticated>
      </div>
    </div>
  );
}
