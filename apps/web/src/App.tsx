import { AppSidebar } from "@/components/app-sidebar";
import { SessionLoader } from "@/components/session-loader";
import { AuthScreen } from "@/features/auth/auth-screen";
import { useSession } from "@/features/auth/queries";
import { PeopleWorkspace } from "@/features/users/people-workspace";

function App() {
  const session = useSession();

  if (session.isPending) {
    return <SessionLoader />;
  }

  if (!session.data) {
    return <AuthScreen />;
  }

  return (
    <main className="min-h-svh animate-in bg-background fade-in duration-500 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <AppSidebar user={session.data.user} />
      <PeopleWorkspace />
    </main>
  );
}

export default App;
