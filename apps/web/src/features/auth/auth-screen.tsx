import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowUpRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { ApiError } from "@/api";
import { AppBrand } from "@/components/app-brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthenticate, type AuthMode } from "@/features/auth/queries";

const authCopy = {
  login: {
    kicker: "Welcome back",
    title: "Sign in to continue",
    action: "Continue",
  },
  register: {
    kicker: "Create your identity",
    title: "Join event / chat",
    action: "Create account",
  },
} satisfies Record<AuthMode, Record<string, string>>;

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("login");
  const authenticate = useAuthenticate();
  const copy = authCopy[mode];

  function selectMode(value: string) {
    if (value !== "login" && value !== "register") return;
    setMode(value);
    authenticate.reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    authenticate.mutate({
      mode,
      username: String(form.get("username") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
  }

  const errorMessage = authenticate.isError
    ? authenticate.error instanceof ApiError
      ? authenticate.error.message
      : "Unable to authenticate. Please try again."
    : null;

  return (
    <main className="min-h-svh animate-in fade-in duration-500 lg:grid lg:grid-cols-[minmax(21rem,0.82fr)_minmax(30rem,1.18fr)]">
      <section className="relative flex min-h-[19rem] flex-col justify-between overflow-hidden bg-foreground px-6 py-7 text-background sm:px-10 lg:min-h-svh lg:px-12 lg:py-10">
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-32 size-96 rounded-full bg-emerald-400/10 blur-3xl"
        />
        <AppBrand inverted className="relative" />

        <div className="relative my-12 max-w-lg lg:my-0">
          <p className="mb-4 text-[11px] font-bold tracking-[0.17em] text-emerald-300 uppercase">
            A real-time systems study
          </p>
          <h1 className="max-w-md font-serif text-4xl leading-[0.98] font-normal tracking-[-0.045em] text-balance sm:text-5xl lg:text-7xl">
            Conversation starts with identity.
          </h1>
          <p className="mt-6 text-sm text-background/60">
            Secure sessions now. Durable messages next.
          </p>
        </div>

        <div className="relative hidden grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-background/15 pt-5 text-xs text-background/55 sm:grid">
          <span className="text-emerald-300 tabular-nums">02</span>
          <span>Authentication and user discovery</span>
          <span className="text-background">In progress</span>
        </div>
      </section>

      <section className="grid min-h-[calc(100svh-19rem)] place-items-center bg-[linear-gradient(rgba(16,32,25,0.035)_1px,transparent_1px)] bg-[length:100%_4rem] px-6 py-14 sm:px-10 lg:min-h-svh lg:px-12">
        <div className="w-full max-w-[27rem]">
          <header>
            <p className="mb-4 text-[11px] font-bold tracking-[0.16em] text-primary uppercase">
              {copy.kicker}
            </p>
            <h2 className="font-serif text-4xl leading-none font-normal tracking-[-0.04em] sm:text-5xl">
              {copy.title}
            </h2>
          </header>

          <Tabs value={mode} onValueChange={selectMode} className="mt-10">
            <TabsList className="h-auto w-full justify-start gap-7 rounded-none border-b border-border bg-transparent p-0">
              <TabsTrigger
                value="login"
                className="rounded-none border-b-2 border-transparent px-0 pb-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Sign in
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-none border-b-2 border-transparent px-0 pb-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Register
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <form
            className="mt-8 grid animate-in gap-6 fade-in slide-in-from-right-2 duration-300"
            key={mode}
            onSubmit={handleSubmit}
            aria-describedby={errorMessage ? "auth-error" : undefined}
          >
            <div className="grid gap-2.5">
              <Label htmlFor={`${mode}-username`} className="text-xs text-muted-foreground">
                Username
              </Label>
              <Input
                id={`${mode}-username`}
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
                placeholder="alice"
                required
                autoFocus
                className="h-12 rounded-none border-0 border-b border-input bg-transparent px-0 text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
              />
            </div>

            <div className="grid gap-2.5">
              <Label htmlFor={`${mode}-password`} className="text-xs text-muted-foreground">
                Password
              </Label>
              <Input
                id={`${mode}-password`}
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : 1}
                maxLength={128}
                placeholder="••••••••"
                required
                className="h-12 rounded-none border-0 border-b border-input bg-transparent px-0 text-base shadow-none focus-visible:border-primary focus-visible:ring-0"
              />
            </div>

            {mode === "register" && (
              <p className="-mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Use 8 or more characters. Your password is hashed with Argon2id.
              </p>
            )}

            {errorMessage && (
              <Alert variant="destructive" id="auth-error" role="alert">
                <AlertCircle />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <Button
              size="lg"
              className="mt-1 h-13 justify-between rounded-none px-5"
              disabled={authenticate.isPending}
            >
              <span>{authenticate.isPending ? "Working…" : copy.action}</span>
              {authenticate.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <ArrowUpRight />
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-start gap-2.5 border-l-2 border-border pl-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p>
              Refresh sessions live in an HttpOnly cookie. Access tokens stay in memory.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
