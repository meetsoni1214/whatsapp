import { useState } from "react";
import { AppSidebar, type Workspace } from "@/components/app-sidebar";
import { SessionLoader } from "@/components/session-loader";
import { AuthScreen } from "@/features/auth/auth-screen";
import { useSession } from "@/features/auth/queries";
import { ConversationWorkspace } from "@/features/conversations/conversation-workspace";
import { RealtimeProvider } from "@/features/realtime/realtime-context";
import { PeopleWorkspace } from "@/features/users/people-workspace";

function App() {
  const session = useSession();
  const [workspace, setWorkspace] = useState<Workspace>("conversations");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  if (session.isPending) {
    return <SessionLoader />;
  }

  if (!session.data) {
    return <AuthScreen />;
  }

  return (
    <RealtimeProvider session={session.data}>
      <main className="min-h-svh animate-in bg-background fade-in duration-500 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        <AppSidebar
          user={session.data.user}
          activeWorkspace={workspace}
          onNavigate={setWorkspace}
        />
        {workspace === "people" ? (
          <PeopleWorkspace
            onConversationCreated={(conversation) => {
              setSelectedConversationId(conversation.id);
              setWorkspace("conversations");
            }}
          />
        ) : (
          <ConversationWorkspace
            currentUser={session.data.user}
            selectedConversationId={selectedConversationId}
            onSelect={setSelectedConversationId}
            onFindPeople={() => setWorkspace("people")}
          />
        )}
      </main>
    </RealtimeProvider>
  );
}

export default App;
