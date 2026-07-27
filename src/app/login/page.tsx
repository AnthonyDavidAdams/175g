import { buildMetadata } from "@/lib/seo";
import LoginForm from "./login-form";

export const metadata = buildMetadata({
  title: "Sign in",
  description: "Sign in to 175g to build and run your tournament.",
  path: "/login",
});

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <span className="mono">175g</span>
      <h1 className="display mt-3 text-4xl">Sign in</h1>
      <p className="mt-4 leading-relaxed text-[var(--color-dim)]">
        No password. Enter your email and we&apos;ll send a link that signs you in
        and remembers this device.
      </p>
      <LoginForm />
    </main>
  );
}
